import { App, Modal, Notice } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CloudProvider, VideoItem } from "../types";
import { UNCATEGORIZED_ID, uid } from "../types";

const PROVIDERS: Array<{ value: CloudProvider; key: string }> = [
  { value: "baidu", key: "cloud.baidu" },
  { value: "quark", key: "cloud.quark" },
  { value: "aliyun", key: "cloud.aliyun" },
  { value: "onedrive", key: "cloud.onedrive" }
];

export class CloudAddModal extends Modal {
  private provider!: HTMLSelectElement;
  private urlInput!: HTMLInputElement;
  private titleInput!: HTMLInputElement;
  private errorEl!: HTMLElement;

  constructor(app: App, private plugin: VideoLibraryPlugin) {
    super(app);
    this.modalEl.addClass("vl-cloud-add-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("cloud.addTitle"));
    this.contentEl.createEl("p", { text: t("cloud.addDesc"), cls: "vl-modal-description" });
    const providerField = this.contentEl.createDiv({ cls: "vl-field" });
    providerField.createEl("label", { text: t("cloud.provider"), cls: "vl-field-label" });
    this.provider = providerField.createEl("select", { cls: "dropdown" });
    for (const item of PROVIDERS) {
      this.provider.createEl("option", { value: item.value, text: t(item.key as never) });
    }
    const connected = PROVIDERS.find((item) => this.plugin.cloudAccount(item.value)?.credential);
    if (connected) this.provider.value = connected.value;

    const urlField = this.contentEl.createDiv({ cls: "vl-field" });
    urlField.createEl("label", { text: t("cloud.videoUrl"), cls: "vl-field-label" });
    this.urlInput = urlField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("cloud.videoUrlPlaceholder") }
    });
    urlField.createDiv({ text: t("cloud.videoUrlHint"), cls: "vl-field-hint" });

    const titleField = this.contentEl.createDiv({ cls: "vl-field" });
    titleField.createEl("label", { text: t("cloud.videoTitle"), cls: "vl-field-label" });
    this.titleInput = titleField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("cloud.videoTitlePlaceholder") }
    });

    this.errorEl = this.contentEl.createDiv({ cls: "vl-form-error" });
    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const save = buttons.createEl("button", {
      text: t("action.add"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    save.addEventListener("click", () => void this.save(save));
    window.setTimeout(() => this.urlInput.focus(), 60);
  }

  private async save(button: HTMLButtonElement): Promise<void> {
    const url = this.urlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      this.errorEl.setText(t("cloud.invalidUrl"));
      return;
    }
    button.disabled = true;
    const provider = this.provider.value as CloudProvider;
    const account = this.plugin.cloudAccount(provider);
    if (!account?.credential) {
      this.errorEl.setText(t("cloud.loginRequired"));
      button.disabled = false;
      return;
    }
    const title = this.titleInput.value.trim() || url.replace(/^https?:\/\//i, "").slice(0, 80);
    const now = Date.now();
    const video: VideoItem = {
      id: uid("vid"),
      url,
      provider: "cloud",
      cloudProvider: provider,
      streamUrl: url,
      title,
      categoryId: UNCATEGORIZED_ID,
      tags: [],
      createdAt: now,
      updatedAt: now
    };
    try {
      await this.plugin.addVideo(video);
      new Notice(t("cloud.added"));
      this.close();
    } catch (error) {
      this.errorEl.setText(t("cloud.addFailed", { error: String(error) }));
      button.disabled = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
