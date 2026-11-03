import { App, MarkdownRenderer, Menu, Notice, setIcon, TFile } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { NoteNode, NoteSection, VideoItem } from "../types";
import { NoteSectionsModal } from "./note-sections-modal";
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
  private treeEl: HTMLElement;
  private titleInput: HTMLInputElement;
  private nodes: NoteNode[] = [];
  private sections: NoteSection[] = [];
  private editingId: string | null = null;
  private editorImages: string[] = [];
  private collapsed = new Set<string>();
  private manualCollapse = new Set<string>();

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
    this.toolButton(toolbar, "picture-in-picture-2", t("notes.float"), () => {
      void this.plugin.openNotesFloating(this.video);
    });
    this.toolButton(toolbar, "list-tree", t("notes.manageSections"), () => {
      new NoteSectionsModal(this.app, this.plugin, this.video, () => void this.reload()).open();
    });

    this.panelEl.createDiv({
      cls: "vl-notes-hint",
      text: `${t("notes.shortcutMark", {
        shortcut: this.plugin.data.settings.noteMarkerShortcut || "Alt+M"
      })} · ${t("notes.shortcutSummary", {
        shortcut: this.plugin.data.settings.noteSummaryShortcut || "Alt+G"
      })}`
    });

    const layout = this.panelEl.createDiv({ cls: "vl-notes-layout" });
    this.treeEl = layout.createDiv({ cls: "vl-notes-tree" });
    this.bodyEl = layout.createDiv({ cls: "vl-notes-body" });
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
    this.sections = await this.plugin.noteStore.listSections(this.video);
    for (const node of this.nodes) {
      if (this.hasSummaryImages(node.summary) && !this.manualCollapse.has(node.id)) {
        this.collapsed.add(node.id);
      }
    }
    this.host.refreshNoteMarkers(this.nodes);
    this.render();
  }

  private render(): void {
    this.bodyEl.empty();
    this.renderTree();
    if (this.nodes.length === 0) {
      const empty = this.bodyEl.createDiv({ cls: "vl-notes-empty" });
      setIcon(empty.createDiv({ cls: "vl-notes-empty-icon" }), "notebook-pen");
      empty.createDiv({ cls: "vl-notes-empty-title", text: t("notes.noNodes") });
      empty.createDiv({ cls: "vl-notes-empty-desc", text: t("notes.noNodesDesc") });
      return;
    }
    const sectionIds = new Set(this.sections.map((section) => section.id));
    for (const node of this.nodes) {
      if (!node.groupId || !sectionIds.has(node.groupId)) this.renderNode(node);
    }
    for (const section of this.sections) {
      this.renderSection(section);
      for (const node of this.nodes.filter((item) => item.groupId === section.id)) {
        this.renderNode(node);
      }
    }
  }

  private renderSection(section: NoteSection): void {
    const el = this.bodyEl.createDiv({ cls: "vl-note-section" });
    el.addEventListener("dragover", (event) => {
      event.preventDefault();
      el.addClass("is-drop-target");
    });
    el.addEventListener("dragleave", () => el.removeClass("is-drop-target"));
    el.addEventListener("drop", (event) => {
      event.preventDefault();
      el.removeClass("is-drop-target");
      const nodeId = event.dataTransfer?.getData("text/vl-note");
      if (nodeId) {
        void this.plugin.noteStore.assignGroup(this.video, nodeId, section.id).then(() => this.reload());
      }
    });
    const head = el.createDiv({ cls: "vl-note-section-head" });
    setIcon(head.createSpan({ cls: "vl-note-section-icon" }), "folder-tree");
    head.createSpan({ cls: "vl-note-section-title", text: section.title });
    const edit = head.createEl("button", {
      cls: "vl-note-action",
      attr: { type: "button", title: t("notes.editSection"), "aria-label": t("notes.editSection") }
    });
    setIcon(edit, "pencil");
    edit.addEventListener("click", () => {
      new NoteSectionsModal(this.app, this.plugin, this.video, () => void this.reload()).open();
    });
    if (section.summary) el.createDiv({ cls: "vl-note-section-summary", text: section.summary });
  }

  private imagesFor(node: NoteNode): string[] {
    const cover = node.coverImage || node.imagePath;
    return cover ? [cover] : [];
  }

  private hasSummaryImages(summary: string): boolean {
    return /!\[\[.*?\]\]|!\[.*?\]\(.*?\)/.test(summary);
  }

  private renderTree(): void {
    this.treeEl.empty();
    if (this.nodes.length === 0) return;
    const ids = new Set(this.nodes.map((node) => node.id));
    const children = new Map<string, NoteNode[]>();
    for (const node of this.nodes) {
      const parent = node.parentId && ids.has(node.parentId) ? node.parentId : "";
      const list = children.get(parent) || [];
      list.push(node);
      children.set(parent, list);
    }
    const renderLevel = (parent: string, depth: number): void => {
      for (const node of children.get(parent) || []) {
        const item = this.treeEl.createEl("button", {
          cls: "vl-notes-tree-item",
          attr: { type: "button" }
        });
        item.setCssStyles({ paddingLeft: `${6 + depth * 10}px` });
        const kids = children.get(node.id)?.length || 0;
        if (kids > 0) {
          const icon = item.createSpan({ cls: "vl-notes-tree-icon" });
          setIcon(icon, "folder-tree");
        }
        item.createSpan({ cls: "vl-notes-tree-time", text: formatClock(node.time) });
        item.createSpan({
          cls: "vl-notes-tree-label",
          text: node.comment || t("notes.untitledNode")
        });
        if (kids > 0) item.createSpan({ cls: "vl-notes-tree-count", text: String(kids) });
        item.addEventListener("click", () => {
          this.host.seekTo(node.time);
          const card = this.bodyEl.querySelector<HTMLElement>(`[data-note-id="${node.id}"]`);
          card?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        if (kids > 0) renderLevel(node.id, depth + 1);
      }
    };
    renderLevel("", 0);
  }

  private groupMenu(node: NoteNode, event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(t("notes.ungroup")).onClick(() => {
        void this.plugin.noteStore.assignGroup(this.video, node.id, undefined).then(() => this.reload());
      });
    });
    for (const section of this.sections) {
      menu.addItem((item) => {
        item
          .setTitle(section.title)
          .setIcon("folder-tree")
          .onClick(() => {
            void this.plugin.noteStore
              .assignGroup(this.video, node.id, section.id)
              .then(() => this.reload());
          });
      });
    }
    menu.showAtMouseEvent(event);
  }

  private renderNode(node: NoteNode): void {
    const card = this.bodyEl.createDiv({ cls: "vl-note-node" });
    card.setAttribute("data-note-id", node.id);
    card.setAttribute("draggable", this.editingId === node.id ? "false" : "true");
    card.addEventListener("dragstart", (event) => {
      if (this.editingId === node.id) return;
      event.dataTransfer?.setData("text/vl-note", node.id);
      card.addClass("is-dragging");
    });
    card.addEventListener("dragend", () => card.removeClass("is-dragging"));
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      card.addClass("is-drop-target");
    });
    card.addEventListener("dragleave", () => card.removeClass("is-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.removeClass("is-drop-target");
      const from = event.dataTransfer?.getData("text/vl-note");
      if (!from || from === node.id) return;
      const ids = this.nodes.map((item) => item.id);
      const fromIndex = ids.indexOf(from);
      const toIndex = ids.indexOf(node.id);
      if (fromIndex < 0 || toIndex < 0) return;
      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, from);
      void this.plugin.noteStore.reorderNodes(this.video, ids).then(() => this.reload());
    });

    const head = card.createDiv({ cls: "vl-note-node-head" });
    if (this.editingId !== node.id) {
      const grip = head.createSpan({ cls: "vl-note-grip" });
      setIcon(grip, "grip-vertical");
    }
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
        this.editorImages = this.imagesFor(node);
        this.render();
      });
      const remove = actions.createEl("button", {
        cls: "vl-note-action is-danger",
        attr: { type: "button", title: t("action.delete"), "aria-label": t("action.delete") }
      });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => this.confirmDelete(node));
      const group = actions.createEl("button", {
        cls: "vl-note-action",
        attr: { type: "button", title: t("notes.group"), "aria-label": t("notes.group") }
      });
      setIcon(group, "list-tree");
      group.addEventListener("click", (event) => this.groupMenu(node, event));

      const images = this.imagesFor(node);
      if (images.length > 0) {
        const grid = card.createDiv({ cls: "vl-note-images" });
        for (const path of images) {
          const imageWrap = grid.createDiv({ cls: "vl-note-image" });
          const image = imageWrap.createEl("img", { attr: { alt: "", loading: "lazy" } });
          const url = this.plugin.noteStore.displayPath(path);
          if (url) image.src = url;
          const removeImage = imageWrap.createEl("button", {
            cls: "vl-note-image-remove",
            attr: { type: "button", title: t("notes.removeImage"), "aria-label": t("notes.removeImage") }
          });
          setIcon(removeImage, "x");
          removeImage.addEventListener("click", () => void this.removeImage(node, path));
        }
      }
      if (node.summary) this.renderSummary(card, node);
      if (node.tags.length > 0) {
        const tags = card.createDiv({ cls: "vl-note-tags" });
        for (const tag of node.tags) tags.createSpan({ cls: "vl-note-tag", text: `#${tag}` });
      }
      return;
    }

    const editor = card.createDiv({ cls: "vl-note-editor" });
    const cover = node.coverImage || node.imagePath;
    if (cover) {
      const coverWrap = editor.createDiv({ cls: "vl-note-image" });
      const image = coverWrap.createEl("img", { attr: { alt: "", loading: "lazy" } });
      const url = this.plugin.noteStore.displayPath(cover);
      if (url) image.src = url;
      const removeCover = coverWrap.createEl("button", {
        cls: "vl-note-image-remove",
        attr: { type: "button", title: t("notes.removeImage"), "aria-label": t("notes.removeImage") }
      });
      setIcon(removeCover, "x");
      removeCover.addEventListener("click", () => void this.removeImage(node, cover));
    }
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
    const preview = editor.createDiv({
      cls: "vl-note-summary-preview vl-note-summary-markdown"
    });
    let previewTimer = 0;
    const renderPreview = (): void => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        preview.empty();
        if (!summary.value.trim()) return;
        void MarkdownRenderer.render(
          this.app,
          summary.value,
          preview,
          this.video.notePath || "",
          this.plugin
        );
      }, 120);
    };
    summary.addEventListener("input", renderPreview);
    summary.addEventListener("paste", (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files = Array.from(items)
        .filter((entry) => entry.type.startsWith("image/"))
        .map((entry) => entry.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (files.length === 0) return;
      event.preventDefault();
      for (const file of files) {
        void file.arrayBuffer().then(async (buffer: ArrayBuffer) => {
          const extension = file.type.includes("png") ? "png" : "jpg";
          const path = await this.plugin.noteStore.saveImageBuffer(this.video, buffer, extension);
          insertAtCursor(summary, `\n![[${path}]]\n`);
          renderPreview();
        });
      }
    });
    renderPreview();

    const actions = editor.createDiv({ cls: "vl-actions-row" });
    const cancel = actions.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.editingId = null;
      this.editorImages = [];
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

  private renderSummary(card: HTMLElement, node: NoteNode): void {
    const collapsed = this.collapsed.has(node.id);
    const wrap = card.createDiv({ cls: `vl-note-summary-wrap${collapsed ? " is-collapsed" : ""}` });
    const toggle = wrap.createEl("button", {
      cls: "vl-note-summary-toggle",
      attr: { type: "button", title: collapsed ? t("notes.expandSummary") : t("notes.collapseSummary") }
    });
    setIcon(toggle, collapsed ? "chevron-right" : "chevron-down");
    toggle.createSpan({ text: t("notes.summaryLabel") });
    toggle.addEventListener("click", () => {
      this.manualCollapse.add(node.id);
      if (this.collapsed.has(node.id)) this.collapsed.delete(node.id);
      else this.collapsed.add(node.id);
      this.render();
    });
    if (collapsed) {
      const preview = node.summary.replace(/!\[\[.*?\]\]/g, "").replace(/!\[.*?\]\(.*?\)/g, "").trim();
      wrap.createDiv({ cls: "vl-note-summary is-collapsed", text: preview || t("notes.summaryHasImages") });
      return;
    }
    const content = wrap.createDiv({ cls: "vl-note-summary vl-note-summary-markdown" });
    void MarkdownRenderer.render(this.app, node.summary, content, this.video.notePath || "", this.plugin).then(() => {
      this.attachSummaryImageControls(content, node);
    });
  }

  private attachSummaryImageControls(container: HTMLElement, node: NoteNode): void {
    const paths = [...node.summary.matchAll(/!\[\[(.*?)\]\]/g)].map((match) => match[1]);
    for (const image of Array.from(container.querySelectorAll("img"))) {
      const path = paths.find((candidate) => {
        const url = this.plugin.noteStore.displayPath(candidate);
        return url ? image.src === url : false;
      });
      if (!path) continue;
      const parent = image.parentElement;
      if (!parent) continue;
      parent.addClass("vl-note-inline-image-wrap");
      const controls = parent.createDiv({ cls: "vl-note-inline-image-controls" });
      const remove = controls.createEl("button", {
        cls: "vl-note-action is-danger",
        attr: { type: "button", title: t("notes.removeImage"), "aria-label": t("notes.removeImage") }
      });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.removeImage(node, path);
      });
    }
  }

  private async removeImage(node: NoteNode, path?: string): Promise<void> {
    if (!path && !node.imagePath) return;
    const ok = await this.plugin.noteStore.trashImage(this.video, node, path);
    if (!ok) {
      new Notice(t("notes.removeImageFailed"));
      return;
    }
    new Notice(t("notes.imageTrashed"));
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
        .filter(Boolean),
      images: this.imagesFor(node),
      coverImage: node.coverImage || node.imagePath,
      imagePath: node.coverImage || node.imagePath
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
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      buffer = await this.plugin.coverStore.captureVideoElement(video, {
        maxWidth: this.plugin.data.settings.noteScreenshotWidth || 1920,
        type: "image/png",
        quality: 1
      });
      if (!buffer) {
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        buffer = await this.plugin.coverStore.captureVideoElement(video, {
          maxWidth: this.plugin.data.settings.noteScreenshotWidth || 1920,
          type: "image/png",
          quality: 1
        });
      }
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
