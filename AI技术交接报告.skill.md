---
name: obsidian-video-library-handover
description: "Use when modifying the Obsidian Video Library plugin (plugin id video-library): understand its architecture, data model, settings/scraping code, and make safe changes without breaking the vault data or the no-preset-sites release rule."
---

# Obsidian Video Library — AI 技术交接报告

> 交接对象：任何要修改本项目的 AI 编码代理。
> 项目版本：`0.9.0`（截至本报告）。
> 源码入口：`src/main.ts`。
> 配套人读文档：`项目架构与修改指南.md`。

---

## 1. 30 秒理解项目

这是一个 **Obsidian 桌面版插件**，不是独立应用。

它把视频链接或本地视频保存成卡片，提供：

- 分类 / 文件夹 / 标签 / 收藏 / 置顶 / 手动排序
- 封面抓取 / 粘贴 / 视频截帧
- 网格 / 列表 / 首页
- 自定义播放器、进度条悬停帧、悬停预览
- 元数据字段：作者、厂商、系列、演员、上架日期、简介、标记
- 可选 MetaTube 刮削
- 设置页、站点 JSON 导入/导出
- 撤销（最多 30 步）
- 视频笔记：Markdown、时间节点、高清截图、笔记管理、回收站
- B 站扫码登录与本地代理原生播放
- 网盘账号、直链视频本地代理播放
- 自动检查更新与一键更新

技术栈：

- TypeScript + Rollup
- Obsidian Plugin API（`Plugin`、`ItemView`、`Modal`、`Setting`、`requestUrl`）
- 桌面端 Node/Electron 能力（外部文件、`child_process`、`shell.openPath`）
- 无 React/Vue；UI 是命令式 DOM + Obsidian `createEl`

---

## 2. 先读哪些文件（按顺序）

| 顺序 | 文件 | 目的 |
|---|---|---|
| 1 | `src/types.ts` | 先建立数据模型 |
| 2 | `src/main.ts` | 看插件生命周期、持久化、所有业务方法 |
| 3 | `src/i18n.ts` | 看文字 key 和双语约定 |
| 4 | `src/ui/library-view.ts` | 看主界面、搜索、选择、拖拽 |
| 5 | `src/ui/video-modal.ts` | 看添加/编辑表单 |
| 6 | `src/ui/player-modal.ts` | 看播放器和详情 |
| 7 | `src/ui/settings-tab.ts` | 看设置页和站点管理 |
| 8 | `src/scraping.ts` + `src/ui/scrape-modal.ts` | 看刮削 |
| 9 | `src/covers.ts` / `src/metadata.ts` / `src/providers.ts` | 看外部能力 |
| 10 | `src/styles.css` | 看样式约定 |

不要一开始通读 `library-view.ts`（2600+ 行）。先看 `refresh()`、`render()`、`filteredVideos()`、`renderGrid()` 四个入口。

---

## 3. 不可破坏的约束（Non-negotiables）

1. **GitHub 版本不带任何预设刮削站点。**
   - `DEFAULT_MARKERS` 只能有 B 站/YouTube 两个链接标记。
   - 不要在 `onload()`/`loadSettings()` 里自动 seed 站点。
   - `刮削站点导入代码/` 是本地模板，已被 `.gitignore` 忽略，不要提交。
2. **`data.json` 是用户数据，不能提交。**
   - 测试库可能通过 junction 把插件目录指向源码，根目录 `data.json` 就是测试库数据。
3. **`main.js`、根目录 `styles.css` 是构建产物，不能手改。**
   - 改 `src/`，再 `npm run build`。
4. **所有用户可见文字必须走 `i18n.ts`。**
   - 中英文两个字典都要加。
5. **界面不能直接写 `data.json`。**
   - 调 `main.ts` 的业务方法；方法内 `recordUndo()` → 改数据 → `persist()` → `refreshViews()`。
