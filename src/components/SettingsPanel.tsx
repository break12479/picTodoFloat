import { open } from "@tauri-apps/plugin-dialog";

import { useSettingsStore } from "../stores/settingsStore";

interface Props {
  onClose: () => void;
}

/** 设置面板：透明度、开机自启、笔记文件夹。 */
export default function SettingsPanel({ onClose }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const setNotesFolder = useSettingsStore((s) => s.setNotesFolder);
  const setOpacity = useSettingsStore((s) => s.setOpacity);
  const setAutoStart = useSettingsStore((s) => s.setAutoStart);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const dataDir = useSettingsStore((s) => s.dataDir);
  const setDataDir = useSettingsStore((s) => s.setDataDir);
  const setHideCompleted = useSettingsStore((s) => s.setHideCompleted);
  const setAutoArchiveDays = useSettingsStore((s) => s.setAutoArchiveDays);
  const setDocEnabled = useSettingsStore((s) => s.setDocEnabled);

  const current = settings?.notes_folder;
  const opacity = settings?.opacity ?? 85;
  const autoStart = settings?.auto_start ?? false;
  const theme = settings?.theme ?? "dark";
  const hideCompleted = settings?.hide_completed ?? true;
  const autoArchiveDays = settings?.auto_archive_days ?? 0;
  const docEnabled = settings?.doc_enabled ?? true;

  const pickDataDir = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await setDataDir(selected);
    }
  };

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await setNotesFolder(selected);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <span>设置</span>
          <button className="win-btn" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="settings-body">
        <div className="settings-row">
          <label>主题</label>
          <div className="settings-theme">
            <button
              className={`theme-opt ${theme === "dark" ? "active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              🌙 深色
            </button>
            <button
              className={`theme-opt ${theme === "light" ? "active" : ""}`}
              onClick={() => setTheme("light")}
            >
              ☀️ 浅色
            </button>
          </div>
        </div>

        <div className="settings-row">
          <label>
            面板不透明度 <span className="settings-val">{opacity}%</span>
          </label>
          <input
            type="range"
            min={50}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="opacity-slider"
          />
        </div>

        <div className="settings-row">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            开机自启
          </label>
        </div>

        <div className="settings-row">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
            />
            折叠已完成任务
          </label>
        </div>

        <div className="settings-row">
          <label>
            完成后自动归档
            <span className="settings-val">
              {autoArchiveDays > 0 ? ` ${autoArchiveDays} 天` : " 关闭"}
            </span>
          </label>
          <select
            className="settings-select"
            value={autoArchiveDays}
            onChange={(e) => setAutoArchiveDays(Number(e.target.value))}
          >
            <option value={0}>关闭</option>
            <option value={3}>3 天后</option>
            <option value={7}>7 天后</option>
            <option value={14}>14 天后</option>
            <option value={30}>30 天后</option>
          </select>
          <p className="settings-hint">
            已完成任务超过所选天数后自动归档，从主列表移入「归档」。
          </p>
        </div>

        <div className="settings-row">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={docEnabled}
              onChange={(e) => setDocEnabled(e.target.checked)}
            />
            启用关联文档功能
          </label>
          <p className="settings-hint">
            关闭后仅隐藏任务上的 📄 入口，已有的文档关联不会断开。
          </p>
        </div>

        <div className="settings-row">
          <label>笔记文件夹</label>
          <div className="settings-folder">
            <span className="folder-path" title={current ?? ""}>
              {current || "默认：文档 / PicTodoFloat Notes"}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn ghost" onClick={pickFolder}>
              选择文件夹…
            </button>
            {current && (
              <button className="btn ghost" onClick={() => setNotesFolder(null)}>
                重置默认
              </button>
            )}
          </div>
          <p className="settings-hint">
            可指向 Obsidian 仓库或 OneDrive / 坚果云同步目录。新建笔记存于此。
          </p>
        </div>

        <div className="settings-row">
          <label>数据存储位置（任务库 + 图片）</label>
          <div className="settings-folder">
            <span className="folder-path" title={dataDir ?? ""}>
              {dataDir || "默认：AppData"}
            </span>
          </div>
          <div className="settings-actions">
            <button className="btn ghost" onClick={pickDataDir}>
              选择文件夹…
            </button>
            <button className="btn ghost" onClick={() => setDataDir(null)}>
              重置默认
            </button>
          </div>
          <p className="settings-hint">
            切换时会把现有数据复制到新位置（旧数据保留作备份，不会删除）。可放到
            坚果云 / OneDrive 等同步目录实现多设备。
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
