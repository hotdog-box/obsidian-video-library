import { App, Modal, Notice, setIcon } from "obsidian";
import { formatDuration, providerName, t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import { buildEmbedUrl, parseVideoUrl } from "../providers";
import type { PreviewClip, VideoItem } from "../types";
import { ConfirmModal, formatDate, formatFileSize, openExternal } from "./common";
import { ScrapeModal } from "./scrape-modal";
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

  private detailsEl: HTMLElement | null = null;
  private durationValueEl: HTMLElement | null = null;
  private quickEditOpen = false;
  private draftTags: string[] = [];
  private draftTagsEl: HTMLElement | null = null;
  private draftTagSelect: HTMLSelectElement | null = null;
  private draftTagInput: HTMLInputElement | null = null;
  private draftNotesInput: HTMLTextAreaElement | null = null;

  private scrubVideo: HTMLVideoElement | null = null;
  private scrubCanvas: HTMLCanvasElement | null = null;
  private scrubBubble: HTMLElement | null = null;
  private scrubTimeEl: HTMLElement | null = null;
  private hoverTimer = 0;
  private hoverSeq = 0;

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

    this.detailsEl = contentEl.createDiv({ cls: "vl-player-details" });
    this.renderDetails();

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

  private infoRow(parent: HTMLElement, label: string, value: string): HTMLElement {
    const row = parent.createDiv({ cls: "vl-player-info-row" });
    row.createSpan({ cls: "vl-player-info-label", text: label });
    return row.createSpan({ cls: "vl-player-info-value", text: value });
  }

  private renderDetails(): void {
    const container = this.detailsEl;
    if (!container) return;
    container.empty();

    const header = container.createDiv({ cls: "vl-player-details-head" });
    const heading = header.createDiv({ cls: "vl-player-details-title" });
    heading.createEl("h4", { text: t("player.info") });
    const badge = heading.createSpan({ text: providerName(this.item.provider), cls: "vl-provider-badge" });
    badge.addClass(`is-${this.item.provider}`);
    if (this.item.folderId) {
      const folderPath = this.plugin.folderPath(this.item.folderId).map((folder) => folder.name);
      if (folderPath.length > 0) {
        heading.createSpan({ text: folderPath.join(" / "), cls: "vl-player-folder-path" });
      }
    }

    const actions = header.createDiv({ cls: "vl-player-details-actions" });
    const scrape = actions.createEl("button", {
      cls: "vl-player-quick-edit",
      attr: { type: "button" }
    });
    setIcon(scrape.createSpan({ cls: "vl-btn-icon" }), "search");
    scrape.createSpan({ text: t("scrape.button") });
    scrape.addEventListener("click", () => {
      new ScrapeModal(this.app, this.plugin, this.item, (updated) => {
        Object.assign(this.item, updated);
        this.titleEl.setText(this.item.title || t("misc.untitled"));
        this.renderDetails();
      }).open();
    });

    const quick = actions.createEl("button", {
      cls: "vl-player-quick-edit",
      attr: { type: "button" }
    });
    setIcon(quick.createSpan({ cls: "vl-btn-icon" }), "square-pen");
    quick.createSpan({ text: this.quickEditOpen ? t("action.cancel") : t("player.quickEdit") });
    quick.addEventListener("click", () => {
      if (this.quickEditOpen) {
        this.quickEditOpen = false;
        this.renderDetails();
        return;
      }
      this.quickEditOpen = true;
      this.draftTags = [...this.item.tags];
      this.renderDetails();
    });

    const grid = container.createDiv({ cls: "vl-player-info-grid" });
    this.durationValueEl = this.infoRow(
      grid,
      t("player.duration"),
      formatDuration(this.item.duration || this.duration) || "—"
    );
    this.infoRow(grid, t("player.fileSize"), formatFileSize(this.plugin.getVideoFileSize(this.item)));
    this.infoRow(grid, t("form.category"), this.plugin.categoryName(this.item.categoryId));
    this.infoRow(grid, t("form.studio"), this.item.studio || "—");
    this.infoRow(grid, t("form.series"), this.item.series || "—");
    this.infoRow(
      grid,
      t("form.performers"),
      this.item.performers && this.item.performers.length > 0 ? this.item.performers.join(" / ") : "—"
    );
    this.infoRow(grid, t("form.author"), this.item.author || "—");
    this.infoRow(grid, t("form.releaseDate"), this.item.releaseDate || "—");
    this.infoRow(grid, t("player.added"), formatDate(this.item.createdAt));

    const markersRow = container.createDiv({ cls: "vl-player-info-row vl-player-info-wide" });
    markersRow.createSpan({ cls: "vl-player-info-label", text: t("form.markers") });
    const markersValue = markersRow.createSpan({ cls: "vl-player-info-value vl-player-info-tags" });
    const markers = this.plugin.markersForVideo(this.item);
    if (markers.length === 0) {
      markersValue.setText("—");
    } else {
      for (const marker of markers) {
        const chip = markersValue.createSpan({ cls: "vl-tag vl-marker-chip" });
        const dot = chip.createSpan({ cls: "vl-tag-dot" });
        dot.setCssStyles({ backgroundColor: marker.color });
        chip.createSpan({ text: marker.name });
      }
    }

    const tagsRow = container.createDiv({ cls: "vl-player-info-row vl-player-info-wide" });
    tagsRow.createSpan({ cls: "vl-player-info-label", text: t("form.tags") });
    const tagsValue = tagsRow.createSpan({ cls: "vl-player-info-value vl-player-info-tags" });
    if (this.item.tags.length === 0) {
      tagsValue.setText("—");
    } else {
      for (const tag of this.item.tags) {
        tagsValue.createSpan({ text: `#${tag}`, cls: "vl-tag" });
      }
    }

    const descriptionRow = container.createDiv({ cls: "vl-player-info-row vl-player-info-wide" });
    descriptionRow.createSpan({ cls: "vl-player-info-label", text: t("form.description") });
    const descriptionValue = descriptionRow.createSpan({
      cls: "vl-player-info-value vl-player-info-notes"
    });
    descriptionValue.setText(this.item.description || "—");

    const notesRow = container.createDiv({ cls: "vl-player-info-row vl-player-info-wide" });
    notesRow.createSpan({ cls: "vl-player-info-label", text: t("form.notes") });
    const notesValue = notesRow.createSpan({ cls: "vl-player-info-value vl-player-info-notes" });
    notesValue.setText(this.item.notes || "—");

    if (this.quickEditOpen) this.renderQuickEdit(container);
  }

  private renderQuickEdit(parent: HTMLElement): void {
    const editor = parent.createDiv({ cls: "vl-player-inline-edit" });
    editor.createEl("h5", { text: t("player.quickEditTitle") });

    const tagsField = editor.createDiv({ cls: "vl-player-edit-field" });
    tagsField.createEl("label", { text: t("form.tags"), cls: "vl-field-label" });
    this.draftTagsEl = tagsField.createDiv({ cls: "vl-player-edit-tags" });
    this.renderDraftTags();

    const controls = tagsField.createDiv({ cls: "vl-player-tag-controls" });
    this.draftTagSelect = controls.createEl("select", {
      cls: "dropdown vl-player-tag-select",
      attr: { "aria-label": t("tag.selectedExisting") }
    });
    this.renderDraftTagSelect();
    this.draftTagSelect.addEventListener("change", () => {
      const value = this.draftTagSelect?.value || "";
      if (this.draftTagSelect) this.draftTagSelect.value = "";
      if (value) this.addDraftTag(value);
    });

    const newTag = controls.createEl("input", {
      type: "text",
      cls: "vl-text-input vl-player-tag-new",
      attr: { placeholder: t("tag.newPlaceholder") }
    });
    this.draftTagInput = newTag;
    const addTag = controls.createEl("button", {
      cls: "vl-small-button",
      attr: { type: "button" }
    });
    setIcon(addTag.createSpan(), "plus");
    addTag.createSpan({ text: t("tag.add") });
    addTag.addEventListener("click", () => {
      this.addDraftTag(newTag.value);
      newTag.value = "";
    });
    newTag.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.addDraftTag(newTag.value);
      newTag.value = "";
    });

    const notesField = editor.createDiv({ cls: "vl-player-edit-field" });
    notesField.createEl("label", { text: t("form.notes"), cls: "vl-field-label" });
    this.draftNotesInput = notesField.createEl("textarea", {
      cls: "vl-text-area vl-player-notes-input",
      attr: { rows: "3", placeholder: t("form.notesPlaceholder") }
    });
    this.draftNotesInput.value = this.item.notes || "";

    const actions = editor.createDiv({ cls: "vl-modal-buttons vl-player-inline-actions" });
    const cancel = actions.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.quickEditOpen = false;
      this.renderDetails();
    });
    const save = actions.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    save.addEventListener("click", () => void this.saveQuickEdit(save));
  }

  private renderDraftTags(): void {
    if (!this.draftTagsEl) return;
    this.draftTagsEl.empty();
    if (this.draftTags.length === 0) {
      this.draftTagsEl.createSpan({ text: t("tag.noTags"), cls: "vl-tag-picker-empty" });
      return;
    }
    for (const name of this.draftTags) {
      const tag = this.plugin.getTagByName(name);
      const chip = this.draftTagsEl.createSpan({ cls: "vl-selected-tag" });
      const dot = chip.createSpan({ cls: "vl-tag-dot" });
      dot.setCssStyles({ backgroundColor: tag?.color || "var(--interactive-accent)" });
      chip.createSpan({ text: name });
      const remove = chip.createEl("button", {
        cls: "vl-selected-tag-remove",
        attr: { type: "button", title: t("tag.remove"), "aria-label": t("tag.remove") }
      });
      setIcon(remove, "x");
      remove.addEventListener("click", () => this.removeDraftTag(name));
    }
  }

  private renderDraftTagSelect(): void {
    if (!this.draftTagSelect) return;
    this.draftTagSelect.empty();
    this.draftTagSelect.createEl("option", {
      text: t("tag.selectedExisting"),
      value: "",
      attr: { selected: "true" }
    });
    for (const tag of this.plugin.data.tags) {
      if (this.draftTags.some((name) => name.toLowerCase() === tag.name.toLowerCase())) continue;
      this.draftTagSelect.createEl("option", { text: tag.name, value: tag.name });
    }
  }

  private addDraftTag(raw: string): void {
    const name = raw.trim();
    if (!name) return;
    const existing = this.plugin.getTagByName(name);
    const canonical = existing?.name || name;
    if (this.draftTags.some((tag) => tag.toLowerCase() === canonical.toLowerCase())) return;
    this.draftTags.push(canonical);
    this.renderDraftTags();
    this.renderDraftTagSelect();
  }

  private removeDraftTag(name: string): void {
    this.draftTags = this.draftTags.filter((tag) => tag !== name);
    this.renderDraftTags();
    this.renderDraftTagSelect();
  }

  private async saveQuickEdit(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const pendingTag = this.draftTagInput?.value.trim();
      if (pendingTag) this.addDraftTag(pendingTag);
      const tags = await this.plugin.ensureTags(this.draftTags);
      const notes = this.draftNotesInput?.value.trim() || undefined;
      const updated: VideoItem = {
        ...this.item,
        tags,
        notes,
        updatedAt: Date.now()
      };
      await this.plugin.updateVideo(updated);
      Object.assign(this.item, updated);
      this.quickEditOpen = false;
      this.renderDetails();
      new Notice(t("notice.updated"));
    } catch {
      button.disabled = false;
      new Notice(t("error.generic"));
    }
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
    this.buildScrubPreview(container, video);

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
      this.onTimelineHover(event, timeline);
      if (!this.scrubbing) return;
      seekFromEvent(event);
    });
    timeline.addEventListener("pointerleave", () => this.hideScrubPreview());
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

  private buildScrubPreview(container: HTMLElement, video: HTMLVideoElement): void {
    const bubble = container.createDiv({ cls: "vl-player-hover-preview is-hidden" });
    this.scrubCanvas = bubble.createEl("canvas", {
      cls: "vl-player-hover-canvas",
      attr: { width: "160", height: "90" }
    });
    this.scrubTimeEl = bubble.createSpan({ cls: "vl-player-hover-time", text: "0:00" });
    this.scrubBubble = bubble;

    const scrub = container.createEl("video", {
      cls: "vl-player-scrub-source",
      attr: { preload: "metadata", playsinline: "true" }
    });
    scrub.muted = true;
    scrub.src = video.currentSrc || video.src;
    scrub.addEventListener("seeked", () => this.drawScrubFrame());
    scrub.addEventListener("error", () => this.scrubCanvas?.addClass("is-hidden"));
    this.scrubVideo = scrub;
  }

  private onTimelineHover(event: PointerEvent, timeline: HTMLElement): void {
    if (!this.scrubBubble || !this.scrubTimeEl) return;
    const video = this.videoEl;
    if (!video) return;
    const duration = this.effectiveDuration(video);
    if (duration <= 0) {
      this.hideScrubPreview();
      return;
    }
    const rect = timeline.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const time = ratio * duration;
    this.scrubTimeEl.setText(formatClock(time));
    this.scrubBubble.removeClass("is-hidden");

    const stage = this.stageEl;
    if (stage) {
      const stageRect = stage.getBoundingClientRect();
      const half = 86;
      const left = Math.min(
        Math.max(half, event.clientX - stageRect.left),
        Math.max(half, stageRect.width - half)
      );
      this.scrubBubble.setCssStyles({ left: `${left}px` });
    }

    const sequence = ++this.hoverSeq;
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => {
      if (sequence !== this.hoverSeq) return;
      const scrub = this.scrubVideo;
      if (!scrub) return;
      try {
        scrub.currentTime = Math.min(Math.max(0, duration - 0.05), Math.max(0, time));
      } catch {
        // Metadata may not be ready yet; the time label still updates.
      }
    }, 80);
  }

  private hideScrubPreview(): void {
    this.hoverSeq += 1;
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = 0;
    this.scrubBubble?.addClass("is-hidden");
  }

  private drawScrubFrame(): void {
    const video = this.scrubVideo;
    const canvas = this.scrubCanvas;
    if (!video || !canvas || video.readyState < 2) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const target = 16 / 9;
    let sourceWidth = width;
    let sourceHeight = height;
    let sourceX = 0;
    let sourceY = 0;
    if (width / height > target) {
      sourceWidth = height * target;
      sourceX = (width - sourceWidth) / 2;
    } else {
      sourceHeight = width / target;
      sourceY = (height - sourceHeight) / 2;
    }
    try {
      context.drawImage(
        video,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      canvas.removeClass("is-hidden");
    } catch {
      canvas.addClass("is-hidden");
    }
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
      this.durationValueEl?.setText(formatDuration(actual) || "—");
      this.renderMarkers();
      this.updateProgress();
      return;
    }

    if (this.item.duration && this.item.duration > 0) {
      this.duration = this.item.duration;
      this.totalLabel?.setText(formatClock(this.duration));
      this.durationValueEl?.setText(formatDuration(this.duration) || "—");
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
        this.durationValueEl?.setText(formatDuration(this.duration) || "—");
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
    window.clearTimeout(this.hoverTimer);
    this.hoverTimer = 0;
    if (this.scrubVideo) {
      this.scrubVideo.pause();
      this.scrubVideo.removeAttribute("src");
      this.scrubVideo.load();
      this.scrubVideo.remove();
      this.scrubVideo = null;
    }
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