6. **`DATA_VERSION` 不能随便动。**
   - 加可选字段一般不用升版本，在 `loadSettings()` 补默认值即可。
   - 做不兼容迁移才升版本，并写迁移逻辑。
7. **设置页可能在独立 popout 窗口。**
   - 文件选择器/弹窗 DOM 必须用 `this.containerEl.ownerDocument`，不要用全局 `document`。
8. **点击动画只加在按钮上。**
   - 不要给 `.setting-item` 加 `:active`，否则点行内按钮会整行/整页抖动（这是已修过的 bug）。
9. **MetaTube 的 provider 名大小写敏感。**
   - 不要 `.toLowerCase()` 后再保存/请求。
10. **撤销只恢复数据，不恢复文件。**
    - 不要把“删除封面/本地文件”说成可撤销。

---

## 4. 架构一屏图

```text
Obsidian Host
  ├─ Plugin lifecycle ──────────────► src/main.ts
  ├─ View registration ─────────────► src/ui/library-view.ts
  ├─ Settings tab ──────────────────► src/ui/settings-tab.ts
  ├─ requestUrl ────────────────────► src/metadata.ts / src/scraping.ts
  └─ Node/Electron ─────────────────► src/main.ts / src/covers.ts / src/ui/video-modal.ts

src/main.ts（核心）
  ├─ data: PluginData
  ├─ loadSettings() / persist()
  ├─ recordUndo() / undo()
  ├─ 分类 / 文件夹 / 标签 / 标记 CRUD
  ├─ 视频 CRUD / 排序 / 收藏 / 置顶
  ├─ 本地/外部视频导入、播放缓存
  ├─ 封面截取队列
  └─ MetaTube 刮削调度

src/types.ts        数据契约 / 默认值
src/i18n.ts         双语词典 / t()
src/providers.ts    URL 识别 / 嵌入地址
src/metadata.ts     网页/平台元数据
src/covers.ts       封面文件 / 截帧
src/scraping.ts     MetaTube HTTP 客户端

src/ui/*            界面层：只收集输入、渲染、调用 main.ts
src/styles.css      全部样式
```

数据流：

```text
UI 事件
  → main.ts 业务方法
    → recordUndo()
    → 修改 this.data
    → persist() 写 data.json
    → refreshViews() 让所有已打开的库视图重绘
```

设置页例外：设置页不是 `ItemView`，改完设置后用 `this.update()` 重绘设置页。

---

## 5. 数据模型速查

```ts
interface PluginData {
  version: number;          // DATA_VERSION = 5
  videos: VideoItem[];
  categories: Category[];
  folders: Folder[];
  tags: Tag[];
  markers: Marker[];
  settings: PluginSettings;
}
```

`VideoItem` 关键字段：

```ts
id, url, provider, videoId, title, author,
studio, series, performers: string[], description,
releaseDate, markers: string[], externalId,
metadataSource, scrapedAt,
categoryId, folderId, tags: string[], notes,
coverPath, thumbnailUrl,
localPath, localExternal, localLinkPath,
duration, preview, favorite, pinned, pinnedAt,
sortOrder, lastPlayedAt, createdAt, updatedAt
```

`Marker`：

```ts
{
  id, name, color,
  kind: "link" | "site",
  enabled,
  autoProvider?,          // link 标记
  metatubeProvider?,      // site 标记，大小写敏感
  capabilities?: string[],// "有码" | "无码"
  url?, description?, sortOrder?, createdAt
}
```

默认数据：

- `DEFAULT_MARKERS`：只有 B 站、YouTube。
- `DEFAULT_SETTINGS`：`scrapeAuto = false`，`relatedEnabled = true`。
- `createDefaultData()`：空视频/分类/文件夹/标签 + 默认标记 + 默认设置。

存储：

```text
<vault>/.obsidian/plugins/video-library/
  ├─ data.json
  ├─ covers/
  └─ external-links/
```

