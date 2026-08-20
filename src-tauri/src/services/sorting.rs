use rusqlite::Connection;

/// 自动排序（§5.3）：把指定分组（None = 默认组；命令层可对每个组分别调用）内的
/// 非置顶任务重排——未完成在上（保持相对顺序），已完成沉底（completed_at DESC），
/// 并回写 sort_order 成为新的手动基线。
pub fn auto_sort_group(conn: &Connection, group_id: Option<i64>) -> Result<(), String> {
    let (where_group, has_param) = match group_id {
        Some(_) => ("group_id = ?1", true),
        None => ("group_id IS NULL", false),
    };
    let sql = format!(
        "SELECT id FROM tasks
         WHERE pinned = 0 AND archived = 0 AND {where_group}
         ORDER BY completed ASC,
                  CASE WHEN completed = 1 THEN completed_at END DESC,
                  sort_order ASC,
                  id ASC"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let ids: Vec<i64> = if has_param {
        stmt.query_map([group_id.unwrap()], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?
    };
    drop(stmt);

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// group_id = None 时，对全部用户分组 + 默认组分别自动排序。
pub fn auto_sort_all(conn: &Connection, group_id: Option<i64>) -> Result<(), String> {
    match group_id {
        Some(g) => auto_sort_group(conn, Some(g)),
        None => {
            let group_ids: Vec<i64> = {
                let mut stmt = conn
                    .prepare("SELECT id FROM groups")
                    .map_err(|e| e.to_string())?;
                let ids: Vec<i64> = stmt
                    .query_map([], |r| r.get(0))
                    .map_err(|e| e.to_string())?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(|e| e.to_string())?;
                ids
            };
            for g in group_ids {
                auto_sort_group(conn, Some(g))?;
            }
            auto_sort_group(conn, None) // 默认组
        }
    }
}
