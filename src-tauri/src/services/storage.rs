use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

/// 数据根目录的指针文件——始终存放在默认配置目录，独立于数据本身。
fn pointer_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析配置目录: {e}"))?
        .join("data-root.txt"))
}

/// 默认数据根目录（AppData）。
pub fn default_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法解析数据目录: {e}"))
}

/// 读取当前数据根目录：指针文件配置了就用它，否则默认。
pub fn read_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let pf = pointer_file(app)?;
    if let Ok(content) = fs::read_to_string(&pf) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    default_data_root(app)
}

/// 写入/清除指针文件（None = 恢复默认，删除指针）。
pub fn write_data_root(app: &tauri::AppHandle, dir: Option<&Path>) -> Result<(), String> {
    let pf = pointer_file(app)?;
    if let Some(parent) = pf.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    match dir {
        Some(d) => fs::write(&pf, d.to_string_lossy().as_bytes())
            .map_err(|e| format!("写入数据位置失败: {e}")),
        None => {
            let _ = fs::remove_file(&pf);
            Ok(())
        }
    }
}

/// 递归复制目录（合并，已存在文件跳过）。
pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), &target).map_err(|e| format!("复制文件失败: {e}"))?;
        }
    }
    Ok(())
}
