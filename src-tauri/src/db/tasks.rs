use rusqlite::{params, Connection, Row};

use crate::models::{Task, TaskImage};

fn row_to_task(row: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        content: row.get("content")?,
        completed: row.get::<_, i64>("completed")? != 0,
        completed_at: row.get("completed_at")?,
        sort_order: row.get("sort_order")?,
        group_id: row.get("group_id")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        doc_path: row.get("doc_path")?,
        archived: row.get::<_, i64>("archived")? != 0,
        archived_at: row.get("archived_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        images: Vec::new(),
    })
}

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

/// 载入每个任务的图片（P3 起有数据；此处统一填充）。
fn attach_images(conn: &Connection, tasks: Vec<Task>) -> Result<Vec<Task>, String> {
    let mut img_stmt = conn
        .prepare("SELECT * FROM task_images WHERE task_id = ?1 ORDER BY sort_order ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let mut result = Vec::with_capacity(tasks.len());
    for mut t in tasks {
        t.images = img_stmt
            .query_map(params![t.id], row_to_image)
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?;
        result.push(t);
    }
    Ok(result)
}

/// 按 tech-design §5.3 排序规则返回完整列表（含各任务图片）。归档任务不在此列，见 [`get_archived`]。
/// 分组 join 待 P4 完善；当前：置顶优先 → 未完成(按 sort_order) → 已完成(completed_at DESC)。
pub fn get_all(conn: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT * FROM tasks
             WHERE archived = 0
             ORDER BY pinned DESC,
                      completed ASC,
                      completed_at DESC,
                      sort_order ASC,
                      id ASC",
        )
        .map_err(|e| e.to_string())?;
    let tasks: Vec<Task> = stmt
        .query_map([], row_to_task)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    attach_images(conn, tasks)
}

/// 已归档任务，最近归档的在前。
pub fn get_archived(conn: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT * FROM tasks
             WHERE archived = 1
             ORDER BY archived_at DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let tasks: Vec<Task> = stmt
        .query_map([], row_to_task)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    attach_images(conn, tasks)
}

pub fn get_one(conn: &Connection, id: i64) -> Result<Task, String> {
    let mut task = conn
        .query_row("SELECT * FROM tasks WHERE id = ?1", params![id], row_to_task)
        .map_err(|e| e.to_string())?;
    let mut img_stmt = conn
        .prepare("SELECT * FROM task_images WHERE task_id = ?1 ORDER BY sort_order ASC, id ASC")
        .map_err(|e| e.to_string())?;
    task.images = img_stmt
        .query_map(params![id], row_to_image)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    Ok(task)
}

pub fn insert(conn: &Connection, content: &str, group_id: Option<i64>) -> Result<Task, String> {
    // 新建置于所属组最顶部：sort_order 取组内最小值 - 1
    let next: i64 = match group_id {
        Some(g) => conn.query_row(
            "SELECT COALESCE(MIN(sort_order), 0) - 1 FROM tasks WHERE group_id = ?1",
            params![g],
            |r| r.get(0),
        ),
        None => conn.query_row(
            "SELECT COALESCE(MIN(sort_order), 0) - 1 FROM tasks WHERE group_id IS NULL",
            [],
            |r| r.get(0),
        ),
    }
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tasks (content, group_id, sort_order) VALUES (?1, ?2, ?3)",
        params![content, group_id, next],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    get_one(conn, id)
}

pub fn update_content(conn: &Connection, id: i64, content: &str) -> Result<Task, String> {
    let n = conn
        .execute(
            "UPDATE tasks SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![content, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

pub fn toggle(conn: &Connection, id: i64) -> Result<Task, String> {
    // 切换 completed，并相应写入/清空 completed_at
    let n = conn
        .execute(
            "UPDATE tasks
             SET completed = 1 - completed,
                 completed_at = CASE WHEN completed = 0 THEN datetime('now') ELSE NULL END,
                 updated_at = datetime('now')
             WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 批量写入拖拽后的 sort_order（ordered_ids 为某分区内的新顺序）。
pub fn reorder(conn: &Connection, ordered_ids: &[i64]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_pinned(conn: &Connection, id: i64, pinned: bool) -> Result<Task, String> {
    let n = conn
        .execute(
            "UPDATE tasks SET pinned = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![pinned as i64, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 归档/取消归档单个任务。
pub fn set_archived(conn: &Connection, id: i64, archived: bool) -> Result<Task, String> {
    let n = conn
        .execute(
            "UPDATE tasks
             SET archived = ?1,
                 archived_at = CASE WHEN ?1 = 1 THEN datetime('now') ELSE NULL END,
                 updated_at = datetime('now')
             WHERE id = ?2",
            params![archived as i64, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 批量归档/取消归档（多选）。
pub fn set_archived_many(conn: &Connection, ids: &[i64], archived: bool) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for id in ids {
        tx.execute(
            "UPDATE tasks
             SET archived = ?1,
                 archived_at = CASE WHEN ?1 = 1 THEN datetime('now') ELSE NULL END,
                 updated_at = datetime('now')
             WHERE id = ?2",
            params![archived as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 完成超过 `days` 天且未归档的任务自动归档，返回归档条数。`days <= 0` 时不做任何事（由调用方保证）。
pub fn auto_archive_stale(conn: &Connection, days: i64) -> Result<usize, String> {
    conn.execute(
        "UPDATE tasks
         SET archived = 1, archived_at = datetime('now')
         WHERE archived = 0
           AND completed = 1
           AND completed_at IS NOT NULL
           AND completed_at <= datetime('now', ?1)",
        params![format!("-{days} days")],
    )
    .map_err(|e| e.to_string())
}

/// 移动任务到分组（None = 默认组），落到目标组末尾。
pub fn set_group(conn: &Connection, id: i64, group_id: Option<i64>) -> Result<Task, String> {
    let next: i64 = match group_id {
        Some(g) => conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE group_id = ?1",
            params![g],
            |r| r.get(0),
        ),
        None => conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE group_id IS NULL",
            [],
            |r| r.get(0),
        ),
    }
    .map_err(|e| e.to_string())?;

    let n = conn
        .execute(
            "UPDATE tasks SET group_id = ?1, sort_order = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![group_id, next, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 多选拖拽：把 moved_ids 移到 group_id（None = 默认组），并按 ordered_ids 重写目标组的
/// sort_order。一个事务完成，中途失败不会留下"改了一半组"的状态。
pub fn move_many(
    conn: &Connection,
    moved_ids: &[i64],
    group_id: Option<i64>,
    ordered_ids: &[i64],
) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for id in moved_ids {
        tx.execute(
            "UPDATE tasks SET group_id = ?1, updated_at = datetime('now')
             WHERE id = ?2 AND group_id IS NOT ?1",
            params![group_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_doc_path(conn: &Connection, id: i64, doc_path: Option<&str>) -> Result<Task, String> {
    let n = conn
        .execute(
            "UPDATE tasks SET doc_path = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![doc_path, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("任务 {id} 不存在"));
    }
    get_one(conn, id)
}

/// 删除任务，返回被级联删除的图片文件路径（供 service 层删磁盘文件）。
pub fn delete(conn: &Connection, id: i64) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT file_path, thumb_path FROM task_images WHERE task_id = ?1")
        .map_err(|e| e.to_string())?;
    let files: Vec<(String, String)> = stmt
        .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    // FK ON DELETE CASCADE 清 task_images 记录
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(files)
}
