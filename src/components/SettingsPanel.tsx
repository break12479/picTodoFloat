import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useSettingsStore } from "../stores/settingsStore";
import HotkeyField from "./HotkeyField";
import Icon from "./Icon";

interface Props {
  onClose: () => void;
}

/** 设置面板：外观 / 窗口 / 任务 / 关联文档 / 数据。保存失败会回滚并在底部提示。 */
export default function SettingsPanel({ onClose }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const setOpacity = useSettingsStore((s) => s.setOpacity);
  const dataDir = useSettingsStore((s) => s.dataDir);
  const setDataDir = useSettingsStore((s) => s.setDataDir);

  const current = settings?.notes_folder;
  const opacity = settings?.opacity ?? 85;
  const theme = settings?.theme ?? "dark";
  const density = settings?.density ?? "comfortable";

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
      await update({ notes_folder: selected });
    }
  };

  /** 开关行：整行可点。 */
  const toggle = (
    key: "fade_when_idle" | "always_on_top" | "edge_hide" | "auto_start" | "hide_completed" | "doc_enabled",
    label: string,
    hint?: string
  ) => (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <span className="settings-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={settings?.[key] ?? false}
        onChange={(e) => update({ [key]: e.target.checked })}
      />
    </label>
  );

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <span>设置</span>
          <button className="icon-btn" onClick={onClose} title="关闭" aria-label="关闭设置">
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
                  aria-pressed={theme === "dark"}
                  onClick={() => update({ theme: "dark" })}
                >
                  <Icon name="moon" size={13} />
                  深色
                </button>
                <button
                  className={theme === "light" ? "active" : ""}
                  aria-pressed={theme === "light"}
                  onClick={() => update({ theme: "light" })}
                >
                  <Icon name="sun" size={13} />
                  浅色
                </button>
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-label">
                列表密度
                <span className="settings-hint">紧凑：字号行距更小，一屏放下更多任务</span>
              </span>
              <div className="segmented">
                <button
                  className={density === "comfortable" ? "active" : ""}
                  aria-pressed={density === "comfortable"}
                  onClick={() => update({ density: "comfortable" })}
                >
                  舒适
                </button>
                <button
                  className={density === "compact" ? "active" : ""}
                  aria-pressed={density === "compact"}
                  onClick={() => update({ density: "compact" })}
                >
                  紧凑
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
                aria-label="面板不透明度"
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="opacity-slider"
              />
            </div>

            {toggle("fade_when_idle", "鼠标移开时变淡", "移开后面板半透明，不挡后面的内容；移回即恢复")}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">窗口</h3>
            {toggle("always_on_top", "始终置顶", "也可以点标题栏的图钉切换")}
            {toggle(
              "edge_hide",
              "贴边自动隐藏",
              "把窗口拖到屏幕上 / 左 / 右边缘，鼠标移开就收起只留一条边，移回来展开"
            )}
            <div className="settings-row stacked">
              <span className="settings-label">
                显示 / 隐藏窗口的快捷键
                <span className="settings-hint">全局生效，窗口没有焦点时也能用</span>
              </span>
              <HotkeyField />
            </div>
            {toggle("auto_start", "开机自启")}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">任务</h3>

            {toggle("hide_completed", "默认折叠已完成任务", "各分组的「已完成 N」可以单独展开 / 折叠")}

            <div className="settings-row">
              <span className="settings-label">
                完成后自动归档
                <span className="settings-hint">超过所选天数后移入「归档」</span>
              </span>
              <select
                className="select-chip"
                value={settings?.auto_archive_days ?? 0}
                aria-label="完成后自动归档"
                onChange={(e) => update({ auto_archive_days: Number(e.target.value) })}
              >
                <option value={0}>关闭</option>
                <option value={3}>3 天后</option>
                <option value={7}>7 天后</option>
                <option value={14}>14 天后</option>
                <option value={30}>30 天后</option>
              </select>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">关联文档</h3>

            {toggle("doc_enabled", "显示文档入口", "关闭只隐藏图标，已有关联不会断开")}

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
                  <button className="btn ghost" onClick={() => update({ notes_folder: "" })}>
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
