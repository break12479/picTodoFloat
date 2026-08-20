use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskImage {
    pub id: i64,
    pub task_id: i64,
    pub file_path: String,
    pub thumb_path: String,
    pub original_name: Option<String>,
    pub file_size: Option<i64>,
    pub sort_order: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: i64,
    pub content: String,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub sort_order: i64,
    pub group_id: Option<i64>,
    pub pinned: bool,
    pub doc_path: Option<String>,
    pub archived: bool,
    pub archived_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub images: Vec<TaskImage>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub opacity: i64,
    pub auto_start: bool,
    pub notes_folder: Option<String>,
    pub theme: String, // "dark" | "light"
    pub hide_completed: bool,
    pub auto_archive_days: i64, // 0 = 关闭
    pub doc_enabled: bool,
}
