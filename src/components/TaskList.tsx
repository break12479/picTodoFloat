import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { buildView, containerKeyOf, flatVisibleIds } from "../lib/order";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import GroupSection from "./GroupSection";
import Icon from "./Icon";
import TaskItem from "./TaskItem";

const noop = () => {};

// 整行即拖拽区，所以按输入方式分流：鼠标 / 笔走 PointerSensor（移动 5px 激活）；
// 触摸交给 TouchSensor（长按激活）——否则手指一划就是拖动，列表没法滑动；
// 反过来只用 PointerSensor 的话，浏览器会把触摸滑动当成滚动并 pointercancel，任务拖不动。
class MousePenSensor extends PointerSensor {
  static activators = PointerSensor.activators.map((a) => ({
    ...a,
    handler: (...args: Parameters<typeof a.handler>) =>
      args[0].nativeEvent.pointerType !== "touch" && a.handler(...args),
  }));
}

export default function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const groups = useTaskStore((s) => s.groups);
  const loading = useTaskStore((s) => s.loading);
  const selectedIds = useTaskStore((s) => s.selectedIds);
  const remove = useTaskStore((s) => s.remove);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);
  const applyMultiMove = useTaskStore((s) => s.applyMultiMove);
  const addGroup = useTaskStore((s) => s.addGroup);
  const reorderGroups = useTaskStore((s) => s.reorderGroups);
  const clearSelection = useTaskStore((s) => s.clearSelection);
  const deleteSelected = useTaskStore((s) => s.deleteSelected);
  const archiveSelected = useTaskStore((s) => s.archiveSelected);
  const searchOpen = useTaskStore((s) => s.searchOpen);
  const searchQuery = useTaskStore((s) => s.searchQuery);
  const searchScope = useTaskStore((s) => s.searchScope);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);
  const setSearchScope = useTaskStore((s) => s.setSearchScope);
  const closeSearch = useTaskStore((s) => s.closeSearch);

  const [pending, setPending] = useState<Task | null>(null);
  const [confirmMulti, setConfirmMulti] = useState(false);
  const [newGroup, setNewGroup] = useState<string | null>(null); // null = 未在新建
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [overContainer, setOverContainer] = useState<string | null>(null);

  const groupIdFromSortable = (id: string | number) =>
    Number(String(id).slice("group-".length));

  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const activelySearching = searchOpen && searchQuery.trim().length > 0;

  const filteredTasks = useMemo(() => {
    if (!activelySearching) return tasks;
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!t.content.toLowerCase().includes(q)) return false;
      if (searchScope && containerKeyOf(t) !== searchScope) return false;
      return true;
    });
  }, [tasks, activelySearching, searchQuery, searchScope]);

  const view = useMemo(
    () => buildView(filteredTasks, groups),
    [filteredTasks, groups]
  );
  const tasksById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks]
  );

  const itemsOf = (key: string): Task[] => {
    if (key === "pinned") return view.pinned;
    if (key === "default") return view.def;
    const g = view.userGroups.find((x) => `g${x.group.id}` === key);
    return g ? g.items : [];
  };

  const onDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "group") {
      setActiveGroupId(groupIdFromSortable(e.active.id));
    } else {
      setActiveId(Number(e.active.id));
    }
  };

  // 统一计算当前悬停容器，驱动目标组高亮（无论压在任务还是空白）
  const containerOf = (overId: string | number | null): string | null => {
    if (overId == null) return null;
    if (typeof overId === "string" && overId.startsWith("container:")) {
      return overId.slice("container:".length);
    }
    const ot = tasksById.get(Number(overId));
    return ot ? containerKeyOf(ot) : null;
  };

  const onDragOver = (e: DragOverEvent) => {
    if (activeGroupId != null) return; // 分组拖拽不涉及任务容器高亮
    setOverContainer(containerOf(e.over ? e.over.id : null));
  };

  const resetDrag = () => {
    setActiveId(null);
    setActiveGroupId(null);
    setOverContainer(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const wasGroupDrag = activeGroupId != null;
    resetDrag();
    const { active, over } = e;
    if (!over) return;

    if (wasGroupDrag) {
      if (over.data.current?.type !== "group") return;
      const ids = view.userGroups.map(({ group }) => group.id);
      const oldI = ids.indexOf(groupIdFromSortable(active.id));
      const newI = ids.indexOf(groupIdFromSortable(over.id));
      if (oldI >= 0 && newI >= 0 && oldI !== newI) {
        reorderGroups(arrayMove(ids, oldI, newI));
      }
      return;
    }

    const activeIdN = Number(active.id);
    const activeTask = tasksById.get(activeIdN);
    if (!activeTask) return;

    const source = containerKeyOf(activeTask);

    let target: string;
    let overTaskId: number | null = null;
    const overId = over.id;
    if (typeof overId === "string" && overId.startsWith("container:")) {
      target = overId.slice("container:".length);
    } else {
      overTaskId = Number(overId);
      const ot = tasksById.get(overTaskId);
      target = ot ? containerKeyOf(ot) : source;
    }

    // 置顶容器：仅同容器重排；涉及置顶的跨容器忽略（置顶用 📌 按钮）
    if (source === "pinned" || target === "pinned") {
      if (source === "pinned" && target === "pinned") {
        const ids = view.pinned.map((t) => t.id);
        const oldI = ids.indexOf(activeIdN);
        const newI = overTaskId != null ? ids.indexOf(overTaskId) : ids.length - 1;
        if (oldI >= 0 && newI >= 0 && oldI !== newI) {
          reorderTasks(arrayMove(ids, oldI, newI));
        }
      }
      return;
    }

    // 被拖动集合：active 在多选内则整组（按展示顺序、排除置顶），否则单个
    const flat = flatVisibleIds(tasks, groups);
    const dragging =
      selectedIds.includes(activeIdN) && selectedIds.length > 1
        ? flat.filter(
            (id) => selectedIds.includes(id) && !tasksById.get(id)?.pinned
          )
        : [activeIdN];
    if (dragging.length === 0) return;
    const draggingSet = new Set(dragging);

    // 落在自身集合上且同源 → 无变化
    if (overTaskId != null && draggingSet.has(overTaskId)) return;

    const targetGroupId = target === "default" ? null : Number(target.slice(1));
    const targetFull = itemsOf(target).map((t) => t.id);
    const targetItems = targetFull.filter((id) => !draggingSet.has(id));

    let insertAt: number;
    if (overTaskId == null) {
      insertAt = targetItems.length;
    } else {
      insertAt = targetItems.indexOf(overTaskId);
      if (insertAt < 0) {
        insertAt = targetItems.length;
      } else {
        // 同容器向下拖：over 在锚点之后 → 插到 over 之后（修正 off-by-one）
        const anchorPos = targetFull.indexOf(activeIdN);
        const overPos = targetFull.indexOf(overTaskId);
        if (anchorPos >= 0 && overPos > anchorPos) insertAt += 1;
      }
    }

    const newOrder = [
      ...targetItems.slice(0, insertAt),
      ...dragging,
      ...targetItems.slice(insertAt),
    ];
    applyMultiMove(dragging, targetGroupId, newOrder);
  };

  if (loading) return <div className="empty-state">加载中…</div>;

  const isEmpty = tasks.length === 0 && groups.length === 0;
  const activeTask = activeId != null ? tasksById.get(activeId) ?? null : null;
  const activeGroup =
    activeGroupId != null ? groups.find((g) => g.id === activeGroupId) ?? null : null;
  const dragCount =
    activeId != null && selectedIds.includes(activeId) ? selectedIds.length : 1;

  const commitNewGroup = () => {
    const name = newGroup?.trim();
    if (name) addGroup(name);
    setNewGroup(null);
  };

  return (
    <div className="task-list">
      {/* 列表头：搜索栏 / 多选工具条放在滚动区之外，不随列表滚走、也不遮挡条目 */}
      {(searchOpen || selectedIds.length >= 2) && (
        <div className="list-head">
          {selectedIds.length >= 2 && (
            <div className="selection-bar">
              <span>已选 {selectedIds.length} 项</span>
              <div className="selection-actions">
                <button className="sel-btn" onClick={archiveSelected}>
                  <Icon name="archive" size={13} />
                  归档
                </button>
                <button className="sel-btn danger" onClick={() => setConfirmMulti(true)}>
                  <Icon name="trash" size={13} />
                  删除
                </button>
                <button className="icon-btn" onClick={clearSelection} title="取消选择">
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          )}

          {searchOpen && (
            <div className="search-bar">
              <Icon name="search" size={14} className="search-icon" />
              <input
                className="search-input"
                autoFocus
                autoComplete="off"
                placeholder="搜索任务…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
              />
              <select
                className="select-chip search-scope"
                value={searchScope ?? ""}
                onChange={(e) => setSearchScope(e.target.value || null)}
                title="搜索范围"
              >
                <option value="">全部</option>
                <option value="pinned">置顶</option>
                {groups.map((g) => (
                  <option key={g.id} value={`g${g.id}`}>
                    {g.name}
                  </option>
                ))}
                <option value="default">默认组</option>
              </select>
              <button className="icon-btn" onClick={closeSearch} title="关闭搜索（Esc）">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="list-scroll">
        {isEmpty && (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="check" size={22} />
            </div>
            <div className="empty-title">还没有任务</div>
            <div className="empty-hint">
              在下方输入框写下第一条任务
              <br />
              <kbd>Ctrl</kbd>+<kbd>N</kbd> 聚焦输入 · 选中任务后 <kbd>Ctrl</kbd>+
              <kbd>V</kbd> 贴图
            </div>
          </div>
        )}

        {activelySearching && filteredTasks.length === 0 && (
          <div className="empty-state">
            <div className="empty-hint">没有匹配的任务</div>
          </div>
        )}

        <DndContext
          sensors={activelySearching ? [] : sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={resetDrag}
        >
          {view.pinned.length > 0 && (
            <GroupSection
              containerKey="pinned"
              title="置顶"
              groupId={null}
              isUserGroup={false}
              items={view.pinned}
              highlight={false}
              onRequestDelete={setPending}
            />
          )}

          <SortableContext
            items={view.userGroups.map(({ group }) => `group-${group.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {view.userGroups.map(({ group, items }) =>
              activelySearching && items.length === 0 ? null : (
                <GroupSection
                  key={group.id}
                  containerKey={`g${group.id}`}
                  title={group.name}
                  groupId={group.id}
                  isUserGroup
                  items={items}
                  highlight={activeId != null && overContainer === `g${group.id}`}
                  onRequestDelete={setPending}
                />
              )
            )}
          </SortableContext>

          {view.def.length > 0 && (
            <GroupSection
              containerKey="default"
              title="默认组"
              groupId={null}
              isUserGroup={false}
              items={view.def}
              highlight={activeId != null && overContainer === "default"}
              onRequestDelete={setPending}
            />
          )}

          <DragOverlay className="drag-overlay">
            {activeGroup ? (
              <div className="multi-drag-badge">拖动分组「{activeGroup.name}」</div>
            ) : activeTask ? (
              dragCount > 1 ? (
                <div className="multi-drag-badge">移动 {dragCount} 项</div>
              ) : (
                <TaskItem task={activeTask} onRequestDelete={noop} dragging />
              )
            ) : null}
          </DragOverlay>
        </DndContext>

        {!activelySearching &&
          (newGroup == null ? (
            <button className="add-group" onClick={() => setNewGroup("")}>
              <Icon name="plus" size={13} />
              新建分组
            </button>
          ) : (
            <input
              className="group-new"
              autoFocus
              placeholder="分组名称，Enter 确认 · Esc 取消"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onBlur={commitNewGroup}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setNewGroup(null);
              }}
            />
          ))}
      </div>

      {pending && (
        <ConfirmDialog
          message={`确认删除任务「${pending.content || "空任务"}」？`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            remove(pending.id);
            setPending(null);
          }}
        />
      )}

      {confirmMulti && (
        <ConfirmDialog
          message={`确认删除选中的 ${selectedIds.length} 项任务？`}
          onCancel={() => setConfirmMulti(false)}
          onConfirm={() => {
            deleteSelected();
            setConfirmMulti(false);
          }}
        />
      )}
    </div>
  );
}
