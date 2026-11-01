import { App, Modal, Notice, setIcon } from "obsidian";
import { formatDuration, providerName, t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import { buildEmbedUrl, parseVideoUrl } from "../providers";
import type { PreviewClip, VideoItem } from "../types";
import { ConfirmModal, openExternal } from "./common";
import { VideoEditModal } from "./video-modal";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export class VideoPlayerModal extends Modal {
  private videoEl: HTMLVideoElement | null = null;
  private iframeEl: HTMLIFrameElement | null = null;

  private stageEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private bufferEl: HTMLElement | null = null;
  private thumbEl: HTMLElement | null = null;
  private markersEl: HTMLElement | null = null;
  private currentLabel: HTMLElement | null = null;
  private totalLabel: HTMLElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private duration = 0;
  private scrubbing = false;
  private triedDurationHack = false;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private item: VideoItem
  ) {
    super(app);
    this.modalEl.addClass("vl-player-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.item.title || t("misc.untitled"));
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const player = contentEl.createDiv({ cls: "vl-player-stage" });
    this.stageEl = player;
    this.renderPlayer(player);

    if (this.item.provider === "bilibili" && this.item.epId) {
      contentEl.createEl("p", { text: t("player.bilibiliRestricted"), cls: "vl-player-notice" });
    }

    const meta = contentEl.createDiv({ cls: "vl-player-meta" });
    const badge = meta.createSpan({ text: providerName(this.item.provider), cls: "vl-provider-badge" });
    badge.addClass(`is-${this.item.provider}`);
    const category = this.plugin.getCategory(this.item.categoryId);
    const categoryEl = meta.createSpan({ cls: "vl-player-category" });
    const dot = categoryEl.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: category?.color || "var(--text-faint)" });
    categoryEl.createSpan({ text: this.plugin.categoryName(this.item.categoryId) });
    if (this.item.folderId) {
      const folderPath = this.plugin.folderPath(this.item.folderId).map((folder) => folder.name);
      if (folderPath.length > 0) meta.createSpan({ text: folderPath.join(" / ") });
    }
    if (this.item.author) {
      meta.createSpan({ text: this.item.author, cls: "vl-player-author" });
    }
    if (this.item.duration) {
      meta.createSpan({ text: formatDuration(this.item.duration), cls: "vl-player-duration" });
    }

    if (this.item.tags.length > 0) {
      const tags = contentEl.createDiv({ cls: "vl-tag-list" });
      for (const tag of this.item.tags) {
        tags.createSpan({ text: `#${tag}`, cls: "vl-tag" });
      }
    }

    if (this.item.notes) {
      const notes = contentEl.createDiv({ cls: "vl-player-notes" });
      notes.createEl("h4", { text: t("player.notes") });
      notes.createEl("p", { text: this.item.notes });
    }

    const footer = contentEl.createDiv({ cls: "vl-modal-buttons vl-player-footer" });
    if (this.item.url) {
      const open = footer.createEl("button", { attr: { type: "button" } });
      setIcon(open.createSpan({ cls: "vl-btn-icon" }), "external-link");
      open.createSpan({ text: t("action.openOriginal") });
      open.addEventListener("click", () => openExternal(this.plugin.getVideoPageUrl(this.item)));
    }

    const edit = footer.createEl("button", { attr: { type: "button" } });
    setIcon(edit.createSpan({ cls: "vl-btn-icon" }), "pencil");
    edit.createSpan({ text: t("action.edit") });
    edit.addEventListener("click", () => {
      const latest = this.plugin.data.videos.find((video) => video.id === this.item.id) || this.item;
      this.close();
      new VideoEditModal(this.app, this.plugin, latest).open();
    });

    const remove = footer.createEl("button", {
      cls: "mod-warning",
      attr: { type: "button" }
    });
    setIcon(remove.createSpan({ cls: "vl-btn-icon" }), "trash-2");
    remove.createSpan({ text: t("action.delete") });
    remove.addEventListener("click", () => {
      new ConfirmModal(this.app, {
        title: t("confirm.deleteVideoTitle"),
        description: t("confirm.deleteVideoDesc", { title: this.item.title }),
        confirmText: t("confirm.delete"),
        danger: true,
        checkbox: this.item.localPath ? { label: t("confirm.deleteLocalFile") } : undefined,
        onConfirm: async (deleteLocalFile) => {
          await this.plugin.deleteVideo(this.item, deleteLocalFile);
          new Notice(t("notice.deleted"));
          this.close();
        }
      }).open();
    });
  }

  private renderPlayer(container: HTMLElement): void {
    const source = this.plugin.getVideoSource(this.item);

    if (this.item.provider === "local" || this.item.provider === "direct") {
      if (!source) {
        this.renderUnavailable(container, t("player.localMissing"), t("player.localMissingDesc"));
        return;
      }
      const frame = container.createDiv({ cls: "vl-player-frame" });
      this.videoEl = frame.createEl("video", {
        cls: "vl-native-video",
        attr: { autoplay: "true", playsinline: "true", preload: "metadata" }
      });
      this.videoEl.src = source;
      this.buildControls(container, this.videoEl);
      this.wireVideo(this.videoEl);
      return;
    }

    if (this.item.provider === "web") {
      this.renderWebFallback(container);
      return;
    }

    const parsed = this.item.url ? parseVideoUrl(this.item.url) : null;
    const bangumiEpisode = this.item.provider === "bilibili" ? this.item.epId || parsed?.epId : undefined;
    const embed = bangumiEpisode
      ? buildEmbedUrl("bilibili", this.item.videoId, 1, undefined, bangumiEpisode)
      : parsed?.embedUrl ||
        (this.item.provider === "youtube" || this.item.provider === "bilibili" || this.item.provider === "vimeo"
          ? buildEmbedUrl(this.item.provider, this.item.videoId, 1, parsed?.vimeoHash, this.item.epId)
          : undefined);

    if (!embed) {
      this.renderWebFallback(container);
      return;
    }

    const frameWrap = container.createDiv({ cls: "vl-iframe-wrap" });
    this.iframeEl = frameWrap.createEl("iframe", {
      attr: {
        src: embed,
        allow: "autoplay; fullscreen; picture-in-picture; encrypted-media",
        allowfullscreen: "true",
        frameborder: "0",
        scrolling: "no"
      }
    });
  }

  private wireVideo(video: HTMLVideoElement): void {
    video.addEventListener("loadedmetadata", () => this.syncDuration());
    video.addEventListener("durationchange", () => this.syncDuration());
    video.addEventListener("timeupdate", () => this.updateProgress());
    video.addEventListener("progress", () => this.updateProgress());
    video.addEventListener("play", () => this.updatePlayButton());
    video.addEventListener("pause", () => this.updatePlayButton());
    video.addEventListener("volumechange", () => this.updateVolumeUi());
    video.addEventListener("error", () => this.showPlaybackError());
    video.addEventListener("click", () => this.togglePlay());
    this.updatePlayButton();
    this.updateVolumeUi();
    this.syncDuration();
    this.updateProgress();
  }

  private buildControls(container: HTMLElement, video: HTMLVideoElement): void {
    const bar = container.createDiv({ cls: "vl-player-controls" });
    this.playButton = bar.createEl("button", {
      cls: "vl-player-control",
      attr: { type: "button", "aria-label": t("player.play") }
    });
    this.playButton.addEventListener("click", () => this.togglePlay());

    this.currentLabel = bar.createSpan({ cls: "vl-player-time", text: "0:00" });

    const timeline = bar.createDiv({
      cls: "vl-player-timeline",
      attr: { role: "slider", tabindex: "0", "aria-label": t("player.timeline"), "aria-valuemin": "0" }
    });
    this.bufferEl = timeline.createDiv({ cls: "vl-player-buffer" });
    this.progressEl = timeline.createDiv({ cls: "vl-player-progress" });
    this.thumbEl = timeline.createDiv({ cls: "vl-player-thumb" });
    this.markersEl = timeline.createDiv({ cls: "vl-player-markers" });
    this.bindTimeline(timeline, video);

    this.totalLabel = bar.createSpan({ cls: "vl-player-time", text: "--:--" });

    this.muteButton = bar.createEl("button", {
      cls: "vl-player-control",
      attr: { type: "button", "aria-label": t("player.mute") }
    });
    this.muteButton.addEventListener("click", () => {
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 0.8;
    });

    this.volumeSlider = bar.createEl("input", {
      cls: "vl-player-volume",
      attr: { type: "range", min: "0", max: "1", step: "0.01", "aria-label": t("player.volume") }
    });
    this.volumeSlider.value = String(video.volume);
    this.volumeSlider.addEventListener("input", () => {
      const volume = Math.min(1, Math.max(0, Number(this.volumeSlider?.value) || 0));
      video.volume = volume;
      video.muted = volume <= 0;
    });

    const fullscreen = bar.createEl("button", {
      cls: "vl-player-control",
      attr: { type: "button", "aria-label": t("player.fullscreen") }
    });
    setIcon(fullscreen, "maximize");
    fullscreen.addEventListener("click", () => {
      const stage = this.stageEl;
      if (!stage) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void stage.requestFullscreen?.().catch(() => undefined);
      }
    });
  }

  private bindTimeline(timeline: HTMLElement, video: HTMLVideoElement): void {
    const seekFromEvent = (event: PointerEvent): void => {
      const rect = timeline.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const duration = this.effectiveDuration(video);
      if (duration <= 0) return;
      video.currentTime = ratio * duration;
    };

    timeline.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.scrubbing = true;
      timeline.setPointerCapture(event.pointerId);
      seekFromEvent(event);
      event.preventDefault();
    });
    timeline.addEventListener("pointermove", (event) => {
      if (!this.scrubbing) return;
      seekFromEvent(event);
    });
    const stop = (event: PointerEvent): void => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      if (timeline.hasPointerCapture(event.pointerId)) timeline.releasePointerCapture(event.pointerId);
    };
    timeline.addEventListener("pointerup", stop);
    timeline.addEventListener("pointercancel", stop);

    timeline.addEventListener("keydown", (event) => {
      const duration = this.effectiveDuration(video);
      if (duration <= 0) return;
      if (event.key === "ArrowRight") {
        video.currentTime = Math.min(duration, video.currentTime + 5);
        event.preventDefault();
      } else if (event.key === "ArrowLeft") {
        video.currentTime = Math.max(0, video.currentTime - 5);
        event.preventDefault();
      } else if (event.key === "Home") {
        video.currentTime = 0;
        event.preventDefault();
      } else if (event.key === "End") {
        video.currentTime = duration;
        event.preventDefault();
      }
    });
  }

  private effectiveDuration(video: HTMLVideoElement): number {
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    if (this.duration > 0) return this.duration;
    return this.item.duration || 0;
  }

  private syncDuration(): void {
    const video = this.videoEl;
    if (!video) return;
    const actual = video.duration;
    if (Number.isFinite(actual) && actual > 0) {
      this.duration = actual;
      this.totalLabel?.setText(formatClock(actual));
      this.renderMarkers();
      this.updateProgress();
      return;
    }

    if (this.item.duration && this.item.duration > 0) {
      this.duration = this.item.duration;
      this.totalLabel?.setText(formatClock(this.duration));
      this.renderMarkers();
    }

    if (this.triedDurationHack) return;
    this.triedDurationHack = true;
    try {
      video.currentTime = 1e7;
    } catch {
      return;
    }
    window.setTimeout(() => {
      const current = this.videoEl;
      if (!current) return;
      if (Number.isFinite(current.duration) && current.duration > 0) {
        this.duration = current.duration;
        this.totalLabel?.setText(formatClock(this.duration));
        this.renderMarkers();
      }
      try {
        current.currentTime = 0;
      } catch {
        // Ignore; the player still works from the current position.
      }
      this.updateProgress();
    }, 140);
  }

  private updateProgress(): void {
    const video = this.videoEl;
    if (!video || !this.progressEl) return;
    const duration = this.effectiveDuration(video);
    const ratio = duration > 0 ? Math.min(1, Math.max(0, video.currentTime / duration)) : 0;
    this.progressEl.setCssStyles({ width: `${(ratio * 100).toFixed(3)}%` });
    this.thumbEl?.setCssStyles({ left: `${(ratio * 100).toFixed(3)}%` });
    this.currentLabel?.setText(formatClock(video.currentTime));
    if (duration > 0) {
      this.totalLabel?.setText(formatClock(duration));
      this.thumbEl?.removeClass("is-hidden");
    } else {
      this.thumbEl?.addClass("is-hidden");
    }

    if (this.bufferEl) {
      let bufferedEnd = 0;
      try {
        for (let index = 0; index < video.buffered.length; index += 1) {
          if (video.buffered.start(index) <= video.currentTime + 0.5) {
            bufferedEnd = Math.max(bufferedEnd, video.buffered.end(index));
          }
        }
      } catch {
        bufferedEnd = 0;
      }
      const bufferRatio = duration > 0 ? Math.min(1, bufferedEnd / duration) : 0;
      this.bufferEl.setCssStyles({ width: `${(bufferRatio * 100).toFixed(3)}%` });
    }
  }

  private renderMarkers(): void {
    const container = this.markersEl;
    const duration = this.duration;
    if (!container || duration <= 0) return;
    container.empty();
    const clips: PreviewClip[] = this.item.preview?.clips || [];
    const seen = new Set<number>();
    for (const clip of clips) {
      const time = Math.max(0, Math.min(duration, clip.start));
      const key = Math.round(time * 10) / 10;
      if (seen.has(key)) continue;
      seen.add(key);
      const marker = container.createEl("button", {
        cls: "vl-player-marker",
        attr: {
          type: "button",
          title: t("timeline.jumpTo", { time: formatClock(time) }),
          "aria-label": t("timeline.jumpTo", { time: formatClock(time) })
        }
      });
      marker.setCssStyles({ left: `${((time / duration) * 100).toFixed(3)}%` });
      marker.addEventListener("pointerdown", (event) => event.stopPropagation());
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        const video = this.videoEl;
        if (!video) return;
        video.currentTime = time;
        this.updateProgress();
      });
    }
  }

  private updatePlayButton(): void {
    if (!this.playButton || !this.videoEl) return;
    const playing = !this.videoEl.paused && !this.videoEl.ended;
    setIcon(this.playButton, playing ? "pause" : "play");
    const label = playing ? t("player.pause") : t("player.play");
    this.playButton.setAttribute("aria-label", label);
    this.playButton.setAttribute("title", label);
  }

  private updateVolumeUi(): void {
    const video = this.videoEl;
    if (!video || !this.muteButton) return;
    const muted = video.muted || video.volume <= 0;
    setIcon(this.muteButton, muted ? "volume-x" : video.volume < 0.5 ? "volume-1" : "volume-2");
    const label = muted ? t("player.unmute") : t("player.mute");
    this.muteButton.setAttribute("aria-label", label);
    this.muteButton.setAttribute("title", label);
    if (this.volumeSlider && document.activeElement !== this.volumeSlider) {
      this.volumeSlider.value = String(video.volume);
    }
  }

  private togglePlay(): void {
    const video = this.videoEl;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => new Notice(t("player.playFailed")));
    } else {
      video.pause();
    }
  }

  private showPlaybackError(): void {
    const video = this.videoEl;
    if (!video || !this.stageEl) return;
    const existing = this.stageEl.querySelector<HTMLElement>(".vl-player-error");
    if (existing) return;
    const overlay = this.stageEl.createDiv({ cls: "vl-player-error" });
    setIcon(overlay.createSpan({ cls: "vl-player-error-icon" }), "triangle-alert");
    overlay.createEl("p", { text: t("player.badFormat") });
    if (this.item.localPath) {
      const open = overlay.createEl("button", { text: t("player.openExternally"), attr: { type: "button" } });
      open.addEventListener("click", () => {
        const electron = (
          window as unknown as {
            require?: (id: string) => {
              shell?: { openPath?: (path: string) => Promise<string> };
            };
          }
        ).require?.("electron");
        if (electron?.shell?.openPath && this.item.localPath) {
          void electron.shell.openPath(this.item.localPath);
        }
      });
    }
  }

  private renderWebFallback(container: HTMLElement): void {
    const fallback = container.createDiv({ cls: "vl-web-fallback" });
    this.renderCover(fallback);
    const overlay = fallback.createDiv({ cls: "vl-web-overlay" });
    overlay.createEl("h3", { text: t("player.notEmbeddable") });
    overlay.createEl("p", { text: t("player.notEmbeddableDesc") });
    const open = overlay.createEl("button", { text: t("action.openOriginal"), cls: "mod-cta" });
    open.addEventListener("click", () => openExternal(this.item.url));
  }

  private renderUnavailable(container: HTMLElement, title: string, description: string): void {
    const fallback = container.createDiv({ cls: "vl-web-fallback" });
    this.renderCover(fallback);
    const overlay = fallback.createDiv({ cls: "vl-web-overlay" });
    overlay.createEl("h3", { text: title });
    overlay.createEl("p", { text: description });
  }

  private renderCover(container: HTMLElement): void {
    const cover = container.createDiv({ cls: "vl-player-cover" });
    if (this.item.coverPath) {
      const img = cover.createEl("img", { attr: { alt: this.item.title } });
      void this.plugin.coverStore.getUrl(this.item.coverPath).then((url) => {
        if (url) img.src = url;
      });
    } else {
      const placeholder = cover.createDiv({ cls: "vl-cover-placeholder" });
      setIcon(placeholder.createSpan(), "film");
      placeholder.createSpan({ text: t("misc.noCover") });
    }
  }

  onClose(): void {
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute("src");
      this.videoEl.load();
    }
    if (this.iframeEl) {
      this.iframeEl.removeAttribute("src");
    }
    this.contentEl.empty();
  }
}
