import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { renderMarkdown } from "../lib/markdown";
import { openPinWindow } from "../lib/pin";
import { convertFileSrc, openExternal } from "../lib/tauri";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";

interface Props {
  onClose: () => void;
}

const THUMBS_COLLAPSED = 3;

/** 一条归档任务：Markdown 渲染（收起时限两行），点击展开全文与全部图片。 */
function ArchiveItem({
  task,
  open,
  onToggle,
  onRequestDelete,
}: {
  task: Task;
  open: boolean;
  onToggle: () => void;
  onRequestDelete: (t: Task) => void;
}) {
  const unarchiveOne = useTaskStore((s) => s.unarchiveOne);
  const setError = useTaskStore((s) => s.setError);
  const html = useMemo(() => renderMarkdown(task.content), [task.content]);
  const images = open ? task.images : task.images.slice(0, THUMBS_COLLAPSED);
  const moreImages = task.images.length - images.length;
  // 只有真被截掉时才加渐隐，免得一行就完的内容也被淡化
  const textRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !open) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [html, open]);

  return (
    <div className={`archive-item ${open ? "open" : ""}`}>
      <div
        className="archive-item-main"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? "收起" : overflowing || moreImages > 0 ? "展开全文" : undefined}
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          if (a) {
            // 链接交给系统浏览器，绝不让窗口自己跳走
            e.preventDefault();
            openExternal(a.getAttribute("href")).catch((err) => setError(`打开链接失败：${err}`));
            return;
          }
          onToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {task.content ? (
          <div
            ref={textRef}
            className={`md-content archive-item-text ${open ? "" : "clamped"} ${
              !open && overflowing ? "overflowing" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <span className="placeholder">{task.images.length ? "（图片）" : "（空任务）"}</span>
        )}
        {images.length > 0 && (
          <div className="archive-thumbs">
            {images.map((img) => (
              <img
                key={img.id}
                src={convertFileSrc(img.thumb_path)}
                alt=""
                draggable={false}
                title="点击悬浮查看"
                onClick={(e) => {
                  e.stopPropagation();
                  openPinWindow(img);
                }}
              />
            ))}
            {moreImages > 0 && <span className="archive-more">+{moreImages}</span>}
          </div>
        )}
        <span className="archive-item-date">归档于 {task.archived_at?.slice(0, 10)}</span>
      </div>
      <div className="archive-item-actions">
        <button
          className="icon-btn"
          onClick={() => unarchiveOne(task.id)}
          title="取消归档，回到任务列表"
          aria-label="取消归档"
        >
          <Icon name="undo" size={14} />
        </button>
        <button
          className="icon-btn danger"
          onClick={() => onRequestDelete(task)}
          title="彻底删除（含关联图片）"
          aria-label="彻底删除"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

/** 归档任务面板：搜索、查看全文和图片，可取消归档（回到原分组）或彻底删除。 */
export default function ArchivePanel({ onClose }: Props) {
  const archivedTasks = useTaskStore((s) => s.archivedTasks);
  const loadArchived = useTaskStore((s) => s.loadArchived);
  const remove = useTaskStore((s) => s.remove);

  const [pending, setPending] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? archivedTasks.filter((t) => t.content.toLowerCase().includes(q))
    : archivedTasks;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="archive-panel"
        role="dialog"
        aria-label="归档"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <span>
            归档 <span className="head-count">{archivedTasks.length}</span>
          </span>
          <button className="icon-btn" onClick={onClose} title="关闭（Esc）" aria-label="关闭归档">
            <Icon name="x" size={15} />
          </button>
        </header>

        {archivedTasks.length > 0 && (
          <div className="archive-search">
            <Icon name="search" size={13} />
            <input
              value={query}
              placeholder="搜索归档…"
              aria-label="搜索归档"
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        <div className="archive-body">
          {archivedTasks.length === 0 && (
            <div className="empty-state">
              <div className="empty-hint">暂无归档任务</div>
            </div>
          )}
          {archivedTasks.length > 0 && shown.length === 0 && (
            <div className="empty-state">
              <div className="empty-hint">没有匹配的归档任务</div>
            </div>
          )}
          {shown.map((t) => (
            <ArchiveItem
              key={t.id}
              task={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onRequestDelete={setPending}
            />
          ))}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          message={`确认彻底删除任务「${pending.content || "空任务"}」？此操作不可撤销。`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            remove(pending.id);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
