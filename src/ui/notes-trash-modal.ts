import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { TrashNote } from "../types";
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

export class TrashNotesModal extends Modal {
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
    const items = this.plugin.data.trashNotes;
    if (items.length === 0) {
      contentEl.createDiv({ cls: "vl-notes-trash-empty", text: t("notes.trashEmpty") });
      return;
    }
    const list = contentEl.createDiv({ cls: "vl-notes-trash-list" });
    for (const item of items) this.renderItem(list, item);
  }

  private renderItem(parent: HTMLElement, item: TrashNote): void {
    const row = parent.createDiv({ cls: "vl-notes-trash-row" });
    const info = row.createDiv({ cls: "vl-notes-trash-info" });
    info.createDiv({
      cls: "vl-notes-trash-title",
      text: `${item.videoTitle || t("misc.untitled")} · ${formatClock(item.node.time)}`
    });
    info.createDiv({
      cls: "vl-notes-trash-meta",
      text: item.node.comment || item.node.summary || t("notes.untitledNode")
    });
    const actions = row.createDiv({ cls: "vl-notes-trash-actions" });
    const restore = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small",
      attr: { type: "button" }
    });
    setIcon(restore.createSpan({ cls: "vl-btn-icon" }), "rotate-ccw");
    restore.createSpan({ text: t("notes.restore") });
    restore.addEventListener("click", () => {
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
    const purge = actions.createEl("button", {
      cls: "vl-notes-manager-action is-small is-danger",
      attr: { type: "button" }
    });
    setIcon(purge.createSpan({ cls: "vl-btn-icon" }), "trash-2");
    purge.createSpan({ text: t("notes.purge") });
    purge.addEventListener("click", () => {
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

  onClose(): void {
    this.contentEl.empty();
  }
}
