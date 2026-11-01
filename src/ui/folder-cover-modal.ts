import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { Folder } from "../types";
import { pickVaultFile, TextPromptModal } from "./common";

export class FolderCoverModal extends Modal {
  private previewEl!: HTMLImageElement;
  private placeholderEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private buffer: ArrayBuffer | null = null;
  private extension = "jpg";
  private coverPath: string | undefined;
  private previewUrl: string | null = null;
  private removed = false;
  private requestSeq = 0;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private folder: Folder,
    private onChanged: () => void
  ) {
    super(app);
    this.coverPath = folder.coverPath;
    this.modalEl.addClass("vl-folder-cover-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("folder.coverTitle", { name: this.folder.name }));
    this.contentEl.createEl("p", { text: t("folder.coverDesc"), cls: "vl-modal-description" });

    const body = this.contentEl.createDiv({ cls: "vl-folder-cover-editor" });
    const preview = body.createDiv({ cls: "vl-folder-cover-preview" });
    this.previewEl = preview.createEl("img", { attr: { alt: t("folder.cover") } });
    this.previewEl.addClass("is-hidden");
    this.placeholderEl = preview.createDiv({ cls: "vl-cover-placeholder" });
    setIcon(this.placeholderEl.createSpan({ cls: "vl-cover-placeholder-icon" }), "image-off");
    this.placeholderEl.createSpan({ text: t("misc.noCover") });
    this.previewEl.addEventListener("load", () => {
      this.previewEl.removeClass("is-hidden");
      this.placeholderEl.addClass("is-hidden");
    });
    this.previewEl.addEventListener("error", () => {
      this.previewEl.addClass("is-hidden");
      this.placeholderEl.removeClass("is-hidden");
    });

    const controls = body.createDiv({ cls: "vl-folder-cover-controls" });
    this.statusEl = controls.createDiv({ cls: "vl-cover-status" });
    controls.createEl("p", { text: t("folder.coverHint"), cls: "vl-field-hint" });
    const actions = controls.createDiv({ cls: "vl-cover-actions" });
    this.coverAction(actions, "folder-open", t("action.localImage"), () => this.chooseLocal());
    this.coverAction(actions, "link", t("action.imageUrl"), () => this.promptUrl());
    this.coverAction(actions, "video", t("folder.useFirstVideoCover"), () => void this.useFirstVideoCover());
    this.coverAction(actions, "x", t("action.removeCover"), () => this.removeCover(), "vl-remove-folder-cover");

    const footer = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = footer.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    this.saveButton = footer.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    this.saveButton.addEventListener("click", () => void this.save());

    void this.renderExisting();
  }

  private coverAction(parent: HTMLElement, icon: string, label: string, onClick: () => void, className = ""): void {
    const button = parent.createEl("button", {
      cls: `vl-cover-action ${className}`.trim(),
      attr: { type: "button", title: label }
    });
    setIcon(button.createSpan({ cls: "vl-btn-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", onClick);
  }

  private async renderExisting(): Promise<void> {
    if (!this.coverPath) return;
    const sequence = ++this.requestSeq;
    const url = await this.plugin.coverStore.getUrl(this.coverPath);
    if (sequence !== this.requestSeq) return;
    if (url) this.previewEl.src = url;
  }

  private setBuffer(buffer: ArrayBuffer, extension: string): void {
    this.buffer = buffer;
    this.extension = extension;
    this.removed = false;
    this.revokePreview();
    this.previewUrl = this.plugin.coverStore.previewBuffer(buffer, extension);
    this.previewEl.src = this.previewUrl;
    this.statusEl.setText("");
    this.saveButton.disabled = false;
  }

  private chooseLocal(): void {
    pickVaultFile(this.app, "image", (file) => {
      void (async () => {
        try {
          const buffer = await this.app.vault.readBinary(file);
          const extension = ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"].includes(
            file.extension.toLowerCase()
          )
            ? file.extension.toLowerCase()
            : "jpg";
          this.setBuffer(buffer, extension);
        } catch {
          new Notice(t("notice.coverFailed"));
        }
      })();
    });
  }

  private promptUrl(): void {
    new TextPromptModal(this.app, {
      title: t("action.imageUrl"),
      placeholder: "https://…/cover.jpg",
      submitText: t("action.choose"),
      validate: (value) => (/^https?:\/\//i.test(value) ? null : t("form.invalidUrl")),
      onSubmit: async (value) => {
        const image = await this.plugin.coverStore.fetchImage(value);
        this.setBuffer(image.buffer, image.extension);
      }
    }).open();
  }

  private async useFirstVideoCover(): Promise<void> {
    this.statusEl.setText(t("misc.loading"));
    const image = await this.plugin.duplicateFirstVideoCover(this.folder.id);
    if (!image) {
      this.statusEl.setText(t("folder.noVideoCover"));
      return;
    }
    this.setBuffer(image.buffer, image.extension);
  }

  private removeCover(): void {
    this.buffer = null;
    this.removed = true;
    this.revokePreview();
    this.previewEl.removeAttribute("src");
    this.previewEl.addClass("is-hidden");
    this.placeholderEl.removeClass("is-hidden");
    this.statusEl.setText(t("notice.coverRemoved"));
  }

  private async save(): Promise<void> {
    this.saveButton.disabled = true;
    try {
      if (this.buffer) {
        const saved = await this.plugin.coverStore.saveBuffer(this.buffer, this.extension);
        await this.plugin.setFolderCover(this.folder.id, saved);
      } else if (this.removed) {
        await this.plugin.setFolderCover(this.folder.id, undefined);
      }
      new Notice(t("folder.coverUpdated"));
      this.onChanged();
      this.close();
    } catch {
      this.saveButton.disabled = false;
      this.statusEl.setText(t("notice.coverFailed"));
    }
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  onClose(): void {
    this.revokePreview();
    this.contentEl.empty();
  }
}