---

## 6. 文件职责与“改哪里”路由

| 用户需求 | 主要文件 | 备注 |
|---|---|---|
| 加/改视频字段 | `types.ts` → `main.ts` (`loadSettings`) → `video-modal.ts` → `player-modal.ts` → `i18n.ts` | 需要时加搜索 haystack |
| 加设置项 | `types.ts` → `main.ts` → `settings-tab.ts` (`getSettingDefinitions` / `getControlValue` / `setControlValue`) → `i18n.ts` | toggle/text/dropdown 用 `control` |
| 加设置页按钮 | `settings-tab.ts` + `styles.css` + `i18n.ts` | 用 `.vl-settings-action` / `.vl-settings-footer-btn` |
| 改主界面/搜索/排序 | `library-view.ts` | 搜索在 `filteredVideos()` |
| 改添加/编辑表单 | `video-modal.ts` | 保存调用 `plugin.addVideo/updateVideo` |
| 改播放器/详情/关联视频 | `player-modal.ts` | 关联视频规则在 `relatedVideos()` |
| 改刮削交互 | `scrape-modal.ts` + `main.ts` | 写入在 `applyMetaTubeMovie()` |
| 改 MetaTube 协议 | `scraping.ts` | 超时 90s，404 返回 [] |
| 改站点列表/导入导出 | `settings-tab.ts` + `main.ts` (`importScrapeSites`) | 文件选择器必须同 document |
| 改标记/站点表单 | `marker-modal.ts` | 站点能力只有 有码/无码 |
| 改封面/截帧 | `covers.ts` + `video-modal.ts` / `frame-modal.ts` | |
| 改 URL 识别/新平台 | `providers.ts` + `metadata.ts` + `types.ts` + `player-modal.ts` | |
| 改样式/动画 | `src/styles.css` | 构建后复制到根目录 |
| 改构建/部署 | `build.mjs` + `deploy.config.json` | |
| 改文档 | `README.md` / `CHANGELOG.md` / 本报告 / 人读指南 | |

---

## 7. MetaTube 刮削子系统

### 7.1 客户端

`MetaTubeClient`：

```ts
search(query, provider?)  // GET /v1/movies/search?q=...&provider=...&fallback=false|true
movie(provider, id)       // GET /v1/movies/{provider}/{id}
providers()               // GET /v1/providers
```

实现细节：

- `requestUrl` + 90 秒 `Promise.race` 超时。
- `requestUrl` 在 404 时会 reject，错误对象可能带 `status`；`get(path, [])` 捕获 404 返回空数组。
- 指定 provider 时 `fallback=false`；全部来源时 `fallback=true`。
- 响应结构：`{ data: ... }` 或 `{ error: ... }`。
- provider 名称大小写敏感（`JavBus`、`JAV321`、`MGS`、`FC2`、`HEYZO`…）。

### 7.2 查询词

`scrapeQueries(video)`：

1. 从清洗后的标题提取番号：`([A-Za-z]{2,8})[-_ ]?(\d{2,6})` → `FH-059`；
2. 再回退到完整清洗标题。

### 7.3 写入字段

`applyMetaTubeMovie(video, movie, fields)`：

- 封面：下载 → `coverStore.saveBuffer()` → 删除旧封面；
- 标题、作者（`director`）、厂商（`maker || label`）、系列、演员、标签、简介、上架日期、时长；
- `tags` 合并，不覆盖已有；
- `notes` 永远不动；
- `externalId`、`metadataSource = metatube:<provider>`、`scrapedAt`；
- 最后 `updateVideo()`。

### 7.4 自动刮削

- 默认关闭。
- 添加链接后约 1.2 秒触发。
- 站点顺序：视频绑定的站点优先，否则所有启用站点。
- 每个查询词 × 每个站点搜索。
- **只有恰好 1 个候选才写入**；多个候选提示手动。
- 失败只 `console.warn`，不打断添加流程。

