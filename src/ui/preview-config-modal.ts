import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import {
  clonePreviewConfig,
  DEFAULT_PREVIEW_DURATION,
  MAX_PREVIEW_DURATION,
  type PreviewClip,
  type PreviewConfig
} from "../types";

export class PreviewConfigModal extends Modal {
  private video!: HTMLVideoElement;
  private slider!: HTMLInputElement;
  private timeLabel!: HTMLElement;
  private startInput!: HTMLInputElement;
  private endInput!: HTMLInputElement;
  private durationInput!: HTMLInputElement;
  private clipList!: HTMLElement;
  private summaryEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private playButton!: HTMLButtonElement;
  private clips: PreviewClip[];
  private duration = DEFAULT_PREVIEW_DURATION;
  private videoDuration = 0;
  private ready = false;
  private initialSeekDone = false;
  private nudgeTimer = 0;

  constructor(
    app: App,
    private source: string,
    private knownDuration: number | undefined,
    initial: PreviewConfig | undefined,
    private onSave: (config: PreviewConfig) => void
  ) {
    super(app);
    this.clips = clonePreviewConfig(initial)?.clips || [];
    this.duration = initial?.duration || DEFAULT_PREVIEW_DURATION;
    this.modalEl.addClass("vl-preview-config-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("preview.title"));
    this.contentEl.createEl("p", { text: t("preview.desc"), cls: "vl-modal-description" });

    const durationRow = this.contentEl.createDiv({ cls: "vl-config-duration" });
    durationRow.createEl("label", { text: t("preview.duration"), cls: "vl-field-label" });
    const durationWrap = durationRow.createDiv({ cls: "vl-number-wrap" });
    this.durationInput = durationWrap.createEl("input", {
      type: "number",
      cls: "vl-text-input vl-number-input",
      attr: {
        min: "1",
        max: String(MAX_PREVIEW_DURATION),
        step: "1",
        value: String(this.duration),
        "data-vl-field": "preview-duration"
      }
    });
    durationWrap.createSpan({ text: t("preview.seconds"), cls: "vl-unit" });
    this.durationInput.addEventListener("input", () => this.renderClips());

    const durationActions = durationRow.createDiv({ cls: "vl-config-actions" });
    const cancel = durationActions.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    this.saveButton = durationActions.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button", "data-vl-action": "save-preview" }
    });
    this.saveButton.addEventListener("click", () => this.save());

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
      attr: { min: "0", max: "0", step: "0.05", value: "0" }
    });
    this.timeLabel = timeline.createSpan({ cls: "vl-frame-time", text: "0:00 / 0:00" });

    const buttons = this.contentEl.createDiv({ cls: "vl-frame-buttons" });
    this.playButton = buttons.createEl("button", { text: t("form.framePlay"), attr: { type: "button" } });
    const setStart = buttons.createEl("button", { text: t("preview.setStart"), attr: { type: "button" } });
    const setEnd = buttons.createEl("button", { text: t("preview.setEnd"), attr: { type: "button" } });

    const editor = this.contentEl.createDiv({ cls: "vl-clip-editor" });
    editor.createDiv({ text: t("preview.addClipHint"), cls: "vl-field-hint" });
    const inputs = editor.createDiv({ cls: "vl-clip-inputs" });
    const startLabel = inputs.createEl("label", { cls: "vl-clip-input-label" });
    startLabel.createSpan({ text: t("preview.start") });
    this.startInput = startLabel.createEl("input", {
      type: "number",
      cls: "vl-text-input vl-number-input",
      attr: { min: "0", step: "0.1", value: "0", "data-vl-field": "clip-start" }
    });
    const endLabel = inputs.createEl("label", { cls: "vl-clip-input-label" });
    endLabel.createSpan({ text: t("preview.end") });
    this.endInput = endLabel.createEl("input", {
      type: "number",
      cls: "vl-text-input vl-number-input",
      attr: { min: "0", step: "0.1", value: "4", "data-vl-field": "clip-end" }
    });
    const add = inputs.createEl("button", {
      cls: "mod-cta",
      text: t("preview.addClip"),
      attr: { type: "button", "data-vl-action": "add-clip" }
    });
    add.addEventListener("click", () => this.addClip());

    this.clipList = this.contentEl.createDiv({ cls: "vl-clip-list" });
    this.summaryEl = this.contentEl.createDiv({ cls: "vl-preview-summary" });
    this.statusEl = this.contentEl.createDiv({ cls: "vl-clip-status" });

    this.playButton.addEventListener("click", () => void this.togglePlay());
    this.slider.addEventListener("input", () => this.seekTo(Number(this.slider.value)));
    setStart.addEventListener("click", () => {
      this.startInput.value = this.video.currentTime.toFixed(1);
      this.statusEl.setText("");
    });
    setEnd.addEventListener("click", () => {
      this.endInput.value = this.video.currentTime.toFixed(1);
      this.statusEl.setText("");
    });

    this.video.addEventListener("loadedmetadata", () => this.onLoaded());
    this.video.addEventListener("durationchange", () => this.onLoaded());
    this.video.addEventListener("loadeddata", () => {
      this.ready = true;
      this.onLoaded();
      if (this.videoDuration === 0) this.nudgeDuration();
    });
    this.video.addEventListener("timeupdate", () => this.syncTime());
    this.video.addEventListener("play", () => this.playButton.setText(t("form.framePause")));
    this.video.addEventListener("pause", () => this.playButton.setText(t("form.framePlay")));
    this.video.addEventListener("error", () => {
      this.statusEl.setText(t("form.frameLoadFailed"));
      this.statusEl.addClass("is-error");
      this.saveButton.disabled = true;
    });

    this.renderClips();
  }

  private onLoaded(): void {
    const actual = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    const resolved = actual > 0 ? actual : this.knownDuration || 0;
    if (resolved > 0) {
      this.videoDuration = resolved;
      this.slider.max = String(resolved);
      this.slider.disabled = false;
      if (!this.initialSeekDone) {
        this.initialSeekDone = true;
        if (Number(this.endInput.value) > resolved) {
          this.endInput.value = String(Math.min(4, resolved).toFixed(1));
        }
        this.video.currentTime = Math.min(1, resolved * 0.1);
      }
      if (!this.endInput.value || Number(this.endInput.value) <= 0) {
        this.endInput.value = String(Math.min(4, resolved).toFixed(1));
      }
    }
    this.syncTime();
  }

  private nudgeDuration(): void {
    if (this.videoDuration > 0 || this.nudgeTimer) return;
    try {
      this.video.currentTime = 1e7;
    } catch {
      // Ignore; manual time entry still works.
    }
    this.nudgeTimer = window.setTimeout(() => {
      this.nudgeTimer = 0;
      this.onLoaded();
      this.syncTime();
    }, 800);
  }

  private syncTime(): void {
    const current = Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0;
    if (!this.slider.disabled && document.activeElement !== this.slider) {
      this.slider.value = String(current);
    }
    this.timeLabel.setText(
      `${this.formatTime(current)} / ${this.videoDuration > 0 ? this.formatTime(this.videoDuration) : "--:--"}`
    );
  }

  private seekTo(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const max = this.videoDuration || 0;
    this.video.currentTime = Math.max(0, max > 0 ? Math.min(seconds, max) : seconds);
    this.syncTime();
  }

  private async togglePlay(): Promise<void> {
    if (this.video.paused) {
      try {
        await this.video.play();
      } catch {
        // Ignore autoplay restrictions; the slider still works.
      }
    } else {
      this.video.pause();
    }
  }

  private addClip(): void {
    const start = Number(this.startInput.value);
    const end = Number(this.endInput.value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 0.1 || start < 0) {
      this.statusEl.setText(t("preview.invalidRange"));
      this.statusEl.addClass("is-error");
      return;
    }
    if (this.videoDuration > 0 && end > this.videoDuration + 0.05) {
      this.statusEl.setText(t("preview.outOfRange"));
      this.statusEl.addClass("is-error");
      return;
    }
    if (this.clips.length >= 20) {
      this.statusEl.setText(t("preview.tooManyClips"));
      this.statusEl.addClass("is-error");
      return;
    }
    this.clips.push({ start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 });
    this.statusEl.empty();
    this.statusEl.removeClass("is-error");
    this.renderClips();
  }

  private renderClips(): void {
    this.clipList.empty();
    if (this.clips.length === 0) {
      this.clipList.createDiv({ text: t("preview.noClips"), cls: "vl-clip-empty" });
    }

    this.clips.forEach((clip, index) => {
      const row = this.clipList.createDiv({ cls: "vl-clip-row" });
      row.createSpan({ text: `${index + 1}`, cls: "vl-clip-index" });
      row.createSpan({
        text: `${this.formatTime(clip.start)} – ${this.formatTime(clip.end)}`,
        cls: "vl-clip-time"
      });
      row.createSpan({ text: `${(clip.end - clip.start).toFixed(1)}s`, cls: "vl-clip-length" });

      const actions = row.createDiv({ cls: "vl-clip-actions" });
      this.clipButton(actions, "arrow-up", t("preview.moveUp"), () => {
        if (index === 0) return;
        [this.clips[index - 1], this.clips[index]] = [this.clips[index], this.clips[index - 1]];
        this.renderClips();
      });
      this.clipButton(actions, "arrow-down", t("preview.moveDown"), () => {
        if (index >= this.clips.length - 1) return;
        [this.clips[index + 1], this.clips[index]] = [this.clips[index], this.clips[index + 1]];
        this.renderClips();
      });
      this.clipButton(actions, "trash-2", t("preview.removeClip"), () => {
        this.clips.splice(index, 1);
        this.renderClips();
      });
    });

    const total = this.clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0);
    const duration = this.currentDuration();
    if (this.clips.length === 0) {
      this.summaryEl.setText(t("preview.summaryEmpty", { duration }));
    } else {
      this.summaryEl.setText(t("preview.summary", { count: this.clips.length, total: total.toFixed(1), duration }));
    }
  }

  private clipButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const button = parent.createEl("button", {
      cls: "vl-icon-btn",
      attr: { type: "button", title: label, "aria-label": label }
    });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
  }

  private currentDuration(): number {
    const value = Number(this.durationInput?.value);
    if (!Number.isFinite(value)) return DEFAULT_PREVIEW_DURATION;
    return Math.min(MAX_PREVIEW_DURATION, Math.max(1, Math.round(value * 10) / 10));
  }

  private save(): void {
    const duration = Number(this.durationInput.value);
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_PREVIEW_DURATION) {
      this.statusEl.setText(t("preview.durationInvalid"));
      this.statusEl.addClass("is-error");
      return;
    }
    this.onSave({
      duration: Math.round(duration * 10) / 10,
      clips: this.clips.map((clip) => ({ ...clip }))
    });
    new Notice(t("preview.saved"));
    this.close();
  }

  private formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  onClose(): void {
    window.clearTimeout(this.nudgeTimer);
    this.nudgeTimer = 0;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.contentEl.empty();
  }
}
