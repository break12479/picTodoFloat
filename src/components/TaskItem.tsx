import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";

import { renderMarkdown, truncateMarkdownSource } from "../lib/markdown";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import DocButton from "./DocButton";
import ImageThumbnailRow from "./ImageThumbnailRow";

// 折叠预览的字符数上限（超过则截断 + 提供"展开全文"）
const PREVIEW_CHAR_LIMIT = 180;

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
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 手动判定双击：不依赖浏览器原生 dblclick 事件（WebView2 下已经踩过一次原生事件
  // 行为跟标准浏览器不一致的坑，这里干脆自己按点击间隔判定，更可靠）。
  const lastTextClickRef = useRef(0);

  const hasMore = task.content.length > PREVIEW_CHAR_LIMIT;
  const previewHtml = useMemo(() => {
    const { text } = truncateMarkdownSource(task.content, PREVIEW_CHAR_LIMIT);
    return renderMarkdown(text);
  }, [task.content]);
  const fullHtml = useMemo(() => renderMarkdown(task.content), [task.content]);

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
          <div
            className="task-text"
            onClick={(e) => {
              const now = Date.now();
              if (now - lastTextClickRef.current < 400) {
                e.stopPropagation();
                lastTextClickRef.current = 0;
                setDraft(task.content);
                setEditing(true);
              } else {
                lastTextClickRef.current = now;
              }
            }}
            title="双击编辑"
          >
            {task.content ? (
              <div
                className="md-content md-content-compact"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <span className="placeholder">（空任务）</span>
            )}
          </div>
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

      {hasMore && !editing && (
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
            <div
              className="md-content text-modal-content"
              dangerouslySetInnerHTML={{ __html: fullHtml }}
            />
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
