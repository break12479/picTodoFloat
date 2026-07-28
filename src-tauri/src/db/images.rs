use rusqlite::{params, Connection, Row};

use crate::models::TaskImage;

fn row_to_image(row: &Row) -> rusqlite::Result<TaskImage> {
    Ok(TaskImage {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        file_path: row.get("file_path")?,
        thumb_path: row.get("thumb_path")?,
        original_name: row.get("original_name")?,
        file_size: row.get("file_size")?,
        sort_order: row.get("sort_order")?,
    })
}

pub fn get_one(conn: &Connection, id: i64) -> Result<TaskImage, String> {
    conn.query_row(
        "SELECT * FROM task_images WHERE id = ?1",
        params![id],
        row_to_image,
    )
    .map_err(|e| e.to_string())
}

pub fn insert(
    conn: &Connection,
    task_id: i64,
    rel_file: &str,
    rel_thumb: &str,
    original_name: Option<&str>,
    file_size: i64,
) -> Result<TaskImage, String> {
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM task_images WHERE task_id = ?1",
            params![task_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO task_images (task_id, file_path, thumb_path, original_name, file_size, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![task_id, rel_file, rel_thumb, original_name, file_size, next],
    )
    .map_err(|e| e.to_string())?;
    get_one(conn, conn.last_insert_rowid())
}

/// 删除图片记录，返回相对路径 (file, thumb) 供 service 层删磁盘文件。
pub fn delete(conn: &Connection, id: i64) -> Result<(String, String), String> {
    let paths: (String, String) = conn
        .query_row(
            "SELECT file_path, thumb_path FROM task_images WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM task_images WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(paths)
}

pub fn reorder(conn: &Connection, task_id: i64, ordered_ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE task_images SET sort_order = ?1 WHERE id = ?2 AND task_id = ?3",
            params![i as i64, id, task_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
