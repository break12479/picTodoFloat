import { useEffect } from "react";

/** 应用内快捷键：Ctrl+N 聚焦新建输入框。（Ctrl+H 显隐为全局，由 Rust 注册） */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>(
          ".task-input textarea"
        );
        ta?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
