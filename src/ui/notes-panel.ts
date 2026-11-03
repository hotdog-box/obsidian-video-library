import { App, Notice, setIcon, TFile } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { NoteNode, VideoItem } from "../types";
import { ConfirmModal } from "./common";

export interface NotesPlayerHost {
  getVideoElement(): HTMLVideoElement | null;
  currentTime(): number;
  pauseForNote(): void;
  togglePlayback(): void;
  seekTo(time: number): void;
  refreshNoteMarkers(nodes: NoteNode[]): void;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function insertAtCursor(input: HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  input.selectionStart = input.selectionEnd = start + text.length;
}

export class NotesPanel {
  private panelEl: HTMLElement;
  private bodyEl: HTMLElement;
  private titleInput: HTMLInputElement;
  private nodes: NoteNode[] = [];
  private editingId: string | null = null;

  constructor(
    private app: App,
    private plugin: VideoLibraryPlugin,
    private video: VideoItem,
    private host: NotesPlayerHost,
    parent: HTMLElement
  ) {
    this.panelEl = parent.createDiv({ cls: "vl-notes-panel" });
    this.panelEl.createDiv({
      cls: "vl-notes-kicker",
      text: t("notes.title")
    });

    const head = this.panelEl.createDiv({ cls: "vl-notes-head" });
    this.titleInput = head.createEl("input", {
      type: "text",
      cls: "vl-notes-title-input",
      attr: { "aria-label": t("notes.noteTitle") }
    });
    this.titleInput.addEventListener("change", () => void this.renameNote());
    this.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.titleInput.blur();
      }
    });

    const toolbar = this.panelEl.createDiv({ cls: "vl-notes-toolbar" });
    this.toolButton(toolbar, "play", t("notes.playPause"), () => this.host.togglePlayback());
    this.toolButton(toolbar, "map-pin-plus", t("notes.mark"), () => void this.markCurrent(), true);
    this.toolButton(toolbar, "minus", t("notes.summary"), () => void this.insertSummary());
    this.toolButton(toolbar, "file-text", t("notes.open"), () => void this.plugin.noteStore.openNote(this.video));

    this.panelEl.createDiv({
      cls: "vl-notes-hint",
      text: `${t("notes.shortcutMark", {
        shortcut: this.plugin.data.settings.noteMarkerShortcut || "Alt+M"
      })} · ${t("notes.shortcutSummary", {
        shortcut: this.plugin.data.settings.noteSummaryShortcut || "Alt+G"
      })}`
    });

    this.bodyEl = this.panelEl.createDiv({ cls: "vl-notes-body" });
  }

  private toolButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    accent = false
  ): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: `vl-notes-tool${accent ? " is-accent" : ""}`,
      attr: { type: "button", title: label, "aria-label": label }
    });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }

  async open(): Promise<void> {
    const group = await this.plugin.noteStore.resolveGroup(this.video);
    this.titleInput.value = group.title || this.video.title || "";
    await this.reload();
  }

  async reload(): Promise<void> {
    const group = await this.plugin.noteStore.resolveGroup(this.video);
    this.titleInput.value = group.title || this.video.title || "";
    this.nodes = await this.plugin.noteStore.listNodes(this.video);
    this.host.refreshNoteMarkers(this.nodes);
    this.render();
  }

  private render(): void {
    this.bodyEl.empty();
    if (this.nodes.length === 0) {
      const empty = this.bodyEl.createDiv({ cls: "vl-notes-empty" });
      setIcon(empty.createDiv({ cls: "vl-notes-empty-icon" }), "notebook-pen");
      empty.createDiv({ cls: "vl-notes-empty-title", text: t("notes.noNodes") });
      empty.createDiv({ cls: "vl-notes-empty-desc", text: t("notes.noNodesDesc") });
      return;
    }
    for (const node of this.nodes) {
      this.renderNode(node);
    }
  }

  private renderNode(node: NoteNode): void {
    const card = this.bodyEl.createDiv({ cls: "vl-note-node" });
    const head = card.createDiv({ cls: "vl-note-node-head" });
    const time = head.createEl("button", {
      cls: "vl-note-time",
      attr: { type: "button", title: t("notes.jump", { time: formatClock(node.time) }) }
    });
    setIcon(time.createSpan({ cls: "vl-note-time-icon" }), "play");
    time.createSpan({ text: formatClock(node.time) });
    time.addEventListener("click", () => this.host.seekTo(node.time));

    if (this.editingId !== node.id) {
      head.createSpan({ cls: "vl-note-comment", text: node.comment || "—" });
      const actions = head.createDiv({ cls: "vl-note-node-actions" });
      const edit = actions.createEl("button", {
        cls: "vl-note-action",
        attr: { type: "button", title: t("notes.edit"), "aria-label": t("notes.edit") }
      });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () => {
        this.editingId = node.id;
        this.render();
      });
      const remove = actions.createEl("button", {
        cls: "vl-note-action is-danger",
        attr: { type: "button", title: t("action.delete"), "aria-label": t("action.delete") }
      });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => this.confirmDelete(node));

      if (node.imagePath) {
        const imageWrap = card.createDiv({ cls: "vl-note-image" });
        const image = imageWrap.createEl("img", {
          attr: { alt: "", loading: "lazy" }
        });
        const url = this.plugin.noteStore.displayPath(node.imagePath);
        if (url) image.src = url;
        const removeImage = imageWrap.createEl("button", {
          cls: "vl-note-image-remove",
          attr: { type: "button", title: t("notes.removeImage"), "aria-label": t("notes.removeImage") }
        });
        setIcon(removeImage, "x");
        removeImage.addEventListener("click", () => void this.removeImage(node));
      }
      if (node.summary) {
        card.createDiv({ cls: "vl-note-summary", text: node.summary });
      }
      if (node.tags.length > 0) {
        const tags = card.createDiv({ cls: "vl-note-tags" });
        for (const tag of node.tags) tags.createSpan({ cls: "vl-note-tag", text: `#${tag}` });
      }
      return;
    }

    const editor = card.createDiv({ cls: "vl-note-editor" });
    const comment = editor.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("notes.comment") }
    });
    comment.value = node.comment;
    const summary = editor.createEl("textarea", {
      cls: "vl-text-area",
      attr: { rows: "4", placeholder: t("notes.summaryPlaceholder") }
    });
    summary.value = node.summary;
    const tags = editor.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("notes.tagsPlaceholder") }
    });
    tags.value = node.tags.join(", ");

    const bindPaste = (textarea: HTMLTextAreaElement): void => {
      textarea.addEventListener("paste", (event) => {
        const items = event.clipboardData?.items;
        const item = items ? Array.from(items).find((entry) => entry.type.startsWith("image/")) : undefined;
        if (!item) return;
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        void file.arrayBuffer().then(async (buffer: ArrayBuffer) => {
          const extension = file.type.includes("png") ? "png" : "jpg";
          const path = await this.plugin.noteStore.saveImageBuffer(this.video, buffer, extension);
          insertAtCursor(textarea, `![[${path}]]`);
        });
      });
    };
    bindPaste(summary);

    const actions = editor.createDiv({ cls: "vl-actions-row" });
    const cancel = actions.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.editingId = null;
      this.render();
    });
    const save = actions.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    save.addEventListener("click", () => {
      void this.saveNode(node, comment.value, summary.value, tags.value, save);
    });
  }

  private async removeImage(node: NoteNode): Promise<void> {
    if (!node.imagePath) return;
    const path = node.imagePath;
    const updated = { ...node, imagePath: undefined };
    await this.plugin.noteStore.updateNode(this.video, updated);
    try {
      if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
    } catch {
      // Missing attachments should not block removing the embed.
    }
    await this.reload();
  }

  private async saveNode(
    node: NoteNode,
    comment: string,
    summary: string,
    tags: string,
    button: HTMLButtonElement
  ): Promise<void> {
    button.disabled = true;
    const updated: NoteNode = {
      ...node,
      comment: comment.trim(),
      summary: summary.trim(),
      tags: tags
        .split(/[,，、\n]+/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
    };
    await this.plugin.noteStore.updateNode(this.video, updated);
    this.editingId = null;
    await this.reload();
    new Notice(t("notes.saved"));
  }

  private confirmDelete(node: NoteNode): void {
    new ConfirmModal(this.app, {
      title: t("notes.deleteTitle"),
      description: t("notes.deleteDesc", { time: formatClock(node.time) }),
      confirmText: t("confirm.delete"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.noteStore.deleteNode(this.video, node.id);
        if (this.editingId === node.id) this.editingId = null;
        await this.reload();
        new Notice(t("notes.deleted"));
      }
    }).open();
  }

  async markCurrent(): Promise<void> {
    const video = this.host.getVideoElement();
    const time = this.host.currentTime();
    this.host.pauseForNote();
    let buffer: ArrayBuffer | null = null;
    if (video) {
      buffer = await this.plugin.coverStore.captureVideoElement(video, {
        maxWidth: 0,
        type: "image/png",
        quality: 1
      });
    }
    const node = await this.plugin.noteStore.addNode(this.video, time, {
      comment: "",
      summary: "",
      tags: [],
      image: buffer,
      extension: "png"
    });
    this.editingId = node.id;
    await this.reload();
    new Notice(buffer ? t("notes.marked") : t("notes.markedNoImage"));
  }

  async insertSummary(): Promise<void> {
    if (this.editingId) {
      const node = this.nodes.find((item) => item.id === this.editingId);
      const editor = this.bodyEl.querySelector<HTMLElement>(".vl-note-editor");
      const fields = editor?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input, textarea"
      );
      const save = editor?.querySelector<HTMLButtonElement>(".mod-cta");
      if (node && fields && fields.length >= 3 && save) {
        await this.saveNode(node, fields[0].value, fields[1].value, fields[2].value, save);
      }
    }
    await this.plugin.noteStore.appendDivider(this.video);
    await this.reload();
    const video = this.host.getVideoElement();
    if (video?.paused) this.host.togglePlayback();
    new Notice(t("notes.summaryInserted"));
  }

  private async renameNote(): Promise<void> {
    const next = this.titleInput.value.trim();
    if (!next) {
      const group = this.plugin.noteStore.groupFor(this.video.id);
      this.titleInput.value = group?.title || this.video.title || "";
      return;
    }
    await this.plugin.noteStore.renameGroup(this.video, next);
    new Notice(t("notes.renamed"));
  }

  destroy(): void {
    this.panelEl.remove();
  }

  focusNewNode(): void {
    const input = this.bodyEl.querySelector<HTMLInputElement>(".vl-note-editor .vl-text-input");
    input?.focus();
  }

  openNoteFile(): void {
    void this.plugin.noteStore.openNote(this.video);
  }
}

export function isNoteTextFile(file: TFile): boolean {
  return file.extension.toLowerCase() === "md";
}
