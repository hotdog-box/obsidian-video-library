import { setIcon } from "obsidian";
import { t } from "../i18n";
import { DEFAULT_PREVIEW_DURATION, MAX_PREVIEW_DURATION, type PreviewClip } from "../types";

interface HoverPreviewOptions {
  duration?: number;
  clips?: PreviewClip[];
  fallbackDuration?: number;
  muted?: boolean;
  volume?: number;
  onAudioChange?: (muted: boolean, volume: number) => void;
}

export class HoverPreview {
  private static active: HoverPreview | null = null;
  private video: HTMLVideoElement | null = null;
  private badge: HTMLElement | null = null;
  private audioEl: HTMLElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private muted = true;
  private volume = 0.8;
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
    this.muted = this.options.muted ?? true;
    const requestedVolume = Number(this.options.volume);
    this.volume = Number.isFinite(requestedVolume) ? Math.min(1, Math.max(0, requestedVolume)) : 0.8;

    const video = document.createElement("video");
    video.className = "vl-hover-video";
    video.muted = this.muted;
    video.volume = this.volume;
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

    this.buildAudioControls();

    video.addEventListener("loadeddata", () => this.prepare(), { once: true });
    video.addEventListener("canplay", () => this.prepare(), { once: true });
    video.addEventListener("timeupdate", () => this.onTimeUpdate());
    video.addEventListener("error", () => this.stop(), { once: true });
    video.load();
  }

  private buildAudioControls(): void {
    const audio = document.createElement("div");
    audio.className = "vl-preview-audio";

    const button = document.createElement("button");
    button.className = "vl-preview-mute";
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.muted = !this.muted;
      if (!this.muted && this.volume <= 0) this.volume = 0.8;
      this.applyAudio();
      this.updateAudioUi();
      this.emitAudioChange();
    });

    const slider = document.createElement("input");
    slider.className = "vl-preview-volume";
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = String(this.volume);
    slider.setAttribute("aria-label", t("player.volume"));
    slider.addEventListener("input", (event) => {
      event.stopPropagation();
      this.volume = Math.min(1, Math.max(0, Number(slider.value) || 0));
      this.muted = this.volume <= 0;
      this.applyAudio();
      this.updateAudioUi();
      this.emitAudioChange();
    });

    audio.addEventListener("click", (event) => event.stopPropagation());
    audio.addEventListener("pointerdown", (event) => event.stopPropagation());
    audio.append(button, slider);
    this.cover.appendChild(audio);
    this.audioEl = audio;
    this.muteButton = button;
    this.volumeSlider = slider;
    this.updateAudioUi();
  }

  private applyAudio(): void {
    if (!this.video) return;
    this.video.muted = this.muted;
    this.video.volume = Math.min(1, Math.max(0, this.volume));
  }

  private updateAudioUi(): void {
    if (this.muteButton) {
      const icon = this.muted || this.volume <= 0 ? "volume-x" : this.volume < 0.5 ? "volume-1" : "volume-2";
      setIcon(this.muteButton, icon);
      const label = this.muted ? t("player.unmute") : t("player.mute");
      this.muteButton.setAttribute("aria-label", label);
      this.muteButton.setAttribute("title", label);
    }
    if (this.volumeSlider && document.activeElement !== this.volumeSlider) {
      this.volumeSlider.value = String(this.volume);
    }
  }

  private emitAudioChange(): void {
    this.options.onAudioChange?.(this.muted, this.volume);
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
      this.restart();
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
      this.playWithFallback();
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
      this.restart();
      return;
    }
    if (time >= this.currentSegment.end - 0.04) {
      this.startSegment(this.segmentIndex + 1);
    }
  }

  private playWithFallback(): void {
    if (!this.video || this.stopped) return;
    this.video.play().catch(() => {
      if (this.stopped || !this.video) return;
      if (!this.muted) {
        this.muted = true;
        this.applyAudio();
        this.updateAudioUi();
        void this.video.play().catch(() => this.stop());
      } else {
        this.stop();
      }
    });
  }

  private restart(): void {
    if (this.stopped) return;
    this.played = 0;
    this.segmentIndex = 0;
    this.startSegment(0);
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
    this.audioEl?.remove();
    this.audioEl = null;
    this.muteButton = null;
    this.volumeSlider = null;
    this.cover.removeClass("is-previewing");
    if (HoverPreview.active === this) HoverPreview.active = null;
  }
}
