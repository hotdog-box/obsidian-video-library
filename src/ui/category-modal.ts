import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { Category } from "../types";
import { ConfirmModal, iconButton } from "./common";

export const CATEGORY_COLORS = [
  "#e46b6b",
  "#e8a33d",
  "#d6c04a",
  "#5bb98c",
  "#4f9dd9",
  "#8b7fe8",
  "#d36bb3",
  "#7a8a99"
];

export class CategoryManagerModal extends Modal {
  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private onChanged: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-category-modal");
    this.modalEl.addClass("vl-category-manager-modal");
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(t("category.manageTitle"));
    contentEl.createEl("p", { text: t("category.manageDesc"), cls: "vl-modal-description" });

    const list = contentEl.createDiv({ cls: "vl-category-list" });
    if (this.plugin.data.categories.length === 0) {
      list.createEl("p", { text: t("category.empty"), cls: "vl-empty-inline" });
    }

    for (const category of this.plugin.data.categories) {
      this.renderRow(list, category);
    }

    const footer = contentEl.createDiv({ cls: "vl-modal-buttons vl-category-footer" });
    const add = footer.createEl("button", {
      cls: "mod-cta",
      attr: { type: "button" }
    });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("category.new") });
    add.addEventListener("click", () => {
      new CategoryEditModal(this.app, this.plugin, null, () => {
        this.onChanged();
        this.render();
      }).open();
    });
  }

  private renderRow(list: HTMLElement, category: Category): void {
    const row = list.createDiv({ cls: "vl-category-row" });
    const dot = row.createSpan({ cls: "vl-category-dot" });
    dot.style.backgroundColor = category.color;
    const info = row.createDiv({ cls: "vl-category-info" });
    info.createSpan({ text: category.name, cls: "vl-category-name" });
    info.createSpan({
      text: t("category.count", { count: this.plugin.categoryCount(category.id) }),
      cls: "vl-category-count"
    });

    const actions = row.createDiv({ cls: "vl-category-actions" });
    iconButton(actions, "pencil", t("action.rename"), () => {
      new CategoryEditModal(this.app, this.plugin, category, () => {
        this.onChanged();
        this.render();
      }).open();
    });

    iconButton(actions, "trash-2", t("action.delete"), () => {
      const count = this.plugin.categoryCount(category.id);
      new ConfirmModal(this.app, {
        title: t("category.deleteTitle"),
        description: t("category.deleteDesc", { name: category.name, count }),
        confirmText: t("category.deleteConfirm"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.deleteCategory(category.id);
          new Notice(t("category.deleted"));
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

export class CategoryEditModal extends Modal {
  private nameInput!: HTMLInputElement;
  private color: string;
  private errorEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private category: Category | null,
    private onSaved: (category: Category) => void
  ) {
    super(app);
    this.color = category?.color || CATEGORY_COLORS[plugin.data.categories.length % CATEGORY_COLORS.length];
    this.modalEl.addClass("vl-category-modal");
    this.modalEl.addClass("vl-category-edit-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.category ? t("category.editTitle") : t("category.newTitle"));
    this.contentEl.createEl("p", { text: t("category.nameHint"), cls: "vl-modal-description" });

    const nameField = this.contentEl.createDiv({ cls: "vl-field" });
    nameField.createEl("label", { text: t("category.name"), cls: "vl-field-label" });
    this.nameInput = nameField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: {
        placeholder: t("category.namePlaceholder"),
        value: this.category?.name || "",
        "data-vl-field": "category-name"
      }
    });

    const colorField = this.contentEl.createDiv({ cls: "vl-field" });
    colorField.createEl("label", { text: t("category.color"), cls: "vl-field-label" });
    const swatches = colorField.createDiv({ cls: "vl-color-swatches" });
    for (const color of CATEGORY_COLORS) {
      const swatch = swatches.createEl("button", {
        cls: "vl-color-swatch",
        attr: { type: "button", "aria-label": color, title: color }
      });
      swatch.style.backgroundColor = color;
      if (color === this.color) swatch.addClass("is-selected");
      swatch.addEventListener("click", () => {
        this.color = color;
        for (const candidate of Array.from(swatches.children) as HTMLElement[]) {
          candidate.removeClass("is-selected");
        }
        swatch.addClass("is-selected");
      });
    }

    this.errorEl = this.contentEl.createDiv({ cls: "vl-form-error" });
    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    this.saveButton = buttons.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button", "data-vl-action": "save-category" }
    });
    this.saveButton.addEventListener("click", () => void this.save());
    this.nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.save();
      }
    });
    window.setTimeout(() => this.nameInput.focus(), 40);
  }

  private async save(): Promise<void> {
    this.saveButton.disabled = true;
    const result = this.category
      ? await this.plugin.renameCategory(this.category.id, this.nameInput.value)
      : await this.plugin.createCategory(this.nameInput.value, this.color);

    if (!result.ok) {
      this.errorEl.setText(result.reason === "empty" ? t("category.nameRequired") : t("category.duplicate"));
      this.saveButton.disabled = false;
      return;
    }
    new Notice(this.category ? t("category.renamed") : t("category.created"));
    this.onSaved(result.category);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
