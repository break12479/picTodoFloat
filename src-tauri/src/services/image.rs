use std::fs;
use std::path::PathBuf;

use image::imageops::FilterType;
use tauri::Manager;

/// 落盘结果：路径为相对 AppData/images 的相对路径（DB 存相对，前端用绝对）。
pub struct SavedImage {
    pub rel_file: String,
    pub rel_thumb: String,
    pub file_size: i64,
}

/// 图片根目录 = 当前数据根目录/images（数据根目录可在设置中自定义）。
pub fn images_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<crate::db::AppState>();
    let root = state.data_root.lock().map_err(|e| e.to_string())?.clone();
    Ok(root.join("images"))
}

/// 把相对路径解析为绝对路径（供 convertFileSrc 渲染）。
pub fn resolve(app: &tauri::AppHandle, rel: &str) -> String {
    images_dir(app)
        .map(|d| d.join(rel).to_string_lossy().into_owned())
        .unwrap_or_else(|_| rel.to_string())
}

/// 把任务图片的相对路径就地解析为绝对路径（供前端 convertFileSrc）。
pub fn resolve_task_images(app: &tauri::AppHandle, task: &mut crate::models::Task) {
    for img in task.images.iter_mut() {
        img.file_path = resolve(app, &img.file_path);
        img.thumb_path = resolve(app, &img.thumb_path);
    }
}

/// 删除相对路径对应的原图 + 缩略图文件。
pub fn remove_files(app: &tauri::AppHandle, rel_file: &str, rel_thumb: &str) {
    let _ = fs::remove_file(resolve(app, rel_file));
    let _ = fs::remove_file(resolve(app, rel_thumb));
}

/// 核心：解码图片二进制 → 落盘原图（png）+ 生成 40×40 缩略图。
/// 返回相对路径。（P0 已验证 image 크레이트可解码各截图格式并高效缩放）
pub fn save(app: &tauri::AppHandle, task_id: i64, bytes: &[u8]) -> Result<SavedImage, String> {
    let base = images_dir(app)?.join(task_id.to_string());
    fs::create_dir_all(&base).map_err(|e| format!("创建图片目录失败: {e}"))?;

    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("图片解码失败（格式不支持?）: {e}"))?;

    let uuid = uuid::Uuid::new_v4().to_string();
    let orig = base.join(format!("{uuid}.png"));
    let thumb = base.join(format!("{uuid}_thumb.png"));

    img.save(&orig).map_err(|e| format!("原图落盘失败: {e}"))?;
    img.resize_to_fill(40, 40, FilterType::Lanczos3)
        .save(&thumb)
        .map_err(|e| format!("缩略图落盘失败: {e}"))?;

    let file_size = fs::metadata(&orig).map(|m| m.len() as i64).unwrap_or(0);

    Ok(SavedImage {
        rel_file: format!("{task_id}/{uuid}.png"),
        rel_thumb: format!("{task_id}/{uuid}_thumb.png"),
        file_size,
    })
}
