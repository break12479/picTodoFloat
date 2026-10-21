import { create } from "zustand";

import { byOrder, searchMatcher, visibleTaskIds } from "../lib/order";
import { invoke } from "../lib/tauri";
import type { Group, Task, TaskImage } from "../types";
import { useSettingsStore } from "./settingsStore";

const COLLAPSED_KEY = "pictodo.collapsedGroups";
const DONE_TOGGLED_KEY = "pictodo.doneToggled";

const readKeys = (storageKey: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const saveKeys = (storageKey: string, keys: string[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    // 存不了就只在本次生效
  }
};

const toggleKey = (keys: string[], key: string) =>
  keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];

/** 输入框里暂存、还没提交的图片（随新任务一起保存）。 */
export interface DraftImage {
  key: number;
  bytes: Uint8Array;
  name: string;
  url: string; // object URL，仅供预览
}

let draftKey = 0;

interface TaskState {
  tasks: Task[];
  groups: Group[];
  archivedTasks: Task[];
  loading: boolean;
  error: string | null;
  selectedId: number | null; // 锚点 / 粘贴目标（最后点击）
  selectedIds: number[]; // 多选集合
  /** 刚贴进图片的任务：滚到可见处并闪一下，让人知道图贴到了哪 */
  flash: { id: number; at: number } | null;
  draftImages: DraftImage[];
  addDraftImages: (images: Omit<DraftImage, "key">[]) => void;
  removeDraftImage: (key: number) => void;
  clearDraftImages: () => void;

  /** 折叠起来的分区（容器键），跨重启记忆 */
  collapsed: string[];
  toggleCollapsed: (key: string) => void;
  /** 单独点过「已完成 N」的分组（与设置里的默认折叠相反），跨重启记忆 */
  doneToggled: string[];
  toggleDone: (key: string) => void;
  /** 设置里改了默认折叠时清空各组的单独设定 */
  resetDoneToggles: () => void;
  /** 屏幕上实际显示的任务 id（展示顺序） */
  visibleIds: () => number[];
  /** 生效的多选：只算看得见的（搜索过滤掉、折叠起来的不算），按展示顺序 */
  effectiveSelection: () => number[];
  /** 待确认的批量删除（多选工具条 / 多选右键菜单发起，TaskList 弹确认框） */
  bulkDeleteIds: number[] | null;
  requestBulkDelete: (ids: number[]) => void;
  cancelBulkDelete: () => void;

  // 搜索：query 为空则不生效；scope 为容器键（pinned/default/g{id}），null = 全部
  searchOpen: boolean;
  searchQuery: string;
  searchScope: string | null;
  toggleSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (q: string) => void;
  setSearchScope: (scope: string | null) => void;

  load: () => Promise<void>;
  runAutoArchive: () => Promise<void>;
  loadArchived: () => Promise<void>;
  archiveOne: (id: number) => Promise<void>;
  unarchiveOne: (id: number) => Promise<void>;
  archiveMany: (ids: number[]) => Promise<void>;
  /** 新建任务，返回建好的任务（失败 / 空内容返回 null）。allowEmpty：只有图片、没有文字也建。 */
  add: (
    content: string,
    groupId?: number | null,
    opts?: { allowEmpty?: boolean }
  ) => Promise<Task | null>;
  update: (id: number, content: string) => Promise<void>;
  toggle: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;

  select: (id: number | null) => void;
  clickSelect: (id: number, mods: { shift: boolean; ctrl: boolean }) => void;
  clearSelection: () => void;
  deleteMany: (ids: number[]) => Promise<void>;
  /** 多选「移动到」：移到目标组末尾（保持展示顺序），一个事务 */
  moveManyToGroup: (ids: number[], groupId: number | null) => Promise<void>;
  applyMultiMove: (
    movedIds: number[],
    targetGroupId: number | null,
    orderedTargetIds: number[]
  ) => Promise<void>;
  addImage: (taskId: number, bytes: Uint8Array, name: string) => Promise<void>;
  deleteImage: (taskId: number, imageId: number) => Promise<void>;

  // P4：排序 / 置顶 / 分组
  pin: (id: number, pinned: boolean) => Promise<void>;
  moveToGroup: (id: number, groupId: number | null) => Promise<void>;
  reorderTasks: (orderedIds: number[]) => Promise<void>;
  autoSort: (groupId?: number | null) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: number, name: string) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
  reorderGroups: (orderedIds: number[]) => Promise<void>;

  // P5：关联文档
  linkDoc: (id: number, absPath: string) => Promise<void>;
  createDoc: (id: number, title: string) => Promise<void>;
  openDoc: (id: number) => Promise<boolean>;
  unlinkDoc: (id: number) => Promise<void>;

  setError: (msg: string | null) => void;
}

