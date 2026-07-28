use tauri::State;

use crate::db::{groups, AppState};
use crate::models::Group;

#[tauri::command]
pub fn get_groups(state: State<'_, AppState>) -> Result<Vec<Group>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    groups::get_all(&conn)
}

#[tauri::command]
pub fn add_group(state: State<'_, AppState>, name: String) -> Result<Group, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("分组名不能为空".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    groups::insert(&conn, name)
}

#[tauri::command]
pub fn rename_group(state: State<'_, AppState>, id: i64, name: String) -> Result<Group, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("分组名不能为空".into());
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    groups::rename(&conn, id, name)
}

#[tauri::command]
pub fn delete_group(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    groups::delete(&conn, id)?;
    Ok(true)
}

#[tauri::command]
pub fn reorder_groups(state: State<'_, AppState>, ordered_ids: Vec<i64>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    groups::reorder(&conn, &ordered_ids)?;
    Ok(true)
}
