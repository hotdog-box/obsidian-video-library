import { App, Modal, Notice, setIcon } from "obsidian";
import { t, type MessageKey } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { Marker, MarkerKind, Provider } from "../types";
import { TAG_COLORS } from "../types";
import { ConfirmModal, iconButton } from "./common";

const AUTO_PROVIDERS: Array<{ value: Provider | ""; key: string }> = [
  { value: "", key: "marker.autoNone" },
  { value: "bilibili", key: "provider.bilibili" },
  { value: "youtube", key: "provider.youtube" },
  { value: "vimeo", key: "provider.vimeo" },
  { value: "direct", key: "provider.direct" },
  { value: "web", key: "provider.web" }
];

export class MarkerManagerModal extends Modal {
  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private onChanged: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-marker-modal");
    this.modalEl.addClass("vl-marker-manager-modal");
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(t("marker.manageTitle"));
    contentEl.createEl("p", { text: t("marker.manageDesc"), cls: "vl-modal-description" });

    const list = contentEl.createDiv({ cls: "vl-marker-list" });
    if (this.plugin.data.markers.length === 0) {
      list.createEl("p", { text: t("marker.empty"), cls: "vl-empty-inline" });
    }
    for (const marker of this.plugin.data.markers) {
      this.renderRow(list, marker);
    }

