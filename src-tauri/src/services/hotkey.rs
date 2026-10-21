use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// 显隐主窗口的全局快捷键：当前注册成功的组合 + 最近一次注册失败的原因（供设置页提示）。
#[derive(Default)]
pub struct HotkeyState {
    pub current: Mutex<Option<Shortcut>>,
    pub error: Mutex<Option<String>>,
}

/// 注册（替换）显隐快捷键：先注册新的，成功后才注销旧的——新组合被占用时旧的照常可用。
pub fn register(app: &tauri::AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut: Shortcut = hotkey
        .parse()
        .map_err(|e| format!("快捷键「{hotkey}」格式不对：{e}"))?;
    let state = app.state::<HotkeyState>();
    let old = *state.current.lock().map_err(|e| e.to_string())?;
    if old != Some(shortcut) {
        app.global_shortcut()
            .on_shortcut(shortcut, |app, _sc, event| {
                if event.state() == ShortcutState::Pressed {
                    crate::toggle_main_window(app);
                }
            })
            .map_err(|e| format!("「{hotkey}」注册失败，可能已被其他程序占用（{e}）"))?;
        if let Some(o) = old {
            let _ = app.global_shortcut().unregister(o);
        }
        *state.current.lock().map_err(|e| e.to_string())? = Some(shortcut);
    }
    *state.error.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// 把运行时的快捷键状态填进返回给前端的设置里。
pub fn fill_status(app: &tauri::AppHandle, s: &mut crate::models::Settings) {
    let state = app.state::<HotkeyState>();
    s.hotkey_error = state.error.lock().ok().and_then(|e| e.clone());
}
