use rusqlite::{params, Connection, Row};

use crate::models::Group;

fn row_to_group(row: &Row) -> rusqlite::Result<Group> {
    Ok(Group {
        id: row.get("id")?,
        name: row.get("name")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
    })
}

pub fn get_all(conn: &Connection) -> Result<Vec<Group>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM groups ORDER BY sort_order ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let groups = stmt
        .query_map([], row_to_group)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

pub fn get_one(conn: &Connection, id: i64) -> Result<Group, String> {
    conn.query_row("SELECT * FROM groups WHERE id = ?1", params![id], row_to_group)
        .map_err(|e| e.to_string())
}

pub fn insert(conn: &Connection, name: &str) -> Result<Group, String> {
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM groups",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO groups (name, sort_order) VALUES (?1, ?2)",
        params![name, next],
    )
    .map_err(|e| e.to_string())?;
    get_one(conn, conn.last_insert_rowid())
}

pub fn rename(conn: &Connection, id: i64, name: &str) -> Result<Group, String> {
    let n = conn
        .execute("UPDATE groups SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("分组 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 删除分组：组内任务归为默认组（group_id = NULL），再删组。
pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE tasks SET group_id = NULL WHERE group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder(conn: &Connection, ordered_ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE groups SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
