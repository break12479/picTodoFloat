mod commands;
mod db;
mod models;
mod services;

use std::fs;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

use db::AppState;

/// 显示并聚焦主窗口（供托盘菜单「显示」与双击托盘复用）。
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 切换主窗口显隐（供全局快捷键 Ctrl+H）。
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        match w.is_visible() {
            Ok(true) => {
                let _ = w.hide();
            }
            _ => show_main_window(app),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // ---- SQLite：数据根目录（可自定义，见指针文件）下建库 + 迁移 ----
            let data_root = services::storage::read_data_root(app.handle())
                .map_err(std::io::Error::other)?;
            fs::create_dir_all(&data_root)?;
            let db_path = data_root.join("pictodo.db");
            let conn = db::init(&db_path).map_err(std::io::Error::other)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                data_root: Mutex::new(data_root),
            });

            // ---- 系统托盘 + 右键菜单（显示 / 退出）----
            let show_i = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("PicTodo Float")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                // 双击托盘图标（左键）→ 显示窗口
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- 全局快捷键 Ctrl+H：显隐窗口（即使未聚焦也生效）----
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };
                let ctrl_h = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyH);
                app.global_shortcut().on_shortcut(ctrl_h, |app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })?;
            }

            Ok(())
        })
        // 主窗关闭按钮：隐藏到托盘而非退出；pin 悬浮窗正常关闭
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::task::get_tasks,
            commands::task::add_task,
            commands::task::update_task,
            commands::task::toggle_task,
            commands::task::delete_task,
            commands::task::delete_tasks,
            commands::task::reorder_tasks,
            commands::task::auto_sort,
            commands::task::pin_task,
            commands::task::move_task_to_group,
            commands::task::get_archived_tasks,
            commands::task::archive_task,
            commands::task::archive_tasks,
            commands::image::add_image_from_bytes,
            commands::image::delete_image,
            commands::image::reorder_images,
            commands::image::copy_image_to_clipboard,
            commands::group::get_groups,
            commands::group::add_group,
            commands::group::rename_group,
            commands::group::delete_group,
            commands::group::reorder_groups,
            commands::doc::link_doc,
            commands::doc::create_doc,
            commands::doc::open_doc,
            commands::doc::check_doc_exists,
            commands::doc::unlink_doc,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::data::get_data_dir,
            commands::data::set_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
