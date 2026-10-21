use tauri::State;

use crate::db::{settings, tasks, AppState};
use crate::models::Task;
use crate::services::image as image_svc;
use crate::services::sorting;

#[tauri::command]
pub fn get_tasks(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let mut list = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        // 顺带检查自动归档（完成超过 N 天），不需要常驻定时器
        run_auto_archive(&conn)?;
        tasks::get_all(&conn)?
    };
    for t in list.iter_mut() {
        image_svc::resolve_task_images(&app, t);
    }
    Ok(list)
}

/// 按设置的天数把过期的已完成任务归档，返回归档条数。
fn run_auto_archive(conn: &rusqlite::Connection) -> Result<usize, String> {
    let days = settings::get(conn)?.auto_archive_days;
    if days > 0 {
        tasks::auto_archive_stale(conn, days)
    } else {
        Ok(0)
    }
}

/// 单独跑一次自动归档（前端在窗口获得焦点时 / 定时调用）：应用常驻托盘时
/// get_tasks 很久都不会再被调用，只靠它检查的话"完成 N 天后归档"迟迟不生效。
#[tauri::command]
pub fn auto_archive(state: State<'_, AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    run_auto_archive(&conn)
}

#[tauri::command]
pub fn get_archived_tasks(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    let mut list = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::get_archived(&conn)?
    };
    for t in list.iter_mut() {
        image_svc::resolve_task_images(&app, t);
    }
    Ok(list)
}

#[tauri::command]
pub fn archive_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::set_archived(&conn, id, archived)?
    };
    Ok(image_svc::resolve_task(&app, task))
}

/// 批量归档/取消归档（多选）。
#[tauri::command]
pub fn archive_tasks(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    archived: bool,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::set_archived_many(&conn, &ids, archived)?;
    Ok(true)
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
pub fn update_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::update_content(&conn, id, &content)?
    };
    Ok(image_svc::resolve_task(&app, task))
}

#[tauri::command]
pub fn toggle_task(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::toggle(&conn, id)?
    };
    Ok(image_svc::resolve_task(&app, task))
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
pub fn pin_task(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::set_pinned(&conn, id, pinned)?
    };
    Ok(image_svc::resolve_task(&app, task))
}

#[tauri::command]
pub fn move_task_to_group(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    group_id: Option<i64>,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::set_group(&conn, id, group_id)?
    };
    Ok(image_svc::resolve_task(&app, task))
}

/// 多选拖拽落下：移组 + 重排目标组，一个事务。
#[tauri::command]
pub fn move_tasks(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    group_id: Option<i64>,
    ordered_ids: Vec<i64>,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks::move_many(&conn, &ids, group_id, &ordered_ids)?;
    Ok(true)
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
        // 一个事务：中途失败则一条都不删（也就不会删掉对应的图片文件）
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let mut all = Vec::new();
        for id in &ids {
            all.extend(tasks::delete(&tx, *id)?);
        }
        tx.commit().map_err(|e| e.to_string())?;
        all
    };
    for (rel_file, rel_thumb) in files {
        image_svc::remove_files(&app, &rel_file, &rel_thumb);
    }
    Ok(true)
}