const replaceTask = (tasks: Task[], updated: Task): Task[] =>
  tasks.map((t) => (t.id === updated.id ? { ...updated } : t));

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  groups: [],
  archivedTasks: [],
  loading: false,
  error: null,
  selectedId: null,
  selectedIds: [],
  flash: null,
  draftImages: [],
  collapsed: readKeys(COLLAPSED_KEY),
  doneToggled: readKeys(DONE_TOGGLED_KEY),
  bulkDeleteIds: null,

  toggleCollapsed: (key) => {
    const collapsed = toggleKey(get().collapsed, key);
    set({ collapsed });
    saveKeys(COLLAPSED_KEY, collapsed);
  },

  toggleDone: (key) => {
    const doneToggled = toggleKey(get().doneToggled, key);
    set({ doneToggled });
    saveKeys(DONE_TOGGLED_KEY, doneToggled);
  },

  resetDoneToggles: () => {
    set({ doneToggled: [] });
    saveKeys(DONE_TOGGLED_KEY, []);
  },

  visibleIds: () => {
    const { tasks, groups, collapsed, doneToggled, searchOpen, searchQuery, searchScope } = get();
    return visibleTaskIds(tasks, groups, {
      collapsed,
      doneToggled,
      hideCompleted: useSettingsStore.getState().settings?.hide_completed ?? true,
      match: searchOpen ? searchMatcher(searchQuery, searchScope) : undefined,
    });
  },

  effectiveSelection: () => {
    const selected = new Set(get().selectedIds);
    return get().visibleIds().filter((id) => selected.has(id));
  },

  requestBulkDelete: (ids) => set({ bulkDeleteIds: ids.length ? ids : null }),
  cancelBulkDelete: () => set({ bulkDeleteIds: null }),

  addDraftImages: (images) =>
    set((s) => ({
      draftImages: [...s.draftImages, ...images.map((d) => ({ ...d, key: ++draftKey }))],
    })),
  removeDraftImage: (key) =>
    set((s) => {
      s.draftImages.filter((d) => d.key === key).forEach((d) => URL.revokeObjectURL(d.url));
      return { draftImages: s.draftImages.filter((d) => d.key !== key) };
    }),
  clearDraftImages: () =>
    set((s) => {
      s.draftImages.forEach((d) => URL.revokeObjectURL(d.url));
      return { draftImages: [] };
    }),

  searchOpen: false,
  searchQuery: "",
  searchScope: null,
  toggleSearch: () =>
    set((s) =>
      s.searchOpen
        ? { searchOpen: false, searchQuery: "", searchScope: null }
        : { searchOpen: true }
    ),
  closeSearch: () => set({ searchOpen: false, searchQuery: "", searchScope: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchScope: (scope) => set({ searchScope: scope }),

  setError: (msg) => set({ error: msg }),
  select: (id) =>
    set({ selectedId: id, selectedIds: id == null ? [] : [id] }),

  clickSelect: (id, mods) => {
    const { selectedIds, selectedId } = get();
    if (mods.shift && selectedId != null) {
      // 范围选择：锚点到当前，按展示顺序，只含看得见的任务
      const order = get().visibleIds();
      const a = order.indexOf(selectedId);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        set({ selectedIds: order.slice(lo, hi + 1) });
        return;
      }
    }
    if (mods.ctrl) {
      const has = selectedIds.includes(id);
      set({
        selectedIds: has
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id],
        selectedId: id,
      });
      return;
    }
    set({ selectedIds: [id], selectedId: id });
  },

  clearSelection: () => set({ selectedIds: [], selectedId: null }),

  deleteMany: async (ids) => {
    if (ids.length === 0) return;
    const prev = get().tasks;
    const prevArchived = get().archivedTasks;
    set({
      tasks: prev.filter((t) => !ids.includes(t.id)),
      archivedTasks: prevArchived.filter((t) => !ids.includes(t.id)),
      selectedIds: get().selectedIds.filter((x) => !ids.includes(x)),
      selectedId: ids.includes(get().selectedId ?? NaN) ? null : get().selectedId,
    });
    try {
      await invoke<boolean>("delete_tasks", { ids });
    } catch (e) {
      set({ tasks: prev, archivedTasks: prevArchived, error: String(e) });
    }
  },

  loadArchived: async () => {
    try {
      const archivedTasks = await invoke<Task[]>("get_archived_tasks");
      set({ archivedTasks });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  archiveOne: async (id) => {
    const prevTasks = get().tasks;
    const task = prevTasks.find((t) => t.id === id);
    if (!task) return;
    set({
      tasks: prevTasks.filter((t) => t.id !== id),
      archivedTasks: [
        { ...task, archived: true, archived_at: new Date().toISOString() },
        ...get().archivedTasks,
      ],
      selectedIds: get().selectedIds.filter((x) => x !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
    try {
      await invoke<Task>("archive_task", { id, archived: true });
    } catch (e) {
      set({ tasks: prevTasks, error: String(e) });
      await get().loadArchived();
    }
  },

  unarchiveOne: async (id) => {
    const prevArchived = get().archivedTasks;
    const task = prevArchived.find((t) => t.id === id);
    if (!task) return;
    set({
      archivedTasks: prevArchived.filter((t) => t.id !== id),
      tasks: [...get().tasks, { ...task, archived: false, archived_at: null }],
    });
    try {
      await invoke<Task>("archive_task", { id, archived: false });
    } catch (e) {
      set({ archivedTasks: prevArchived, error: String(e) });
      await get().load();
    }
  },

  archiveMany: async (ids) => {
    if (ids.length === 0) return;
    const prevTasks = get().tasks;
    const moved = prevTasks.filter((t) => ids.includes(t.id));
    set({
      tasks: prevTasks.filter((t) => !ids.includes(t.id)),
      archivedTasks: [
        ...moved.map((t) => ({
          ...t,
          archived: true,
          archived_at: new Date().toISOString(),
        })),
        ...get().archivedTasks,
      ],
      selectedIds: get().selectedIds.filter((x) => !ids.includes(x)),
      selectedId: ids.includes(get().selectedId ?? NaN) ? null : get().selectedId,
    });
    try {
      await invoke<boolean>("archive_tasks", { ids, archived: true });
    } catch (e) {
      set({ tasks: prevTasks, error: String(e) });
      await get().loadArchived();
    }
  },

  applyMultiMove: async (movedIds, targetGroupId, orderedTargetIds) => {
    const prev = get().tasks;
    const movedSet = new Set(movedIds);
    const orderMap = new Map(orderedTargetIds.map((id, i) => [id, i]));
    // 乐观：移动项改组，目标容器成员重写 sort_order
    set({
      tasks: get().tasks.map((t) => {
        let nt = t;
        if (movedSet.has(t.id)) nt = { ...nt, group_id: targetGroupId };
        if (orderMap.has(t.id)) nt = { ...nt, sort_order: orderMap.get(t.id)! };
        return nt;
      }),
    });
    try {
      // 移组 + 重排在后端一个事务里完成，失败时前后端都整体回到拖拽前
      await invoke<boolean>("move_tasks", {
        ids: movedIds,
        groupId: targetGroupId,
        orderedIds: orderedTargetIds,
      });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  moveManyToGroup: async (ids, groupId) => {
    const moving = new Set(ids);
    // 置顶任务只改所属组，不参与目标组的排序（否则会打乱置顶分区的顺序）
    const stay = get()
      .tasks.filter((t) => !t.pinned && !moving.has(t.id) && (t.group_id ?? null) === groupId)
      .sort(byOrder)
      .map((t) => t.id);
    const nonPinnedMoving = ids.filter((id) => !get().tasks.find((t) => t.id === id)?.pinned);
    await get().applyMultiMove(ids, groupId, [...stay, ...nonPinnedMoving]);
  },

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [tasks, groups] = await Promise.all([
        invoke<Task[]>("get_tasks"),
        invoke<Group[]>("get_groups"),
      ]);
      set({ tasks, groups, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  runAutoArchive: async () => {
    try {
      const n = await invoke<number>("auto_archive");
      if (n === 0) return;
      // 静默刷新：不走 load() 的"加载中"状态，列表不闪
      const tasks = await invoke<Task[]>("get_tasks");
      const alive = new Set(tasks.map((t) => t.id));
      const { selectedId, selectedIds } = get();
      set({
        tasks,
        selectedIds: selectedIds.filter((id) => alive.has(id)),
        selectedId: selectedId != null && alive.has(selectedId) ? selectedId : null,
      });
    } catch {
      // 后台检查，失败不打扰用户，下次再试
    }
  },

  add: async (content, groupId = null, opts) => {
    const trimmed = content.trim();
    if (!trimmed && !opts?.allowEmpty) return null;
    try {
      const task = await invoke<Task>("add_task", {
        content: trimmed,
        groupId,
      });
      set({
        tasks: [...get().tasks, task],
        selectedId: task.id,
        selectedIds: [task.id],
      });
      return task;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  update: async (id, content) => {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, content } : t)) });
    try {
      const updated = await invoke<Task>("update_task", { id, content });
      set({ tasks: replaceTask(get().tasks, updated) });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  toggle: async (id) => {
    const prev = get().tasks;
    set({
      tasks: prev.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    });
    try {
      const updated = await invoke<Task>("toggle_task", { id });
      set({ tasks: replaceTask(get().tasks, updated) });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  remove: async (id) => {
    const prev = get().tasks;
    const prevArchived = get().archivedTasks;
    set({
      tasks: prev.filter((t) => t.id !== id),
      archivedTasks: prevArchived.filter((t) => t.id !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
      selectedIds: get().selectedIds.filter((x) => x !== id),
    });
    try {
      await invoke<boolean>("delete_task", { id });
    } catch (e) {
      set({ tasks: prev, archivedTasks: prevArchived, error: String(e) });
    }
  },

  addImage: async (taskId, bytes, name) => {
    try {
      // 原始二进制 IPC：请求体就是图片字节（以前转成 JSON 数字数组，几 MB 的截图要序列化很久）
      const img = await invoke<TaskImage>("add_image_from_bytes", bytes, {
        headers: {
          "x-task-id": String(taskId),
          "x-file-name": encodeURIComponent(name),
        },
      });
      set({
        tasks: get().tasks.map((t) =>
          t.id === taskId ? { ...t, images: [...t.images, img] } : t
        ),
        error: null,
        flash: { id: taskId, at: Date.now() },
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteImage: async (taskId, imageId) => {
    const prev = get().tasks;
    set({
      tasks: prev.map((t) =>
        t.id === taskId
          ? { ...t, images: t.images.filter((im) => im.id !== imageId) }
          : t
      ),
    });
    try {
      await invoke<boolean>("delete_image", { imageId });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  pin: async (id, pinned) => {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, pinned } : t)) });
    try {
      const updated = await invoke<Task>("pin_task", { id, pinned });
      set({ tasks: replaceTask(get().tasks, updated) });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  moveToGroup: async (id, groupId) => {
    const prev = get().tasks;
    set({ tasks: prev.map((t) => (t.id === id ? { ...t, group_id: groupId } : t)) });
    try {
      const updated = await invoke<Task>("move_task_to_group", { id, groupId });
      set({ tasks: replaceTask(get().tasks, updated) });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  reorderTasks: async (orderedIds) => {
    const prev = get().tasks;
    // 乐观：把这批 id 的 sort_order 设为新的下标
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    set({
      tasks: get().tasks.map((t) =>
        orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id)! } : t
      ),
    });
    try {
      await invoke<boolean>("reorder_tasks", { orderedIds });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
  },

  autoSort: async (groupId = null) => {
    try {
      const tasks = await invoke<Task[]>("auto_sort", { groupId });
      set({ tasks, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addGroup: async (name) => {
    try {
      const g = await invoke<Group>("add_group", { name });
      set({ groups: [...get().groups, g] });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameGroup: async (id, name) => {
    const prev = get().groups;
    set({ groups: prev.map((g) => (g.id === id ? { ...g, name } : g)) });
    try {
      const g = await invoke<Group>("rename_group", { id, name });
      set({ groups: get().groups.map((x) => (x.id === id ? g : x)) });
    } catch (e) {
      set({ groups: prev, error: String(e) });
    }
  },

  deleteGroup: async (id) => {
    const prevGroups = get().groups;
    const prevTasks = get().tasks;
    // 乐观：组内任务归默认组
    set({
      groups: prevGroups.filter((g) => g.id !== id),
      tasks: prevTasks.map((t) =>
        t.group_id === id ? { ...t, group_id: null } : t
      ),
    });
    try {
      await invoke<boolean>("delete_group", { id });
    } catch (e) {
      set({ groups: prevGroups, tasks: prevTasks, error: String(e) });
    }
  },

  reorderGroups: async (orderedIds) => {
    const prev = get().groups;
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    set({
      groups: get().groups.map((g) =>
        orderMap.has(g.id) ? { ...g, sort_order: orderMap.get(g.id)! } : g
      ),
    });
    try {
      await invoke<boolean>("reorder_groups", { orderedIds });
    } catch (e) {
      set({ groups: prev, error: String(e) });
    }
  },

  linkDoc: async (id, absPath) => {
    try {
      const updated = await invoke<Task>("link_doc", { taskId: id, absPath });
      set({ tasks: replaceTask(get().tasks, updated), error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createDoc: async (id, title) => {
    try {
      const updated = await invoke<Task>("create_doc", { taskId: id, title });
      set({ tasks: replaceTask(get().tasks, updated), error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openDoc: async (id) => {
    try {
      await invoke<boolean>("open_doc", { taskId: id });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  unlinkDoc: async (id) => {
    try {
      const updated = await invoke<Task>("unlink_doc", { taskId: id });
      set({ tasks: replaceTask(get().tasks, updated), error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
