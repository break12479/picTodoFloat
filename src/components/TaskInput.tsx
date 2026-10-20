import { useEffect, useRef, useState } from "react";

import { handleMarkdownKey, isComposingKey } from "../lib/mdEdit";
import { useTaskStore } from "../stores/taskStore";
import Icon from "./Icon";
import LiveMarkdownEditor from "./LiveMarkdownEditor";

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
  const groups = useTaskStore((s) => s.groups);
  const [value, setValue] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [noteMode, setNoteMode] = useState<NoteMode>(readNoteMode);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

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

  const submit = () => {
    if (!value.trim()) return;
    add(value, groupId);
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

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
      <div className="task-input">
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
                disabled={!value.trim()}
                title="保存为任务（Ctrl+Enter）"
              >
                <Icon name="check" size={14} />
                保存
              </button>
              <button className="icon-btn" onClick={collapse} title="收起（Esc）">
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
          <div className="note-hint">
            Ctrl+Enter 保存 · Esc 收起 · Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="task-input">
      <select
        className="select-chip input-group-pick"
        value={groupId ?? ""}
        title="添加到分组"
        onChange={(e) =>
          setGroupId(e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">默认组</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

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
        onClick={() => setExpanded(true)}
        title="展开为便签（Markdown 实时预览）"
      >
        <Icon name="expand" size={14} />
      </button>

      <button
        className="add-btn"
        onClick={submit}
        disabled={!value.trim()}
        title="添加任务（Enter）"
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
