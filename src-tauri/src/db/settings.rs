use rusqlite::{params, Connection, ToSql};

use crate::models::{Settings, SettingsPatch};

pub fn get(conn: &Connection) -> Result<Settings, String> {
    conn.query_row(
        "SELECT opacity, auto_start, notes_folder, theme, hide_completed, auto_archive_days, doc_enabled,
                density, always_on_top, fade_when_idle, edge_hide, toggle_hotkey
         FROM settings WHERE id = 1",
        [],
        |r| {
            Ok(Settings {
                opacity: r.get(0)?,
                auto_start: r.get::<_, i64>(1)? != 0,
                notes_folder: r.get(2)?,
                theme: r.get(3)?,
                hide_completed: r.get::<_, i64>(4)? != 0,
                auto_archive_days: r.get(5)?,
                doc_enabled: r.get::<_, i64>(6)? != 0,
                density: r.get(7)?,
                always_on_top: r.get::<_, i64>(8)? != 0,
                fade_when_idle: r.get::<_, i64>(9)? != 0,
                edge_hide: r.get::<_, i64>(10)? != 0,
                toggle_hotkey: r.get(11)?,
                hotkey_error: None,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// 写一列（列名只来自本文件里的常量，不拼用户输入）。
fn set(conn: &Connection, column: &str, value: impl ToSql) -> Result<(), String> {
    conn.execute(
        &format!("UPDATE settings SET {column} = ?1 WHERE id = 1"),
        params![value],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// 局部更新（None = 不改），一个事务。
pub fn update(conn: &Connection, p: &SettingsPatch) -> Result<Settings, String> {
    if let Some(d) = &p.density {
        if d != "comfortable" && d != "compact" {
            return Err(format!("未知的列表密度：{d}"));
        }
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    if let Some(t) = &p.theme {
        set(&tx, "theme", t)?;
    }
    if let Some(o) = p.opacity {
        set(&tx, "opacity", o.clamp(50, 100))?;
    }
    if let Some(a) = p.auto_start {
        set(&tx, "auto_start", a as i64)?;
    }
    if let Some(nf) = &p.notes_folder {
        // 空串视为清空（回默认目录）
        set(&tx, "notes_folder", Some(nf.as_str()).filter(|v| !v.trim().is_empty()))?;
    }
    if let Some(hc) = p.hide_completed {
        set(&tx, "hide_completed", hc as i64)?;
    }
    if let Some(days) = p.auto_archive_days {
        set(&tx, "auto_archive_days", days.max(0))?;
    }
    if let Some(de) = p.doc_enabled {
        set(&tx, "doc_enabled", de as i64)?;
    }
    if let Some(d) = &p.density {
        set(&tx, "density", d)?;
    }
    if let Some(v) = p.always_on_top {
        set(&tx, "always_on_top", v as i64)?;
    }
    if let Some(v) = p.fade_when_idle {
        set(&tx, "fade_when_idle", v as i64)?;
    }
    if let Some(v) = p.edge_hide {
        set(&tx, "edge_hide", v as i64)?;
    }
    if let Some(h) = &p.toggle_hotkey {
        set(&tx, "toggle_hotkey", h.trim())?;
    }
    tx.execute(
        "UPDATE settings SET updated_at = datetime('now') WHERE id = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    get(conn)
}
