# **PicTodo Float —— 开发计划（Dev Plan）**

> **文档版本**：1.0
> **配套**：[prd.md](./prd.md) v2.1、[tech-design.md](./tech-design.md) v1.0
> **状态基线**：P0 风险穿刺已于 2026-07-01 验证通过

------

## 〇、当前工程现状（P0 产出）

P0 穿刺已搭出一个**可运行的最小 Tauri v2 工程**，验证了两个最高风险点：`onPaste`@WebView2 取截图 blob、`image` crate 生成 40×40 缩略图。以下资产可复用，但部分是一次性验证代码，进入 P1+ 需重构：

| 资产 | 现状 | P1+ 去向 |
| --- | --- | --- |
| Tauri v2 + React19 + TS 工程骨架、Vite 配置 | ✅ 可用 | 保留 |
| 无边框/透明/置顶窗口配置（`tauri.conf.json`） | ✅ 可用 | 保留，补托盘/window-state |
| `src/App.tsx`（粘贴+日志的 spike UI） | ⚠️ 一次性 | 拆成正式组件树后删除 |
| `src-tauri/src/lib.rs`（内存自增 id 的 `add_image_from_bytes`） | ⚠️ 一次性 | 拆入 `commands/`+`services/`，id 改由 SQLite 提供 |
| 图标、依赖 | ✅ 可用 | 保留 |

> ⚠️ **构建前置**：本机需关闭 Smart App Control 才能编译 Rust（否则 `os error 4551`）。已关闭。

------

## 一、总体原则与里程碑

- **纵向切片，能跑优先**：每阶段结束都产出一个可运行、可自测的增量，而非攒到最后集成。
- **后端先立数据契约**：Schema + Command 接口先于 UI 定稿，避免前端返工。
- **乐观更新 + 失败回滚**：所有写操作在 store 层先更新 UI，`invoke` 失败再回滚。

| 里程碑 | 覆盖阶段 | 达成标志 |
| --- | --- | --- |
| **M1 可用待办** | P1 + P2 | 纯文本任务的增删改查、完成、持久化，重启不丢 |
| **M2 图片体验** | P3 | PixPin 式粘贴/拖入、缩略图行、全屏预览、删图 |
| **M3 组织能力** | P4 | 拖拽排序、自动排序、分组、置顶 |
| **M4 深度层** | P5 | 关联/新建/打开 md 文档、笔记文件夹、断链处理 |
| **M5 达标交付** | P6 | 透明度/自启/窗口状态/快捷键/高DPI，命中 PRD 非功能指标 |

------

## 二、阶段拆解

### P1 · 项目骨架与基础设施

> **目标**：把 P0 一次性代码重构成 tech-design §6 的正式目录结构，立起数据层与窗口基座。

**任务**
1. **前后端目录落位**：按 tech-design §6 建 `stores/ hooks/ lib/ components/`（前端）与 `db/ services/ commands/`（Rust）；删除 spike 版 `App.tsx`/`lib.rs` 里的临时逻辑。
2. **SQLite 接入**：`rusqlite`（`bundled`），`db/mod.rs` 建连接、按 `PRAGMA user_version` 跑 migration（建 tech-design §3 的四张表）。
3. **窗口基座**：系统托盘 + 右键菜单（显示/退出）；关闭按钮走 `window.hide()`；接入 `tauri-plugin-window-state`（位置/尺寸持久化）。
4. **Tauri 骨架**：`lib.rs` 注册插件与全部 command（先占位），capabilities 声明最小权限集。
5. **前端基座**：`lib/tauri.ts`（invoke 封装 + convertFileSrc）、空的 `taskStore`/`settingsStore`。

**交付物**：空壳可运行——启动出透明置顶窗口、能最小化到托盘、DB 文件在 AppData 生成、迁移可重复执行。
**验收**：删掉 DB 文件重启能重建；改窗口大小/位置重启后恢复；托盘"退出"真正退出进程。

------

### P2 · 任务 CRUD（→ M1）

> **目标**：纯文本待办可用并持久化。

**任务**
1. **Rust command**：`get_tasks` / `add_task` / `update_task` / `toggle_task`（写/清 `completed_at`）/ `delete_task`；`db/tasks.rs` 落 SQL。
2. **store**：`taskStore` 持有列表，封装上述命令，乐观更新 + 失败回滚。
3. **组件**：`TaskList` / `TaskItem`（勾选/文本/×删除）/ `TaskInput`（Enter 或「+」新建）；双击进编辑。
4. **完成态样式**：删除线 + 灰色；**空状态**提示「点击『+』添加第一条任务」。
5. **删除确认**：`ConfirmDialog`。

