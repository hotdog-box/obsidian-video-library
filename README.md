# 视频库 / Video Library

一个给 Obsidian 用的视频链接收藏插件：把 B 站、YouTube、Vimeo、视频直链或本地视频收进一个带封面的网格里，用自定义分类、标签、收藏和搜索来整理。

![视频库界面](docs/demo-grid.png)

## English overview

Video Library is a desktop-only Obsidian plugin for collecting, organizing and watching video links and local video files in one cover grid.

- Import Bilibili, YouTube, Vimeo, direct video URLs and generic web pages, with automatic title, author, duration and cover detection.
- Add videos from inside the vault or from any folder on the computer; multi-file import and whole-folder import preserve subfolders, and folder import creates categories from the folder names.
- The player has a custom timeline with hover frame thumbnails and hover-preview clip markers, so preview clips become one-click jump points.
- Videos can store studio/label, series and performers. The player shows duration, file size, credits, tags and notes, with inline tag/notes editing.
- Batch and folder imports capture a random frame for every imported video as its cover.
- Optional MetaTube scraping: define markers per source, auto-mark Bilibili/YouTube links, search MetaTube manually, and apply cover, credits, tags, description, release date and duration. The plugin calls a local MetaTube server over HTTP and does not bundle its code.
- Organize with nested folders, a collapsible folder tree, breadcrumbs, tags with Any/All filtering, favorites, pinned videos, manual drag ordering and custom categories.
- Switch between a cover grid and a compact list, set custom folder covers, and delete a folder together with its contents when you confirm it.
- Windows Explorer-style selection: single-click selects, double-click opens, Ctrl/Cmd toggles, Shift extends, and dragging selected items moves them.
- A Bilibili-style Home view with a six-item recent/played carousel, pinned picks, recent additions, favorites, local videos and category rows.
- Optional deletion of the local source file, only after an explicit confirmation checkbox.
- The plugin has no accounts, ads or telemetry. Network access is limited to metadata and cover requests for the links the user adds. External file access is limited to files the user explicitly chooses.
- Desktop only: Node.js and Electron APIs are required for external files and native file dialogs.

See the Chinese sections below for the complete feature list and usage notes.

---

