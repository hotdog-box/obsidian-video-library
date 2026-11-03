import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { TrashGroup, TrashImage, TrashNote } from "../types";
import { ConfirmModal } from "./common";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

interface TrashSection {
  videoId: string;
  title: string;
  notes: TrashNote[];
  images: TrashImage[];
}

export class TrashNotesModal extends Modal {
  private search = "";
  private expanded = new Set<string>();
  private selected = new Set<string>();

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private onChanged: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-notes-trash-modal");
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(t("notes.trashTitle"));
    contentEl.createEl("p", { text: t("notes.trashDesc"), cls: "vl-modal-description" });

    const toolbar = contentEl.createDiv({ cls: "vl-trash-toolbar" });
    const searchWrap = toolbar.createDiv({ cls: "vl-trash-search" });
    setIcon(searchWrap.createSpan({ cls: "vl-trash-search-icon" }), "search");
    const search = searchWrap.createEl("input", {
      type: "search",
      cls: "vl-text-input",
      attr: { placeholder: t("notes.trashSearch") }
    });
    search.value = this.search;
    search.addEventListener("input", () => {
      this.search = search.value;
      this.render();
      const next = this.contentEl.querySelector<HTMLInputElement>(".vl-trash-search input");
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    });
    if (this.selected.size > 0) {
      const removeSelected = toolbar.createEl("button", {
        cls: "vl-notes-manager-action is-small is-danger",
        attr: { type: "button" }
      });
      setIcon(removeSelected.createSpan({ cls: "vl-btn-icon" }), "trash-2");
      removeSelected.createSpan({
        text: t("notes.deleteSelected", { count: this.selected.size })
      });
      removeSelected.addEventListener("click", () => this.confirmDeleteSelected());
    }
    const clear = toolbar.createEl("button", {
      cls: "vl-notes-manager-action is-small is-danger",
      attr: { type: "button" }
    });
    setIcon(clear.createSpan({ cls: "vl-btn-icon" }), "trash-2");
    clear.createSpan({ text: t("notes.clearTrash") });
    clear.addEventListener("click", () => this.confirmClear());

    if (this.plugin.data.trashGroups.length > 0) {
      contentEl.createEl("h4", { text: t("notes.trashWholeHeading"), cls: "vl-trash-section-title" });
      const wholeList = contentEl.createDiv({ cls: "vl-notes-trash-list" });
      for (const group of this.plugin.data.trashGroups) this.renderWholeGroup(wholeList, group);
    }

    const groups = this.groups();
    if (groups.length === 0 && this.plugin.data.trashGroups.length === 0) {
      contentEl.createDiv({ cls: "vl-notes-trash-empty", text: t("notes.trashEmpty") });
      return;
    }

