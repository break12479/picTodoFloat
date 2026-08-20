import { useRef, useState } from "react";

import { useTaskStore } from "../stores/taskStore";

/** 新建任务输入框：Enter 提交，Shift+Enter 换行，自动增高；可选目标分组；可展开为便签全屏输入。 */
export default function TaskInput() {
  const add = useTaskStore((s) => s.add);
  const groups = useTaskStore((s) => s.groups);
  const [value, setValue] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && expanded) {
      collapse();
    }
  };

  return (
    <div className="task-input">
      {expanded && (
        <div className="note-overlay">
          <div className="note-head">
            <span className="note-hint">便签模式 · Enter 保存为任务 · Esc 收起</span>
            <button className="win-btn" onClick={collapse} title="收起">
              ×
            </button>
          </div>
          <textarea
            className="note-textarea"
            autoFocus
            value={value}
            placeholder="随手记点什么…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      )}

      <select
        className="task-move input-group-pick"
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
        placeholder="输入新任务…（Enter 添加，Shift+Enter 换行）"
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={onKeyDown}
      />

      <button
        className="expand-btn"
        onClick={() => setExpanded(true)}
        title="展开为便签全屏输入"
      >
        ⤢
      </button>

      <button className="add-btn" onClick={submit} title="添加任务">
        +
      </button>
    </div>
  );
}
