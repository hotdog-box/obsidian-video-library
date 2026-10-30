import { App, Modal } from "obsidian";
import { t } from "../i18n";

export class BatchRenameModal extends Modal {
  private findInput!: HTMLInputElement;
  private replaceInput!: HTMLInputElement;
  private errorEl!: HTMLElement;

  constructor(
    app: App,
    private count: number,
    private onApply: (find: string, replace: string) => void
  ) {
    super(app);
    this.modalEl.addClass("vl-rename-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("rename.title"));
    this.contentEl.createEl("p", { text: t("rename.desc"), cls: "vl-modal-description" });

    const findField = this.contentEl.createDiv({ cls: "vl-field" });
    findField.createEl("label", { text: t("rename.find"), cls: "vl-field-label" });
    this.findInput = findField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("rename.findPlaceholder"), "data-vl-field": "rename-find" }
    });

    const replaceField = this.contentEl.createDiv({ cls: "vl-field" });
    replaceField.createEl("label", { text: t("rename.replace"), cls: "vl-field-label" });
    this.replaceInput = replaceField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("rename.replacePlaceholder"), "data-vl-field": "rename-replace" }
    });

    this.errorEl = this.contentEl.createDiv({ cls: "vl-form-error" });
    const footer = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = footer.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const apply = footer.createEl("button", {
      text: t("rename.apply", { count: this.count }),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    apply.addEventListener("click", () => this.apply());
    this.findInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.apply();
    });
    this.replaceInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.apply();
    });
    window.setTimeout(() => this.findInput.focus(), 50);
  }

  private apply(): void {
    const find = this.findInput.value;
    if (!find) {
      this.errorEl.setText(t("rename.findRequired"));
      this.findInput.focus();
      return;
    }
    this.onApply(find, this.replaceInput.value);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