    const list = contentEl.createDiv({ cls: "vl-notes-trash-list" });
    for (const group of groups) this.renderGroup(list, group);
  }

  private groups(): TrashSection[] {
    const map = new Map<string, TrashSection>();
    const query = this.search.trim().toLowerCase();
    for (const note of this.plugin.data.trashNotes) {
      const haystack = `${note.videoTitle} ${note.node.comment} ${note.node.summary}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;
      let group = map.get(note.videoId);
      if (!group) {
        group = { videoId: note.videoId, title: note.videoTitle, notes: [], images: [] };
        map.set(note.videoId, group);
      }
      group.notes.push(note);
    }
    for (const image of this.plugin.data.trashImages) {
      const haystack = `${image.videoTitle} 截图`.toLowerCase();
      if (query && !haystack.includes(query)) continue;
      let group = map.get(image.videoId);
      if (!group) {
        group = { videoId: image.videoId, title: image.videoTitle, notes: [], images: [] };
        map.set(image.videoId, group);
      }
      group.images.push(image);
    }
    return [...map.values()].sort((a, b) => b.notes.length + b.images.length - (a.notes.length + a.images.length));
  }

  private renderWholeGroup(parent: HTMLElement, item: TrashGroup): void {
    const row = parent.createDiv({ cls: "vl-notes-trash-row is-whole" });
    const icon = row.createDiv({ cls: "vl-notes-trash-thumb is-icon" });
    setIcon(icon, "notebook-pen");
    const info = row.createDiv({ cls: "vl-notes-trash-info" });
    info.createDiv({ cls: "vl-notes-trash-title", text: item.title || item.videoTitle });
    info.createDiv({
      cls: "vl-notes-trash-meta",
      text: t("notes.wholeGroupMeta", { title: item.videoTitle })
    });
    const actions = row.createDiv({ cls: "vl-notes-trash-actions" });
    this.actionButton(actions, "rotate-ccw", t("notes.restore"), false, () => {
      void this.plugin.noteStore.restoreGroup(item.id).then(async (ok) => {
        if (!ok) {
          new Notice(t("notes.restoreFailed"));
          return;
        }
        new Notice(t("notes.restored"));
        this.onChanged();
        this.render();
      });
    });
    this.actionButton(actions, "trash-2", t("notes.purge"), true, () => {
      new ConfirmModal(this.app, {
        title: t("notes.purgeWholeTitle"),
        description: t("notes.purgeWholeDesc", { title: item.title || item.videoTitle }),
        confirmText: t("notes.purge"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.noteStore.purgeGroup(item.id);
          new Notice(t("notes.purged"));
          this.onChanged();
          this.render();
        }
      }).open();
    });
  }

  private renderGroup(parent: HTMLElement, group: TrashSection): void {
    const section = parent.createDiv({ cls: "vl-trash-group" });
    const head = section.createDiv({ cls: "vl-trash-group-head" });
    const toggle = head.createEl("button", {
      cls: "vl-trash-group-toggle",
      attr: { type: "button" }
    });
    setIcon(toggle, this.expanded.has(group.videoId) ? "chevron-down" : "chevron-right");
    toggle.createSpan({ text: group.title || t("misc.untitled") });
    head.createSpan({
      cls: "vl-trash-group-count",
      text: t("notes.trashGroupCount", {
        notes: group.notes.length,
        images: group.images.length
      })
    });
    toggle.addEventListener("click", () => {
      if (this.expanded.has(group.videoId)) this.expanded.delete(group.videoId);
      else this.expanded.add(group.videoId);
      this.render();
    });
    if (!this.expanded.has(group.videoId)) return;

    for (const note of group.notes) this.renderNote(section, note);
    for (const image of group.images) this.renderImage(section, image);
  }

  private renderNote(parent: HTMLElement, item: TrashNote): void {
    const row = parent.createDiv({ cls: "vl-notes-trash-row" });
    this.selectionBox(row, item.id);
    const info = row.createDiv({ cls: "vl-notes-trash-info" });
    info.createDiv({
      cls: "vl-notes-trash-title",
      text: `▶ ${formatClock(item.node.time)} · ${item.videoTitle || t("misc.untitled")}`
    });
    info.createDiv({
      cls: "vl-notes-trash-meta",
      text: item.node.comment || item.node.summary || t("notes.untitledNode")
    });
    const actions = row.createDiv({ cls: "vl-notes-trash-actions" });
    this.actionButton(actions, "rotate-ccw", t("notes.restore"), false, () => {
      void this.plugin.noteStore.restoreTrash(item.id).then(async (ok) => {
        if (!ok) {
          new Notice(t("notes.restoreFailed"));
          return;
        }
        new Notice(t("notes.restored"));
        this.onChanged();
        this.render();
      });
    });
    this.actionButton(actions, "trash-2", t("notes.purge"), true, () => {
      new ConfirmModal(this.app, {
        title: t("notes.purgeTitle"),
        description: t("notes.purgeDesc", {
          title: item.videoTitle,
          time: formatClock(item.node.time)
        }),
        confirmText: t("notes.purge"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.noteStore.purgeTrash(item.id);
          new Notice(t("notes.purged"));
          this.onChanged();
          this.render();
        }
      }).open();
    });
  }

  private renderImage(parent: HTMLElement, item: TrashImage): void {
    const row = parent.createDiv({ cls: "vl-notes-trash-row" });
    this.selectionBox(row, item.id);
    const thumb = row.createDiv({ cls: "vl-notes-trash-thumb" });
    const img = thumb.createEl("img", { attr: { alt: "", loading: "lazy" } });
    const url = this.plugin.noteStore.displayPath(item.trashPath);
    if (url) img.src = url;
    const info = row.createDiv({ cls: "vl-notes-trash-info" });
    info.createDiv({
      cls: "vl-notes-trash-title",
      text: t("notes.trashImageTitle", {
        title: item.videoTitle,
        time: formatClock(Number(item.time) || 0)
      })
    });
    info.createDiv({ cls: "vl-notes-trash-meta", text: item.path });
    const actions = row.createDiv({ cls: "vl-notes-trash-actions" });
    this.actionButton(actions, "rotate-ccw", t("notes.restore"), false, () => {
      void this.plugin.noteStore.restoreImage(item.id).then(async (ok) => {
        if (!ok) {
          new Notice(t("notes.restoreFailed"));
          return;
        }
        new Notice(t("notes.restored"));
        this.onChanged();
        this.render();
      });
    });
    this.actionButton(actions, "trash-2", t("notes.purge"), true, () => {
      void this.plugin.noteStore.purgeImage(item.id).then(async () => {
        new Notice(t("notes.purged"));
        this.onChanged();
        this.render();
      });
    });
  }

  private selectionBox(parent: HTMLElement, id: string): void {
    const label = parent.createEl("label", { cls: "vl-trash-select" });
    const input = label.createEl("input", { type: "checkbox" });
    input.checked = this.selected.has(id);
    input.addEventListener("change", () => {
      if (input.checked) this.selected.add(id);
      else this.selected.delete(id);
      this.render();
    });
  }

  private confirmDeleteSelected(): void {
    if (this.selected.size === 0) return;
    new ConfirmModal(this.app, {
      title: t("notes.deleteSelectedTitle"),
      description: t("notes.deleteSelectedDesc", { count: this.selected.size }),
      confirmText: t("notes.purge"),
      danger: true,
      onConfirm: async () => {
        for (const id of [...this.selected]) {
          if (this.plugin.data.trashNotes.some((item) => item.id === id)) {
            await this.plugin.noteStore.purgeTrash(id);
          } else {
            await this.plugin.noteStore.purgeImage(id);
          }
        }
        this.selected.clear();
        new Notice(t("notes.purged"));
        this.onChanged();
        this.render();
      }
    }).open();
  }

  private actionButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    danger: boolean,
    onClick: () => void
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-notes-manager-action is-small${danger ? " is-danger" : ""}`,
      attr: { type: "button", title: label, "aria-label": label }
    });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
  }

  private confirmClear(): void {
    const total =
      this.plugin.data.trashNotes.length +
      this.plugin.data.trashImages.length +
      this.plugin.data.trashGroups.length;
    if (total === 0) return;
    new ConfirmModal(this.app, {
      title: t("notes.clearTrashTitle"),
      description: t("notes.clearTrashDesc", { count: total }),
      confirmText: t("notes.clearTrash"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.noteStore.clearTrash();
        new Notice(t("notes.trashCleared"));
        this.onChanged();
        this.render();
      }
    }).open();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
