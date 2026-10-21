import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";
import SortableTaskItem from "./SortableTaskItem";

interface Props {
  containerKey: string; // 'pinned' | 'default' | `g${id}`
  title: string;
  groupId: number | null; // 用户分组才有；默认组/置顶为 null
  isUserGroup: boolean;
  items: Task[]; // 组内全部任务，按手动顺序（完成项也可拖）
  highlight: boolean; // 拖拽悬停本组时高亮（由 TaskList 统一计算）
  onRequestDelete: (task: Task) => void;
}

/** 一个分区：置顶 / 用户分组 / 默认组。可折叠、可作为拖拽落点，组内条目均可拖。 */
export default function GroupSection({
  containerKey,
  title,
  groupId,
  isUserGroup,
  items,
  highlight,
  onRequestDelete,
}: Props) {
  const autoSort = useTaskStore((s) => s.autoSort);
  const renameGroup = useTaskStore((s) => s.renameGroup);
  const deleteGroup = useTaskStore((s) => s.deleteGroup);
  const hideCompleted = useSettingsStore((s) => s.settings?.hide_completed ?? true);
  const setHideCompleted = useSettingsStore((s) => s.setHideCompleted);

  // 折叠状态放在 store 里：跨重启记忆，也让多选 / 批量操作知道哪些任务看不见
  const collapsed = useTaskStore((s) => s.collapsed.includes(containerKey));
  const toggleCollapsed = useTaskStore((s) => s.toggleCollapsed);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { setNodeRef } = useDroppable({
    id: `container:${containerKey}`,
  });

  // 分组本身的拖拽排序：仅用户分组参与（置顶/默认组固定位置，不可拖）
  const {
    listeners: groupListeners,
    setNodeRef: setGroupNodeRef,
    transform: groupTransform,
    transition: groupTransition,
    isDragging: groupDragging,
  } = useSortable({
    id: `group-${groupId ?? containerKey}`,
    disabled: !isUserGroup,
    data: { type: "group" },
  });

  // 置顶分区不参与"已完成折叠"（置顶任务永远整体可见）
  const splitCompleted = containerKey !== "pinned";
  const activeItems = splitCompleted ? items.filter((t) => !t.completed) : items;
  const doneItems = splitCompleted ? items.filter((t) => t.completed) : [];
  const showDone = !splitCompleted || !hideCompleted;
  const visibleItems = showDone ? items : activeItems;
  const ids = visibleItems.map((t) => t.id);

  return (
    <section
      ref={setGroupNodeRef}
      style={{
        transform: CSS.Transform.toString(groupTransform),
        transition: groupTransition,
        opacity: groupDragging ? 0.5 : 1,
      }}
      className={`group-section ${highlight ? "drop-over" : ""} ${
        groupDragging ? "group-dragging" : ""
      }`}
    >
      {/* 用户分组：按住标题栏拖动即可调整分组顺序（无独立手柄）；重命名时不挂，免得拖选文字变成拖分组 */}
      <header
        className={`group-header ${isUserGroup && !renaming ? "draggable" : ""}`}
        title={isUserGroup && !renaming ? "按住拖动调整分组顺序" : undefined}
        {...(isUserGroup && !renaming ? groupListeners : undefined)}
      >
        <button
          className={`group-collapse ${collapsed ? "" : "open"}`}
          onClick={() => toggleCollapsed(containerKey)}
          title={collapsed ? "展开" : "折叠"}
        >
          <Icon name="chevron" size={13} />
        </button>

        {renaming ? (
          <input
            className="group-name-edit"
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (groupId != null && nameDraft.trim())
                renameGroup(groupId, nameDraft.trim());
              else setNameDraft(title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(title);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className="group-title"
            onDoubleClick={() => isUserGroup && setRenaming(true)}
            title={isUserGroup ? "双击重命名" : undefined}
          >
            {containerKey === "pinned" && <Icon name="pin" size={12} />}
            {title}
          </span>
        )}

        <span className="group-count">{items.length}</span>

        <div
          className="group-actions"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {containerKey !== "pinned" && items.length > 0 && (
            <button
              className="icon-btn group-btn"
              title="本组自动排序（已完成沉底）"
              onClick={() => autoSort(groupId)}
            >
              <Icon name="sort" size={13} />
            </button>
          )}
          {isUserGroup && groupId != null && (
            <button
              className="icon-btn group-btn danger"
              title="删除分组（组内任务归默认组）"
              onClick={() =>
                items.length > 0 ? setConfirmDelete(true) : deleteGroup(groupId)
              }
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </header>

      {confirmDelete && groupId != null && (
        <ConfirmDialog
          message={`删除分组「${title}」？组内 ${items.length} 项任务会移到默认组，不会被删除。`}
          confirmText="删除分组"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            deleteGroup(groupId);
          }}
        />
      )}

      {!collapsed && (
        <div ref={setNodeRef} className="group-body">
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {activeItems.map((t) => (
              <SortableTaskItem
                key={t.id}
                task={t}
                onRequestDelete={onRequestDelete}
              />
            ))}

            {splitCompleted && doneItems.length > 0 && (
              <button
                className="done-toggle"
                onClick={() => setHideCompleted(!hideCompleted)}
                title={hideCompleted ? "展开已完成" : "折叠已完成"}
              >
                <span className={`done-toggle-caret ${hideCompleted ? "" : "open"}`}>
                  <Icon name="chevron" size={11} />
                </span>
                已完成 {doneItems.length}
              </button>
            )}

            {showDone &&
              doneItems.map((t) => (
                <SortableTaskItem
                  key={t.id}
                  task={t}
                  onRequestDelete={onRequestDelete}
                />
              ))}
          </SortableContext>

          {items.length === 0 && (
            <div className="group-empty">拖任务到此分组</div>
          )}
        </div>
      )}
    </section>
  );
}
