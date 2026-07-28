use tauri::State;

use crate::db::{images, AppState};
use crate::models::TaskImage;
use crate::services::image as image_svc;

/// 核心：接收粘贴/拖入的图片二进制，落盘原图 + 缩略图，写记录。
/// 返回的路径已解析为绝对路径，供前端 convertFileSrc 渲染。
#[tauri::command]
pub fn add_image_from_bytes(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
    bytes: Vec<u8>,
    original_name: Option<String>,
) -> Result<TaskImage, String> {
    let saved = image_svc::save(&app, task_id, &bytes)?;
    let mut img = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        images::insert(
            &conn,
            task_id,
            &saved.rel_file,
            &saved.rel_thumb,
            original_name.as_deref(),
            saved.file_size,
        )?
    };
    img.file_path = image_svc::resolve(&app, &img.file_path);
    img.thumb_path = image_svc::resolve(&app, &img.thumb_path);
    Ok(img)
}

#[tauri::command]
pub fn delete_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    image_id: i64,
) -> Result<bool, String> {
    let (rel_file, rel_thumb) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        images::delete(&conn, image_id)?
    };
    image_svc::remove_files(&app, &rel_file, &rel_thumb);
    Ok(true)
}

/// 把图片复制到系统剪贴板（预览里 Ctrl+C）。
#[tauri::command]
pub fn copy_image_to_clipboard(path: String) -> Result<bool, String> {
    let img = image::open(&path)
        .map_err(|e| format!("打开图片失败: {e}"))?
        .to_rgba8();
    let (w, h) = img.dimensions();
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("剪贴板初始化失败: {e}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: std::borrow::Cow::Owned(img.into_raw()),
        })
        .map_err(|e| format!("写入剪贴板失败: {e}"))?;
    Ok(true)
}

#[tauri::command]
pub fn reorder_images(
    state: State<'_, AppState>,
    task_id: i64,
    ordered_ids: Vec<i64>,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    images::reorder(&conn, task_id, &ordered_ids)?;
    Ok(true)
}
