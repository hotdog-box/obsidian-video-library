# Changelog

## 0.9.1 — 2026-11-04

- Security: stop disabling TLS certificate verification in the local stream proxy; all HTTPS upstream requests now validate certificates.
- Use a dedicated `Component` for Markdown rendering in the notes panel instead of the long-lived plugin instance, avoiding component lifecycle leaks.
- Respect the user's file deletion preference by using `FileManager.trashFile()` instead of `Vault.delete()`.
- Use `Vault.configDir` for the fallback plugin/config path instead of hardcoding `.obsidian`.
- Remove unnecessary TypeScript assertions and unused helpers; clean up lint warnings in the notes and floating-notes views.
- Add an English introduction at the top of the README for the Obsidian community directory review.

## 0.9.0 — 2026-11-04

- Add a resizable video player modal, with a notes panel that opens on the right.
- Add video notes stored as Markdown files in the vault. Each video gets its own folder; the note title defaults to the video name and can be renamed.
- Add timestamp nodes: mark the current time (button or configurable shortcut), pause, capture a high-resolution PNG frame, write the timestamp/comment/caption into the note, and show a clickable marker on the timeline.
- Clicking a timestamp in a note or in the notes manager opens the video at that exact time.
- Add a summary divider shortcut (default `Alt+G`) that inserts `---` and resumes playback.
- Add node tags, inline note editing, paste-text/paste-image support, and manual screenshot removal.
- Add player quality switching for Bilibili, playback speed 0.5×–2×, Space play/pause, arrow-key seeking and volume, draggable/maximizable modal, sticky footer and scrollable content.
- Render note summaries as Markdown (headings, lists, inline images) with collapsible sections; pasted images stay inline instead of a separate strip.
- Add multiple-image support, image ordering/removal to the recycle bin, and auto screenshot covers.
- Add independent note groups with titles/summaries, drag cards into groups, and `##`/`###` Markdown structure; the left node tree stays in time order.
- Add whole-note deletion to the recycle bin (folder, Markdown and attachments), with restore and permanent deletion.
- Add recycle-bin search, group-by-video, multi-select permanent deletion, and timestamps on deleted screenshots.
- Add note-derived hover previews (2-second clips, 10-second total by default) and settings for clip length, total duration and maximum duration.
- Add online hover previews for Bilibili and cloud videos.
- Add Bilibili part/episode selection from the player and preserve `?p=` page numbers when importing URLs.
- Add per-node collapse, card drag ordering (file order preserved), tag filtering across all folders, and fix oversized note images in wide note panels.
- Tag filtering now keeps the current search query and shows matching videos from inside folders in the all-videos grid.
- Add a notes manager button under “Add video”, a note shortcut on video cards/list rows, and refresh the notes manager when notes close/change.
- Fix Bilibili login by parsing Set-Cookie as well as the redirect URL; fix Baidu login validation via `xpan/nas?method=uinfo`.
- Add Bilibili quality labels and a local stream proxy for Bilibili/cloud playback.
- Add a notes manager view with one card per video folder, editable folder covers, per-timestamp cards, and a recycle bin with restore/permanent delete.
- Add note settings for the notes root, screenshot location (same folder, subfolder, or a specified vault folder), and both shortcuts.
- Add Bilibili QR-code login. The login cookie is stored only in the local plugin data, never uploaded by the plugin.
- Add native Bilibili playback through the local stream proxy, so HD streams can play inside Obsidian without opening a browser tab. The iframe player remains as a fallback.
- Add local cloud-drive accounts for Baidu Pan, Quark Drive, Aliyun Drive and OneDrive. Credentials stay in local `data.json`; video URLs are streamed through the local proxy instead of being downloaded.
- Add “Add cloud video” and automatic source categories (Bilibili, YouTube, Baidu Pan, Quark Drive, Aliyun Drive, OneDrive).
- Add update checking with an automatic startup reminder and a one-click updater that downloads the latest release assets from GitHub.
- Migrate plugin data to `DATA_VERSION = 6` with note groups, recycle-bin records, cloud accounts and note settings.
- Add `qrcode` for local QR rendering; the plugin still makes no requests to third-party QR services.

