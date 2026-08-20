use tauri::State;
use tauri_plugin_autostart::ManagerExt;

use crate::db::{settings, AppState};
use crate::models::Settings;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    settings::get(&conn)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    opacity: Option<i64>,
    auto_start: Option<bool>,
    notes_folder: Option<String>,
    theme: Option<String>,
    hide_completed: Option<bool>,
    auto_archive_days: Option<i64>,
    doc_enabled: Option<bool>,
) -> Result<Settings, String> {
    let result = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        settings::update(
            &conn,
            opacity,
            auto_start,
            notes_folder,
            theme,
            hide_completed,
            auto_archive_days,
            doc_enabled,
        )?
    };

    // 开机自启副作用：实际启用/停用
    if let Some(enable) = auto_start {
        let mgr = app.autolaunch();
        let r = if enable { mgr.enable() } else { mgr.disable() };
        r.map_err(|e| format!("设置开机自启失败: {e}"))?;
    }

    Ok(result)
}
