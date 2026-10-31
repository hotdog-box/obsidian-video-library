# Changelog

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