## 0.8.1 — 2026-11-02

- Address Obsidian community review findings for 0.8.0.
- Use the Obsidian `createEl` helper instead of `document.createElement` for the site-import file input and the site-export download link.
- Replace direct `style` assignments on the hidden file input with `setCssStyles`.
- Remove an unnecessary type assertion in `importScrapeSites()` and two unused imports.

## 0.8.0 — 2026-11-01

- Add a marker system for scraping: user-defined markers can bind videos to a MetaTube provider, and Bilibili/YouTube links receive automatic markers.
- Add a scraping-site list in settings with per-site enable, capabilities, URL, test, up/down ordering, delete, custom add and JSON import. The GitHub build ships **no preset sites**; site templates are kept locally outside the repository.
- Add MetaTube executable path plus start/stop service buttons in settings, and buttons to open the plugin data and covers folders.
- Add optional MetaTube integration. Run MetaTube locally and set its URL (and optional token) in settings; the plugin calls its REST API and does not bundle MetaTube code.
- Allow the search box to search the whole library across categories and folders.
- Add an undo button and Ctrl+Z for library actions (up to 30 steps).
- Make player tags, series and performers clickable to show related videos; configurable in settings, 10 shown initially with a show-all button.
- Turn settings actions into visible icon buttons with a clear press animation, and fix the bug where clicking a site button also animated the entire settings row.
- Fix “Import sites” so it opens a file picker from the settings window itself instead of creating a hidden input in the wrong document; add “Export sites” with a dated JSON file.
- Show a dedicated empty state when no scraping sites are configured, and keep the current site list as a local import template instead of shipping presets.
- Remove placeholder hints from the new-site dialog and drop the “欧美” capability option.
- Add `项目架构与修改指南.md` and `AI技术交接报告.skill.md` for future maintainers and AI agents.
- Treat MetaTube 404 as “no results” and raise the search timeout so all-provider searches do not fail prematurely.
- Add a manual “Scrape metadata” flow in the player and video context menu: search, choose a candidate, review the field diff, and apply cover, author, studio, series, performers, tags, description, release date and duration.
- Add marker management and four new editable fields: author, release date, description and markers. The video edit form also shows and manages markers.
- Add an optional auto-scrape setting. It is off by default and only applies metadata when exactly one candidate is found.
- Auto-scraped metadata never overwrites notes and only merges tags.
- Keep the 0.7.0 player, cover and folder features unchanged.

## 0.7.0 — 2026-11-01

- Add Studio/label, Series and Performers fields to the add/edit dialog and persist them with each video.
- Redesign the player details panel: duration, file size, category, studio, series, performers, author, added date, tags and notes are shown below the video.
- Add an inline “Edit tags & notes” editor to the player, so tags and notes can be changed without leaving the playback view.
- Batch and folder imports now generate a cover for every imported video by capturing a random frame in the background.
- Show a live frame thumbnail and timestamp when hovering over the player timeline.
- Add a Showcase selector to the Home hero with For you, Recently played, Recently added, Pinned, Favorites and Local videos modes.
- Keep the external playback cache check so large libraries do not copy files again on every launch.

## 0.6.0 — 2026-11-01

- Importing a whole folder now creates categories from the root folder and each top-level subfolder automatically.
- Unify Home cover sizes: the hero has a fixed height and every recent card uses a 16:9 cover with equal body height.
- Add a custom player timeline for local and direct videos, with play/pause, buffered range, seek, volume and fullscreen controls. The timeline stays visible even when a file reports an unknown or infinite duration.
- Show hover-preview clips as clickable diamond nodes on the player timeline; clicking a node jumps to that clip's start time.
- Folder covers can now be set from a local image, image URL, the first video cover in the folder, or removed.
- Deleting a folder now deletes its videos and subfolders as well, with an optional checkbox to delete the original local video files.
- Improve moving: drag any selected video or folder onto another folder, another video, a breadcrumb or the folder tree. Right-click a selection to open “Move to folder…”.
- Add a list view alongside the thumbnail grid, plus a collapsible folder tree in the sidebar for quick hierarchy navigation.
- Hover-preview settings now play audio while scrubbing; the preview player starts unmuted with a volume slider and mute button.
- Skip rebuilding the external playback cache when the cached hard link or copy already matches the source size, avoiding a full re-copy of large libraries on every launch.

