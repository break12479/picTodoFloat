use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::db::{tasks, AppState};
use crate::models::Task;
use crate::services::docs;
use crate::services::image as image_svc;

/// 返回前，解析图片相对路径，避免覆盖前端已渲染的图片。
fn resolved(app: &tauri::AppHandle, task: Task) -> Task {
    image_svc::resolve_task(app, task)
}

/// 关联已有 .md：存绝对路径。
#[tauri::command]
pub fn link_doc(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
    abs_path: String,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        tasks::set_doc_path(&conn, task_id, Some(&abs_path))?
    };
    Ok(resolved(&app, task))
}

/// 在笔记文件夹新建 .md，存相对路径，并用系统默认程序打开。
#[tauri::command]
pub fn create_doc(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
    title: String,
) -> Result<Task, String> {
    let (task, abs_path) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let rel = docs::create(&app, &conn, &title)?;
        let abs = docs::resolve(&app, &conn, &rel)?;
        let task = tasks::set_doc_path(&conn, task_id, Some(&rel))?;
        (task, abs)
    };
    // 新建后打开（失败不阻塞关联结果）
    let _ = app
        .opener()
        .open_path(abs_path.to_string_lossy().to_string(), None::<&str>);
    Ok(resolved(&app, task))
}

/// 用系统默认程序打开；文件缺失返回错误供前端标断链。
#[tauri::command]
pub fn open_doc(app: tauri::AppHandle, state: State<'_, AppState>, task_id: i64) -> Result<bool, String> {
    let abs = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let task = tasks::get_one(&conn, task_id)?;
        let doc_path = task.doc_path.ok_or_else(|| "该任务未关联文档".to_string())?;
        docs::resolve(&app, &conn, &doc_path)?
    };
    if !abs.exists() {
        return Err("文档不存在（可能已被移动或删除）".to_string());
    }
    app.opener()
        .open_path(abs.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开失败: {e}"))?;
    Ok(true)
}

/// 加载时校验断链。
#[tauri::command]
pub fn check_doc_exists(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let task = tasks::get_one(&conn, task_id)?;
    match task.doc_path {
        None => Ok(false),
        Some(p) => Ok(docs::resolve(&app, &conn, &p)?.exists()),
    }
}

/// 取消关联：清空 doc_path，不删文件；文件存在则在末尾追加“已断联”备注。
#[tauri::command]
pub fn unlink_doc(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
) -> Result<Task, String> {
    let task = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        // 先尝试给原文档追加备注（缺失则跳过）
        if let Ok(t) = tasks::get_one(&conn, task_id) {
            if let Some(dp) = t.doc_path {
                if let Ok(abs) = docs::resolve(&app, &conn, &dp) {
                    if abs.exists() {
                        let _ = docs::append_unlink_note(&abs);
                    }
                }
            }
        }
        tasks::set_doc_path(&conn, task_id, None)?
    };
    Ok(resolved(&app, task))
}
