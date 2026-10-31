import { App, FuzzySuggestModal, Modal, setIcon, TFile } from "obsidian";
import { t } from "../i18n";

export function iconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: (event: MouseEvent) => void,
  className = "vl-icon-btn"
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: className,
    attr: { type: "button", "aria-label": label, title: label }
  });
  setIcon(button, icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "";
  }
}

export class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private options: {
      title: string;
      description: string;
      confirmText: string;
      cancelText?: string;
      danger?: boolean;
      checkbox?: { label: string; defaultChecked?: boolean };
      onConfirm: (checked: boolean) => void | Promise<void>;
    }
  ) {
    super(app);
    this.modalEl.addClass("vl-confirm-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    this.contentEl.createEl("p", { text: this.options.description, cls: "vl-modal-description" });

    let checkbox: HTMLInputElement | null = null;
    if (this.options.checkbox) {
      const label = this.contentEl.createEl("label", { cls: "vl-confirm-checkbox" });
      checkbox = label.createEl("input", { type: "checkbox" });
      checkbox.checked = Boolean(this.options.checkbox.defaultChecked);
      label.createSpan({ text: this.options.checkbox.label });
    }

    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", {
      text: this.options.cancelText || t("action.cancel"),
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.close());

    const confirm = buttons.createEl("button", {
      text: this.options.confirmText,
      cls: this.options.danger ? "mod-warning" : "mod-cta",
      attr: { type: "button" }
    });
    confirm.addEventListener("click", () => {
      void this.submit(confirm, checkbox);
    });
  }

  private async submit(confirm: HTMLButtonElement, checkbox: HTMLInputElement | null): Promise<void> {
    confirm.disabled = true;
    this.confirmed = true;
    try {
      await this.options.onConfirm(Boolean(checkbox?.checked));
    } finally {
      this.close();
    }
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.confirmed) {
      // Closed without confirming.
    }
  }
}

export class TextPromptModal extends Modal {
  private inputEl!: HTMLInputElement;
  private errorEl!: HTMLElement;
  private submitEl!: HTMLButtonElement;

  constructor(
    app: App,
    private options: {
      title: string;
      description?: string;
      placeholder?: string;
      value?: string;
      submitText?: string;
      onSubmit: (value: string) => void | Promise<void>;
      validate?: (value: string) => string | null;
    }
  ) {
    super(app);
    this.modalEl.addClass("vl-prompt-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    if (this.options.description) {
      this.contentEl.createEl("p", { text: this.options.description, cls: "vl-modal-description" });
    }

    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: {
        placeholder: this.options.placeholder || "",
        value: this.options.value || ""
      }
    });
    this.errorEl = this.contentEl.createDiv({ cls: "vl-form-error" });

    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());

    this.submitEl = buttons.createEl("button", {
      text: this.options.submitText || t("action.confirm"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    this.submitEl.addEventListener("click", () => void this.submit());
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.submit();
      }
    });

    window.setTimeout(() => {
      this.inputEl.focus();
      this.inputEl.select();
    }, 50);
  }

  private async submit(): Promise<void> {
    const value = this.inputEl.value.trim();
    const validation = this.options.validate?.(value) ?? null;
    if (validation) {
      this.errorEl.setText(validation);
      return;
    }
    this.errorEl.setText("");
    this.submitEl.disabled = true;
    try {
      await this.options.onSubmit(value);
      this.close();
    } catch (error) {
      this.errorEl.setText(error instanceof Error ? error.message : t("error.generic"));
      this.submitEl.disabled = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class VaultFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    private placeholder: string,
    private onChoose: (file: TFile) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
    this.setInstructions([
      { command: "↑↓", purpose: "move" },
      { command: "↵", purpose: "choose" }
    ]);
    this.modalEl.addClass("vl-file-suggest-modal");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  onChooseItem(item: TFile): void {
    this.close();
    this.onChoose(item);
  }
}

export function pickVaultFile(
  app: App,
  kind: "video" | "image",
  onChoose: (file: TFile) => void
): void {
  const videoExtensions = ["mp4", "webm", "ogv", "ogg", "mov", "m4v", "mkv"];
  const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"];
  const allowed = kind === "video" ? videoExtensions : imageExtensions;
  const files = app.vault
    .getFiles()
    .filter((file) => allowed.includes(file.extension.toLowerCase()))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);

  new VaultFileSuggestModal(
    app,
    files,
    kind === "video" ? t("form.chooseVideo") : t("action.localImage"),
    onChoose
  ).open();
}
