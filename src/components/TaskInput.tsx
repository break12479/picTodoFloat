import { useEffect, useRef, useState } from "react";

import { clipboardImage, droppedImages, pastedName, stageDraftImages } from "../lib/images";
import { handleMarkdownKey, isComposingKey } from "../lib/mdEdit";
import { useTaskStore } from "../stores/taskStore";
import Icon from "./Icon";
import LiveMarkdownEditor from "./LiveMarkdownEditor";
import SelectChip from "./SelectChip";

type NoteMode = "live" | "source";
const NOTE_MODE_KEY = "pictodo.noteMode";

const readNoteMode = (): NoteMode => {
  try {
    return localStorage.getItem(NOTE_MODE_KEY) === "source" ? "source" : "live";
  } catch {
    return "live";
  }
};

/** 新建任务输入框：Enter 提交，Shift+Enter 换行，自动增高；可选目标分组；可展开为便签全屏输入。 */
export default function TaskInput() {
  const add = useTaskStore((s) => s.add);
  const addImage = useTaskStore((s) => s.addImage);
  const groups = useTaskStore((s) => s.groups);
  const draftImages = useTaskStore((s) => s.draftImages);
  const removeDraftImage = useTaskStore((s) => s.removeDraftImage);
  const clearDraftImages = useTaskStore((s) => s.clearDraftImages);
  const [value, setValue] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteMode>(readNoteMode);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const canSubmit = value.trim() !== "" || draftImages.length > 0;

  useEffect(() => {
    if (expanded && noteMode === "source") noteRef.current?.focus();
  }, [expanded, noteMode]);

  const switchNoteMode = (mode: NoteMode) => {
    setNoteMode(mode);
    try {
      localStorage.setItem(NOTE_MODE_KEY, mode);
    } catch {
      // 存不了就只在本次生效
    }
  };

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const submit = async () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    const images = draftImages;
    try {
      // 只有图片、没写文字也可以建（截图即任务）
      const task = await add(value, groupId, { allowEmpty: images.length > 0 });
      if (!task) return; // 失败时文字和图片都留在输入框里
      setValue("");
      clearDraftImages();
      requestAnimationFrame(() => {
        if (taRef.current) taRef.current.style.height = "auto";
      });
      for (const img of images) await addImage(task.id, img.bytes, img.name);
    } finally {
      submitting.current = false;
    }
  };

  // 正在写新任务（有草稿 / 便签模式 / 没有选中任务）时粘贴的图片跟着这条新任务走，
  // 而不是贴到列表里之前选中的某条任务上；输入框空着时交给全局处理（贴到选中任务）。
  const onPaste = (e: React.ClipboardEvent) => {
    const file = clipboardImage(e.clipboardData);
    if (!file) return; // 文本照常粘贴
    const { selectedId } = useTaskStore.getState();
    if (!expanded && !value.trim() && draftImages.length === 0 && selectedId != null) return;
    e.preventDefault();
    e.stopPropagation();
    stageDraftImages([file], [pastedName(file)]);
  };

  const onDrop = (e: React.DragEvent) => {
    const files = droppedImages(e.dataTransfer);
    if (!files.length) return;
    e.preventDefault();
    stageDraftImages(files);
  };

  const draftStrip = draftImages.length > 0 && (
    <div className="draft-images">
      {draftImages.map((d) => (
        <div key={d.key} className="thumb-cell" title={d.name}>
          <img src={d.url} alt="" draggable={false} />
          <button
            className="thumb-del"
            title="移除这张图片"
            aria-label="移除这张图片"
            onClick={() => removeDraftImage(d.key)}
          >
            <Icon name="x" size={10} />
          </button>
        </div>
      ))}
      <span className="draft-hint">将随新任务一起保存</span>
    </div>
  );

  const collapse = () => {
    setExpanded(false);
    requestAnimationFrame(autoGrow);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKey(e)) return; // 回车可能是输入法在上屏英文，不是提交
    if (handleMarkdownKey(e, { newline: "shift-enter" })) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  if (expanded) {
    // 便签展开时，覆盖层下面那一整排（分组选择/紧凑输入框/展开/添加按钮）完全不挂载，
    // 而不只是视觉盖住。
    //
    // 「实时预览」是 Obsidian 式编辑（见 LiveMarkdownEditor）：之前用 CodeMirror 做过一版，
    // 搜狗输入法快速用空格上屏会丢字，所以改成只有光标所在行是原生 textarea、其余行渲染的做法，
    // 组字始终在原生 textarea 里完成。「源码」是普通 textarea，作为兜底。
    return (
      <div className="task-input" onPaste={onPaste} onDrop={onDrop}>
        <div
          className="note-overlay"
          onKeyDown={(e) => {
            if (isComposingKey(e)) return; // 输入法用 Esc 取消组字时别把便签收起
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              collapse();
            }
          }}
        >
          <div className="note-head">
            <div className="segmented note-mode" role="tablist">
              <button
                className={noteMode === "live" ? "active" : ""}
                onClick={() => switchNoteMode("live")}
                title="Markdown 实时预览：只有光标所在行显示源码"
              >
                实时预览
              </button>
              <button
                className={noteMode === "source" ? "active" : ""}
                onClick={() => switchNoteMode("source")}
                title="纯文本编辑 Markdown 源码"
              >
                源码
              </button>
            </div>
            <div className="note-head-actions">
              <button
                className="btn primary"
                onClick={submit}
                disabled={!canSubmit}
                title="保存为任务（Ctrl+Enter）"
              >
                <Icon name="check" size={14} />
                保存
              </button>
              <button className="icon-btn" onClick={collapse} title="收起（Esc）" aria-label="收起便签">
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
          {noteMode === "live" ? (
            <LiveMarkdownEditor
              value={value}
              onChange={setValue}
              placeholder="随手记点什么…支持 Markdown"
              autoFocus
            />
          ) : (
            <textarea
              ref={noteRef}
              className="note-textarea"
              value={value}
              placeholder="随手记点什么…支持 Markdown"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (handleMarkdownKey(e, { newline: "enter", tab: true })) e.preventDefault();
              }}
            />
          )}
          {draftStrip}
          <div className="note-hint">
            Ctrl+Enter 保存 · Esc 收起 · Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-input-wrap" onPaste={onPaste} onDrop={onDrop}>
      {draftStrip}
      <div className="task-input">
        <SelectChip
          className="input-group-pick"
          value={groupId ?? ""}
          title="添加到分组"
          options={[
            { value: "", label: "默认组" },
            ...groups.map((g) => ({ value: g.id, label: g.name })),
          ]}
          onChange={(v) => setGroupId(v === "" ? null : Number(v))}
        />

        <textarea
          ref={taRef}
          rows={1}
          value={value}
          placeholder="添加任务…"
          title="Enter 添加 · Shift+Enter 换行 · 支持 Markdown"
          onChange={(e) => {
            setValue(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKeyDown}
        />

        <button
          className="icon-btn expand-btn"
          aria-label="展开为便签"
          onClick={() => setExpanded(true)}
          title="展开为便签（Markdown 实时预览）"
        >
          <Icon name="expand" size={14} />
        </button>

        <button
          className="add-btn"
          aria-label="添加任务"
          onClick={submit}
          disabled={!canSubmit}
          title="添加任务（Enter）"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}
