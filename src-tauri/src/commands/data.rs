use std::path::PathBuf;

use tauri::State;

use crate::db::{self, AppState};
use crate::services::storage;

#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state
        .data_root
        .lock()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned())
}

/// 切换数据存储位置（数据库 + 图片）。
/// - dir = Some(路径)：切到该目录；空目录则把现有数据**复制**过去，已有 PicTodo 数据则直接沿用。
/// - dir = None：恢复默认（AppData）。
/// 旧数据保留原地作为备份，绝不删除。
#[tauri::command]
pub fn set_data_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    dir: Option<String>,
) -> Result<String, String> {
    let target: PathBuf = match &dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d.trim()),
        _ => storage::default_data_root(&app)?,
    };

    let current = state.data_root.lock().map_err(|e| e.to_string())?.clone();
    if target == current {
        return Ok(current.to_string_lossy().into_owned());
    }

    std::fs::create_dir_all(&target).map_err(|e| format!("创建目标目录失败: {e}"))?;
    let target_db = target.join("pictodo.db");

    // 目标没有 PicTodo 数据 → 把当前数据复制过去；已有则直接沿用目标数据
    if !target_db.exists() {
        {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "VACUUM INTO ?1",
                [target_db.to_string_lossy().to_string()],
            )
            .map_err(|e| format!("复制数据库失败: {e}"))?;
        }
        storage::copy_dir_all(&current.join("images"), &target.join("images"))?;
    }

    // 重开连接指向新位置（旧连接随之关闭）
    {
        let mut guard = state.db.lock().map_err(|e| e.to_string())?;
        *guard = db::init(&target_db)?;
    }

    *state.data_root.lock().map_err(|e| e.to_string())? = target.clone();
    storage::write_data_root(&app, if dir.is_some() { Some(&target) } else { None })?;

    Ok(target.to_string_lossy().into_owned())
}
