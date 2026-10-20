import { useEffect, useRef, useState } from "react";

import { useTaskStore } from "../stores/taskStore";
import Icon from "./Icon";

/** 新建任务输入框：Enter 提交，Shift+Enter 换行，自动增高；可选目标分组；可展开为便签全屏输入。 */
export default function TaskInput() {
  const add = useTaskStore((s) => s.add);
  const groups = useTaskStore((s) => s.groups);
  const [value, setValue] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (expanded) noteRef.current?.focus();
  }, [expanded]);

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
  };

  if (expanded) {
    // 便签展开时，覆盖层下面那一整排（分组选择/紧凑输入框/展开/添加按钮）完全不挂载，
    // 而不只是视觉盖住。
    //
    // 这里原本是 CodeMirror 实现的 Obsidian 式实时预览编辑器，但搜狗输入法快速连续用
    // 空格确认候选词时会丢字（数字键确认、或放慢速度都不会丢），排查过装饰重建时机、
    // 回声抑制、去掉自定义装饰插件、拦截空格 keydown 等 5 个方向均未解决，判断是
    // WebView2 + 搜狗 + CodeMirror 交互更底层的问题，够不到应用代码层面。改回普通
    // textarea（放弃实时预览），彻底避开这个坑。
    return (
      <div className="task-input">
        <div className="note-overlay">
          <div className="note-head">
            <span className="note-hint">
              便签 · Enter 换行 · Ctrl+Enter 保存 · Esc 收起
            </span>
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
          <textarea
            ref={noteRef}
            className="note-textarea"
            value={value}
            placeholder="随手记点什么…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                collapse();
              }
              // 普通 Enter / Shift+Enter：不拦截，走 textarea 默认换行
            }}
          />
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
        title="Enter 添加 · Shift+Enter 换行"
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={onKeyDown}
      />

      <button
        className="icon-btn expand-btn"
        onClick={() => setExpanded(true)}
        title="展开为便签全屏输入"
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
