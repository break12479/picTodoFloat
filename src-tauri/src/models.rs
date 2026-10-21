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
    pub density: String, // "comfortable" | "compact"
    pub always_on_top: bool,
    pub fade_when_idle: bool,
    pub edge_hide: bool,
    pub toggle_hotkey: String, // 显隐主窗口的全局快捷键，如 "Ctrl+H"
    /// 运行时状态，不入库：显隐快捷键注册失败的原因（多半是被其他程序占用）
    #[serde(default)]
    pub hotkey_error: Option<String>,
}

/// 设置的局部更新：None = 不改。前端传 camelCase 键。
#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub opacity: Option<i64>,
    pub auto_start: Option<bool>,
    /// 空串 = 清空（回默认目录）
    pub notes_folder: Option<String>,
    pub theme: Option<String>,
    pub hide_completed: Option<bool>,
    pub auto_archive_days: Option<i64>,
    pub doc_enabled: Option<bool>,
    pub density: Option<String>,
    pub always_on_top: Option<bool>,
    pub fade_when_idle: Option<bool>,
    pub edge_hide: Option<bool>,
    pub toggle_hotkey: Option<String>,
}
