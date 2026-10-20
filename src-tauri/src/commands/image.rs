use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, State};

use crate::db::{images, AppState};
use crate::models::TaskImage;
use crate::services::image as image_svc;

/// 核心：接收粘贴/拖入的图片二进制，落盘原图 + 缩略图，写记录。
/// 图片走原始二进制 IPC（请求体就是字节，不再是 JSON 数字数组），任务 id / 文件名放在请求头里；
/// 解码、缩放放到后台线程，不阻塞主线程（同步命令默认跑在主线程，大图会卡住窗口和托盘）。
/// 返回的路径已解析为绝对路径，供前端 convertFileSrc 渲染。
#[tauri::command]
pub async fn add_image_from_bytes(
    app: tauri::AppHandle,
    request: Request<'_>,
) -> Result<TaskImage, String> {
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        // 自定义协议 IPC 不可用、退回 postMessage 时，字节会以 JSON 数组到达
        InvokeBody::Json(v) => {
            serde_json::from_value(v.clone()).map_err(|_| "图片数据格式错误".to_string())?
        }
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
    };
    let task_id: i64 = header("x-task-id")
        .and_then(|v| v.parse().ok())
        .ok_or("缺少任务 id")?;
    let original_name = header("x-file-name");

    let app2 = app.clone();
    let saved = tauri::async_runtime::spawn_blocking(move || image_svc::save(&app2, task_id, &bytes))
        .await
        .map_err(|e| e.to_string())??;

    let state = app.state::<AppState>();
    let mut img = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        images::insert(
            &conn,
            task_id,
            &saved.rel_file,
            &saved.rel_thumb,
            original_name.as_deref(),
            saved.file_size,
        )
    }
    .inspect_err(|_| image_svc::remove_files(&app, &saved.rel_file, &saved.rel_thumb))?;
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

/// 把图片复制到系统剪贴板（预览里 Ctrl+C）。解码大图较慢，放后台线程。
#[tauri::command]
pub async fn copy_image_to_clipboard(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("打开图片失败: {e}"))?;
        let img = image_svc::decode(&bytes)?.to_rgba8();
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
    })
    .await
    .map_err(|e| e.to_string())?
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
