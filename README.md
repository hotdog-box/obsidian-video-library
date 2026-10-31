# 视频库 / Video Library

一个给 Obsidian 用的视频链接收藏插件：把 B 站、YouTube、Vimeo、视频直链或本地视频收进一个带封面的网格里，用自定义分类、标签、收藏和搜索来整理。

![视频库界面](docs/demo-grid.png)

## English overview

Video Library is a desktop-only Obsidian plugin for collecting, organizing and watching video links and local video files in one cover grid.

- Import Bilibili, YouTube, Vimeo, direct video URLs and generic web pages, with automatic title, author, duration and cover detection.
- Add videos from inside the vault or from any folder on the computer; multi-file import and whole-folder import preserve subfolders.
- Organize with nested folders, breadcrumbs, tags with Any/All filtering, favorites, pinned videos, manual drag ordering and custom categories.
- Windows Explorer-style selection: single-click selects, double-click opens, Ctrl/Cmd toggles, Shift extends, and dragging selected items moves them.
- A Bilibili-style Home view with a six-item recent/played carousel, pinned picks, recent additions, favorites, local videos and category rows.
- Optional deletion of the local source file, only after an explicit confirmation checkbox.
- The plugin has no accounts, ads or telemetry. Network access is limited to metadata and cover requests for the links the user adds. External file access is limited to files the user explicitly chooses.
- Desktop only: Node.js and Electron APIs are required for external files and native file dialogs.

See the Chinese sections below for the complete feature list and usage notes.

---

> 当前版本：`0.5.1`  
> 已在 Obsidian `1.14.5`（Windows 桌面版）实际测试通过。  
> 插件类型：仅桌面端。

---

## 已经实现的功能

- **视频链接管理**
  - B 站：`BV` 号、`av` 号、分 P、`b23.tv` 短链、番剧/影视 `ep` / `ss` 链接
  - 直接粘贴 `BV17f4y1n7et`、`av170001`、`ep419527` 这样的视频号也可以
  - YouTube：`watch`、`youtu.be`、`Shorts`
  - Vimeo：普通链接和带私有 hash 的链接
  - MP4 / WebM / MOV 等视频直链
  - 普通网页链接（保存标题和封面，播放时打开浏览器）
- **自动获取标题、作者、时长和封面**
- **封面可替换**
  - 自动抓取
  - 用截图软件截图后，在弹窗里按 `Ctrl+V`（Mac 为 `Cmd+V`）直接粘贴
  - 图片 URL
  - 仓库内的本地图片
  - 拖动进度条，从本地/直链视频里选择任意一帧
- **自定义分类**
  - 新建、重命名、删除
  - 自定义颜色
  - 删除分类时，视频自动移到“未分类”，不会删除视频
- **本地视频**
  - 选择仓库内的视频文件
  - 内嵌播放
  - 保存后自动从视频中截取封面
- **浏览与整理**
  - 封面网格、卡片大小切换
  - 本地/直链视频悬停时静音预览；可设置预览总时长，并选择多个片段按顺序拼接，超出总时长即从头循环
  - 预览时可点按钮切换静音/取消静音，并拖动滑块调节音量；会自动记住上次选择
  - 标题 / 标签 / 作者 / 备注搜索
  - 标签库：编辑视频时可选择已有标签或新建标签，一个视频可加多个标签
  - 标签管理：新建、重命名、删除标签，并查看每个标签的使用数量
  - 标签筛选：在当前分类和搜索范围内选择多个标签，可切换“任一标签”或“全部标签”匹配强度
  - 仿 B 站电影主页的“首页”：大图轮播推荐、置顶推荐、最近添加、收藏、本地视频和分类横向卡片
  - 首页轮播优先展示最近播放的 6 个视频，自动轮换，可用圆点和左右箭头切换
  - 本地视频支持仓库内文件和仓库外文件；仓库外文件直接引用绝对路径，不复制进仓库
  - 仓库外视频支持单文件选择、多选批量导入、整个文件夹导入；文件夹导入会保留子文件夹结构
  - 仓库外视频会在插件目录的 `external-links/` 建立硬链接供播放；跨盘无法硬链接时自动复制一份播放缓存
  - 删除本地视频时可勾选“同时删除本地视频文件”，文件会移到系统回收站；批量删除也支持
  - 选择逻辑参考 Windows 11：单击选中，双击打开；Ctrl/Cmd 切换选中，Shift 连选
  - 多选：卡片复选框、Ctrl/Cmd 多选、Shift 连选；在视频区域任意位置拖动即可框选，四个方向都可以
  - 框选默认切换选中状态，重复框同一批会取消；Shift 只加选，Ctrl 只减选
  - 文件夹：全部视频中可新建、重命名、删除文件夹，支持嵌套子文件夹
  - 拖动视频或文件夹到文件夹卡片上即可移动，多选后可一起拖动
  - 拖到顶部面包屑可移动到上一层/指定层；拖动卡片上的手柄可在当前文件夹内排序
  - 文件夹删除时只删除文件夹本身，里面的视频和子文件夹移到上一层
  - 在文件夹内点击“添加视频”，新视频会自动放进当前文件夹
  - 批量操作栏固定在顶部：全选/反选、批量改分类、批量收藏、批量置顶、批量查找替换重命名、批量删除
  - 置顶区在列表顶部，可折叠/展开、可拖动排序
  - 拖动卡片上的手柄排序；拖动后自动切换为“手动排序”
  - 收藏
  - 按添加时间、标题或手动顺序排序
  - 分类支持右键重命名/删除，侧边栏拖动可排序
  - 列表和首页空白处右键可直接添加视频；列表空白处还可新建文件夹
  - 右键菜单：播放、编辑、置顶、打开原网页、复制链接、删除；文件夹可打开、重命名、删除
  - 中英双语界面，可跟随 Obsidian 语言