## 0.5.2 — 2026-10-31

- Adopt Obsidian's declarative settings API with `getSettingDefinitions()`.
- Remove the deprecated imperative `display()` settings implementation.
- Settings now appear in Obsidian's settings search.
- Raise the minimum Obsidian version to 1.13.0 for the declarative settings API.

## 0.5.1 — 2026-10-31

- Address Obsidian community review findings.
- Replace direct style assignments with `setCssStyles` and Obsidian `createEl` helpers.
- Stop detaching the view leaf in `onunload`.
- Use `Setting.setHeading` in settings.
- Use Obsidian `getLanguage` and `vault.configDir`.
- Remove the plugin ID from command IDs.
- Use `FileManager.trashFile` for vault-local file deletion.
- Improve Node/Electron typings and Promise handling.
- Remove all `!important` declarations from CSS while preserving button styling.
- Add an English README overview and expand privacy/network/file-access disclosures.

## 0.5.0 — 2026-10-31

- Fix external file selection: use the native Electron file dialog and read paths with `webUtils.getPathForFile`.
- Add multi-file external import and whole-folder import, preserving the folder tree and skipping duplicates.
- Add a six-video Home hero carousel with auto-rotation, dots and previous/next buttons.
- Track `lastPlayedAt` and prioritize recently played videos in the Home carousel.
- Fix switching from Home back to All videos, Favorites, Uncategorized and categories.
- Fix “View all” links on Home so they actually open the corresponding library view.
- External imports show a summary notice and close the add dialog after importing.

## 0.4.0 — 2026-10-31

- Add external local video support: pick any video file on the computer without copying it into the vault.
- External videos play through a hard link in `external-links/`; cross-volume files fall back to a playback copy.
- Delete dialog can optionally move the local video file to the trash; batch delete supports the same option.
- Add a Bilibili-style Home view with a featured hero, pinned picks, recent videos, favorites, local videos and category rows.
- Home is now the default view; the library remains available from the sidebar.
- Add category right-click menu with rename and delete.
- Add drag-to-reorder categories in the sidebar.
- Right-click any empty area in the library or home view to add a video, and create a folder from the menu.
- Local vault and external files are both supported by player, preview and cover capture.

## 0.3.0 — 2026-10-31

- Add folders, including nested folders, with create, rename and delete.
- Breadcrumb navigation with drag-to-breadcrumb moves.
- Windows 11 Explorer-style selection: single click selects, double click opens, Ctrl/Shift extend selection.
- Drag videos and folders onto folder cards to move them, including multi-selection drag.
- Drag selected items to the breadcrumb to move them up one or more levels.
- Videos can live inside folders and are hidden from the parent folder view.
- Deleting a folder moves its videos and subfolders up one level instead of deleting the videos.
- New videos added while inside a folder are created in that folder.
- Folder cards show video and subfolder counts.
- Manual drag sorting continues to work inside each folder.

## 0.2.1 — 2026-10-31

- Pin videos to a dedicated section at the top.
- Pin/unpin from the card, context menu, or batch action bar.
- Collapse and expand the pinned section; the collapsed state is remembered.
- Drag the grip handle to reorder pinned or regular videos.
- Dragging switches the library to manual order, which is also selectable in the sort dropdown.

## 0.2.0 — 2026-10-31

- Global tag library shared by all videos, with migration from existing free-text tags.
- Tag picker while adding/editing: choose existing tags, create new ones, and assign multiple tags per video.
- Tag manager for creating, renaming, deleting and reviewing usage counts.
- Tag filter bar with one or more selected tags and an Any/All match-strength switch.
- Tag filtering combines with the current category and search query.
- Tag match mode is remembered across sessions.

