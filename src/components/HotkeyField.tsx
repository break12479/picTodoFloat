import { useState } from "react";

import { useSettingsStore } from "../stores/settingsStore";

// 允许单独使用（不带修饰键）的键：F1~F24
const STANDALONE = /^F([1-9]|1\d|2[0-4])$/;
// global-hotkey 认得的键名（KeyboardEvent.code 去掉 Key / Digit 前缀后）
const SUPPORTED =
  /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad\d)$/;

/** 把一次按键转成快捷键字符串（如 "Ctrl+Shift+H"）；只按了修饰键或不支持的键返回 null。 */
function comboFromEvent(e: React.KeyboardEvent): string | null {
  const key = e.code.replace(/^Key/, "").replace(/^Digit/, "");
  if (/^(Control|Shift|Alt|Meta|OS)/.test(e.code) || !SUPPORTED.test(key)) return null;
  const mods = [
    e.ctrlKey && "Ctrl",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.metaKey && "Super",
  ].filter(Boolean) as string[];
  // 只有 Shift 不算：Shift+字母就是打大写，会吞掉正常输入
  const hasRealMod = e.ctrlKey || e.altKey || e.metaKey;
  if (!hasRealMod && !STANDALONE.test(key)) return null;
  return [...mods, key].join("+");
}

const Keys = ({ combo }: { combo: string }) => (
  <span className="hotkey-keys">
    {combo.split("+").map((k, i) => (
      <kbd key={i}>{k === "Super" ? "Win" : k}</kbd>
    ))}
  </span>
);

/** 显隐主窗口的全局快捷键：点「修改」后直接按新组合键，立即注册；被占用时保留原快捷键并提示。 */
export default function HotkeyField() {
  const hotkey = useSettingsStore((s) => s.settings?.toggle_hotkey ?? "Ctrl+H");
  const error = useSettingsStore((s) => s.settings?.hotkey_error ?? null);
  const update = useSettingsStore((s) => s.update);
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onKeyDown = async (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // 录制中的按键不交给应用内快捷键，也别让 Esc 关掉设置面板
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      setHint(null);
      return;
    }
    const combo = comboFromEvent(e);
    if (!combo) {
      if (!/^(Control|Shift|Alt|Meta|OS)/.test(e.code)) {
        setHint("需要配合 Ctrl / Alt / Win（F1~F12 可单独使用）");
      }
      return;
    }
    setRecording(false);
    setHint(null);
    if (combo !== hotkey) await update({ toggle_hotkey: combo });
  };

  return (
    <div className="hotkey-field">
      {recording ? (
        <button
          className="hotkey-record"
          autoFocus
          onKeyDown={onKeyDown}
          onBlur={() => {
            setRecording(false);
            setHint(null);
          }}
        >
          按下新的组合键…（Esc 取消）
        </button>
      ) : (
        <>
          <Keys combo={hotkey} />
          <button className="btn ghost" onClick={() => setRecording(true)}>
            修改
          </button>
        </>
      )}
      {(hint || error) && <span className="settings-warn">{hint ?? error}</span>}
    </div>
  );
}