> 当前版本：`0.8.0`
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
  - 封面网格与列表两种显示模式，可一键切换；封面网格支持卡片大小切换
  - 本地/直链视频悬停时静音预览；可设置预览总时长，并选择多个片段按顺序拼接，超出总时长即从头循环
  - 预览时可点按钮切换静音/取消静音，并拖动滑块调节音量；会自动记住上次选择
  - 标题 / 标签 / 作者 / 备注搜索；输入搜索词后会跨分类和文件夹搜索整个视频库
  - 工具栏和首页提供撤回按钮，支持 Ctrl+Z 撤回上一步（最多 30 步；已删除的封面/本地文件不会恢复）
  - 标签库：编辑视频时可选择已有标签或新建标签，一个视频可加多个标签
  - 标签管理：新建、重命名、删除标签，并查看每个标签的使用数量
  - 标签筛选：在当前分类和搜索范围内选择多个标签，可切换“任一标签”或“全部标签”匹配强度
  - 仿 B 站电影主页的“首页”：大图轮播推荐、置顶推荐、最近添加、收藏、本地视频和分类横向卡片
  - 首页轮播右上角可切换展示来源：推荐、最近播放、最近添加、置顶、收藏、本地视频
  - 首页轮播优先展示最近播放的视频，自动轮换，可用圆点和左右箭头切换，每页最多 6 个
  - 本地视频支持仓库内文件和仓库外文件；仓库外文件直接引用绝对路径，不复制进仓库
  - 仓库外视频支持单文件选择、多选批量导入、整个文件夹导入；文件夹导入会保留子文件夹结构，并按根文件夹和每个一级子文件夹自动创建分类
  - 仓库外视频会在插件目录的 `external-links/` 建立硬链接供播放；跨盘无法硬链接时自动复制一份播放缓存
  - 删除本地视频时可勾选“同时删除本地视频文件”，文件会移到系统回收站；批量删除也支持
  - 选择逻辑参考 Windows 11：单击选中，双击打开；Ctrl/Cmd 切换选中，Shift 连选
  - 多选：卡片复选框、Ctrl/Cmd 多选、Shift 连选；在视频区域任意位置拖动即可框选，四个方向都可以
  - 框选默认切换选中状态，重复框同一批会取消；Shift 只加选，Ctrl 只减选
  - 文件夹：全部视频中可新建、重命名、删除、修改封面，支持嵌套子文件夹
  - 侧边栏文件夹树按层级展开，可折叠，点击任意层级直接跳转
  - 拖动视频或文件夹到文件夹卡片上即可移动，多选后可一起拖动；拖到另一张视频卡片可同时移动并调整顺序
  - 拖到顶部面包屑或侧边栏文件夹树可移动到指定层级；拖动卡片上的手柄可在当前文件夹内排序
  - 选中项目后右键可选择“移动到文件夹…”，在弹窗中搜索并选择目标位置
  - 删除文件夹时会连同其中的所有视频和子文件夹一起从视频库删除；可勾选同时删除原始视频文件
  - 在文件夹内点击“添加视频”，新视频会自动放进当前文件夹
  - 批量操作栏固定在顶部：全选/反选、批量改分类、批量收藏、批量置顶、批量查找替换重命名、批量删除
  - 置顶区在列表顶部，可折叠/展开、可拖动排序
  - 拖动卡片上的手柄排序；拖动后自动切换为“手动排序”
  - 收藏
  - 按添加时间、标题或手动顺序排序
  - 分类支持右键重命名/删除，侧边栏拖动可排序
  - 列表和首页空白处右键可直接添加视频；列表空白处还可新建文件夹
  - 编辑视频时可填写作者、厂商/片商、系列、演出人员、上架时间、简介和标记，多个演出人员用逗号或“、”分隔
  - 标记体系：B站/YouTube 链接自动打标记，本地视频可手动选择 JavBus、DMM 等来源标记
  - 可选 MetaTube 刮削：播放页或右键打开“刮削信息”，搜索候选并勾选要写入的封面、作者、厂商、系列、演出人员、标签、简介、上架时间和时长
  - 自动刮削默认关闭；开启后只在恰好一个候选时自动写入，避免错配
  - 内置播放器带完整进度条、缓冲进度、音量、全屏和播放/暂停控制；本地文件时长异常时进度条仍可拖动
  - 播放页视频下方显示时长、视频大小、分类、厂商、系列、演出人员、作者、添加时间、标签和备注
  - 播放页点击标签、系列或演员，可在下方联动显示相关视频；默认显示 10 个，可展开全部
  - 设置中可关闭“播放页显示关联视频”
  - 播放页提供“修改标签和备注”按钮，可在不离开播放页的情况下直接编辑并同步
  - 鼠标悬停在播放进度条上时，显示对应时间点的视频帧缩略图和时间标注
  - 设置了悬停预览的视频，会在播放进度条上显示可点击的菱形节点，点击直接跳到对应片段起点
  - 悬停预览设置里的播放按钮可听到声音，并提供音量滑块和静音按钮
  - 批量导入和文件夹导入会为每个视频在后台随机截取一帧作为封面
  - 右键菜单：播放、编辑、置顶、打开原网页、复制链接、移动到文件夹、删除；文件夹可打开、改封面、重命名、移动、删除
  - 中英双语界面，可跟随 Obsidian 语言
- **数据持久化**
  - 视频、分类、文件夹、标签、设置保存在插件的 `data.json`
  - 封面保存在插件目录的 `covers/` 下，可随插件目录一起备份

---

## 信息刮削（可选）

