import { useRef, useState } from "react";

import { useTaskStore } from "../stores/taskStore";

/** 新建任务输入框：Enter 提交，Shift+Enter 换行，自动增高。（P3 起也是 onPaste 图片入口） */
export default function TaskInput() {
  const add = useTaskStore((s) => s.add);
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const submit = () => {
    if (!value.trim()) return;
    add(value);
    setValue("");
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = "auto";
    });
  };

  return (
    <div className="task-input">
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        placeholder="输入新任务…（Enter 添加，Shift+Enter 换行）"
        onChange={(e) => {
          setValue(e.target.value);
          autoGrow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button className="add-btn" onClick={submit} title="添加任务">
        +
      </button>
    </div>
  );
}