    const footer = contentEl.createDiv({ cls: "vl-modal-buttons vl-marker-footer" });
    const add = footer.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("marker.new") });
    add.addEventListener("click", () => {
      new MarkerEditModal(this.app, this.plugin, null, () => {
        this.onChanged();
        this.render();
      }).open();
    });
  }

  private renderRow(list: HTMLElement, marker: Marker): void {
    const row = list.createDiv({ cls: "vl-marker-row" });
    const dot = row.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: marker.color });
    const info = row.createDiv({ cls: "vl-marker-info" });
    info.createSpan({ text: marker.name, cls: "vl-marker-name" });
    const meta = info.createSpan({ cls: "vl-marker-meta" });
    if (marker.autoProvider) meta.setText(t("marker.autoLabel", { provider: marker.autoProvider }));
    if (marker.metatubeProvider) {
      if (meta.textContent) meta.appendText(" · ");
      meta.appendText(t("marker.metatubeLabel", { provider: marker.metatubeProvider }));
    }
    if (!marker.autoProvider && !marker.metatubeProvider) meta.setText(t("marker.noBinding"));

    const actions = row.createDiv({ cls: "vl-marker-actions" });
    iconButton(actions, "pencil", t("action.rename"), () => {
      new MarkerEditModal(this.app, this.plugin, marker, () => {
        this.onChanged();
        this.render();
      }).open();
    });
    iconButton(actions, "trash-2", t("action.delete"), () => {
      const count = this.plugin.data.videos.filter((video) => video.markers?.includes(marker.id)).length;
      new ConfirmModal(this.app, {
        title: t("marker.deleteTitle"),
        description: t("marker.deleteDesc", { name: marker.name, count }),
        confirmText: t("confirm.delete"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.deleteMarker(marker.id);
          new Notice(t("marker.deleted"));
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

export class MarkerEditModal extends Modal {
  private nameInput!: HTMLInputElement;
  private metatubeInput!: HTMLInputElement;
  private autoSelect!: HTMLSelectElement;
  private urlInput!: HTMLInputElement;
  private descriptionInput!: HTMLTextAreaElement;
  private enabledInput!: HTMLInputElement;
  private capabilityChecks: Array<{ name: string; input: HTMLInputElement }> = [];
  private color: string;
  private kind: MarkerKind;
  private errorEl!: HTMLElement;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private marker: Marker | null,
    private onSaved: (marker: Marker) => void,
    kind: MarkerKind = marker?.kind || "site"
  ) {
    super(app);
    this.kind = kind;
    this.color = marker?.color || TAG_COLORS[plugin.data.markers.length % TAG_COLORS.length];
    this.modalEl.addClass("vl-marker-modal");
    this.modalEl.addClass("vl-marker-edit-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.marker ? t("marker.editTitle") : t("marker.newTitle"));
    this.contentEl.createEl("p", { text: t("marker.desc"), cls: "vl-modal-description" });

    const nameField = this.contentEl.createDiv({ cls: "vl-field" });
    nameField.createEl("label", { text: t("marker.name"), cls: "vl-field-label" });
    this.nameInput = nameField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { value: this.marker?.name || "", placeholder: t("marker.namePlaceholder") }
    });

    const colorField = this.contentEl.createDiv({ cls: "vl-field" });
    colorField.createEl("label", { text: t("marker.color"), cls: "vl-field-label" });
    const swatches = colorField.createDiv({ cls: "vl-color-swatches" });
    for (const color of TAG_COLORS) {
      const swatch = swatches.createEl("button", {
        cls: "vl-color-swatch",
        attr: { type: "button", "aria-label": color, title: color }
      });
      swatch.setCssStyles({ backgroundColor: color });
      if (color === this.color) swatch.addClass("is-selected");
      swatch.addEventListener("click", () => {
        this.color = color;
        for (const candidate of Array.from(swatches.children) as HTMLElement[]) {
          candidate.removeClass("is-selected");
        }
        swatch.addClass("is-selected");
      });
    }

    if (this.kind === "link") {
      const autoField = this.contentEl.createDiv({ cls: "vl-field" });
      autoField.createEl("label", { text: t("marker.autoProvider"), cls: "vl-field-label" });
      this.autoSelect = autoField.createEl("select", { cls: "dropdown" });
      for (const option of AUTO_PROVIDERS) {
        this.autoSelect.createEl("option", { text: t(option.key as MessageKey), value: option.value });
      }
      this.autoSelect.value = this.marker?.autoProvider || "";
    } else {
      const urlField = this.contentEl.createDiv({ cls: "vl-field" });
      urlField.createEl("label", { text: t("marker.siteUrl"), cls: "vl-field-label" });
      this.urlInput = urlField.createEl("input", {
        type: "text",
        cls: "vl-text-input",
        attr: {
          value: this.marker?.url || "",
          placeholder: "https://www.javbus.com"
        }
      });

      const metatubeField = this.contentEl.createDiv({ cls: "vl-field" });
      metatubeField.createEl("label", { text: t("marker.metatubeProvider"), cls: "vl-field-label" });
      this.metatubeInput = metatubeField.createEl("input", {
        type: "text",
        cls: "vl-text-input",
        attr: {
          value: this.marker?.metatubeProvider || "",
          placeholder: t("marker.metatubePlaceholder")
        }
      });
      metatubeField.createDiv({ text: t("marker.metatubeHint"), cls: "vl-field-hint" });

      const capabilityField = this.contentEl.createDiv({ cls: "vl-field" });
      capabilityField.createEl("label", { text: t("marker.capabilities"), cls: "vl-field-label" });
      const capabilityRow = capabilityField.createDiv({ cls: "vl-marker-capabilities" });
      this.capabilityChecks = ["有码", "无码", "欧美"].map((name) => {
        const label = capabilityRow.createEl("label");
        const input = label.createEl("input", { type: "checkbox" });
        input.checked = Boolean(this.marker?.capabilities?.includes(name));
        label.createSpan({ text: name });
        return { name, input };
      });

      const descriptionField = this.contentEl.createDiv({ cls: "vl-field" });
      descriptionField.createEl("label", { text: t("marker.siteDescription"), cls: "vl-field-label" });
      this.descriptionInput = descriptionField.createEl("textarea", {
        cls: "vl-text-area",
        attr: { rows: "2", placeholder: t("marker.siteDescriptionPlaceholder") }
      });
      this.descriptionInput.value = this.marker?.description || "";

      const enabledLabel = this.contentEl.createEl("label", { cls: "vl-marker-enabled" });
      this.enabledInput = enabledLabel.createEl("input", { type: "checkbox" });
      this.enabledInput.checked = this.marker?.enabled !== false;
      enabledLabel.createSpan({ text: t("marker.enabled") });
    }

    this.errorEl = this.contentEl.createDiv({ cls: "vl-form-error" });
    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const cancel = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const save = buttons.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    save.addEventListener("click", () => void this.save());
    this.nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.save();
      }
    });
    window.setTimeout(() => this.nameInput.focus(), 40);
  }

  private async save(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.errorEl.setText(t("marker.nameRequired"));
      return;
    }
    if (
      this.plugin.data.markers.some(
        (candidate) =>
          candidate.id !== this.marker?.id && candidate.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      this.errorEl.setText(t("marker.duplicate"));
      return;
    }
    const marker: Marker = {
      id: this.marker?.id || `marker_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      color: this.color,
      kind: this.kind,
      enabled: this.kind === "site" ? this.enabledInput.checked : true,
      autoProvider:
        this.kind === "link" ? ((this.autoSelect.value || undefined) as Provider | undefined) : undefined,
      metatubeProvider: this.kind === "site" ? this.metatubeInput.value.trim() || undefined : undefined,
      capabilities:
        this.kind === "site"
          ? this.capabilityChecks.filter((item) => item.input.checked).map((item) => item.name)
          : [],
      url: this.kind === "site" ? this.urlInput.value.trim() || undefined : undefined,
      description:
        this.kind === "site" ? this.descriptionInput.value.trim() || undefined : undefined,
      sortOrder: this.marker?.sortOrder,
      createdAt: this.marker?.createdAt || Date.now()
    };
    await this.plugin.saveMarker(marker);
    new Notice(this.marker ? t("marker.updated") : t("marker.created"));
    this.onSaved(marker);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