- **数据持久化**
  - 视频、分类、文件夹、标签、设置保存在插件的 `data.json`
  - 封面保存在插件目录的 `covers/` 下，可随插件目录一起备份

---

## 安装

### 社区插件市场

审核通过后，在 Obsidian 中打开“设置 → 第三方插件 → 浏览”，搜索 **Video Library** 安装并启用。

### 手动安装

从 [Releases](https://github.com/hotdog-box/obsidian-video-library/releases) 下载：

- `main.js`
- `manifest.json`
- `styles.css`

放到：

```text
<你的仓库>/.obsidian/plugins/video-library/
```

然后在“设置 → 第三方插件”中启用 **Video Library**。

> 仅支持 Obsidian 桌面版。

---

## 在 Obsidian 里使用

1. 启动 Obsidian，打开测试仓库 `视频文件插件管理插件`。
2. 左侧栏点击胶片图标，或按 `Ctrl+P` 搜索“打开视频库”。
3. 点击“添加视频”，粘贴链接。
   - 链接粘贴后会自动识别标题和封面。
   - 识别失败也可以手动填写标题、图片链接或选择本地图片。
4. 选择分类；没有分类就点“新建分类”。
5. 保存后，卡片会出现在网格里。单击选中，双击卡片播放，悬停卡片可编辑。
6. 左侧“管理分类”可以重命名、删除、换颜色；分类也可以右键操作，或直接拖动排序。
7. 打开插件默认进入“首页”，可在大图推荐和横向卡片中浏览；点击“全部视频”进入管理视图。

> 本地视频既可以选仓库内文件，也可以点“选择仓库外文件”直接选电脑上的视频；“批量导入视频”可一次选多个文件，“导入整个文件夹”会连同子文件夹一起导入。外部文件只记录绝对路径，不会复制进仓库。为了绕过 Obsidian 的本地 URL 安全限制，插件会在 `external-links/` 建立硬链接（同盘），跨盘时复制播放缓存。删除卡片时默认不删文件，只有勾选“同时删除本地视频文件”才会把文件移到系统回收站。

---

## 安装 / 开发

### 环境

- Node.js 18 或更高（当前机器是 v24）
- npm
- Obsidian 桌面版

### 安装依赖并构建

```powershell
cd "G:\AIdeepseek ha\视频文件管理插件\video-library-plugin"
npm install
npm run build
```

构建会生成：

- `main.js`
- `styles.css`
- `manifest.json`
- `versions.json`

### 配置测试库

复制 `deploy.config.example.json` 为 `deploy.config.json`，把 `vault` 改成你的 Obsidian 仓库路径：

```json
{
  "vault": "G:\\AIdeepseek ha\\视频文件管理插件\\视频文件插件管理插件",
  "pluginId": "video-library"
}
```

然后运行：

```powershell
npm run dev
```

`npm run dev` 会监听源码变化，自动构建，并把产物复制到：

```text
<你的仓库>\.obsidian\plugins\video-library\
```

改完代码后，在 Obsidian 里按 `Ctrl+R` 重新加载，或到“设置 → 第三方插件”里关闭再启用插件。

### 当前电脑的特殊安装方式

这台电脑的 DSH 工作区有完整性级别限制，不能直接往 Obsidian 仓库里复制文件，所以当前使用 **目录链接**：

```text
G:\AIdeepseek ha\视频文件管理插件\视频文件插件管理插件\.obsidian\plugins\video-library
    -> G:\AIdeepseek ha\视频文件管理插件\video-library-plugin
```

Obsidian 会把链接当成普通插件目录；`npm run build` 检测到链接指向源码目录时，会跳过复制。

如果以后链接丢了，可以用管理员或普通 PowerShell 重新创建：

```powershell
Remove-Item "G:\AIdeepseek ha\视频文件管理插件\视频文件插件管理插件\.obsidian\plugins\video-library" -Force
cmd /c mklink /J "G:\AIdeepseek ha\视频文件管理插件\视频文件插件管理插件\.obsidian\plugins\video-library" "G:\AIdeepseek ha\视频文件管理插件\video-library-plugin"
```

普通用户如果不想用链接，直接按上一节配置 `deploy.config.json`，让构建脚本复制文件即可。

### 测试

```powershell
npm test
```

目前包含链接解析的单元测试：

- YouTube 各种链接
- B 站 BV / av / 分 P / b23 短链
- Vimeo 私有 hash
- 视频直链和普通网页
- 链接规范化与嵌入地址生成

---

## 数据与备份

插件数据在：

```text
<仓库>\.obsidian\plugins\video-library\data.json
<仓库>\.obsidian\plugins\video-library\covers\
```

- `data.json`：视频信息、分类、设置。
- `covers/`：下载或截取的封面图片。

备份整个 `video-library` 插件文件夹，就能保留视频库。删除卡片只会删除库里的记录和对应封面，不会删除原网页或本地视频文件。

---

## 已知限制

- B 站 / YouTube 的接口可能受网络、登录状态、地区或反爬限制。识别失败时，标题和封面都可以手动填写。
- 普通网页通常不允许在 Obsidian 内嵌播放，插件会提供“打开原网页”。
- 本地视频必须位于当前 Obsidian 仓库内。
- B 站播放器可能提示登录或限制清晰度，这是 B 站播放器本身的行为。
- 仅支持桌面端，不支持 Obsidian 手机端。
- 暂不支持批量导入、拖拽排序、播放列表、时间轴笔记。

---

## 版本管理

发布新版本时：

1. 修改 `package.json`、`manifest.json` 里的版本号。
2. 在 `versions.json` 增加 `"新版本": "最低 Obsidian 版本"`。
3. 运行 `npm test` 和 `npm run build`。
4. 提交并打标签：

```powershell
git add .
git commit -m "release: 0.1.0"
git tag 0.1.0
git push
git push --tags
```

GitHub Release 建议附上这三个文件，方便直接安装：

- `main.js`
- `manifest.json`
- `styles.css`

---

## 网络访问与隐私 / Privacy and network access

### 中文

这个插件**没有账号系统、没有广告、没有遥测**。所有视频、分类、标签、文件夹和设置都只保存在本地插件目录的 `data.json` 中。

只有在用户添加视频、刷新信息或更换封面时，插件才会访问网络：

- **B 站**：访问 `bilibili.com` / `api.bilibili.com` 获取视频、番剧的标题、作者、时长和封面；
- **YouTube**：访问 `youtube.com` 的 oEmbed 接口和 `ytimg.com` 的封面；
- **Vimeo**：访问 `vimeo.com` 的 oEmbed 接口；
- **普通网页**：访问用户粘贴的网页，读取标题和封面元数据；
- **封面图片**：访问用户提供的图片 URL。

这些请求只用于填充视频信息和封面，不会上传视频库内容。插件不会在后台定期联网。

### 仓库外文件

为了支持仓库外的本地视频，插件会读取用户明确选择的绝对路径文件，并在插件目录的 `external-links/` 下建立硬链接（跨盘时复制一份播放缓存）供 Obsidian 播放。删除视频时默认**不会**删除本地文件；只有用户在确认框中勾选“同时删除本地视频文件”时，才会把源文件移到系统回收站。

### English

This plugin has **no accounts, no ads and no telemetry**. All videos, categories, tags, folders and settings are stored locally in the plugin's `data.json`.

The plugin only accesses the network when the user adds a video, refreshes metadata or changes a cover:

- **Bilibili**: `bilibili.com` / `api.bilibili.com` for video and bangumi metadata and covers;
- **YouTube**: the oEmbed endpoint on `youtube.com` and thumbnails from `ytimg.com`;
- **Vimeo**: the oEmbed endpoint on `vimeo.com`;
- **Generic pages**: the page URL entered by the user, to read title and cover metadata;
- **Cover images**: image URLs explicitly provided by the user.

These requests only fill in video information and covers. Library contents are never uploaded, and the plugin does not poll the network in the background.

For local videos outside the vault, the plugin reads files at absolute paths explicitly chosen by the user. It creates a hard link in the plugin's `external-links/` folder for playback, or copies a playback cache when the source is on another volume. Deleting a video does **not** delete the original file unless the user ticks “Also delete the local video file” in the confirmation dialog, which moves the source file to the system trash.

---

## English

Video Library is an Obsidian desktop plugin for collecting and watching video links, local files and folders with custom covers, tags and categories.

- Supports Bilibili (including bangumi `ep`/`ss`), YouTube, Vimeo, direct video URLs, generic web pages, vault-local videos and external local files.
- Home view with a six-item recent/played carousel, pinned videos, recent additions, favorites, local videos and category rows.
- Tags with an Any/All filter, nested folders, breadcrumbs, Windows Explorer-style selection, multi-select drag and manual ordering.
- Fetches title, author, duration and cover automatically; covers can be replaced with an image URL, a local image, or a frame captured from a video.
- Custom categories with colors, right-click rename/delete and drag-to-reorder.
- Multi-file external import and whole-folder import that preserves subfolders.
- Optional deletion of the local source file, with an explicit confirmation checkbox.
- Bilingual UI (Chinese / English), following Obsidian's language by default.
- Desktop only, because external file access and playback use Node.js and Electron APIs.

### Development

```powershell
npm install
npm run build   # production build
npm run dev     # watch + deploy to the vault configured in deploy.config.json
npm test
```

The plugin data lives in `.obsidian/plugins/video-library/data.json`, and covers live in its `covers/` folder.

---

## License

MIT
