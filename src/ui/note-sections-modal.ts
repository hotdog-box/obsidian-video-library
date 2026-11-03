import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { NoteSection, VideoItem } from "../types";
import { ConfirmModal } from "./common";

export class NoteSectionsModal extends Modal {
  private sections: NoteSection[] = [];

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private video: VideoItem,
    private onChanged: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-note-sections-modal");
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    this.titleEl.setText(t("notes.manageSections"));
    this.sections = await this.plugin.noteStore.listSections(this.video);
    const list = this.contentEl.createDiv({ cls: "vl-note-sections-list" });
    for (const section of this.sections) this.renderSection(list, section);

    const add = this.contentEl.createDiv({ cls: "vl-note-section-add" });
    const title = add.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("notes.sectionName") }
    });
    const summary = add.createEl("textarea", {
      cls: "vl-text-area",
      attr: { rows: "2", placeholder: t("notes.sectionSummary") }
    });
    const button = add.createEl("button", {
      text: t("notes.addSection"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    button.addEventListener("click", () => {
      if (!title.value.trim()) return;
      void this.plugin.noteStore
        .addSection(this.video, title.value, summary.value)
        .then(async () => {
          this.onChanged();
          await this.render();
        });
    });

    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const close = buttons.createEl("button", { text: t("action.close"), attr: { type: "button" } });
    close.addEventListener("click", () => this.close());
  }

  private renderSection(parent: HTMLElement, section: NoteSection): void {
    const row = parent.createDiv({ cls: "vl-note-section-row" });
    const title = row.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { value: section.title }
    });
    const summary = row.createEl("textarea", {
      cls: "vl-text-area",
      attr: { rows: "2" }
    });
    summary.value = section.summary;
    const actions = row.createDiv({ cls: "vl-note-section-actions" });
    const save = actions.createEl("button", {
      text: t("action.save"),
      attr: { type: "button" }
    });
    save.addEventListener("click", () => {
      void this.plugin.noteStore
        .updateSection(this.video, section.id, title.value, summary.value)
        .then(async () => {
          this.onChanged();
          await this.render();
        });
    });
    const remove = actions.createEl("button", {
      cls: "mod-warning",
      attr: { type: "button", title: t("action.delete"), "aria-label": t("action.delete") }
    });
    setIcon(remove, "trash-2");
    remove.addEventListener("click", () => {
      new ConfirmModal(this.app, {
        title: t("notes.deleteSectionTitle"),
        description: t("notes.deleteSectionDesc", { title: section.title }),
        confirmText: t("confirm.delete"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.noteStore.deleteSection(this.video, section.id);
          this.onChanged();
          await this.render();
          new Notice(t("notes.sectionDeleted"));
        }
      }).open();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
