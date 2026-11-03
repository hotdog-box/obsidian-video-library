import { App, Modal } from "obsidian";
import { t } from "../i18n";

export class CloudHelpModal extends Modal {
  constructor(app: App) {
    super(app);
    this.modalEl.addClass("vl-cloud-help-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("cloud.helpTitle"));
    this.contentEl.createEl("p", { text: t("cloud.helpIntro"), cls: "vl-modal-description" });
    for (const key of ["helpBaidu", "helpQuark", "helpAliyun", "helpOneDrive"] as const) {
      const section = this.contentEl.createDiv({ cls: "vl-cloud-help-section" });
      section.createEl("h4", { text: t(`cloud.${key}` as never) });
      section.createEl("p", { text: t(`cloud.${key}Desc` as never) });
    }
    this.contentEl.createEl("p", { text: t("cloud.helpWarning"), cls: "vl-cloud-help-warning" });
    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const close = buttons.createEl("button", { text: t("action.close"), attr: { type: "button" } });
    close.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