**交付物**：能增删改查、勾选完成、重启不丢的纯文本待办。
**验收**：50 条任务连续操作无卡顿；关闭重开数据 100% 恢复；完成项样式正确。

------

### P3 · 图片附件（→ M2）

> **目标**：把 P0 验证过的粘贴链路做成完整产品体验。

**任务**
1. **Rust**：`add_image_from_bytes`（复用 P0 逻辑，改为写 `task_images` 表返回真实 id + 异步缩略图）、`delete_image`（删记录+删文件）、`reorder_images`；`services/image.rs` 落盘与缩略图。
2. **入库两路**：`hooks/usePasteImage.ts`（`onPaste` 主路径）+ 拖入文件路径；**兜底按钮**走 `tauri-plugin-clipboard` `readImageBinary()`。
3. **缩略图行** `ImageThumbnailRow`：前 3 张 40×40，超 3 张第 3 张显示「+N」；`convertFileSrc` 渲染。
4. **全屏预览** `ImagePreview`：左右/滚轮切换、`Ctrl+滚轮`缩放、拖动、`Esc`关闭、单张右上角「×」删除、底部索引 `2/5`。
5. **级联删除**：删任务时连带删图片文件（`delete_task` service 层处理）。

**交付物**：PixPin 式图片体验闭环。
**验收**：截图软件复制后 `Ctrl+V` 一步入库；预览切换/缩放顺滑；删图不影响其他图；删任务后 AppData 无残留文件。

------

### P4 · 排序与分组（→ M3）

> **目标**：完整组织能力（tech-design §5.3 排序规则）。

**任务**
1. **Rust**：`reorder_tasks`（批量写 `sort_order`）、`auto_sort`（未完成在上/已完成沉底、最近完成在上）、`pin_task`、`move_task_to_group`；分组 5 个 command；`services/sorting.rs` 统一排序规则。
2. **拖拽** `dnd-kit`：`TaskList` 容器 + `TaskItem` 可拖；支持组内 + 跨组拖拽，落定后 `reorder_tasks`。
3. **分组 UI** `GroupSection`：可折叠、组内独立排序、完成项沉本组底部；未分组入「默认组」。
4. **置顶**：置顶任务恒在最顶，不受分组/完成影响；可取消。
5. **自动排序按钮**：点击才重排并成为新手动基线；默认尊重手动序。

**交付物**：拖拽排序 + 分组 + 置顶完整可用。
**验收**：拖拽顺序重启保持；自动排序规则与 §5.3 一致；完成项留在原组底部；置顶优先级正确。

------

### P5 · 关联文档（→ M4）

> **目标**：深度层——任务关联本地 md 文档。

**任务**
1. **Rust**：`link_doc`（存绝对路径）、`create_doc`（笔记文件夹新建 `yyyyMMdd-slug.md`，预填 `# {title}`，存相对路径）、`open_doc`（`tauri-plugin-opener`）、`check_doc_exists`；`services/docs.rs` 路径解析。
2. **笔记文件夹**：设置中可配根目录，默认 `文档/PicTodoFloat Notes`；`pick_folder` 用 `tauri-plugin-dialog`；fs capability scope 动态放行所选目录。
3. **组件** `DocButton`（📄）：无文档→弹「关联已有 / 新建」；有文档→高亮，点击 `open_doc`。
4. **断链处理**：加载时 `check_doc_exists`，缺失显示断链角标 + 「重新关联」，绝不静默丢失引用。

**交付物**：📄 关联/新建/打开 + 笔记文件夹配置 + 断链态。
**验收**：新建笔记落在配置目录并用系统默认程序打开；关联外部 md 存绝对路径；把文件移走后显示断链且能重连。

------

### P6 · 设置与打磨（→ M5）

> **目标**：命中 PRD 第五节非功能指标。

**任务**
1. **设置面板** `SettingsPanel`：透明度（原生 window API 生效，非仅 CSS）、开机自启（`tauri-plugin-autostart`，持久化且实际生效）、笔记文件夹。
2. **`get_settings`/`update_settings`**：透明度/自启/笔记目录副作用落地。
3. **快捷键** `useKeyboardShortcuts`：`Ctrl+N` 新建、`Ctrl+H` 显隐（`tauri-plugin-global-shortcut`）、`Ctrl+V` 向选中任务粘贴。
4. **高 DPI**：适配 125%/150%/200%。
5. **性能打磨**：缩略图异步生成、原图按需加载；对照指标压测。

