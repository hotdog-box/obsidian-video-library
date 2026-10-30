import { t } from "../i18n";

const PREVIEW_SECONDS = 4;

export class HoverPreview {
  private static active: HoverPreview | null = null;
  private video: HTMLVideoElement | null = null;
  private badge: HTMLElement | null = null;
  private stopped = false;
  private started = false;

  constructor(
    private source: string,
    private cover: HTMLElement
  ) {}

  static stopActive(): void {
    HoverPreview.active?.stop();
  }

  start(): void {
    if (!this.source || this.stopped) return;
    HoverPreview.stopActive();
    HoverPreview.active = this;

    this.cover.addClass("is-previewing");

    const video = document.createElement("video");
    video.className = "vl-hover-video";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = false;
    video.setAttribute("aria-hidden", "true");
    video.src = this.source;
    this.video = video;
    this.cover.appendChild(video);

    this.badge = document.createElement("span");
    this.badge.className = "vl-preview-badge";
    this.badge.textContent = t("player.preview");
    this.cover.appendChild(this.badge);

    const tryPlay = () => {
      if (this.stopped || this.started) return;
      this.started = true;
      void video.play().catch(() => this.stop());
    };

    video.addEventListener("loadeddata", tryPlay, { once: true });
    video.addEventListener("canplay", tryPlay, { once: true });
    video.addEventListener("timeupdate", () => {
      if (this.stopped) return;
      if (video.currentTime >= PREVIEW_SECONDS) video.pause();
    });
    video.addEventListener("error", () => this.stop(), { once: true });
    video.load();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      this.video.remove();
      this.video = null;
    }
    this.badge?.remove();
    this.badge = null;
    this.cover.removeClass("is-previewing");
    if (HoverPreview.active === this) HoverPreview.active = null;
  }
}
