use rusqlite::{params, Connection};

use crate::models::Settings;

pub fn get(conn: &Connection) -> Result<Settings, String> {
    conn.query_row(
        "SELECT opacity, auto_start, notes_folder, theme FROM settings WHERE id = 1",
        [],
        |r| {
            Ok(Settings {
                opacity: r.get(0)?,
                auto_start: r.get::<_, i64>(1)? != 0,
                notes_folder: r.get(2)?,
                theme: r.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// 局部更新（None = 不改）。notes_folder 传入空串视为清空（回默认目录）。
pub fn update(
    conn: &Connection,
    opacity: Option<i64>,
    auto_start: Option<bool>,
    notes_folder: Option<String>,
    theme: Option<String>,
) -> Result<Settings, String> {
    if let Some(t) = theme {
        conn.execute(
            "UPDATE settings SET theme = ?1 WHERE id = 1",
            params![t],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(o) = opacity {
        conn.execute(
            "UPDATE settings SET opacity = ?1 WHERE id = 1",
            params![o.clamp(50, 100)],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(a) = auto_start {
        conn.execute(
            "UPDATE settings SET auto_start = ?1 WHERE id = 1",
            params![a as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(nf) = notes_folder {
        let value: Option<String> = if nf.trim().is_empty() { None } else { Some(nf) };
        conn.execute(
            "UPDATE settings SET notes_folder = ?1 WHERE id = 1",
            params![value],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE settings SET updated_at = datetime('now') WHERE id = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    get(conn)
}
