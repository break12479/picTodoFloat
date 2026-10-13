import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import ArchivePanel from "./components/ArchivePanel";
import Icon from "./components/Icon";
import SettingsPanel from "./components/SettingsPanel";
import TaskInput from "./components/TaskInput";
import TaskList from "./components/TaskList";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePasteImage } from "./hooks/usePasteImage";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";

// 错误/提示条自动消失的时长
const TOAST_MS = 4000;

export default function App() {
  const load = useTaskStore((s) => s.load);
  const error = useTaskStore((s) => s.error);
  const setError = useTaskStore((s) => s.setError);
  const toggleSearch = useTaskStore((s) => s.toggleSearch);
  const searchOpen = useTaskStore((s) => s.searchOpen);
  const autoSort = useTaskStore((s) => s.autoSort);
  const loadSettings = useSettingsStore((s) => s.load);
  const opacity = useSettingsStore((s) => s.settings?.opacity ?? 85);
  const theme = useSettingsStore((s) => s.settings?.theme ?? "dark");

  const [showSettings, setShowSettings] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  usePasteImage();
  useKeyboardShortcuts();

  useEffect(() => {
    load();
    loadSettings();
  }, [load, loadSettings]);

  // 透明度：驱动面板背景 alpha（0.50~1.00）
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-alpha",
      String(opacity / 100)
    );
  }, [opacity]);

  // 主题：dark / light
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 提示条不常驻：几秒后自动收起，也可手动关闭
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [error, setError]);

  const appWindow = getCurrentWindow();

  return (
    <div className="app">
      {/* 顶部标题栏：留白区可拖拽移动窗口（无边框） */}
      <header className="titlebar" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>
          PicTodo Float
        </span>
        <div className="win-controls">
          <button
            className={`win-btn ${searchOpen ? "active" : ""}`}
            title="搜索（Ctrl+F）"
            onClick={toggleSearch}
          >
            <Icon name="search" />
          </button>
          <button
            className="win-btn"
            title="全部自动排序（已完成沉底、最近完成在上）"
            onClick={() => autoSort(null)}
          >
            <Icon name="sort" />
          </button>
          <button
            className="win-btn"
            title="归档"
            onClick={() => setShowArchive(true)}
          >
            <Icon name="archive" />
          </button>
          <button
            className="win-btn"
            title="设置"
            onClick={() => setShowSettings(true)}
          >
            <Icon name="settings" />
          </button>
          <span className="win-sep" />
          <button
            className="win-btn"
            title="最小化"
            onClick={() => appWindow.minimize()}
          >
            <Icon name="minus" />
          </button>
          <button
            className="win-btn close"
            title="隐藏到托盘"
            onClick={() => appWindow.hide()}
          >
            <Icon name="x" />
          </button>
        </div>
      </header>

      <main className="content">
        <TaskList />
      </main>

      <footer className="footer">
        <TaskInput />
      </footer>

      {error && (
        <div className="toast" role="alert">
          <span className="toast-msg">{error}</span>
          <button className="icon-btn" onClick={() => setError(null)} title="关闭">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {showArchive && <ArchivePanel onClose={() => setShowArchive(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
