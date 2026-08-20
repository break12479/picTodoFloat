import { create } from "zustand";

import { flatVisibleIds } from "../lib/order";
import { invoke } from "../lib/tauri";
import type { Group, Task, TaskImage } from "../types";

interface TaskState {
  tasks: Task[];
  groups: Group[];
  archivedTasks: Task[];
  loading: boolean;
  error: string | null;
  selectedId: number | null; // 锚点 / 粘贴目标（最后点击）
  selectedIds: number[]; // 多选集合

  // 搜索：query 为空则不生效；scope 为容器键（pinned/default/g{id}），null = 全部
  searchOpen: boolean;
  searchQuery: string;
  searchScope: string | null;
  toggleSearch: () => void;
  closeSearch: () => void;
  setSearchQuery: (q: string) => void;
  setSearchScope: (scope: string | null) => void;

  load: () => Promise<void>;
  loadArchived: () => Promise<void>;
  archiveOne: (id: number) => Promise<void>;
  unarchiveOne: (id: number) => Promise<void>;
  archiveSelected: () => Promise<void>;
  add: (content: string, groupId?: number | null) => Promise<void>;
  update: (id: number, content: string) => Promise<void>;
  toggle: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;

  select: (id: number | null) => void;
  clickSelect: (id: number, mods: { shift: boolean; ctrl: boolean }) => void;
  clearSelection: () => void;
  deleteSelected: () => Promise<void>;
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
    const { selectedIds, selectedId, tasks, groups } = get();
    if (mods.shift && selectedId != null) {
      // 范围选择：锚点到当前，按展示顺序
      const order = flatVisibleIds(tasks, groups);
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

  deleteSelected: async () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    const prev = get().tasks;
    const prevArchived = get().archivedTasks;
    set({
      tasks: prev.filter((t) => !ids.includes(t.id)),
      archivedTasks: prevArchived.filter((t) => !ids.includes(t.id)),
      selectedIds: [],
      selectedId: null,
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

  archiveSelected: async () => {
    const ids = get().selectedIds;
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
      selectedIds: [],
      selectedId: null,
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
      for (const id of movedIds) {
        const before = prev.find((t) => t.id === id);
        if (before && (before.group_id ?? null) !== targetGroupId) {
          await invoke<Task>("move_task_to_group", { id, groupId: targetGroupId });
        }
      }
      await invoke<boolean>("reorder_tasks", { orderedIds: orderedTargetIds });
    } catch (e) {
      set({ tasks: prev, error: String(e) });
    }
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

  add: async (content, groupId = null) => {
    const trimmed = content.trim();
    if (!trimmed) return;
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
    } catch (e) {
      set({ error: String(e) });
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
      const img = await invoke<TaskImage>("add_image_from_bytes", {
        taskId,
        bytes: Array.from(bytes),
        originalName: name,
      });
      set({
        tasks: get().tasks.map((t) =>
          t.id === taskId ? { ...t, images: [...t.images, img] } : t
        ),
        error: null,
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
