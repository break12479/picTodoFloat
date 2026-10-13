import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useSettingsStore } from "../stores/settingsStore";
import Icon from "./Icon";

interface Props {
  onClose: () => void;
}

/** 设置面板：外观 / 任务 / 关联文档 / 数据，四组。 */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <button className="icon-btn" onClick={onClose} title="关闭">
            <Icon name="x" size={15} />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-section-title">外观</h3>

            <div className="settings-row">
              <span className="settings-label">主题</span>
              <div className="segmented">
                <button
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => setTheme("dark")}
                >
                  <Icon name="moon" size={13} />
                  深色
                </button>
                <button
                  className={theme === "light" ? "active" : ""}
                  onClick={() => setTheme("light")}
                >
                  <Icon name="sun" size={13} />
                  浅色
                </button>
              </div>
            </div>

            <div className="settings-row stacked">
              <span className="settings-label">
                面板不透明度 <span className="settings-val">{opacity}%</span>
              </span>
              <input
                type="range"
                min={50}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="opacity-slider"
              />
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">任务</h3>

            <label className="settings-row">
              <span className="settings-label">折叠已完成任务</span>
              <input
                type="checkbox"
                className="switch"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
            </label>

            <div className="settings-row">
              <span className="settings-label">
                完成后自动归档
                <span className="settings-hint">超过所选天数后移入「归档」</span>
              </span>
              <select
                className="select-chip"
                value={autoArchiveDays}
                onChange={(e) => setAutoArchiveDays(Number(e.target.value))}
              >
                <option value={0}>关闭</option>
                <option value={3}>3 天后</option>
                <option value={7}>7 天后</option>
                <option value={14}>14 天后</option>
                <option value={30}>30 天后</option>
              </select>
            </div>

            <label className="settings-row">
              <span className="settings-label">开机自启</span>
              <input
                type="checkbox"
                className="switch"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
            </label>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">关联文档</h3>

            <label className="settings-row">
              <span className="settings-label">
                显示文档入口
                <span className="settings-hint">关闭只隐藏图标，已有关联不会断开</span>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={docEnabled}
                onChange={(e) => setDocEnabled(e.target.checked)}
              />
            </label>

            <div className="settings-row stacked">
              <span className="settings-label">
                笔记文件夹
                <span className="settings-hint">
                  新建笔记存于此，可指向 Obsidian 仓库或同步目录
                </span>
              </span>
              <div className="folder-field">
                <span className="folder-path" title={current ?? ""}>
                  <Icon name="folder" size={13} />
                  <span>{current || "默认：文档 / PicTodoFloat Notes"}</span>
                </span>
                <button className="btn ghost" onClick={pickFolder}>
                  更改
                </button>
                {current && (
                  <button className="btn ghost" onClick={() => setNotesFolder(null)}>
                    重置
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">数据</h3>

            <div className="settings-row stacked">
              <span className="settings-label">
                存储位置（任务库 + 图片）
                <span className="settings-hint">
                  切换时复制现有数据到新位置，旧数据保留作备份；可放到坚果云 / OneDrive
                  等同步目录
                </span>
              </span>
              <div className="folder-field">
                <span className="folder-path" title={dataDir ?? ""}>
                  <Icon name="folder" size={13} />
                  <span>{dataDir || "默认：AppData"}</span>
                </span>
                <button className="btn ghost" onClick={pickDataDir}>
                  更改
                </button>
                <button className="btn ghost" onClick={() => setDataDir(null)}>
                  重置
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
