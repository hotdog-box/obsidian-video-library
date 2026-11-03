import { App, Modal, Notice } from "obsidian";
import { captureCloudLogin } from "../cloud-login-window";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CloudProvider } from "../types";

const PROVIDER_KEY: Record<CloudProvider, string> = {
  baidu: "cloud.baidu",
  quark: "cloud.quark",
  aliyun: "cloud.aliyun",
  onedrive: "cloud.onedrive"
};

export class CloudLoginModal extends Modal {
  private input!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private provider: CloudProvider,
    private onSaved: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-cloud-login-modal");
  }

  onOpen(): void {
    const label = t(PROVIDER_KEY[this.provider] as never);
    this.titleEl.setText(t("cloud.loginTitle", { provider: label }));
    this.contentEl.createEl("p", { text: t("cloud.loginHint"), cls: "vl-modal-description" });
    const field = this.contentEl.createDiv({ cls: "vl-field" });
    field.createEl("label", { text: t("cloud.credential"), cls: "vl-field-label" });
    this.input = field.createEl("textarea", {
      cls: "vl-text-area vl-cloud-credential",
      attr: { rows: "4", placeholder: t("cloud.credentialPlaceholder") }
    });
    this.input.value = this.plugin.cloudAccount(this.provider)?.credential || "";
    field.createDiv({ text: t("cloud.credentialNote"), cls: "vl-field-hint" });
    if (this.provider === "baidu" || this.provider === "quark") {
      const loginWindow = this.contentEl.createEl("button", {
        cls: "vl-cloud-open-login",
        text: t("cloud.openLoginWindow"),
        attr: { type: "button" }
      });
      loginWindow.addEventListener("click", () => void this.openLoginWindow(loginWindow));
      field.createDiv({ text: t("cloud.loginWindowHint"), cls: "vl-field-hint" });
    }
    this.statusEl = this.contentEl.createDiv({ cls: "vl-form-error" });

    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const saveOnly = buttons.createEl("button", {
      text: t("cloud.saveOnly"),
      attr: { type: "button" }
    });
    saveOnly.addEventListener("click", () => void this.save(false));
    this.saveButton = buttons.createEl("button", {
      text: t("cloud.testAndSave"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    this.saveButton.addEventListener("click", () => void this.save(true));
    window.setTimeout(() => this.input.focus(), 60);
  }

  private async openLoginWindow(button: HTMLButtonElement): Promise<void> {
    if (this.provider !== "baidu" && this.provider !== "quark") return;
    button.disabled = true;
    this.statusEl.setText(t("cloud.loginWindowWaiting"));
    try {
      const cookie = await captureCloudLogin(this.provider);
      if (cookie) {
        this.input.value = cookie;
        this.statusEl.setText(t("cloud.loginWindowCaptured"));
      } else {
        this.statusEl.setText(t("cloud.loginWindowFailed"));
      }
    } catch (error) {
      this.statusEl.setText(t("cloud.loginWindowFailed"));
      console.warn("video-library: cloud login window failed", error);
    } finally {
      button.disabled = false;
    }
  }

  private async save(test: boolean): Promise<void> {
    const credential = this.input.value.trim();
    if (!credential) {
      this.statusEl.setText(t("cloud.credentialRequired"));
      return;
    }
    this.saveButton.disabled = true;
    this.statusEl.setText(test ? t("cloud.testing") : "");
    try {
      if (test) {
        const result = await this.plugin.connectCloudAccount(this.provider, credential);
        if (!result.ok) {
          this.statusEl.setText(t("cloud.testFailed", { error: result.error || "" }));
          this.saveButton.disabled = false;
          return;
        }
        new Notice(t("cloud.testOk"));
      } else {
        const account = this.plugin.data.settings.cloudAccounts[this.provider];
        account.enabled = true;
        account.credential = credential;
        account.displayName = t(PROVIDER_KEY[this.provider] as never);
        account.updatedAt = Date.now();
        await this.plugin.persist();
        this.plugin.refreshViews();
      }
      this.onSaved();
      this.close();
    } catch (error) {
      this.statusEl.setText(t("cloud.testFailed", { error: String(error) }));
      this.saveButton.disabled = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
