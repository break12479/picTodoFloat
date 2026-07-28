use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::Manager;

use crate::db::settings;

/// 笔记根目录：settings.notes_folder 配置了就用它，否则默认 文档/PicTodoFloat Notes。
pub fn notes_root(app: &tauri::AppHandle, conn: &Connection) -> Result<PathBuf, String> {
    let s = settings::get(conn)?;
    match s.notes_folder {
        Some(f) if !f.trim().is_empty() => Ok(PathBuf::from(f)),
        _ => Ok(app
            .path()
            .document_dir()
            .map_err(|e| format!("无法解析文档目录: {e}"))?
            .join("PicTodoFloat Notes")),
    }
}

/// 把 doc_path 解析为绝对路径：绝对路径（外部关联）直接用；相对路径（应用新建）拼笔记根目录。
pub fn resolve(app: &tauri::AppHandle, conn: &Connection, doc_path: &str) -> Result<PathBuf, String> {
    let p = Path::new(doc_path);
    if p.is_absolute() {
        Ok(p.to_path_buf())
    } else {
        Ok(notes_root(app, conn)?.join(doc_path))
    }
}

/// 在笔记文件夹新建 .md（预填 H1），返回相对笔记根目录的路径。
pub fn create(
    app: &tauri::AppHandle,
    conn: &Connection,
    title: &str,
) -> Result<String, String> {
    let root = notes_root(app, conn)?;
    fs::create_dir_all(&root).map_err(|e| format!("创建笔记目录失败: {e}"))?;

    let date: String = conn
        .query_row("SELECT strftime('%Y%m%d','now')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let slug = slugify(title);

    let mut filename = format!("{date}-{slug}.md");
    if root.join(&filename).exists() {
        let short = &uuid::Uuid::new_v4().to_string()[..6];
        filename = format!("{date}-{slug}-{short}.md");
    }

    let heading = if title.trim().is_empty() { "未命名" } else { title.trim() };
    fs::write(root.join(&filename), format!("# {heading}\n\n"))
        .map_err(|e| format!("写入笔记失败: {e}"))?;

    Ok(filename)
}

/// 取消关联时在文档末尾追加一条“已断联”备注（不删除文件）。
pub fn append_unlink_note(path: &Path) -> Result<(), String> {
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|e| format!("打开文档追加备注失败: {e}"))?;
    writeln!(f, "\n\n> （已断联：此文档已从 PicTodo 任务解除关联）")
        .map_err(|e| format!("写入备注失败: {e}"))?;
    Ok(())
}

/// 标题转文件名 slug：保留字母/数字/中日韩字符，其余转 '-'，合并连续 '-'。
fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in title.trim().chars() {
        if c.is_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let limited: String = trimmed.chars().take(40).collect();
    if limited.is_empty() {
        "note".to_string()
    } else {
        limited
    }
}
