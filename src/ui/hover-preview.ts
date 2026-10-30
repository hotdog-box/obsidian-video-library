import { t } from "../i18n";
import { DEFAULT_PREVIEW_DURATION, MAX_PREVIEW_DURATION, type PreviewClip } from "../types";

interface HoverPreviewOptions {
  duration?: number;
  clips?: PreviewClip[];
  fallbackDuration?: number;
}

export class HoverPreview {
  private static active: HoverPreview | null = null;
  private video: HTMLVideoElement | null = null;
  private badge: HTMLElement | null = null;
  private stopped = false;
  private started = false;
  private segments: PreviewClip[] = [];
  private segmentIndex = 0;
  private currentSegment: PreviewClip | null = null;
  private played = 0;
  private lastTime = 0;
  private seeking = false;
  private runId = 0;
  private seekTimer = 0;

  constructor(
    private source: string,
    private cover: HTMLElement,
    private options: HoverPreviewOptions = {}
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

    video.addEventListener("loadeddata", () => this.prepare(), { once: true });
    video.addEventListener("canplay", () => this.prepare(), { once: true });
    video.addEventListener("timeupdate", () => this.onTimeUpdate());
    video.addEventListener("error", () => this.stop(), { once: true });
    video.load();
  }

  private prepare(): void {
    if (this.stopped || this.started) return;
    this.started = true;

    const videoDuration = Number.isFinite(this.video?.duration)
      ? this.video!.duration
      : this.options.fallbackDuration || 0;
    const maxDuration = Math.min(
      MAX_PREVIEW_DURATION,
      Math.max(1, this.options.duration || DEFAULT_PREVIEW_DURATION)
    );
    const requested = (this.options.clips || [])
      .filter((clip) => Number.isFinite(clip.start) && Number.isFinite(clip.end) && clip.end - clip.start >= 0.1)
      .map((clip) => ({
        start: Math.max(0, clip.start),
        end: videoDuration > 0 ? Math.min(clip.end, videoDuration) : clip.end
      }))
      .filter((clip) => clip.end - clip.start >= 0.1);

    this.segments = requested.length > 0 ? requested : [{ start: 0, end: 0 }];
    if (requested.length === 0) {
      this.segments[0].end = videoDuration > 0 ? Math.min(videoDuration, maxDuration) : maxDuration;
    }

    this.segmentIndex = 0;
    this.played = 0;
    this.startSegment(0);
  }

  private startSegment(index: number): void {
    if (this.stopped || !this.video) return;
    if (index >= this.segments.length) {
      this.video.pause();
      return;
    }
    const segment = this.segments[index];
    if (!segment || segment.end <= segment.start) {
      this.startSegment(index + 1);
      return;
    }

    this.segmentIndex = index;
    this.currentSegment = segment;
    this.seeking = true;
    const run = ++this.runId;
    const video = this.video;

    const begin = () => {
      if (this.stopped || !this.video || run !== this.runId) return;
      window.clearTimeout(this.seekTimer);
      this.seekTimer = 0;
      this.seeking = false;
      this.lastTime = this.video.currentTime;
      void this.video.play().catch(() => this.stop());
    };

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      begin();
    };

    if (Math.abs(video.currentTime - segment.start) < 0.05) {
      begin();
      return;
    }

    video.addEventListener("seeked", onSeeked);
    this.seekTimer = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      begin();
    }, 1200);
    video.currentTime = segment.start;
  }

  private onTimeUpdate(): void {
    if (this.stopped || this.seeking || !this.video || !this.currentSegment) return;
    const time = this.video.currentTime;
    const delta = Math.max(0, time - this.lastTime);
    this.lastTime = time;
    this.played += delta;

    const maxDuration = Math.min(
      MAX_PREVIEW_DURATION,
      Math.max(1, this.options.duration || DEFAULT_PREVIEW_DURATION)
    );

    if (this.played >= maxDuration - 0.02) {
      this.video.pause();
      return;
    }
    if (time >= this.currentSegment.end - 0.04) {
      this.startSegment(this.segmentIndex + 1);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.runId += 1;
    window.clearTimeout(this.seekTimer);
    this.seekTimer = 0;
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
