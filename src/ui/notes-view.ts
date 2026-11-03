import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { NoteGroup, NoteNode, VideoItem } from "../types";
import { ConfirmModal, pickVaultFile } from "./common";
import { VideoPlayerModal } from "./player-modal";
import { TrashNotesModal } from "./notes-trash-modal";

export const NOTES_VIEW_TYPE = "video-library-notes-view";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export class NotesView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: VideoLibraryPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return NOTES_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("notes.title");
  }

  getIcon(): string {
    return "notebook-pen";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("vl-notes-view");
    await this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    const root = this.contentEl.createDiv({
      cls: `vl-notes-manager${this.plugin.data.settings.notesViewMode === "list" ? " is-list" : ""}`
    });
    const head = root.createDiv({ cls: "vl-notes-manager-head" });
    const title = head.createDiv({ cls: "vl-notes-manager-title" });
    title.createEl("h2", { text: t("notes.title") });
    title.createEl("p", { text: t("notes.managerDesc") });
    const actions = head.createDiv({ cls: "vl-notes-manager-actions" });
    const trash = actions.createEl("button", {
      cls: "vl-notes-manager-action",
      attr: { type: "button" }
    });
    setIcon(trash.createSpan({ cls: "vl-btn-icon" }), "trash-2");
    trash.createSpan({
      text: t("notes.trash", {
        count:
          this.plugin.data.trashNotes.length +
          this.plugin.data.trashImages.length +
          this.plugin.data.trashGroups.length
      })
    });
    trash.addEventListener("click", () => {
      this.plugin.focusMainWindow();
      new TrashNotesModal(this.app, this.plugin, () => void this.render()).open();
    });
    const refresh = actions.createEl("button", {
      cls: "vl-notes-manager-action",
      attr: { type: "button" }
    });
    setIcon(refresh.createSpan({ cls: "vl-btn-icon" }), "refresh-cw");
    refresh.createSpan({ text: t("notes.refresh") });
    refresh.addEventListener("click", () => void this.render());

    const groups = [...this.plugin.data.noteGroups].sort((a, b) => b.updatedAt - a.updatedAt);
    if (groups.length === 0) {
      const empty = root.createDiv({ cls: "vl-notes-manager-empty" });
      setIcon(empty.createDiv({ cls: "vl-notes-manager-empty-icon" }), "notebook-pen");
      empty.createDiv({ cls: "vl-notes-manager-empty-title", text: t("notes.empty") });
      empty.createDiv({ cls: "vl-notes-manager-empty-desc", text: t("notes.emptyDesc") });
      return;
    }

    for (const group of groups) {
      const video = this.plugin.data.videos.find((item) => item.id === group.videoId);
      if (!video) continue;
      const nodes = await this.plugin.noteStore.listNodes(video);
      this.renderGroup(root, video, group, nodes);
    }
  }

  private renderGroup(parent: HTMLElement, video: VideoItem, group: NoteGroup, nodes: NoteNode[]): void {
    const section = parent.createDiv({ cls: "vl-notes-group" });
    const head = section.createDiv({ cls: "vl-notes-group-head" });
    const cover = head.createDiv({ cls: "vl-notes-group-cover" });
    const coverPath = group.coverPath || nodes.find((node) => node.imagePath)?.imagePath;
    if (coverPath) {
      const image = cover.createEl("img", { attr: { alt: "", loading: "lazy" } });
      const url = this.plugin.noteStore.displayPath(coverPath);
      if (url) image.src = url;
    } else {
      setIcon(cover.createDiv({ cls: "vl-notes-group-cover-empty" }), "notebook-pen");
    }
    cover.addEventListener("click", () => this.openVideo(video, 0));
    const info = head.createDiv({ cls: "vl-notes-group-info" });
    info.createDiv({ cls: "vl-notes-group-title", text: group.title || video.title });
    info.createDiv({
      cls: "vl-notes-group-meta",
      text: t("notes.nodeCount", { count: nodes.length })
    });
    const actions = head.createDiv({ cls: "vl-notes-group-actions" });
    const coverButton = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small",
      attr: { type: "button", title: t("notes.changeCover"), "aria-label": t("notes.changeCover") }
    });
    setIcon(coverButton, "image");
    coverButton.addEventListener("click", () => {
      this.plugin.focusMainWindow();
      pickVaultFile(this.app, "image", (file) => {
        void this.plugin.noteStore.setGroupCover(video, file.path).then(() => this.render());
      });
    });
    const noteButton = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small",
      attr: { type: "button", title: t("notes.open"), "aria-label": t("notes.open") }
    });
    setIcon(noteButton, "file-text");
    noteButton.addEventListener("click", () => {
      this.plugin.focusMainWindow();
      void this.plugin.noteStore.openNote(video);
    });
    const playButton = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small is-primary",
      attr: { type: "button", title: t("notes.openVideo"), "aria-label": t("notes.openVideo") }
    });
    setIcon(playButton, "play");
    playButton.addEventListener("click", () => this.openVideo(video, 0));
    const deleteNote = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small is-danger",
      attr: { type: "button", title: t("notes.deleteWhole"), "aria-label": t("notes.deleteWhole") }
    });
    setIcon(deleteNote, "trash-2");
    deleteNote.addEventListener("click", () => {
      this.plugin.focusMainWindow();
      new ConfirmModal(this.app, {
        title: t("notes.deleteWholeTitle"),
        description: t("notes.deleteWholeDesc", { title: group.title || video.title }),
        confirmText: t("confirm.delete"),
        danger: true,
        onConfirm: async () => {
          const ok = await this.plugin.noteStore.trashGroup(video);
          if (!ok) {
            new Notice(t("notes.deleteWholeFailed"));
            return;
          }
          new Notice(t("notes.deleted"));
          await this.render();
        }
      }).open();
    });

    if (nodes.length === 0) {
      section.createDiv({ cls: "vl-notes-group-empty", text: t("notes.noNodes") });
      return;
    }

    const grid = section.createDiv({ cls: "vl-notes-node-grid" });
    for (const node of nodes) this.renderNode(grid, video, node);
  }

  private renderNode(parent: HTMLElement, video: VideoItem, node: NoteNode): void {
    const card = parent.createDiv({ cls: "vl-notes-node-card" });
    const image = card.createDiv({ cls: "vl-notes-node-image" });
    if (node.imagePath) {
      const img = image.createEl("img", { attr: { alt: "", loading: "lazy" } });
      const url = this.plugin.noteStore.displayPath(node.imagePath);
      if (url) img.src = url;
    } else {
      setIcon(image.createDiv({ cls: "vl-notes-node-image-empty" }), "film");
    }
    const time = image.createEl("button", {
      cls: "vl-notes-node-time",
      text: `▶ ${formatClock(node.time)}`,
      attr: { type: "button" }
    });
    time.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openVideo(video, node.time);
    });
    card.addEventListener("click", () => this.openVideo(video, node.time));

    const body = card.createDiv({ cls: "vl-notes-node-body" });
    body.createDiv({ cls: "vl-notes-node-comment", text: node.comment || t("notes.untitledNode") });
    if (node.summary) body.createDiv({ cls: "vl-notes-node-summary", text: node.summary });
    if (node.tags.length > 0) {
      const tags = body.createDiv({ cls: "vl-notes-node-tags" });
      for (const tag of node.tags) tags.createSpan({ cls: "vl-note-tag", text: `#${tag}` });
    }
    const actions = card.createDiv({ cls: "vl-notes-node-actions" });
    const remove = actions.createEl("button", {
      cls: "vl-notes-node-delete",
      attr: { type: "button", title: t("action.delete"), "aria-label": t("action.delete") }
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      this.confirmDelete(video, node);
    });
  }

  private openVideo(video: VideoItem, time: number): void {
    this.plugin.focusMainWindow();
    new VideoPlayerModal(this.app, this.plugin, video, { startTime: time, openNotes: true }).open();
  }

  private confirmDelete(video: VideoItem, node: NoteNode): void {
    this.plugin.focusMainWindow();
    new ConfirmModal(this.app, {
      title: t("notes.deleteTitle"),
      description: t("notes.deleteDesc", { time: formatClock(node.time) }),
      confirmText: t("confirm.delete"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.noteStore.deleteNode(video, node.id);
        new Notice(t("notes.deleted"));
        await this.render();
      }
    }).open();
  }
}
