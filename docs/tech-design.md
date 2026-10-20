# **PicTodo Float —— 技术设计文档（Tech Design）**

> **文档版本**：1.0
> **配套 PRD**：[prd.md](./prd.md) v2.1
> **目标平台**：Windows 10 / 11 (x64)

------

## 一、技术选型总览

| 维度 | 选型 | 说明 |
| --- | --- | --- |
| 桌面框架 | **Tauri v2**（Rust 后端 + WebView2） | 单文件 exe、低内存、启动快 |
| 前端 | **React 19 + TypeScript** | UI 层 |
| 样式 | **Tailwind CSS v4** | 原子化样式 |
| 状态管理 | **Zustand** | 轻量 store |
| 数据库 | **SQLite**（Rust 侧 `rusqlite`，`bundled` 特性） | 任务/分组/设置结构化存储 |
| 图片粘贴 | **`onPaste`（Web API）** 主路径 + **`tauri-plugin-clipboard`** 兜底 | 从剪贴板取位图 |
| 图片处理 | Rust **`image`** крейт | 生成 40×40 缩略图 |
| 拖拽排序 | **`dnd-kit`** | 列表内 + 分组间拖拽 |
| 关联文档 | **`tauri-plugin-opener`** | 系统默认程序打开 .md |
| 文件选择 | **`tauri-plugin-dialog`** | 关联已有文档 / 选笔记文件夹 |
| 窗口状态 | **`tauri-plugin-window-state`** | 位置/尺寸持久化 |
| 开机自启 | **`tauri-plugin-autostart`** | 自启开关 |
| 全局快捷键 | **`tauri-plugin-global-shortcut`** | `Ctrl+H` 显隐 |

------

## 二、架构分层

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React / WebView2)                │
│  组件层 ── Zustand Store ── Tauri API (invoke / event)    │
└───────────────────────────┬─────────────────────────────┘
                            │  invoke("command", args)
                            │  ← Result<T, String>
