import { App, Modal, Notice } from "obsidian";
import type { CoverStore } from "../covers";
import { t } from "../i18n";

export class FramePickerModal extends Modal {
  private video!: HTMLVideoElement;
  private slider!: HTMLInputElement;
  private timeLabel!: HTMLElement;
  private useButton!: HTMLButtonElement;
  private playButton!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private duration = 0;
  private initialSeekDone = false;
  private nudgeTimer = 0;
  private ready = false;
  private chosen = false;

  constructor(
    app: App,
    private coverStore: CoverStore,
    private source: string,
    private knownDuration: number | undefined,
    private onChoose: (buffer: ArrayBuffer) => void
  ) {
    super(app);
    this.modalEl.addClass("vl-frame-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("form.framePickerTitle"));
    this.contentEl.createEl("p", { text: t("form.framePickerDesc"), cls: "vl-modal-description" });

    const stage = this.contentEl.createDiv({ cls: "vl-frame-stage" });
    this.video = stage.createEl("video", {
      cls: "vl-frame-video",
      attr: { preload: "auto", playsinline: "true" }
    });
    this.video.muted = true;
    this.video.src = this.source;

    const timeline = this.contentEl.createDiv({ cls: "vl-frame-timeline" });
    this.slider = timeline.createEl("input", {
      type: "range",
      cls: "vl-frame-slider",
      attr: { min: "0", max: "0", step: "0.05", value: "0", "data-vl-field": "frame-time" }
    });
    this.timeLabel = timeline.createSpan({ cls: "vl-frame-time", text: "0:00 / 0:00" });

    const buttons = this.contentEl.createDiv({ cls: "vl-frame-buttons" });
    this.playButton = buttons.createEl("button", { text: t("form.framePlay"), attr: { type: "button" } });
    const back = buttons.createEl("button", { text: t("form.frameBack"), attr: { type: "button" } });
    const forward = buttons.createEl("button", { text: t("form.frameForward"), attr: { type: "button" } });

    this.statusEl = this.contentEl.createDiv({ cls: "vl-frame-status" });

    const footer = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = footer.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    this.useButton = footer.createEl("button", {
      text: t("form.frameUse"),
      cls: "mod-cta",
      attr: { type: "button", "data-vl-action": "use-frame" }
    });
    this.useButton.disabled = true;
    this.useButton.addEventListener("click", () => void this.chooseFrame());

    this.playButton.addEventListener("click", () => void this.togglePlay());
    back.addEventListener("click", () => this.seekBy(-1));
    forward.addEventListener("click", () => this.seekBy(1));
    this.slider.addEventListener("input", () => this.seekTo(Number(this.slider.value)));

    this.video.addEventListener("loadedmetadata", () => this.onLoaded());
    this.video.addEventListener("durationchange", () => this.applyDuration());
    this.video.addEventListener("loadeddata", () => {
      this.ready = true;
      this.applyDuration();
      if (this.duration === 0) this.nudgeDuration();
      this.useButton.disabled = false;
    });
    this.video.addEventListener("timeupdate", () => this.syncTime());
    this.video.addEventListener("play", () => this.playButton.setText(t("form.framePause")));
    this.video.addEventListener("pause", () => this.playButton.setText(t("form.framePlay")));
    this.video.addEventListener("error", () => {
      this.statusEl.setText(t("form.frameLoadFailed"));
      this.statusEl.addClass("is-error");
      this.useButton.disabled = true;
    });
  }

  private onLoaded(): void {
    this.applyDuration();
    this.syncTime();
  }

  private seekableEnd(): number {
    try {
      const seekable = this.video.seekable;
      if (seekable.length > 0) {
        const end = seekable.end(seekable.length - 1);
        if (Number.isFinite(end) && end > 0) return end;
      }
    } catch {
      // Ignore seekable-range errors.
    }
    return 0;
  }

  private applyDuration(): void {
    const candidates = [
      Number.isFinite(this.video.duration) ? this.video.duration : 0,
      this.knownDuration || 0,
      this.seekableEnd()
    ];
    const resolved = candidates.find((value) => Number.isFinite(value) && value > 0) || 0;
    if (resolved <= 0) return;
    this.duration = resolved;
    this.slider.max = String(this.duration);
    this.slider.disabled = false;
    if (!this.initialSeekDone) {
      this.initialSeekDone = true;
      this.seekTo(Math.min(1, this.duration * 0.1));
    }
    this.syncTime();
  }

  private nudgeDuration(): void {
    if (this.duration > 0 || this.nudgeTimer) return;
    try {
      this.video.currentTime = 1e7;
    } catch {
      // Some browsers refuse the seek; the slider simply stays disabled.
    }
    this.nudgeTimer = window.setTimeout(() => {
      this.nudgeTimer = 0;
      this.applyDuration();
      this.syncTime();
    }, 800);
  }

  private syncTime(): void {
    const current = Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0;
    if (!this.slider.disabled && document.activeElement !== this.slider) {
      this.slider.value = String(current);
    }
    this.timeLabel.setText(`${this.formatTime(current)} / ${this.duration > 0 ? this.formatTime(this.duration) : "--:--"}`);
  }

  private seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const max = this.duration || this.video.duration || 0;
    const target = Math.max(0, Math.min(seconds, max || seconds));
    this.video.currentTime = target;
    this.syncTime();
  }

  private seekBy(offset: number): void {
    this.seekTo(this.video.currentTime + offset);
  }

  private async togglePlay(): Promise<void> {
    if (this.video.paused) {
      try {
        await this.video.play();
      } catch {
        // The browser may reject autoplay; the slider still works.
      }
    } else {
      this.video.pause();
    }
  }

  private async chooseFrame(): Promise<void> {
    this.useButton.disabled = true;
    this.video.pause();
    const buffer = await this.coverStore.captureVideoElement(this.video);
    if (!buffer) {
      this.useButton.disabled = false;
      new Notice(t("notice.frameCaptureFailed"));
      return;
    }
    this.chosen = true;
    this.onChoose(buffer);
    new Notice(t("notice.frameCaptured"));
    this.close();
  }

  private formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    }
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  onClose(): void {
    window.clearTimeout(this.nudgeTimer);
    this.nudgeTimer = 0;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.contentEl.empty();
    if (!this.chosen) {
      // Nothing was selected; the edit modal stays open with its previous cover.
    }
  }
}
