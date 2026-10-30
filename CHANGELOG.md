# Changelog

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
