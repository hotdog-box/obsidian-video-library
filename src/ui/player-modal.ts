import { App, Modal, Notice, setIcon } from "obsidian";
import { formatDuration, providerName, t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import { buildEmbedUrl, parseVideoUrl } from "../providers";
import type { VideoItem } from "../types";
import { ConfirmModal, openExternal } from "./common";
import { VideoEditModal } from "./video-modal";

export class VideoPlayerModal extends Modal {
  private videoEl: HTMLVideoElement | null = null;
  private iframeEl: HTMLIFrameElement | null = null;

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
    this.renderPlayer(player);

    const meta = contentEl.createDiv({ cls: "vl-player-meta" });
    const badge = meta.createSpan({ text: providerName(this.item.provider), cls: "vl-provider-badge" });
    badge.addClass(`is-${this.item.provider}`);
    const category = this.plugin.getCategory(this.item.categoryId);
    const categoryEl = meta.createSpan({ cls: "vl-player-category" });
    const dot = categoryEl.createSpan({ cls: "vl-category-dot" });
    dot.style.backgroundColor = category?.color || "var(--text-faint)";
    categoryEl.createSpan({ text: this.plugin.categoryName(this.item.categoryId) });
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
      open.addEventListener("click", () => openExternal(this.item.url));
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
        onConfirm: async () => {
          await this.plugin.deleteVideo(this.item);
          new Notice(t("notice.deleted"));
          this.close();
        }
      }).open();
    });
  }

  private renderPlayer(container: HTMLElement): void {
    const source = this.plugin.getVideoSource(this.item);

    if (this.item.provider === "local") {
      if (!source) {
        this.renderUnavailable(container, t("player.localMissing"), t("player.localMissingDesc"));
        return;
      }
      this.videoEl = container.createEl("video", {
        cls: "vl-native-video",
        attr: { controls: "true", autoplay: "true", playsinline: "true" }
      });
      this.videoEl.src = source;
      return;
    }

    if (this.item.provider === "direct") {
      if (!source) {
        this.renderUnavailable(container, t("player.localMissing"), t("player.localMissingDesc"));
        return;
      }
      this.videoEl = container.createEl("video", {
        cls: "vl-native-video",
        attr: { controls: "true", autoplay: "true", playsinline: "true" }
      });
      this.videoEl.src = source;
      return;
    }

    if (this.item.provider === "web") {
      this.renderWebFallback(container);
      return;
    }

    const parsed = this.item.url ? parseVideoUrl(this.item.url) : null;
    const embed =
      parsed?.embedUrl ||
      (this.item.provider === "youtube" || this.item.provider === "bilibili" || this.item.provider === "vimeo"
        ? buildEmbedUrl(this.item.provider, this.item.videoId)
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