**交付物**：达成 PRD 非功能指标的可发布版本。
**验收**：启动 <1s；50 条任务(每条≈2图) 内存 ≤80MB、滚动 ≥60fps；透明度/自启/窗口状态重启 100% 恢复；单文件 exe 绿色运行。

------

## 三、横切关注点（贯穿各阶段）

- **迁移演进**：每次 Schema 变更递增 `user_version`，migration 只增不改历史。
- **错误契约**：所有 command 返回 `Result<T, String>`，前端 `try/catch` 并在日志/toast 反馈。
- **资源清理**：删任务/删图必须"记录 + 文件"双清，避免 AppData 泄漏。
- **权限最小化**：capabilities 只放行 dialog/opener/clipboard/global-shortcut/fs(AppData+笔记目录)。

## 四、建议推进顺序与并行度

1. **串行主干**：P1 → P2 是地基，必须先行。
2. **P3 可提前起步**：图片入库逻辑 P0 已验证，P2 完成任务实体后即可并入。
3. **P4/P5 相对独立**：P4（排序分组）与 P5（文档）互不依赖，可按优先级插队；PRD 定义排序分组重要度更高，建议 P4 先于 P5。
4. **P6 收尾**：设置与打磨放最后统一压测达标。

## 五、风险回看（tech-design §9）

| 风险 | 状态 |
| --- | --- |
| onPaste 兼容性 | ✅ P0 已验证主路径；P3 补 `tauri-plugin-clipboard` 兜底覆盖异常截图源 |
| 透明+置顶+WebView2 | ✅ P0 窗口已实测正常；P6 应用原生透明度时复测点击穿透 |
| 缩略图性能 | ⚠️ P0 已测单张耗时；P3 改异步、P6 做 50×2 图压测 |
| 笔记文件夹权限 | ⏳ P5 处理 fs scope 动态放行 |

------

## P7 · 缺陷修复与体验增强（2026-08，→ V1.1）

> **背景**：P0-P6 达标交付后收到的第一批真实使用反馈，含 2 个缺陷修复 + 6 个体验增强。详见 [tech-design §10](./tech-design.md#十v11-增量2026-08归档--搜索--分组拖拽等)。

**缺陷修复**
1. 任务勾选完成/取消完成后缩略图裂开（`toggle_task` 等命令遗漏图片路径 resolve，见 tech-design §10.3）。
2. 悬浮预览窗双击关闭前"闪一下全屏"、拖到屏幕边缘触发 Windows 贴靠（`maximizable`/`resizable` 原生窗口行为）。

**体验增强**
1. 已完成任务折叠（全局开关，重启记忆，默认折叠）。
2. 归档：单条/批量归档、归档面板（查看/取消归档/彻底删除）、完成 N 天后自动归档。
3. 任务文字限高 4 行 + 弹层展开查看全文。
4. 设置里可关闭「关联文档」入口（不影响已有关联）。
5. 分组支持拖拽排序（前端接线复用了 P4 就已建好的 `reorder_groups` 命令）。
6. 默认组为空时不显示。
7. 新建任务时可直接选择目标分组。
8. 输入框可展开为全屏便签模式，收起不丢草稿。
9. 搜索（标题栏 🔍 / Ctrl+F），支持按分组范围过滤。
10. 「新建分组」工具栏改为悬停展开，默认不占布局空间。

**交付物**：DB migration v3（archived 字段 + 3 个新 settings 字段）；6 个新 Tauri command（含已有的 `reorder_groups` 前端接线）；上述前端能力全部落地。
**验收**：`cargo build --lib` + `tsc && vite build` 全绿；实机冒烟（截图确认）UI 渲染正确；发布包改用 `npm run tauri build`，用假 devUrl 服务器验证过不再误连开发服务器（见 tech-design §10.4）。

**新踩的坑（写进 tech-design，别再踩第二次）**：
- 返回单个 `Task` 的 command 必须过 `image_svc::resolve_task()`，只在 `get_tasks`/`auto_sort` 里 resolve 是不够的。
- 打包发布必须 `npm run tauri build`，裸 `cargo build --release` 编出来的包会一直连 `localhost:1420` 打不开。
- "悬停显示的工具条"类 UI 别用 `position:fixed` 覆盖层，会挡住下面的内容；用正常文档流 + `max-height` 折叠展开。

> （已断联：此文档已从 PicTodo 任务解除关联）