### 7.5 站点导入格式

```json
{
  "version": 1,
  "type": "video-library-scrape-sites",
  "sites": [
    {
      "id": "site_javbus",
      "name": "JavBus",
      "color": "#5bb98c",
      "kind": "site",
      "enabled": true,
      "metatubeProvider": "JavBus",
      "capabilities": ["有码", "无码"],
      "url": "https://www.javbus.com",
      "description": "…",
      "sortOrder": 1
    }
  ]
}
```

`importScrapeSites(payload)` 也接受裸数组；按 `id` 或同名合并；最多处理 500 条。

---

## 8. 设置页与文件选择器（高频踩坑）

### 8.1 声明式设置

`VideoLibrarySettingTab.getSettingDefinitions()` 返回 `SettingDefinitionItem[]`：

- `control`: `text` / `toggle` / `dropdown`，Obsidian 自动渲染；
- `render`: 自定义 DOM，例如站点列表、操作按钮；
- `action`: 旧式行点击，不建议新增（不可见按钮，体验差）。

新增 `control` 后：

- 在 `getControlValue(key)` 返回当前值；
- 在 `setControlValue(key, value)` 保存并 `persist()`；
- 需要刷新设置页时 `this.update()`。

### 8.2 设置页是独立窗口

Obsidian 可能把设置开在 popout：

```ts
const doc = this.containerEl.ownerDocument;
const win = doc.defaultView;
```

不要用全局 `document.body` 创建 file input。否则“导入站点”会没反应，或者文件选择器跑到主窗口后面。

### 8.3 导入站点

`pickSiteFile()` 的正确做法：

1. 在 `this.containerEl.ownerDocument` 创建 `<input type="file">`；
2. 追加到该 document 的 body；
3. 用透明/移出屏幕的方式隐藏，**不要 `display:none`**；
4. `input.click()`；
5. `change` 里 `file.text()` → 去掉 BOM → `JSON.parse` → `plugin.importScrapeSites()`；
6. `cancel` 清理 input。

不要改回 `document.body.createEl(...)` + `display:none`。

### 8.4 导出站点

`exportSites()`：

- 生成 `video-library-scrape-sites-YYYY-MM-DD.json`；
- `capabilities` 过滤掉“欧美”；
- 用 Blob + `<a download>`；
- 日期用本地日期，不要用 `toISOString().slice(0,10)`（UTC 会差一天）。

### 8.5 按钮反馈

CSS 只对按钮：

```css
.mod-settings button:active:not(:disabled),
.vl-settings-sites button:active:not(:disabled),
... {
  transform: scale(0.9);
  opacity: 0.74;
  box-shadow: inset 0 2px 5px rgb(0 0 0 / 28%);
}
```

不要恢复 `.mod-settings .setting-item:active`。那会导致点“自定义添加站点”时整行/整个设置界面触发缩放。

---

## 9. 构建与部署

```bash
npm install
npm run build      # tsc --noEmit + rollup
npm run dev        # watch
```

产物：

- `main.js`（CJS，Obsidian 加载）
- `styles.css`（从 `src/styles.css` 复制）

`build.mjs` 会读 `deploy.config.json`：

```json
{
  "vault": "I:\\你的仓库",
  "pluginId": "video-library"
}
```

复制 `main.js`、`styles.css`、`manifest.json`、`versions.json` 到：

```text
<vault>/.obsidian/plugins/video-library/
```

如果目标目录是 junction/symlink 指向源码，会跳过复制。

**改完必须重新构建 + 在 Obsidian 里重载插件。** 只改 `src/` 不构建，界面不会变。

---

## 10. 验证清单（Definition of Done）

每次提交前至少做：

