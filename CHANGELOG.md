# Changelog

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