┌───────────────────────────▼─────────────────────────────┐
│                    Tauri 后端 (Rust)                      │
│  commands ── services ── db (rusqlite) ── fs (图片/文档)   │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   SQLite 数据库        AppData/images/     笔记文件夹/*.md
  (tasks/groups/     (图片原图+缩略图)     (用户配置，可同步)
   settings)
```

**分层职责**

- **组件层**：纯展示 + 交互，不直接调 `invoke`，通过 store 触发。
- **Store 层**：唯一持有状态与调用后端的地方，乐观更新 + 失败回滚。
- **commands 层**：Tauri `#[command]`，参数校验、序列化，薄封装。
- **services 层**：业务逻辑（排序规则、缩略图生成、文档路径解析）。
- **db 层**：SQL 读写，事务管理。
- **fs 层**：图片落盘/删除、笔记文件创建、路径存在性校验。

------

## 三、数据库 Schema（SQLite）

```sql
-- 分组
CREATE TABLE groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 任务
CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT    NOT NULL DEFAULT '',
  completed    INTEGER NOT NULL DEFAULT 0,   -- 0/1
  completed_at TEXT,                          -- 完成时间戳，可空
  sort_order   INTEGER NOT NULL DEFAULT 0,    -- 手动拖拽顺序
  group_id     INTEGER,                       -- 可空 = 默认组
  pinned       INTEGER NOT NULL DEFAULT 0,    -- 0/1
  doc_path     TEXT,                          -- 关联 md 文档路径，可空
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
);

-- 任务图片
CREATE TABLE task_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL,
  file_path     TEXT    NOT NULL,   -- 相对 AppData/images 的原图路径
  thumb_path    TEXT    NOT NULL,   -- 相对 AppData/images 的缩略图路径
  original_name TEXT,
  file_size     INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 应用设置（单行 key-value，或单行宽表；此处用宽表单行）
CREATE TABLE settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  opacity       INTEGER NOT NULL DEFAULT 85,   -- 50~100
  auto_start    INTEGER NOT NULL DEFAULT 0,
  notes_folder  TEXT,                           -- 空 = 默认 文档/PicTodoFloat Notes
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (id) VALUES (1);

CREATE INDEX idx_tasks_group   ON tasks(group_id);
CREATE INDEX idx_images_task   ON task_images(task_id);
```

> **迁移策略**：用户版本号 `PRAGMA user_version` 递增管理 migration；`ON DELETE CASCADE` 保证删任务时图片记录联动清理，文件删除由 service 层负责。窗口位置/尺寸由 `tauri-plugin-window-state` 独立持久化，不进本表。

------

## 四、Tauri Command 接口清单

统一返回 `Result<T, String>`，前端 `invoke` 后 `try/catch`。

### 任务

| Command | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_tasks` | — | `Task[]`（含 images、group） | 按排序规则返回完整列表 |
| `add_task` | `content, group_id?` | `Task` | 新建，`sort_order` 取末尾 |
| `update_task` | `id, content` | `Task` | 编辑文本 |
| `toggle_task` | `id` | `Task` | 切换完成，写/清 `completed_at` |
| `delete_task` | `id` | `bool` | 删除（级联图片记录 + 删图片文件） |
| `reorder_tasks` | `ordered_ids[]` | `bool` | 批量写入拖拽后的 `sort_order` |
| `auto_sort` | `group_id?` | `Task[]` | 未完成在上、已完成沉底（最近完成在上） |
| `pin_task` | `id, pinned` | `Task` | 置顶/取消置顶 |
| `move_task_to_group` | `id, group_id?` | `Task` | 移动到分组 |
| `move_tasks` | `ids[], group_id?, ordered_ids[]` | `bool` | 多选拖拽落下：移组 + 重排目标组，一个事务 |
| `auto_archive` | — | `number` | 按设置天数归档过期的已完成任务，返回条数（前端窗口获得焦点 / 每小时调用） |

### 分组

| Command | 参数 | 返回 |
| --- | --- | --- |
| `get_groups` | — | `Group[]` |
| `add_group` | `name` | `Group` |
| `rename_group` | `id, name` | `Group` |
| `delete_group` | `id` | `bool`（组内任务归为默认组） |
| `reorder_groups` | `ordered_ids[]` | `bool` |

### 图片

| Command | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `add_image_from_bytes` | 请求体 = 图片原始字节；请求头 `x-task-id`、`x-file-name`（URL 编码） | `TaskImage` | **核心**：接收粘贴/拖入的图片二进制，落盘原图 + 生成缩略图。async，解码 / 缩放在后台线程 |
| `delete_image` | `image_id` | `bool` | 删记录 + 删文件 |
| `reorder_images` | `task_id, ordered_ids[]` | `bool` | 图片内排序 |
| `get_image_data` | `path` | `bytes`（或用 `convertFileSrc`） | 供前端渲染 |

### 关联文档

| Command | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `link_doc` | `task_id, abs_path` | `Task` | 关联已有 .md（存绝对路径） |
| `create_doc` | `task_id, title` | `Task` | 在笔记文件夹新建 .md，预填 H1，存相对路径 |
| `open_doc` | `task_id` | `bool` | `opener` 打开；文件缺失返回错误供前端标断链 |
| `check_doc_exists` | `task_id` | `bool` | 加载时校验断链 |

### 设置

| Command | 参数 | 返回 |
| --- | --- | --- |
| `get_settings` | — | `Settings` |
| `update_settings` | `patch` | `Settings`（含应用透明度、自启、笔记目录副作用） |
| `pick_folder` | — | `string?`（选笔记文件夹） |

------

## 五、关键数据流

### 5.1 图片粘贴（PixPin 式，主路径）

```
用户在任务输入框 Ctrl+V
  └─ 前端 onPaste(e)
       ├─ 遍历 e.clipboardData.items，找 type 以 "image/" 开头的项
       ├─ item.getAsFile() → Blob → arrayBuffer → Uint8Array
       └─ invoke("add_image_from_bytes", bytes, { headers: { "x-task-id", "x-file-name" } })
            └─ Rust（async，解码 / 缩放在 spawn_blocking 里）:
                 ├─ image 解码（按 EXIF 方向摆正）确认是有效图片
                 ├─ 写原图 images/{task}/{uuid}.{ext}：PNG/JPEG/WebP/GIF/BMP 原样写入，其它格式转 PNG
                 ├─ 生成 120×120 缩略图（界面 40px 显示，高 DPI 备足像素）→ 写 thumb
                 ├─ INSERT task_images
                 └─ 返回 TaskImage
  └─ store 更新，缩略图行渲染新图
```

> **兜底**：若某来源应用的剪贴板 `onPaste` 拿不到（无 `image/*` item），提供「从剪贴板粘贴图片」按钮 → `tauri-plugin-clipboard` `readImageBinary()` 直读 OS 剪贴板位图 → 同样走 `add_image_from_bytes`。
>
> **拖入文件**：HTML5 drop 事件拿到 `File` → 同一路径入库。

### 5.2 前端渲染图片

用 Tauri `convertFileSrc()` 把 AppData 下的缩略图/原图路径转成可在 WebView 加载的 `asset://` URL，避免把二进制塞进 JS。需在 `tauri.conf.json` 配置 assetProtocol scope 覆盖 AppData/images。

### 5.3 排序规则（`get_tasks` 与 `auto_sort`）

最终展示顺序（自上而下）：

```
1. pinned = 1 的任务（按 sort_order）
2. 各分组（按 groups.sort_order）：
     组内：
       a. 未完成任务 → 按 sort_order（用户拖拽序）
       b. 已完成任务 → completed_at DESC（最近完成在上）
3. 默认组（group_id IS NULL）同上
```

- **默认**：`get_tasks` 只保证「已完成沉底」，未完成区严格保持 `sort_order`。
- **点自动排序**：`auto_sort` 重算并回写 `sort_order`，此后成为新的手动基线。

### 5.4 关联文档

```
点 📄（无文档）→ 弹菜单：
  ├─ 关联已有 → pick file(.md) → link_doc → 存绝对路径
  └─ 新建     → create_doc(title) →
                 笔记文件夹/{yyyyMMdd-slug}.md（预填 "# {title}\n"）
                 → 存相对路径 → open_doc
点 📄（有文档）→ open_doc → opener 系统默认程序
加载列表 → check_doc_exists → 缺失则该项 📄 显示断链态 + 重新关联
```

------

## 六、前端目录结构与组件树

```
src/
├── main.tsx
├── App.tsx
├── types/
│   └── index.ts            # Task / TaskImage / Group / Settings
├── stores/
│   ├── taskStore.ts        # 任务 + 分组 + 排序
│   └── settingsStore.ts    # 设置
├── hooks/
│   ├── useKeyboardShortcuts.ts   # Ctrl+N / Ctrl+H
│   ├── usePasteImage.ts          # onPaste 图片处理
│   └── useWindowDrag.ts
├── lib/
│   └── tauri.ts            # invoke 封装 + convertFileSrc 工具
└── components/
    ├── TaskList.tsx        # dnd-kit 容器，渲染分组
    ├── GroupSection.tsx    # 单个分组（可折叠）
    ├── TaskItem.tsx        # 单条：勾选/文本/缩略图行/📄/删除，可拖拽
    ├── TaskInput.tsx       # 新建输入框（onPaste 入口）
    ├── ImageThumbnailRow.tsx  # 前3张 + "+N"
    ├── ImagePreview.tsx    # 全屏预览：切换/缩放/拖动/删除
    ├── DocButton.tsx       # 📄 关联/新建/打开/断链
    ├── SettingsPanel.tsx   # 透明度/自启/笔记文件夹
    └── ConfirmDialog.tsx
```

**Rust 侧**

```
src-tauri/src/
├── main.rs                 # 注册插件 + command
├── db/
│   ├── mod.rs              # 连接池、migration
│   ├── tasks.rs
│   ├── groups.rs
│   └── settings.rs
├── services/
│   ├── image.rs           # 落盘 + 缩略图
│   ├── sorting.rs         # 排序规则
│   └── docs.rs            # 笔记路径/新建/校验
└── commands/
    ├── task.rs
    ├── image.rs
    ├── doc.rs
    └── settings.rs
```

------

## 七、Tauri 窗口与插件配置要点

- **窗口**：`decorations: false`（无边框）、`transparent: true`、`alwaysOnTop: true`、`skipTaskbar: true`；透明度经原生 window API 应用（非仅 CSS）。
- **托盘**：`SystemTray` + 右键菜单（显示 / 退出）；关闭按钮走 `window.hide()`，非退出。
- **assetProtocol**：scope 放行 AppData/images，配合 `convertFileSrc`。
- **权限（capabilities）**：显式声明 dialog、opener、clipboard、global-shortcut、fs（限定 AppData + 笔记文件夹）等最小权限集。

------

## 八、分阶段实现计划

> 原则：**先验证最大风险，再搭主干，最后做增强**。

| 阶段 | 目标 | 交付 |
| --- | --- | --- |
| **P0 · 风险验证** | 证明 `onPaste` 在 WebView2 能拿截图 blob；`image` крейт 生成缩略图跑通 | 一个能粘贴截图并落盘+显示缩略图的最小 demo |
| **P1 · 项目骨架** | Tauri v2 工程、无边框透明置顶窗口、托盘、SQLite + migration | 空壳可运行 |
| **P2 · 任务 CRUD** | 增删改查、完成、持久化、空状态 | 纯文本待办可用 |
| **P3 · 图片附件** | 粘贴/拖入入库、缩略图行、全屏预览、删图 | PixPin 式图片体验 |
| **P4 · 排序分组** | dnd-kit 拖拽、自动排序、分组、置顶 | 完整组织能力 |
| **P5 · 关联文档** | 📄 关联/新建/打开、笔记文件夹配置、断链处理 | 深度层 |
| **P6 · 设置与打磨** | 透明度、开机自启、窗口状态持久化、快捷键、高 DPI | 达成 PRD 非功能指标 |

------

## 九、待验证 / 风险点

1. **`onPaste` 兼容性（最高风险）**：不同截图软件剪贴板格式差异，P0 必须先验证；兜底为 `tauri-plugin-clipboard`。
2. **透明 + 置顶 + WebView2**：Windows 上透明窗口偶有渲染/点击穿透问题，需实测。
3. **缩略图性能**：50 条 ×2 图的缩略图生成放异步，避免阻塞；原图按需加载。
4. **笔记文件夹权限**：用户指向 Obsidian/云盘目录时，fs capability scope 需动态放行所选目录。

------

## 十、V1.1 增量（2026-08，归档 / 搜索 / 分组拖拽等）

在 P0-P6 基线之上新增的字段、命令与前端能力，均通过 `PRAGMA user_version` migration v3 落地（`db/mod.rs`）。

### 10.1 Schema 变更（v3）

```sql
ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN archived_at TEXT;
ALTER TABLE settings ADD COLUMN hide_completed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN auto_archive_days INTEGER NOT NULL DEFAULT 0; -- 0 = 关闭
ALTER TABLE settings ADD COLUMN doc_enabled INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
```

`get_tasks`/排序相关查询默认 `WHERE archived = 0`；归档任务改由 `get_archived_tasks` 单独查询（`archived_at DESC`）。

### 10.2 新增 Command

| Command | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `get_archived_tasks` | — | `Task[]` | 已归档任务，最近归档在前 |
| `archive_task` | `id, archived` | `Task` | 单条归档/取消归档 |
| `archive_tasks` | `ids[], archived` | `bool` | 批量归档（多选） |
| `reorder_groups` | `ordered_ids[]` | `bool` | 分组拖拽排序（命令 P4 时已建，本轮补上前端接线） |

`get_tasks` 命令内部会先按 `settings.auto_archive_days` 顺带执行一次 `auto_archive_stale`（完成超过 N 天且未归档 → 自动归档），不需要常驻定时器。

### 10.3 图片路径解析踩坑（重要）

`toggle_task` / `update_task` / `pin_task` / `move_task_to_group` 早期实现直接返回 `db::tasks::*` 的裸 `Task`，**遗漏了 `image_svc::resolve_task_images()`**，导致返回给前端的图片路径是相对路径而非可用于 `convertFileSrc` 的绝对路径——表现为"任务勾选完成后缩略图裂开，取消完成也不恢复，只有点自动排序（走 `get_tasks`/`auto_sort` 的完整 resolve 链路）才会修好"。

修复：新增 `image_svc::resolve_task(app, task) -> Task`（消费单个 `Task` 并解析其图片路径），所有**返回单个 `Task` 给前端**的 command 都必须经过它包一层，不能只在 `get_tasks`/`auto_sort` 这类返回列表的命令里做。`doc.rs` 已有的 `resolved()` 同款 helper 现改为直接复用这个函数。

### 10.4 打包踩坑：`cargo build --release` ≠ 生产资源嵌入（重要）

Tauri 判断"嵌入 `frontendDist` 静态资源"还是"连接 `devUrl` 开发服务器"，**不取决于 cargo 的 debug/release profile**，而是 `tauri-cli` 的 `tauri build` 流程本身控制的。直接裸跑 `cargo build --release`（跳过 `tauri build`）编出来的 exe 会一直尝试连 `http://localhost:1420`，双击运行显示 `ERR_CONNECTION_REFUSED`——之前发过一次这样的坏包。

**结论：打包发布一律用 `npm run tauri build`（内部会先跑 `beforeBuildCommand: npm run build` 再正确编译+嵌入资源），禁止为图快直接 `cargo build --release`。** 验证手段：在 1420 端口起个假 HTTP 服务，跑编出来的 exe 看是否有请求打过去（有 = 没嵌对，无 = 正常）。

### 10.5 前端新增能力一览

| 能力 | 关键实现 |
| --- | --- |
| 已完成项折叠 | `GroupSection` 按 `completed` 拆分 `activeItems`/`doneItems`；全局开关 `settings.hide_completed`（重启记忆，默认折叠） |
| 归档 | 单条/批量归档按钮 + `ArchivePanel`（查看/取消归档/彻底删除）+ 设置里「完成 N 天后自动归档」下拉 |
| 分组拖拽排序 | `GroupSection` 内部 `useSortable({id:"group-{id}", data:{type:"group"}})`，与任务拖拽共用同一个 `DndContext`，靠 `active.data.current.type` 分支处理，避免嵌套 `DndContext` 的坑 |
| 默认组为空时隐藏 | `TaskList` 里 `view.def.length > 0` 才渲染 |
| 新建任务选分组 | `TaskInput` 加分组下拉，`add(content, groupId)` |
| 输入框便签全屏模式 | `TaskInput` 展开态用 `position:fixed` 盖住标题栏以下整个内容区；收起不清空草稿 |
| 搜索 | 标题栏 🔍（或 Ctrl+F）打开搜索栏，`taskStore` 存 `searchQuery`/`searchScope`；纯前端按 `containerKeyOf` 范围 + 内容子串过滤，复用 `buildView` 不改渲染结构；激活搜索时禁用拖拽（避免用过滤后的局部列表重排导致 `sort_order` 错乱） |
| 新建分组工具栏隐藏 | `.list-toolbar` 默认 `max-height:0` 不占空间，`.app:hover` 时用 `max-height` 过渡展开——**踩过坑**：最早用 `position:fixed` 覆盖层实现，展开时会盖住第一个分组的标题和操作按钮，改回正常文档流的高度折叠方案后问题消失 |
| 悬浮预览窗两个 bug | 双击关闭前"闪一下全屏"（`data-tauri-drag-region` 触发系统原生双击最大化）与拖到屏幕边缘触发 Windows 贴靠，统一用 `maximizable:false` + `resizable:false` 解决（缩放走程序化 `setSize()`，不受影响） |
