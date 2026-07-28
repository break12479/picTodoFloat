use tauri::State;

use crate::db::{tasks, AppState};
use crate::models::Task;
use crate::services::image as image_svc;
use crate::services::sorting;

#[tauri::command]
pub fn get_tasks(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let mut list = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::get_all(&conn)?
    };
    for t in list.iter_mut() {
        image_svc::resolve_task_images(&app, t);
    }
    Ok(list)
}

#[tauri::command]
pub fn add_task(
    state: State<'_, AppState>,
    content: String,
    group_id: Option<i64>,
) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::insert(&conn, &content, group_id)
}

#[tauri::command]
pub fn update_task(state: State<'_, AppState>, id: i64, content: String) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::update_content(&conn, id, &content)
}

#[tauri::command]
pub fn toggle_task(state: State<'_, AppState>, id: i64) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::toggle(&conn, id)
}

#[tauri::command]
pub fn reorder_tasks(state: State<'_, AppState>, ordered_ids: Vec<i64>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::reorder(&conn, &ordered_ids)?;
    Ok(true)
}

#[tauri::command]
pub fn auto_sort(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    group_id: Option<i64>,
) -> Result<Vec<Task>, String> {
    let mut list = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        sorting::auto_sort_all(&conn, group_id)?;
        tasks::get_all(&conn)?
    };
    for t in list.iter_mut() {
        image_svc::resolve_task_images(&app, t);
    }
    Ok(list)
}

#[tauri::command]
pub fn pin_task(state: State<'_, AppState>, id: i64, pinned: bool) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::set_pinned(&conn, id, pinned)
}

#[tauri::command]
pub fn move_task_to_group(
    state: State<'_, AppState>,
    id: i64,
    group_id: Option<i64>,
) -> Result<Task, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::set_group(&conn, id, group_id)
}

#[tauri::command]
pub fn delete_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let files = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::delete(&conn, id)?
    };
    // 级联删除图片记录后，清磁盘文件（路径为相对，需解析）
    for (rel_file, rel_thumb) in files {
        image_svc::remove_files(&app, &rel_file, &rel_thumb);
    }
    Ok(true)
}

/// 批量删除（多选）。
#[tauri::command]
pub fn delete_tasks(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<bool, String> {
    let files = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mut all = Vec::new();
        for id in &ids {
            all.extend(tasks::delete(&conn, *id)?);
        }
        all
    };
    for (rel_file, rel_thumb) in files {
        image_svc::remove_files(&app, &rel_file, &rel_thumb);
    }
    Ok(true)
}
