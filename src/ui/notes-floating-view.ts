import { ItemView, setIcon, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { NoteNode, VideoItem } from "../types";
import { NotesPanel, type NotesPlayerHost } from "./notes-panel";

export const NOTES_FLOAT_VIEW_TYPE = "video-library-notes-float";

export class NotesFloatingView extends ItemView implements NotesPlayerHost {
  private videoId = "";
  private notesPanel: NotesPanel | null = null;
  private video: VideoItem | null = null;
  private pinned = true;

  constructor(leaf: WorkspaceLeaf, private plugin: VideoLibraryPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return NOTES_FLOAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("notes.title");
  }

  getIcon(): string {
    return "notebook-pen";
  }

  getState(): Record<string, unknown> {
    return { videoId: this.videoId };
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    this.videoId = String(state?.videoId || this.videoId || "");
    await super.setState(state, result);
    this.render();
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("vl-notes-float-view");
    this.render();
    window.setTimeout(() => this.applyAlwaysOnTop(), 180);
  }

  async onClose(): Promise<void> {
    this.notesPanel?.destroy();
    this.notesPanel = null;
    this.contentEl.empty();
  }

  refresh(): void {
    if (!this.video || this.video.id !== this.videoId) this.render();
    else void this.notesPanel?.reload();
  }

  private render(): void {
    this.contentEl.empty();
    this.video = this.plugin.data.videos.find((item) => item.id === this.videoId) || null;
    const header = this.contentEl.createDiv({ cls: "vl-notes-float-head" });
    const title = header.createDiv({ cls: "vl-notes-float-title" });
    setIcon(title.createSpan({ cls: "vl-notes-float-icon" }), "notebook-pen");
    title.createSpan({ text: this.video?.title || t("notes.title") });

    const actions = header.createDiv({ cls: "vl-notes-float-actions" });
    const pin = actions.createEl("button", {
      cls: `vl-notes-float-button${this.pinned ? " is-active" : ""}`,
      attr: {
        type: "button",
        title: t("notes.alwaysOnTop"),
        "aria-label": t("notes.alwaysOnTop")
      }
    });
    setIcon(pin, "pin");
    pin.addEventListener("click", () => {
      this.pinned = !this.pinned;
      this.applyAlwaysOnTop();
      pin.toggleClass("is-active", this.pinned);
    });
    const close = actions.createEl("button", {
      cls: "vl-notes-float-button",
      attr: { type: "button", title: t("action.close"), "aria-label": t("action.close") }
    });
    setIcon(close, "x");
    close.addEventListener("click", () => this.leaf.detach());

    if (!this.video) {
      this.contentEl.createDiv({ cls: "vl-notes-float-empty", text: t("notes.noteMissing") });
      return;
    }

    const host = this.contentEl.createDiv({ cls: "vl-notes-float-body" });
    this.notesPanel = new NotesPanel(this.app, this.plugin, this.video, this, host);
    void this.notesPanel.open();
  }

  private applyAlwaysOnTop(): void {
    try {
      const win = this.containerEl.ownerDocument.defaultView as
        | (Window & {
            require?: (id: string) => {
              remote?: {
                getCurrentWindow?: () => {
                  setAlwaysOnTop?: (value: boolean, level?: string) => void;
                };
              };
            };
          })
        | null;
      const remote = win?.require?.("electron")?.remote;
      remote?.getCurrentWindow?.()?.setAlwaysOnTop?.(this.pinned, "screen-saver");
    } catch {
      // Always-on-top is best effort; the popout still works without it.
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.plugin.activePlayer?.getVideoElement() || null;
  }

  currentTime(): number {
    return this.plugin.activePlayer?.currentTime() || 0;
  }

  pauseForNote(): void {
    this.plugin.activePlayer?.pauseForNote();
  }

  togglePlayback(): void {
    this.plugin.activePlayer?.togglePlayback();
  }

  seekTo(time: number): void {
    this.plugin.activePlayer?.seekTo(time);
  }

  refreshNoteMarkers(nodes: NoteNode[]): void {
    this.plugin.activePlayer?.refreshNoteMarkers(nodes);
  }
}