0.8.0 增加了基于 [MetaTube](https://github.com/metatube-community/metatube-sdk-go) 的可选刮削能力。插件只通过 HTTP 调用本地 MetaTube 服务，**不打包 MetaTube 代码**，因此本项目仍保持 MIT 协议。

### 1. 运行 MetaTube

在本地或 NAS 运行 MetaTube 服务，默认地址通常是：

```text
http://127.0.0.1:8080
```

如果服务开启了鉴权，准备好 Bearer Token。

#### Windows 免 Docker 安装

1. 安装 Go 1.25+，或使用免安装的 Go zip。
2. 下载 MetaTube 源码并解压。
3. 在源码目录执行：

```powershell
go build -o D:\MetaTube\metatube-server.exe ./cmd/server
```

4. 记下 `metatube-server.exe` 的完整路径，例如：

```text
D:\MetaTube\metatube-server.exe
```

5. 在插件设置中填写这个路径，然后点“启动 MetaTube 服务”。以后不需要再双击 bat。

当前测试机已经安装在 `D:\MetaTube\metatube-server.exe`。

### 2. 在插件设置中连接

打开“设置 → 视频库 → 信息刮削”：

- 填写 `MetaTube 服务地址`，例如 `http://127.0.0.1:8080`
- 需要时填写 `MetaTube Token`
- 填写 `MetaTube 程序路径`，用于启动/停止按钮
- 点“启动 MetaTube 服务”
- 点“测试 MetaTube 连接”，确认能读到来源数量

设置页同时提供“打开数据文件夹”和“打开封面文件夹”按钮，不需要自己去 `.obsidian/plugins/video-library` 里找。

### 3. 刮削站点

**发布到 GitHub 的版本不包含任何预设站点**，避免把特定站点配置强加给所有用户。首次使用时需要自己添加，或导入站点 JSON 文件。

设置页每个站点可以：

- 勾选启用/停用
- 上移、下移调整尝试顺序
- 编辑站点地址和 MetaTube 来源
- 单独测试连接
- 删除
- 自定义添加
- 从 JSON 文件导入
- 把当前站点导出为 JSON，方便备份或换电脑后恢复

没有配置站点时，设置页会显示空状态和“自定义添加站点 / 导入站点”入口。前一个站点失败时才尝试下一个，全部失败才算失败。

### 4. 站点 JSON 导入 / 导出

设置页可以把当前站点导出为 JSON，方便备份或换电脑后恢复；也可以导入之前保存的模板。

站点导入文件格式：

```json
{
  "version": 1,
  "type": "video-library-scrape-sites",
  "sites": [
    {
      "name": "站点名称",
      "enabled": true,
      "metatubeProvider": "MetaTube 来源名",
      "capabilities": ["有码", "无码"],
      "url": "https://example.com",
      "description": "说明"
    }
  ]
}
```

导入时按 `id` 或站点名称合并，已存在的站点会被更新，不会影响 B站/YouTube 链接标记。

本地开发用的站点模板保存在源码根目录 `刮削站点导入代码/`，该目录已加入 `.gitignore`，不会上传 GitHub。

### 5. 创建标记

标记（Marker）决定视频去哪个来源刮削：

- “B站”“YouTube”是内置自动标记，添加对应链接时会自动打上。
- 站点列表里的 JavBus、JAV321、MGStage 等本身就是可选标记。
- 在编辑视频时选择标记；也可以从“管理标记”里新建、改色、改来源或删除。

MetaTube 的来源名称区分大小写，以服务 `/v1/providers` 实际返回为准。当前版本的常见名称包括 `JavBus`、`JAV321`、`JAVFREE`、`MGS`、`SOD`、`FANZA`、`FC2`、`HEYZO`。**JavDB、MissAV 是否可用取决于你的 MetaTube 版本和来源插件**；当前 MetaTube 公共 provider 列表中没有这两个名字，需要单独适配或使用其他来源。

### 6. 手动刮削

在播放页点“刮削信息”，或在视频上右键“刮削信息”：

1. 按番号或标题搜索；
2. 从候选结果中选择正确的一部；
3. 勾选要写入的字段；
4. 写入视频。

可写入：封面、标题、作者、厂商/片商、系列、演出人员、标签、简介、上架时间、时长。标签采用合并方式，备注永远不会被覆盖。

### 7. 自动刮削（默认关闭）

设置中打开“添加链接后自动刮削”后：

- 只对带有 **MetaTube 来源标记** 的视频生效；
- 只有搜索结果**恰好一个**时才写入，避免匹配错影片；
- 多候选时不会自动选择，会提示你手动刮削。

B站/YouTube 链接目前只自动获取标题、作者、封面、时长并自动打标记；没有 Cookie 或 API Key 时，不做站内搜索。JAV 类站点建议使用 MetaTube 后端。

### 协议说明

- MetaTube 采用 Apache-2.0；本项目只调用其 HTTP API，不复制其源代码。
- [MDCz](https://github.com/ShotHeadman/MDCz) 采用 GPLv3；本项目没有复制或链接其代码，只参考了产品流程并独立实现。

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

### 开发文档

- `项目架构与修改指南.md`：面向小白的架构、文件职责、数据流和修改示例。
- `AI技术交接报告.skill.md`：给其他 AI 代理的交接 skill，包含约束、修改路由和自检清单。

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
