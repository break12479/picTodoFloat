import { useEffect } from "react";

import { useTaskStore } from "../stores/taskStore";

/** 应用内快捷键：Ctrl+N 聚焦新建输入框，Ctrl+F 打开搜索，Esc 取消选择。（Ctrl+H 显隐为全局，由 Rust 注册） */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc：没有输入框 / 弹窗 / 菜单 / 便签在接这个键时，取消选中（含多选）。
      // 菜单、弹窗开着时先由它们自己关掉，再按一次才取消选择。
      if (e.key === "Escape" && !e.defaultPrevented) {
        const target = e.target as HTMLElement | null;
        const typing = target?.closest?.("input, textarea, select, [contenteditable]");
        const layered = document.querySelector(".dialog-overlay, .popover-backdrop, .note-overlay");
        const { selectedIds, clearSelection } = useTaskStore.getState();
        if (!typing && !layered && selectedIds.length > 0) clearSelection();
      }
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
