use tauri::State;
use tauri_plugin_autostart::ManagerExt;

use crate::db::{settings, AppState};
use crate::models::{Settings, SettingsPatch};
use crate::services::hotkey;

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Settings, String> {
    let mut s = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        settings::get(&conn)?
    };
    hotkey::fill_status(&app, &mut s);
    Ok(s)
}

/// 局部更新设置。有副作用的项（快捷键、开机自启）先执行，成功了才写库——
/// 失败时直接报错、设置保持原样，界面不会显示一个实际没生效的状态。
#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    if let Some(hk) = &patch.toggle_hotkey {
        hotkey::register(&app, hk.trim())?;
    }
    if let Some(enable) = patch.auto_start {
        let mgr = app.autolaunch();
        let r = if enable { mgr.enable() } else { mgr.disable() };
        r.map_err(|e| format!("设置开机自启失败: {e}"))?;
    }
    let mut s = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        settings::update(&conn, &patch)?
    };
    hotkey::fill_status(&app, &mut s);
    Ok(s)
}