- [ ] `npm run build` 通过。
- [ ] 重载插件，Console 无红色错误。
- [ ] 视频库能打开，首页/网格/列表正常。
- [ ] 添加/编辑视频能保存。
- [ ] 播放器能播放、暂停、拖动进度。
- [ ] 设置页能打开，新增按钮/设置生效。
- [ ] 刮削站点为空时显示空状态。
- [ ] “导入站点”能打开文件选择器。
- [ ] 导入模板后站点数量/名称正确。
- [ ] “导出站点”能生成 JSON。
- [ ] 新建站点弹窗输入框没有 placeholder，能力只有“有码/无码”。
- [ ] 点击设置页按钮只有按钮缩放，没有整行/整页抖动。
- [ ] 搜索能跨分类/文件夹。
- [ ] 撤销按钮和 `Ctrl+Z` 正常。
- [ ] 旧 `data.json` 能加载（必要时先备份）。
- [ ] `git status` 没有 `data.json`、`covers/`、`external-links/`、`main.js`、`styles.css`。

---

## 10.5 0.9.0 笔记 / B 站 / 网盘 / 更新

### 新文件

- `src/notes.ts`：`NoteStore`。笔记 Markdown、节点解析、截图、回收站。
- `src/ui/notes-panel.ts`：播放器右侧笔记面板。
- `src/ui/notes-view.ts`：笔记管理视图。
- `src/ui/notes-trash-modal.ts`：回收站。
- `src/stream-server.ts`：127.0.0.1 随机端口流代理，转发 Range 和鉴权头。
- `src/bilibili.ts`：B 站扫码登录、DASH 解析。
- `src/ui/bilibili-login-modal.ts`：二维码登录。
- `src/cloud.ts`：网盘鉴权头与连接测试。
- `src/cloud-login-window.ts`：Electron 登录窗口读取百度/夸克 Cookie。
- `src/ui/cloud-login-modal.ts`、`src/ui/cloud-add-modal.ts`。
- `src/updates.ts`：GitHub Release 检查。

### 笔记数据

- `PluginData.noteGroups: NoteGroup[]`
- `PluginData.trashNotes: TrashNote[]`
- `VideoItem.notePath / noteFolder / noteCoverPath`
- 节点从 Markdown 的 `<!-- vl-note: JSON -->` 解析，不存 `data.json`。

格式：

```md
## 0:24 · 备注
<!-- vl-note: {"id":"note_xxx","time":24.59,"tags":[],"image":"...png","createdAt":...} -->
[▶ 0:24](obsidian://video-library?action=play&video=vid_xxx&t=24.59)
![[...png]]
总结
---
```

**不要改 marker 格式**，否则旧笔记节点全部解析失败。

### 笔记关键流程

- 标记：暂停 → `captureVideoElement(maxWidth:0,type:image/png)` → `NoteStore.addNode()` → `player.refreshNoteMarkers()`。
- 跳转：`obsidian://video-library?action=play&video=...&t=...` 或 `player.seekTo()`。
- 删除：`deleteNode()` 从 Markdown 移除块并写入 `trashNotes`。
- 还原：`restoreTrash()` 追加块。
- 彻底删除：`purgeTrash()` 删除附件；没有节点时删除笔记和 group。
- 移动笔记文件后：`resolveGroup()` 按 frontmatter `video-id` 重新定位。
- 打开 Modal 前必须 `plugin.focusMainWindow()`，否则 Modal 会跑进设置 popout。

### B 站

- `bilibiliCookie` 只存本地。
- 原生播放：`resolveBilibiliStream()` → `playurl` DASH → 视频/音频双轨 → 本地代理。
- 失败回退 iframe；不要删除回退。

### 网盘

- `cloudAccounts` 存 `credential`，仅本地。
- `getVideoSource()` 对 cloud 用 `streamServer.urlFor(url, cloudHeaders(...))`。
- 当前“添加网盘视频”接受**直链地址**；文件列表浏览尚未适配，这是一个明确的待办，不要声称已支持。
- 百度/夸克登录窗口依赖 `require("electron").remote`；如果 remote 不可用，回退到手动 Cookie。

