pub mod groups;
pub mod images;
pub mod settings;
pub mod tasks;

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

/// Tauri managed state：全局唯一的 SQLite 连接 + 当前数据根目录。
/// rusqlite::Connection 是 Send 但非 Sync，故用 Mutex 包裹以满足 State 的 Send+Sync。
pub struct AppState {
    pub db: Mutex<Connection>,
    pub data_root: Mutex<PathBuf>,
}

/// 打开连接并执行迁移。
pub fn init(db_path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("打开数据库失败: {e}"))?;
    // 外键级联需显式开启（每连接生效）
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("开启外键失败: {e}"))?;
    migrate(&conn)?;
    Ok(conn)
}

/// 基于 PRAGMA user_version 的递增式迁移。只增不改历史。
fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("读取 user_version 失败: {e}"))?;

    if version < 1 {
        conn.execute_batch(MIGRATION_V1)
            .map_err(|e| format!("迁移 v1 失败: {e}"))?;
        conn.execute_batch("PRAGMA user_version = 1;")
            .map_err(|e| format!("写入 user_version 失败: {e}"))?;
    }

    if version < 2 {
        conn.execute_batch(MIGRATION_V2)
            .map_err(|e| format!("迁移 v2 失败: {e}"))?;
        conn.execute_batch("PRAGMA user_version = 2;")
            .map_err(|e| format!("写入 user_version 失败: {e}"))?;
    }

    if version < 3 {
        conn.execute_batch(MIGRATION_V3)
            .map_err(|e| format!("迁移 v3 失败: {e}"))?;
        conn.execute_batch("PRAGMA user_version = 3;")
            .map_err(|e| format!("写入 user_version 失败: {e}"))?;
    }

    if version < 4 {
        conn.execute_batch(MIGRATION_V4)
            .map_err(|e| format!("迁移 v4 失败: {e}"))?;
        conn.execute_batch("PRAGMA user_version = 4;")
            .map_err(|e| format!("写入 user_version 失败: {e}"))?;
    }

    Ok(())
}

// v2：主题（dark / light）
const MIGRATION_V2: &str = r#"
ALTER TABLE settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';
"#;

// v3：归档、已完成折叠开关、自动归档天数、关联文档功能开关
const MIGRATION_V3: &str = r#"
ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
ALTER TABLE settings ADD COLUMN hide_completed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN auto_archive_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN doc_enabled INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
"#;

// v4：列表密度、窗口置顶开关、鼠标移开变淡、贴边隐藏、可自定义的显隐快捷键
const MIGRATION_V4: &str = r#"
ALTER TABLE settings ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE settings ADD COLUMN always_on_top INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN fade_when_idle INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN edge_hide INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN toggle_hotkey TEXT NOT NULL DEFAULT 'Ctrl+H';
"#;

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT    NOT NULL DEFAULT '',
  completed    INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  group_id     INTEGER,
  pinned       INTEGER NOT NULL DEFAULT 0,
  doc_path     TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL,
  file_path     TEXT    NOT NULL,
  thumb_path    TEXT    NOT NULL,
  original_name TEXT,
  file_size     INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  opacity       INTEGER NOT NULL DEFAULT 85,
  auto_start    INTEGER NOT NULL DEFAULT 0,
  notes_folder  TEXT,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_images_task ON task_images(task_id);
"#;
