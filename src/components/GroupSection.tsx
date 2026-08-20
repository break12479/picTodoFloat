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

  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);

  const { setNodeRef } = useDroppable({
    id: `container:${containerKey}`,
  });

  // 分组本身的拖拽排序：仅用户分组参与（置顶/默认组固定位置，不可拖）
  const {
    attributes: groupAttrs,
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
      <header className="group-header">
        {isUserGroup ? (
          <span
            className="group-drag-handle"
            title="拖拽调整分组顺序"
            {...groupAttrs}
            {...groupListeners}
          >
            ⠿
          </span>
        ) : (
          <span className="group-drag-handle placeholder-handle" />
        )}

        <button
          className="group-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? "▶" : "▼"}
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
            {title}
          </span>
        )}

        <span className="group-count">{items.length}</span>

        <div className="group-actions">
          {containerKey !== "pinned" && items.length > 0 && (
            <button
              className="group-btn"
              title="本组自动排序（已完成沉底）"
              onClick={() => autoSort(groupId)}
            >
              ↕
            </button>
          )}
          {isUserGroup && groupId != null && (
            <button
              className="group-btn danger"
              title="删除分组（组内任务归默认组）"
              onClick={() => deleteGroup(groupId)}
            >
              🗑
            </button>
          )}
        </div>
      </header>

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
                <span className="done-toggle-caret">{hideCompleted ? "▸" : "▾"}</span>
                已完成 ({doneItems.length})
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