### 更新

- `checkForUpdates()` 查 GitHub latest；`installUpdate()` 下载三个资产后 `location.reload()`。
- 改版本号必须同步 `manifest.json`、`package.json`、`versions.json`。

---

## 11. 已知陷阱

1. **`library-view.ts` 很大**：不要全局替换同类名；先定位具体 `renderXxx()`。
2. **`refresh()` 会重建 DOM**：外部持有的元素引用会失效；定时器/监听器要在 `onClose()` 清理。
3. **设置页 `this.update()` 与 `refreshViews()` 不是一回事**。
4. **`recordUndo()` 是快照**：在修改前调用；不要在修改后调用。
5. **删除标记会清理视频里的引用**：`deleteMarker()` 会从 `video.markers` 移除该 ID。
6. **清空站点不会自动删除视频字段**：站点只是筛选/刮削来源。
7. **外部视频播放缓存**：`external-links/` 可能是硬链接或复制；不要假设一定是硬链接。
8. **`coverPath` 只是文件名**：不要存绝对路径。
9. **搜索有词时忽略分类/文件夹**：这是产品要求，不要“修正”成只搜当前目录。
10. **关联视频默认 10 个**：`relatedEnabled` 关闭后不显示。
11. **MetaTube 404 不是错误**：不要把它包成失败提示。
12. **`requestUrl` 与浏览器 `fetch` 不同**：CORS 行为不同，但 404 仍可能 reject。
13. **Windows 路径**：外部视频路径用绝对路径；写 JSON 时注意反斜杠转义。
14. **弹窗按钮的 `type="button"`**：避免在表单里触发 submit。
15. **不要给 `.setting-item` 加动画**：见 8.5。

---

## 12. 交接时的最小上下文模板

把下面这段连同任务一起给下一个代理：

```text
项目：Obsidian 插件 Video Library（plugin id: video-library）
源码根：<repo>
入口：src/main.ts
数据：src/types.ts（DATA_VERSION=6）
界面：src/ui/*
构建：npm run build（tsc + rollup）
约束：
- GitHub 版本不带预设刮削站点
- 所有文字走 src/i18n.ts（中英双语）
- 改数据必须 recordUndo → persist → refreshViews
- 设置页可能在 popout，文件选择器用 this.containerEl.ownerDocument
- 不要手改 main.js/styles.css
- 点击动画只加按钮，不要加 .setting-item:active
请先读：types.ts → main.ts → settings-tab.ts → 相关 ui 文件
完成后：npm run build + 重载插件 + 按验证清单自测
```

---

## 13. 相关文件

- 人读架构指南：`项目架构与修改指南.md`
- 用户文档：`README.md`
- 变更记录：`CHANGELOG.md`
- 构建：`build.mjs`
- 清单：`manifest.json`
- 本地站点模板：`刮削站点导入代码/刮削站点模板.json`（不提交）

### 10.6 0.9.0 补充约束

- 全屏笔记栏在 `.vl-player-stage:fullscreen` 下显示；不要把它移到 modal 外层。
- 悬浮笔记是 Obsidian popout `NotesFloatingView`；打开 Modal 前务必 `focusMainWindow()`，否则会进到悬浮窗。
- `setAlwaysOnTop(true, "screen-saver")` 用于覆盖全屏视频。
- 截图分辨率默认 1920；源视频小于该宽度时不要 upscale。
- 单独删除截图走 `trashImage()`，不要直接 `adapter.remove()`。
- 回收站包含 `trashNotes` 和 `trashImages`；清空调用 `clearTrash()`。
- `notesGrouping` 为 `flat` 时笔记直接放根目录；`notesViewMode` 为 `list` 时只改 CSS 类。
- 网盘直链是临时 URL；不要把它当成永久地址。文件列表浏览仍未实现。
