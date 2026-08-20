import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import SettingsPanel from "./components/SettingsPanel";
import TaskInput from "./components/TaskInput";
import TaskList from "./components/TaskList";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePasteImage } from "./hooks/usePasteImage";
import { useSettingsStore } from "./stores/settingsStore";
import { useTaskStore } from "./stores/taskStore";

export default function App() {
  const load = useTaskStore((s) => s.load);
  const error = useTaskStore((s) => s.error);
  const toggleSearch = useTaskStore((s) => s.toggleSearch);
  const loadSettings = useSettingsStore((s) => s.load);
  const opacity = useSettingsStore((s) => s.settings?.opacity ?? 85);
  const theme = useSettingsStore((s) => s.settings?.theme ?? "dark");

  const [showSettings, setShowSettings] = useState(false);

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
            className="win-btn"
            title="搜索（Ctrl+F）"
            onClick={toggleSearch}
          >
            🔍
          </button>
          <button
            className="win-btn"
            title="设置"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
          <button
            className="win-btn"
            title="最小化"
            onClick={() => appWindow.minimize()}
          >
            —
          </button>
          <button
            className="win-btn close"
            title="隐藏到托盘"
            onClick={() => appWindow.hide()}
          >
            ×
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="content">
        <TaskList />
      </main>

      <footer className="footer">
        <TaskInput />
      </footer>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
