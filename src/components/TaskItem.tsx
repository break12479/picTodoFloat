import { useEffect, useRef, useState } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";

import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import DocButton from "./DocButton";
import ImageThumbnailRow from "./ImageThumbnailRow";

interface Props {
  task: Task;
  onRequestDelete: (task: Task) => void;
  // dnd-kit（未完成任务可拖拽时由 SortableTaskItem 传入）
  rootRef?: (el: HTMLElement | null) => void;
  rootStyle?: React.CSSProperties;
  dragging?: boolean;
  handle?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
}

/** 单条任务：拖拽手柄 / 勾选 / 文本（双击编辑）/ 缩略图行 / 置顶 / 移动分组 / 删除。 */
export default function TaskItem({
  task,
  onRequestDelete,
  rootRef,
  rootStyle,
  dragging,
  handle,
}: Props) {
  const toggle = useTaskStore((s) => s.toggle);
  const update = useTaskStore((s) => s.update);
  const select = useTaskStore((s) => s.select);
  const addImage = useTaskStore((s) => s.addImage);
  const deleteImage = useTaskStore((s) => s.deleteImage);
  const pin = useTaskStore((s) => s.pin);
  const archiveOne = useTaskStore((s) => s.archiveOne);
  const moveToGroup = useTaskStore((s) => s.moveToGroup);
  const clickSelect = useTaskStore((s) => s.clickSelect);
  const groups = useTaskStore((s) => s.groups);
  const selected = useTaskStore((s) => s.selectedIds.includes(task.id));
  const docEnabled = useSettingsStore((s) => s.settings?.doc_enabled ?? true);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.content);
  const [dragOver, setDragOver] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      autoGrow();
    }
  }, [editing]);

  // 文本超过限高（约 4 行）时可展开弹层查看全文
  useEffect(() => {
    const el = textRef.current;
    if (!el) {
      setOverflowing(false);
      return;
    }
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [task.content, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== task.content) update(task.id, next);
    else setDraft(task.content);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    select(task.id);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const f of files) {
      if (f.type.startsWith("image/")) {
        const buf = new Uint8Array(await f.arrayBuffer());
        await addImage(task.id, buf, f.name);
      }
    }
  };

  return (
    <div
      ref={rootRef}
      style={rootStyle}
      className={`task-item ${task.completed ? "done" : ""} ${
        selected ? "selected" : ""
      } ${dragOver ? "drag-over" : ""} ${dragging ? "dragging" : ""}`}
      onClick={(e) =>
        clickSelect(task.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
      }
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="task-main">
        {handle ? (
          <span
            className="drag-handle"
            title="拖拽排序"
            {...handle.attributes}
            {...handle.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
        ) : (
          <span className="drag-handle placeholder-handle" />
        )}

        <input
          type="checkbox"
          checked={task.completed}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggle(task.id)}
        />

        {editing ? (
          <textarea
            ref={inputRef}
            className="task-edit"
            rows={1}
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setDraft(e.target.value);
              autoGrow();
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(task.content);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            ref={textRef}
            className="task-text"
            onDoubleClick={() => {
              setDraft(task.content);
              setEditing(true);
            }}
            title="双击编辑"
          >
            {task.content || <span className="placeholder">（空任务）</span>}
          </span>
        )}

        {docEnabled && (
          <div className="task-doc" onClick={(e) => e.stopPropagation()}>
            <DocButton task={task} />
          </div>
        )}

        <div className="task-actions" onClick={(e) => e.stopPropagation()}>
          <span className="actions-trigger" title="更多操作">
            {task.pinned ? "📌" : "⋯"}
          </span>

          <div className="actions-menu">
            <button
              className={`task-pin ${task.pinned ? "active" : ""}`}
              onClick={() => pin(task.id, !task.pinned)}
              title={task.pinned ? "取消置顶" : "置顶"}
            >
              {task.pinned ? "📌" : "📍"}
            </button>

            <select
              className="task-move"
              value={task.group_id ?? ""}
              title="移动到分组"
              onChange={(e) =>
                moveToGroup(
                  task.id,
                  e.target.value ? Number(e.target.value) : null
                )
              }
            >
              <option value="">默认组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <button
              className="task-archive"
              onClick={() => archiveOne(task.id)}
              title="归档"
            >
              🗄
            </button>

            <button
              className="task-del"
              onClick={() => onRequestDelete(task)}
              title="删除任务"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {overflowing && !editing && (
        <div className="task-more">
          <button
            className="text-expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            展开全文
          </button>
        </div>
      )}

      <ImageThumbnailRow
        images={task.images}
        onDelete={(imageId) => deleteImage(task.id, imageId)}
      />

      {expanded && (
        <div
          className="dialog-overlay"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
        >
          <div className="dialog text-modal" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-msg text-modal-content">{task.content}</p>
            <div className="dialog-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  setExpanded(false);
                  setDraft(task.content);
                  setEditing(true);
                }}
              >
                编辑
              </button>
              <button className="btn ghost" onClick={() => setExpanded(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
