use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use tauri::Manager;

/// 缩略图边长：界面按 40px 显示，按 300% 缩放备足像素，高 DPI 屏上不发糊。
const THUMB_PX: u32 = 120;

/// 原样落盘的格式（WebView 能直接显示）；其它格式解码后转存 PNG。
const KEEP_AS_IS: [ImageFormat; 5] = [
    ImageFormat::Png,
    ImageFormat::Jpeg,
    ImageFormat::WebP,
    ImageFormat::Gif,
    ImageFormat::Bmp,
];

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

/// 消费一个 Task，解析其图片路径后返回。任何返回单个 Task 给前端的命令都要走这个，
/// 否则图片相对路径会覆盖前端已渲染的绝对路径，缩略图裂开。
pub fn resolve_task(app: &tauri::AppHandle, mut task: crate::models::Task) -> crate::models::Task {
    resolve_task_images(app, &mut task);
    task
}

/// 删除相对路径对应的原图 + 缩略图文件。
pub fn remove_files(app: &tauri::AppHandle, rel_file: &str, rel_thumb: &str) {
    let _ = fs::remove_file(resolve(app, rel_file));
    let _ = fs::remove_file(resolve(app, rel_thumb));
}

/// 解码并按 EXIF 方向摆正（手机照片常带旋转标记；浏览器显示原图时会按它旋转，缩略图 / 复制出去的图也得一致）。
pub fn decode(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_decoder()
        .map_err(|e| format!("图片解码失败（格式不支持?）: {e}"))?;
    let orientation = decoder.orientation().ok();
    let mut img =
        DynamicImage::from_decoder(decoder).map_err(|e| format!("图片解码失败: {e}"))?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    Ok(img)
}

/// 生成方形缩略图：大图先用 thumbnail() 快速降到短边 2×THUMB_PX，再精细裁切缩放，
/// 避免直接对整张 4K 截图跑 Lanczos3。
fn make_thumb(img: &DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let short = w.min(h).max(1);
    let target = THUMB_PX * 2;
    if short > target {
        let s = target as f64 / short as f64;
        let pre = img.thumbnail(
            ((w as f64 * s).ceil() as u32).max(1),
            ((h as f64 * s).ceil() as u32).max(1),
        );
        pre.resize_to_fill(THUMB_PX, THUMB_PX, FilterType::Lanczos3)
    } else {
        img.resize_to_fill(THUMB_PX, THUMB_PX, FilterType::Lanczos3)
    }
}

/// 核心：图片二进制落盘 + 生成缩略图，返回相对路径。
/// 常见格式原样写入（不再统一转 PNG：JPEG 照片转 PNG 会大好几倍，GIF 动图也会丢帧）；
/// 先完整解码一遍，确认是有效图片再写。耗时（解码 / 缩放），调用方应放到后台线程。
pub fn save(app: &tauri::AppHandle, task_id: i64, bytes: &[u8]) -> Result<SavedImage, String> {
    let img = decode(bytes)?;
    let format = image::guess_format(bytes).ok();

    let base = images_dir(app)?.join(task_id.to_string());
    fs::create_dir_all(&base).map_err(|e| format!("创建图片目录失败: {e}"))?;

    let uuid = uuid::Uuid::new_v4().to_string();
    let ext = match format {
        Some(f) if KEEP_AS_IS.contains(&f) => f.extensions_str()[0],
        _ => "png",
    };
    let orig = base.join(format!("{uuid}.{ext}"));
    let thumb = base.join(format!("{uuid}_thumb.png"));

    if ext == "png" && format != Some(ImageFormat::Png) {
        img.save(&orig).map_err(|e| format!("原图落盘失败: {e}"))?;
    } else {
        fs::write(&orig, bytes).map_err(|e| format!("原图落盘失败: {e}"))?;
    }
    make_thumb(&img)
        .save(&thumb)
        .map_err(|e| format!("缩略图落盘失败: {e}"))?;

    let file_size = fs::metadata(&orig).map(|m| m.len() as i64).unwrap_or(0);

    Ok(SavedImage {
        rel_file: format!("{task_id}/{uuid}.{ext}"),
        rel_thumb: format!("{task_id}/{uuid}_thumb.png"),
        file_size,
    })
}