## 0.1.9 — 2026-10-31

- The toolbar and batch-action bar are now sticky and stay visible while scrolling.
- The batch bar is always visible; its actions are disabled until something is selected.
- Box selection can start anywhere in the grid, including on a card, and works in all four drag directions.
- Box selection now toggles cards by default: dragging over selected cards deselects them without holding Ctrl.
- Shift still adds and Ctrl still removes; a drag no longer triggers the card's play action.

## 0.1.8 — 2026-10-31

- Multi-select with card checkboxes, Ctrl/Cmd click and Shift range selection.
- Drag a box over empty space to select cards; Shift adds and Ctrl removes from the selection.
- Select all, invert selection and clear selection actions.
- Batch move to category, batch favorite/unfavorite, batch rename (find and replace) and batch delete.
- Batch actions work in every filter, category and search result view.

## 0.1.7 — 2026-10-31

- Hover preview now has a mute/unmute button and a volume slider.
- The last mute state and volume are remembered for the next hover preview.
- Audio follows the configured clip sequence and loops with the video.
- Made card play/edit buttons more transparent and slimmer, with clearer icons.

## 0.1.6 — 2026-10-31

- The configured hover preview now loops continuously while the pointer stays on the card.
- After the last clip, or when the total preview duration is reached, playback restarts from the first clip.
- Leaving the card still stops and removes the preview immediately.

## 0.1.5 — 2026-10-31

- Per-video hover preview settings: choose the total preview duration and one or more clips.
- Clips play in list order; the sequence stops when the configured total duration is reached.
- Added a preview settings editor with video scrubbing, start/end selection, clip list, reorder and delete.
- Default behavior remains a 4-second preview from the beginning when no clips are configured.

## 0.1.4 — 2026-10-31

- Hovering a local or direct-URL video card starts a muted 4-second preview.
- Moving the pointer away stops and removes the preview immediately.
- Only one preview plays at a time; no player iframe is created for online cards.
- Added a small “Preview” badge on the cover while previewing.

## 0.1.3 — 2026-10-31

- Choose any frame from a local video or a direct video URL as the cover.
- New frame picker with a video preview, draggable timeline, play/pause and ±1s controls.
- Handles WebM files whose duration is only known after seeking, so the timeline still works.
- Online Bilibili / YouTube / Vimeo players remain non-capturable because of browser cross-origin restrictions; use the clipboard screenshot cover instead.

## 0.1.2 — 2026-10-31

- Paste a screenshot from the clipboard directly as the video cover (`Ctrl+V`, or `Cmd+V` on macOS).
- Pasted images are stored inside the plugin's `covers/` folder as PNG/JPEG/WebP and survive restarts.
- Added a visible paste hint and a 25 MB image-size guard.

## 0.1.1 — 2026-10-31

- Bilibili bangumi / movie links (`/bangumi/play/ep...`) are now resolved to their video and can be collected directly.
- Bare Bilibili IDs are accepted: `BV...`, `av...`, `ep...`, `ss...`.
- Bangumi metadata uses the season title, author, cover and duration, and keeps the episode id for playback.
- Bilibili page fallback also extracts a `bvid` from the HTML when the API is unavailable.

## 0.1.0 — 2026-10-30

First working version.

- Video library view with cover cards, search, sorting, favorites and right-click menu.
- Add and edit videos from Bilibili, YouTube, Vimeo, direct video URLs and generic web pages.
- Automatic title, author, duration and cover fetching.
- Replace covers with an image URL, a local image or a frame captured from a local video.
- Local video support for files inside the vault, with automatic cover capture.
- User-defined categories with colors, rename and delete; deleting a category keeps its videos.
- Built-in player for Bilibili, YouTube, Vimeo, direct videos and local videos.
- Chinese / English interface with automatic language detection.
- Persistent data in the plugin folder; covers stored alongside the plugin.
