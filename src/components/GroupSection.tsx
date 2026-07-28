import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

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

  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);

  const { setNodeRef } = useDroppable({
    id: `container:${containerKey}`,
  });

  const ids = items.map((t) => t.id);

  return (
    <section className={`group-section ${highlight ? "drop-over" : ""}`}>
      <header className="group-header">
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
            {items.map((t) => (
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
