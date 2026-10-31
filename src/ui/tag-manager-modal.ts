import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import { ConfirmModal, TextPromptModal } from "./common";

export class TagManagerModal extends Modal {
  private newInput!: HTMLInputElement;
  private errorEl!: HTMLElement;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private onChanged: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-tag-modal");
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(t("tag.manageTitle"));
    contentEl.createEl("p", { text: t("tag.manageDesc"), cls: "vl-modal-description" });

    const list = contentEl.createDiv({ cls: "vl-tag-list" });
    if (this.plugin.data.tags.length === 0) {
      list.createEl("p", { text: t("tag.empty"), cls: "vl-empty-inline" });
    }

    for (const tag of this.plugin.data.tags) {
      const row = list.createDiv({ cls: "vl-tag-row" });
      const dot = row.createSpan({ cls: "vl-tag-dot" });
      dot.style.backgroundColor = tag.color;
      const name = row.createDiv({ cls: "vl-tag-name" });
      name.createSpan({ text: tag.name });
      name.createSpan({
        text: t("tag.count", { count: this.plugin.tagCount(tag.name) }),
        cls: "vl-tag-count"
      });

      const actions = row.createDiv({ cls: "vl-tag-actions" });
      const rename = actions.createEl("button", {
        cls: "vl-icon-btn",
        attr: { type: "button", title: t("action.rename"), "aria-label": t("action.rename") }
      });
      setIcon(rename, "pencil");
      rename.addEventListener("click", () => {
        new TextPromptModal(this.app, {
          title: t("action.rename"),
          description: t("tag.nameHint"),
          value: tag.name,
          placeholder: t("tag.namePlaceholder"),
          onSubmit: async (value) => {
            const result = await this.plugin.renameTag(tag.id, value);
            if (!result.ok) {
              throw new Error(result.reason === "duplicate" ? t("tag.duplicate") : t("tag.nameRequired"));
            }
            new Notice(t("tag.renamed"));
            this.onChanged();
            this.render();
          }
        }).open();
      });

      const remove = actions.createEl("button", {
        cls: "vl-icon-btn",
        attr: { type: "button", title: t("action.delete"), "aria-label": t("action.delete") }
      });
      setIcon(remove, "trash-2");
      remove.addEventListener("click", () => {
        const count = this.plugin.tagCount(tag.name);
        new ConfirmModal(this.app, {
          title: t("tag.deleteTitle"),
          description: t("tag.deleteDesc", { name: tag.name, count }),
          confirmText: t("tag.deleteConfirm"),
          danger: true,
          onConfirm: async () => {
            await this.plugin.deleteTag(tag.id);
            new Notice(t("tag.deleted"));
            this.onChanged();
            this.render();
          }
        }).open();
      });
    }

    const addRow = contentEl.createDiv({ cls: "vl-tag-add-row" });
    this.newInput = addRow.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("tag.namePlaceholder"), "data-vl-field": "tag-name" }
    });
    const add = addRow.createEl("button", {
      text: t("tag.new"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    const submit = async () => {
      const result = await this.plugin.createTag(this.newInput.value);
      if (!result.ok) {
        this.errorEl.setText(result.reason === "duplicate" ? t("tag.duplicate") : t("tag.nameRequired"));
        return;
      }
      this.errorEl.setText("");
      this.newInput.value = "";
      new Notice(t("tag.created"));
      this.onChanged();
      this.render();
    };
    add.addEventListener("click", () => void submit());
    this.newInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
    this.errorEl = contentEl.createDiv({ cls: "vl-form-error" });
    window.setTimeout(() => this.newInput.focus(), 50);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
