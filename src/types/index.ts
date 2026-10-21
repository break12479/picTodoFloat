export interface TaskImage {
  id: number;
  task_id: number;
  file_path: string;
  thumb_path: string;
  original_name: string | null;
  file_size: number | null;
  sort_order: number;
}

export interface Task {
  id: number;
  content: string;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  group_id: number | null;
  pinned: boolean;
  doc_path: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  images: TaskImage[];
}

export interface Group {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Settings {
  opacity: number;
  auto_start: boolean;
  notes_folder: string | null;
  theme: "dark" | "light";
  hide_completed: boolean;
  auto_archive_days: number; // 0 = 关闭
  doc_enabled: boolean;
  density: "comfortable" | "compact";
  always_on_top: boolean;
  fade_when_idle: boolean;
  edge_hide: boolean;
  toggle_hotkey: string; // 显隐主窗口的全局快捷键，如 "Ctrl+H"
  /** 运行时：显隐快捷键注册失败的原因（多半被其他程序占用），null = 正常 */
  hotkey_error: string | null;
}
