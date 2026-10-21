import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";

import {
  checklistProgress,
  enableTaskCheckboxes,
  renderMarkdown,
  toggleChecklistItem,
  truncateMarkdownSource,
} from "../lib/markdown";
import { openExternal } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import DocButton from "./DocButton";
import Icon from "./Icon";
import ImageThumbnailRow from "./ImageThumbnailRow";
import TaskMenu from "./TaskMenu";

// 折叠预览的字符数上限（超过则截断 + 提供"展开全文"）
const PREVIEW_CHAR_LIMIT = 180;

interface Props {
  task: Task;
  onRequestDelete: (task: Task) => void;
  // dnd-kit（由 SortableTaskItem 传入；拖拽浮层里的副本没有）
  rootRef?: (el: HTMLElement | null) => void;
  rootStyle?: React.CSSProperties;
  dragging?: boolean;
  dragListeners?: DraggableSyntheticListeners;
}

/** 单条任务：勾选 / 文本（双击编辑）/ 缩略图行 / ⋯ 菜单（置顶 / 归档 / 移动分组 / 删除，也可右键打开）。整行按住拖动即可排序。 */
export default function TaskItem({
  task,
  onRequestDelete,
  rootRef,
  rootStyle,
  dragging,
  dragListeners,
}: Props) {
  const toggle = useTaskStore((s) => s.toggle);
  const update = useTaskStore((s) => s.update);
  const select = useTaskStore((s) => s.select);
  const addImage = useTaskStore((s) => s.addImage);
  const deleteImage = useTaskStore((s) => s.deleteImage);
  const clickSelect = useTaskStore((s) => s.clickSelect);
  const selected = useTaskStore((s) => s.selectedIds.includes(task.id));
  const docEnabled = useSettingsStore((s) => s.settings?.doc_enabled ?? true);
  const setError = useTaskStore((s) => s.setError);
  const flashAt = useTaskStore((s) => (s.flash?.id === task.id ? s.flash.at : 0));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.content);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menuAt, setMenuAt] = useState<{
    x: number;
    y: number;
    align: "start" | "end";
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 手动判定双击：不依赖浏览器原生 dblclick 事件（WebView2 下已经踩过一次原生事件
  // 行为跟标准浏览器不一致的坑，这里干脆自己按点击间隔判定，更可靠）。
  const lastTextClickRef = useRef(0);

  // 刚贴进图片：滚到可见处并闪一下（拖拽浮层里的副本没有 rootRef，不处理）
  const elRef = useRef<HTMLDivElement | null>(null);
  const setRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      rootRef?.(el);
    },
    [rootRef]
  );
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flashAt || !rootRef) return;
    elRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlashing(true);
    const t = window.setTimeout(() => setFlashing(false), 900);
    return () => window.clearTimeout(t);
  }, [flashAt, rootRef]);

  const previewHtml = useMemo(() => {
    const { text } = truncateMarkdownSource(task.content, PREVIEW_CHAR_LIMIT);
    return enableTaskCheckboxes(renderMarkdown(text));
  }, [task.content]);
  const fullHtml = useMemo(
    () => enableTaskCheckboxes(renderMarkdown(task.content)),
    [task.content]
  );
  const progress = useMemo(() => checklistProgress(task.content), [task.content]);

  // 预览被裁切：字符数超限，或没超字符数但被 .md-content-compact 的最大高度截掉
  // （中文一行字少，180 字远超 5 行，只按字符数判断会出现"被截断却没有展开按钮"）
  const previewRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) {
      setClipped(false);
      return;
    }
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check); // 窗口变窄时换行变多
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewHtml, editing]);
  const hasMore = task.content.length > PREVIEW_CHAR_LIMIT || clipped;

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

  // Markdown 里的链接：交给系统浏览器打开。绝不能让 WebView 自己跳转——无边框窗口没有后退键，
  // 整个应用界面会被网页替换掉。返回 true 表示点的是链接（调用方别再当普通点击处理）。
  const handleLinkClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return false;
    e.preventDefault();
    e.stopPropagation();
    openExternal(a.getAttribute("href")).catch((err) => setError(`打开链接失败：${err}`));
    return true;
  };

  // 文本里的任务清单（- [ ]）：点任务框改源码里的 [ ] / [x]。截断预览是全文的前缀，
  // 第 n 个框在预览和全文里是同一项。返回 true 表示点的是任务框。
  const handleChecklistClick = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.target as HTMLElement;
    if (!(box instanceof HTMLInputElement) || box.type !== "checkbox") return false;
    e.preventDefault(); // 勾选状态以源码为准，别让原生 click 先翻
    e.stopPropagation();
    const all = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
    const next = toggleChecklistItem(task.content, all.indexOf(box));
    if (next != null) update(task.id, next);
    return true;
  };

  // 整行即拖拽区：PointerSensor 要移动 5px 才激活，单击/双击/右键不受影响。
  // 编辑中、展开全文弹层打开时不挂，否则在输入框/弹层里拖选文字会变成拖动任务。
  const rowDragListeners = editing || expanded ? undefined : dragListeners;

  return (
    <div
      ref={setRootRef}
      style={rootStyle}
      {...rowDragListeners}
      className={`task-item ${task.completed ? "done" : ""} ${
        selected ? "selected" : ""
      } ${dragOver ? "drag-over" : ""} ${dragging ? "dragging" : ""} ${
        menuAt ? "menu-open" : ""
      } ${flashing ? "flash" : ""}`}
      onMouseDown={(e) => {
        // Shift+点击做范围多选时，阻止浏览器顺带拖出一片文字选区
        if (e.shiftKey && !editing) e.preventDefault();
      }}
      onClick={(e) =>
        clickSelect(task.id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
      }
      onContextMenu={(e) => {
        if (editing || !rootRef) return; // 拖拽浮层里的副本不响应
        e.preventDefault();
        setMenuAt({ x: e.clientX + 2, y: e.clientY - 4, align: "start" });
      }}
      onAuxClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="task-main">
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
              if (handleChecklistClick(e) || handleLinkClick(e)) return;
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
                ref={previewRef}
                className={`md-content md-content-compact ${
                  hasMore ? "is-truncated" : ""
                }`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <span className="placeholder">
                {task.images.length > 0 ? "（图片）" : "（空任务）"}
              </span>
            )}
          </div>
        )}

        {docEnabled && (
          <div
            className="task-doc"
            onClick={(e) => e.stopPropagation()}
            // 按在 📄 上不触发拖动（鼠标走 pointerdown，触摸走 touchstart），右键是它自己的菜单
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <DocButton task={task} />
          </div>
        )}

        <div
          className="task-actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            className="icon-btn task-menu-btn"
            title="更多操作（也可右键）"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuAt(menuAt ? null : { x: r.right, y: r.bottom, align: "end" });
            }}
          >
            <Icon name="more" size={16} />
          </button>
          {menuAt && (
            <TaskMenu
              task={task}
              at={menuAt}
              onClose={() => setMenuAt(null)}
              onRequestDelete={onRequestDelete}
            />
          )}
        </div>
      </div>

      {!editing && (hasMore || progress.total > 0) && (
        <div className="task-more">
          {progress.total > 0 && (
            <span
              className={`check-progress ${progress.done === progress.total ? "all-done" : ""}`}
              title="清单进度"
            >
              <Icon name="check" size={11} />
              {progress.done}/{progress.total}
            </span>
          )}
          {hasMore && (
            <button
              className="text-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
            >
              展开全文
            </button>
          )}
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
              onClick={(e) => handleChecklistClick(e) || handleLinkClick(e)}
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
