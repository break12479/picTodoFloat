import { useEffect } from "react";

import { useTaskStore } from "../stores/taskStore";

/** 应用内快捷键：Ctrl+N 聚焦新建输入框，Ctrl+F 打开搜索。（Ctrl+H 显隐为全局，由 Rust 注册） */
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const { searchOpen, toggleSearch } = useTaskStore.getState();
        if (!searchOpen) toggleSearch();
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>(".search-input")?.focus();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
