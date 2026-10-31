import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { providerName, t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import { fetchVideoMetadata } from "../metadata";
import { fallbackTitleFromUrl, normalizeUrlInput, parseVideoUrl } from "../providers";
import type { ParsedVideo, PreviewConfig, VideoItem, VideoMetadata } from "../types";
import { clonePreviewConfig, uid, UNCATEGORIZED_ID } from "../types";
import { CategoryEditModal } from "./category-modal";
import { pickVaultFile, TextPromptModal } from "./common";
import { FramePickerModal } from "./frame-modal";
import { PreviewConfigModal } from "./preview-config-modal";

type SourceMode = "url" | "local";

interface ElectronRemoteLike {
  dialog?: {
    showOpenDialog?: (...args: unknown[]) => Promise<{ canceled?: boolean; filePaths?: string[] }>;
  };
  getCurrentWindow?: () => unknown;
}

interface ElectronLike {
  webUtils?: {
    getPathForFile?: (file: File) => string;
  };
}

export class VideoEditModal extends Modal {
  private item: VideoItem | null;
  private sourceMode: SourceMode;
  private parsed: ParsedVideo | null;
  private metadata: VideoMetadata | null = null;
  private titleTouched: boolean;
  private author?: string;
  private previewConfig?: PreviewConfig;
  private previewSummaryEl!: HTMLElement;

  private urlInput!: HTMLInputElement;
  private urlStatus!: HTMLElement;
  private providerBadge!: HTMLElement;
  private localNameEl!: HTMLElement;
  private localPath?: string;
  private localExternal = false;
  private titleInput!: HTMLInputElement;
  private categorySelect!: HTMLSelectElement;
  private tagChipsEl!: HTMLElement;
  private tagSelect!: HTMLSelectElement;
  private tagNewInput!: HTMLInputElement;
  private selectedTags: string[] = [];
  private notesInput!: HTMLTextAreaElement;
  private urlPane!: HTMLElement;
  private localPane!: HTMLElement;
  private urlTab!: HTMLButtonElement;
  private localTab!: HTMLButtonElement;
  private formError!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private detectButton!: HTMLButtonElement;

  private coverImg!: HTMLImageElement;
  private coverPlaceholder!: HTMLElement;
  private coverEmptyText!: HTMLElement;
  private coverStatus!: HTMLElement;
  private coverPath?: string;
  private coverBuffer: ArrayBuffer | null = null;
  private coverExtension = "jpg";
  private coverPreviewUrl: string | null = null;
  private coverRemoved = false;
  private coverRequest = 0;

  private detectTimer = 0;
  private detectionSeq = 0;
  private detection: Promise<void> | null = null;
  private pasteHandler: ((event: ClipboardEvent) => void) | null = null;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    video?: VideoItem | null,
    private folderId?: string
  ) {
    super(app);
    this.item = video
      ? {
          ...video,
          tags: [...video.tags],
          preview: clonePreviewConfig(video.preview)
        }
      : null;
    this.sourceMode = video?.provider === "local" ? "local" : "url";
    this.localPath = video?.localPath;
    this.localExternal = Boolean(video?.localExternal);
    this.parsed = video?.url ? parseVideoUrl(video.url) : null;
    this.titleTouched = Boolean(video);
    this.author = video?.author;
    this.selectedTags = video ? [...video.tags] : [];
    this.previewConfig = clonePreviewConfig(video?.preview);
    this.coverPath = video?.coverPath;
    this.modalEl.addClass("vl-video-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.item ? t("form.editTitle") : t("form.addTitle"));
    this.contentEl.createEl("p", { text: t("form.subtitle"), cls: "vl-modal-description" });

    this.buildSourceSection();
    this.buildMainFields();
    this.buildCoverSection();
    this.buildPreviewSection();

    this.pasteHandler = (event: ClipboardEvent) => {
      void this.handlePaste(event);
    };
    this.modalEl.addEventListener("paste", this.pasteHandler);

    this.formError = this.contentEl.createDiv({ cls: "vl-form-error" });

    const footer = this.contentEl.createDiv({ cls: "vl-modal-buttons vl-edit-footer" });
    const cancel = footer.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    this.saveButton = footer.createEl("button", {
      text: t("action.save"),
      cls: "mod-cta",
      attr: { type: "button", "data-vl-action": "save" }
    });
    this.saveButton.addEventListener("click", () => void this.save());

    this.updateSourceVisibility();
    this.populateFields();
    void this.renderCover();
    this.updateProviderBadge();

    if (!this.item) {
      window.setTimeout(() => this.urlInput.focus(), 60);
    }
  }

  private buildSourceSection(): void {
    const section = this.contentEl.createDiv({ cls: "vl-form-section" });
    section.createEl("label", { text: t("form.source"), cls: "vl-field-label" });

    const tabs = section.createDiv({ cls: "vl-segmented" });
    this.urlTab = tabs.createEl("button", {
      text: t("form.link"),
      attr: { type: "button" }
    });
    this.localTab = tabs.createEl("button", {
      text: t("form.local"),
      attr: { type: "button" }
    });
    this.urlTab.addEventListener("click", () => {
      this.sourceMode = "url";
      this.updateSourceVisibility();
      this.updateProviderBadge();
      window.setTimeout(() => this.urlInput.focus(), 30);
    });
    this.localTab.addEventListener("click", () => {
      this.sourceMode = "local";
      this.updateSourceVisibility();
      this.updateProviderBadge();
    });

    this.urlPane = section.createDiv({ cls: "vl-source-pane" });
    const urlHeader = this.urlPane.createDiv({ cls: "vl-inline-heading" });
    urlHeader.createSpan({ text: t("form.linkDesc"), cls: "vl-field-hint" });
    this.providerBadge = urlHeader.createSpan({ cls: "vl-provider-badge" });

    const urlRow = this.urlPane.createDiv({ cls: "vl-input-row" });
    this.urlInput = urlRow.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: {
        placeholder: t("form.urlPlaceholder"),
        spellcheck: "false",
        "data-vl-field": "url"
      }
    });
    this.detectButton = urlRow.createEl("button", {
      text: t("action.detect"),
      attr: { type: "button" }
    });
    this.detectButton.addEventListener("click", () => {
      this.titleTouched = false;
      void this.detect(true);
    });

    this.urlStatus = this.urlPane.createDiv({ cls: "vl-url-status" });
    this.urlInput.addEventListener("input", () => {
      this.metadata = null;
      this.parsed = parseVideoUrl(this.urlInput.value);
      this.updateProviderBadge();
      this.clearStatus();
      window.clearTimeout(this.detectTimer);
      this.detectTimer = window.setTimeout(() => {
        this.detectTimer = 0;
        void this.detect(false);
      }, 750);
    });
    this.urlInput.addEventListener("blur", () => {
      if (this.detectTimer) {
        window.clearTimeout(this.detectTimer);
        this.detectTimer = 0;
        void this.detect(false);
      }
    });

    this.localPane = section.createDiv({ cls: "vl-source-pane" });
    this.localPane.createEl("p", { text: t("form.localDesc"), cls: "vl-field-hint" });
    const localCard = this.localPane.createDiv({ cls: "vl-local-file" });
    const icon = localCard.createSpan({ cls: "vl-local-icon" });
    setIcon(icon, "file-video");
    this.localNameEl = localCard.createSpan({ cls: "vl-local-name" });
    const choose = localCard.createEl("button", { text: t("form.chooseVideo"), attr: { type: "button" } });
    choose.addEventListener("click", () => {
      pickVaultFile(this.app, "video", (file) => this.selectLocalFile(file));
    });
    const chooseExternal = localCard.createEl("button", {
      text: t("form.chooseExternalVideo"),
      attr: { type: "button" }
    });
    chooseExternal.addEventListener("click", () => this.chooseExternalVideo());
    if (!this.item) {
      const importFiles = localCard.createEl("button", {
        text: t("form.importExternalFiles"),
        attr: { type: "button" }
      });
      importFiles.addEventListener("click", () => this.chooseExternalFiles());
      const importFolder = localCard.createEl("button", {
        text: t("form.importExternalFolder"),
        attr: { type: "button" }
      });
      importFolder.addEventListener("click", () => this.chooseExternalFolder());
    }
  }

  private chooseExternalVideo(): void {
    void this.pickExternalPaths("file").then((paths) => {
      const path = paths[0];
      if (path) this.selectExternalFile(path, path.split(/[\\/]/).pop() || path);
    });
  }

  private chooseExternalFiles(): void {
    void this.pickExternalPaths("files").then(async (paths) => {
      if (paths.length === 0) return;
      if (paths.length === 1) {
        this.selectExternalFile(paths[0], paths[0].split(/[\\/]/).pop() || paths[0]);
        return;
      }
      const result = await this.plugin.importExternalFiles(
        paths,
        this.folderId || null,
        this.categorySelect.value || UNCATEGORIZED_ID
      );
      new Notice(
        result.imported > 0 ? t("notice.importedVideos", { count: result.imported, skipped: result.skipped }) : t("notice.importEmpty")
      );
      if (result.imported > 0) this.close();
    });
  }

  private chooseExternalFolder(): void {
    void this.pickExternalPaths("folder").then(async (paths) => {
      const folderPath = paths[0];
      if (!folderPath) return;
      const result = await this.plugin.importExternalFolder(
        folderPath,
        this.folderId || null,
        this.categorySelect.value || UNCATEGORIZED_ID
      );
      new Notice(
        result.imported > 0
          ? t("notice.importedFolder", { count: result.imported, folders: result.folders, skipped: result.skipped })
          : t("notice.importEmpty")
      );
      if (result.imported > 0) this.close();
    });
  }

  private async pickExternalPaths(mode: "file" | "files" | "folder"): Promise<string[]> {
    const loader = (window as unknown as { require?: (module: string) => unknown }).require;
    const remote = loader?.("@electron/remote") as ElectronRemoteLike | undefined;
    if (remote?.dialog?.showOpenDialog) {
      const properties =
        mode === "folder"
          ? ["openDirectory"]
          : mode === "files"
            ? ["openFile", "multiSelections"]
            : ["openFile"];
      const result = await remote.dialog.showOpenDialog(remote.getCurrentWindow?.(), {
        title: mode === "folder" ? t("form.chooseExternalFolder") : t("form.chooseExternalVideo"),
        properties,
        filters: [
          {
            name: "Videos",
            extensions: ["mp4", "mkv", "webm", "mov", "avi", "wmv", "flv", "m4v", "ts", "mpg", "mpeg", "rmvb", "3gp"]
          }
        ]
      });
      return result.canceled ? [] : result.filePaths || [];
    }
    return new Promise((resolve) => {
      const input = document.body.createEl("input", { attr: { type: "file" } });
      input.multiple = mode !== "file";
      if (mode === "folder") input.setAttribute("webkitdirectory", "true");
      input.accept = "video/*,.mkv,.avi,.mov,.wmv,.flv,.rmvb,.ts,.m4v,.mpg,.mpeg,.webm";
      input.setCssStyles({ display: "none" });
      input.addEventListener("change", () => {
        const paths = Array.from(input.files || [])
          .map((file) => {
            const webUtils = (loader?.("electron") as ElectronLike | undefined)?.webUtils;
            return webUtils?.getPathForFile?.(file) || (file as File & { path?: string }).path || "";
          })
          .filter(Boolean);
        input.remove();
        resolve(paths);
      });
      input.addEventListener("cancel", () => {
        input.remove();
        resolve([]);
      });
      input.click();
    });
  }

  private selectExternalFile(path: string, name: string): void {
    this.localPath = path;
    this.localExternal = true;
    this.updateLocalLabel();
    this.updateSourceVisibility();
    this.updateProviderBadge();
    if (!this.titleTouched || !this.titleInput.value.trim()) {
      this.titleInput.value = name.replace(/\.[^.]+$/, "");
      this.titleTouched = false;
    }
    this.coverStatus.setText(t("form.coverFromVideo"));
  }

  private buildMainFields(): void {
    const grid = this.contentEl.createDiv({ cls: "vl-form-grid" });

    const titleField = grid.createDiv({ cls: "vl-field vl-field-wide" });
    titleField.createEl("label", { text: t("form.title"), cls: "vl-field-label" });
    this.titleInput = titleField.createEl("input", {
      type: "text",
      cls: "vl-text-input",
      attr: { placeholder: t("form.titlePlaceholder"), "data-vl-field": "title" }
    });
    this.titleInput.addEventListener("input", () => {
      this.titleTouched = true;
    });

    const categoryField = grid.createDiv({ cls: "vl-field" });
    categoryField.createEl("label", { text: t("form.category"), cls: "vl-field-label" });
    const categoryRow = categoryField.createDiv({ cls: "vl-input-row" });
    this.categorySelect = categoryRow.createEl("select", {
      cls: "dropdown",
      attr: { "data-vl-field": "category" }
    });
    const newCategory = categoryRow.createEl("button", {
      cls: "vl-small-button",
      attr: { type: "button", title: t("form.newCategory") }
    });
    setIcon(newCategory.createSpan(), "folder-plus");
    newCategory.createSpan({ text: t("form.newCategory") });
    newCategory.addEventListener("click", () => {
      new CategoryEditModal(this.app, this.plugin, null, (category) => {
        this.fillCategories(category.id);
      }).open();
    });

    const tagsField = grid.createDiv({ cls: "vl-field vl-field-wide" });
    tagsField.createEl("label", { text: t("form.tags"), cls: "vl-field-label" });
    this.buildTagPicker(tagsField);

    const notesField = grid.createDiv({ cls: "vl-field vl-field-wide" });
    notesField.createEl("label", { text: t("form.notes"), cls: "vl-field-label" });
    this.notesInput = notesField.createEl("textarea", {
      cls: "vl-text-area",
      attr: { placeholder: t("form.notesPlaceholder"), rows: "3", "data-vl-field": "notes" }
    });
  }

  private buildTagPicker(parent: HTMLElement): void {
    const picker = parent.createDiv({ cls: "vl-tag-picker" });
    this.tagChipsEl = picker.createDiv({ cls: "vl-tag-picker-chips" });

    const controls = picker.createDiv({ cls: "vl-tag-picker-controls" });
    this.tagSelect = controls.createEl("select", {
      cls: "dropdown vl-tag-select",
      attr: { "aria-label": t("tag.selectedExisting"), "data-vl-field": "tags-existing" }
    });
    this.tagSelect.addEventListener("change", () => {
      const value = this.tagSelect.value;
      this.tagSelect.value = "";
      if (value) this.addTag(value);
    });

    this.tagNewInput = controls.createEl("input", {
      type: "text",
      cls: "vl-text-input vl-tag-new",
      attr: { placeholder: t("tag.newPlaceholder"), "data-vl-field": "tags-new" }
    });
    const add = controls.createEl("button", {
      cls: "vl-small-button",
      attr: { type: "button", "data-vl-action": "add-tag" }
    });
    setIcon(add.createSpan(), "plus");
    add.createSpan({ text: t("tag.add") });
    add.addEventListener("click", () => this.addTag(this.tagNewInput.value));
    this.tagNewInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.addTag(this.tagNewInput.value);
    });
  }

  private addTag(raw: string): void {
    const name = raw.trim();
    if (!name) return;
    const existing = this.plugin.getTagByName(name);
    const canonical = existing?.name || name;
    if (!this.selectedTags.some((tag) => tag.toLowerCase() === canonical.toLowerCase())) {
      this.selectedTags.push(canonical);
      if (this.tagNewInput) this.tagNewInput.value = "";
      this.renderTagChips();
    }
  }

  private removeTag(name: string): void {
    this.selectedTags = this.selectedTags.filter((tag) => tag !== name);
    this.renderTagChips();
  }

  private renderTagChips(): void {
    if (!this.tagChipsEl) return;
    this.tagChipsEl.empty();
    if (this.selectedTags.length === 0) {
      this.tagChipsEl.createSpan({ text: t("tag.noTags"), cls: "vl-tag-picker-empty" });
    }
    for (const name of this.selectedTags) {
      const tag = this.plugin.getTagByName(name);
      const chip = this.tagChipsEl.createSpan({ cls: "vl-selected-tag" });
      const dot = chip.createSpan({ cls: "vl-tag-dot" });
      dot.setCssStyles({ backgroundColor: tag?.color || "var(--interactive-accent)" });
      chip.createSpan({ text: name });
      const remove = chip.createEl("button", {
        cls: "vl-selected-tag-remove",
        attr: { type: "button", title: t("tag.remove"), "aria-label": t("tag.remove") }
      });
      setIcon(remove, "x");
      remove.addEventListener("click", () => this.removeTag(name));
    }

    if (this.tagSelect) {
      this.tagSelect.empty();
      this.tagSelect.createEl("option", {
        text: t("tag.selectedExisting"),
        value: "",
        attr: { selected: "true" }
      });
      for (const tag of this.plugin.data.tags) {
        if (this.selectedTags.some((name) => name.toLowerCase() === tag.name.toLowerCase())) continue;
        this.tagSelect.createEl("option", { text: tag.name, value: tag.name });
      }
    }
  }

  private buildCoverSection(): void {
    const section = this.contentEl.createDiv({ cls: "vl-form-section vl-cover-section" });
    const heading = section.createDiv({ cls: "vl-cover-heading" });
    heading.createEl("label", { text: t("form.cover"), cls: "vl-field-label" });
    heading.createSpan({ text: t("form.coverHint"), cls: "vl-field-hint" });

    const body = section.createDiv({ cls: "vl-cover-editor" });
    const preview = body.createDiv({ cls: "vl-cover-preview" });
    this.coverImg = preview.createEl("img", { attr: { alt: t("form.cover") } });
    this.coverImg.addClass("is-hidden");
    this.coverPlaceholder = preview.createDiv({ cls: "vl-cover-placeholder" });
    const placeholderIcon = this.coverPlaceholder.createSpan({ cls: "vl-cover-placeholder-icon" });
    setIcon(placeholderIcon, "image-off");
    this.coverEmptyText = this.coverPlaceholder.createSpan({ text: t("form.coverEmpty") });
    this.coverImg.addEventListener("load", () => {
      this.coverImg.removeClass("is-hidden");
      this.coverPlaceholder.addClass("is-hidden");
    });
    this.coverImg.addEventListener("error", () => {
      this.coverImg.addClass("is-hidden");
      this.coverPlaceholder.removeClass("is-hidden");
    });

    const controls = body.createDiv({ cls: "vl-cover-controls" });
    this.coverStatus = controls.createDiv({ cls: "vl-cover-status" });
    controls.createEl("p", { text: t("form.coverPasteHint"), cls: "vl-paste-hint" });
    const actions = controls.createDiv({ cls: "vl-cover-actions" });
    this.coverAction(actions, "sparkles", t("action.autoCover"), () => void this.autoCover());
    this.coverAction(actions, "link", t("action.imageUrl"), () => this.promptImageUrl());
    this.coverAction(actions, "folder-open", t("action.localImage"), () => this.chooseLocalImage());
    this.coverAction(actions, "camera", t("action.captureCover"), () => void this.captureFromVideo(), "vl-capture-cover");
    this.coverAction(actions, "x", t("action.removeCover"), () => this.removeCover(), "vl-remove-cover");
  }

  private coverAction(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    className = ""
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-cover-action ${className}`.trim(),
      attr: { type: "button", title: label }
    });
    setIcon(button.createSpan({ cls: "vl-btn-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", onClick);
  }

  private buildPreviewSection(): void {
    const section = this.contentEl.createDiv({ cls: "vl-form-section vl-preview-setting" });
    const info = section.createDiv({ cls: "vl-preview-setting-info" });
    info.createEl("label", { text: t("preview.section"), cls: "vl-field-label" });
    this.previewSummaryEl = info.createDiv({ cls: "vl-preview-setting-summary" });
    this.updatePreviewSummary();

    const button = section.createEl("button", {
      cls: "vl-small-button",
      attr: { type: "button", "data-vl-action": "preview-settings" }
    });
    setIcon(button.createSpan({ cls: "vl-btn-icon" }), "sliders-horizontal");
    button.createSpan({ text: t("preview.configure") });
    button.addEventListener("click", () => this.openPreviewSettings());
  }

  private updatePreviewSummary(): void {
    if (!this.previewSummaryEl) return;
    if (!this.previewConfig) {
      this.previewSummaryEl.setText(t("preview.defaultSummary"));
      return;
    }
    if (this.previewConfig.clips.length === 0) {
      this.previewSummaryEl.setText(
        t("preview.summaryEmpty", { duration: this.previewConfig.duration })
      );
      return;
    }
    this.previewSummaryEl.setText(
      t("preview.customSummary", {
        duration: this.previewConfig.duration,
        count: this.previewConfig.clips.length
      })
    );
  }

  private getEditableVideoSource(): string | null {
    if (this.sourceMode === "local" && this.localPath) {
      if (this.localExternal) {
        if (!this.item?.localLinkPath) return null;
        return this.app.vault.adapter.getResourcePath(this.item.localLinkPath);
      }
      const file = this.plugin.getLocalFile(this.localPath);
      return file ? this.app.vault.adapter.getResourcePath(this.localPath) : null;
    }
    if (this.sourceMode === "url" && this.parsed?.provider === "direct") {
      const source = this.normalizeSourceUrl();
      return source || null;
    }
    return null;
  }

  private openPreviewSettings(): void {
    const source = this.getEditableVideoSource();
    if (!source) {
      new Notice(t("preview.onlyLocal"));
      return;
    }
    new PreviewConfigModal(
      this.app,
      source,
      this.metadata?.duration || this.item?.duration,
      this.previewConfig,
      (config) => {
        this.previewConfig = clonePreviewConfig(config);
        this.updatePreviewSummary();
      }
    ).open();
  }

  private populateFields(): void {
    this.urlInput.value = this.item?.url || "";
    this.titleInput.value = this.item?.title || "";
    this.notesInput.value = this.item?.notes || "";
    this.fillCategories(this.item?.categoryId || UNCATEGORIZED_ID);
    this.renderTagChips();
    this.updateLocalLabel();
  }

  private fillCategories(selected: string): void {
    this.categorySelect.empty();
    const all = this.categorySelect.createEl("option", {
      text: t("category.uncategorizedName"),
      value: UNCATEGORIZED_ID
    });
    for (const category of this.plugin.data.categories) {
      this.categorySelect.createEl("option", { text: category.name, value: category.id });
    }
    this.categorySelect.value = selected;
    if (all.value !== selected && !Array.from(this.categorySelect.options).some((option) => option.value === selected)) {
      this.categorySelect.value = UNCATEGORIZED_ID;
    }
  }

  private updateSourceVisibility(): void {
    const isUrl = this.sourceMode === "url";
    this.urlTab.toggleClass("is-active", isUrl);
    this.localTab.toggleClass("is-active", !isUrl);
    this.urlPane.toggleClass("is-hidden", !isUrl);
    this.localPane.toggleClass("is-hidden", isUrl);
    const capture = this.contentEl.querySelector<HTMLElement>(".vl-capture-cover");
    if (capture) {
      capture.toggleClass("is-hidden", isUrl && this.parsed?.provider !== "direct");
    }
  }

  private updateProviderBadge(): void {
    if (!this.providerBadge) return;
    const provider =
      this.sourceMode === "local" ? "local" : this.parsed?.provider || (this.urlInput.value.trim() ? "web" : null);
    this.providerBadge.setText(provider ? providerName(provider) : "");
    this.providerBadge.toggleClass("is-hidden", !provider);
  }

  private updateLocalLabel(): void {
    if (!this.localNameEl) return;
    if (this.localPath) {
      const name = this.localPath.split(/[\\/]/).pop() || this.localPath;
      this.localNameEl.setText(t(this.localExternal ? "form.localExternalSelected" : "form.localSelected", { name }));
      this.localNameEl.removeClass("is-muted");
    } else {
      this.localNameEl.setText(t("form.noLocal"));
      this.localNameEl.addClass("is-muted");
    }
  }

  private selectLocalFile(file: TFile): void {
    this.localPath = file.path;
    this.localExternal = false;
    this.updateLocalLabel();
    this.updateSourceVisibility();
    this.updateProviderBadge();
    if (!this.titleTouched || !this.titleInput.value.trim()) {
      this.titleInput.value = file.basename;
      this.titleTouched = false;
    }
    this.coverStatus.setText(t("form.coverFromVideo"));
  }

  private clearStatus(): void {
    this.urlStatus.setText("");
    this.urlStatus.removeClass("is-error", "is-loading");
  }

  private setStatus(text: string, kind: "normal" | "loading" | "error" = "normal"): void {
    this.urlStatus.setText(text);
    this.urlStatus.toggleClass("is-loading", kind === "loading");
    this.urlStatus.toggleClass("is-error", kind === "error");
  }

  private normalizeSourceUrl(): string {
    return normalizeUrlInput(this.urlInput.value);
  }

  private refererFor(url: string): string | undefined {
    try {
      const host = new URL(url).hostname;
      if (host.includes("hdslb.com") || host.includes("bilibili.com")) return "https://www.bilibili.com/";
      if (host.includes("ytimg.com") || host.includes("youtube.com")) return "https://www.youtube.com/";
      return `${new URL(url).origin}/`;
    } catch {
      return undefined;
    }
  }

  private async detect(manual: boolean): Promise<void> {
    if (this.sourceMode !== "url") return;
    const raw = this.normalizeSourceUrl();
    if (!raw) {
      if (manual) this.setStatus(t("form.requiredSource"), "error");
      return;
    }
    const parsed = parseVideoUrl(raw);
    if (!parsed) {
      this.setStatus(t("form.invalidUrl"), "error");
      return;
    }
    this.parsed = parsed;
    this.updateProviderBadge();

    const sequence = ++this.detectionSeq;
    this.detectButton.disabled = true;
    this.setStatus(t("form.detecting"), "loading");
    this.detection = this.runDetect(raw, parsed, sequence, manual);
    await this.detection;
    if (sequence === this.detectionSeq) this.detectButton.disabled = false;
  }

  private async runDetect(
    raw: string,
    parsed: ParsedVideo,
    sequence: number,
    manual: boolean
  ): Promise<void> {
    try {
      const metadata = await fetchVideoMetadata(raw, parsed);
      if (sequence !== this.detectionSeq) return;

      this.metadata = metadata;
      if (metadata.videoId) this.parsed = { ...this.parsed!, videoId: metadata.videoId };
      if (metadata.canonicalUrl) this.parsed = { ...this.parsed!, canonicalUrl: metadata.canonicalUrl };
      if (metadata.embedUrl) this.parsed = { ...this.parsed!, embedUrl: metadata.embedUrl };
      if (metadata.author) this.author = metadata.author;

      if (!this.titleTouched && metadata.title) {
        this.titleInput.value = metadata.title;
      }

      const hasCover = !this.coverRemoved && Boolean(this.coverBuffer || this.coverPath);
      if (metadata.thumbnailUrl && (!hasCover || manual)) {
        await this.loadCoverFromUrl(metadata.thumbnailUrl, false, sequence);
      }

      if (metadata.title || metadata.thumbnailUrl) {
        this.setStatus(t("form.detected"));
      } else {
        this.setStatus(t("form.detectFailed"), "error");
      }
    } catch {
      if (sequence === this.detectionSeq) {
        this.setStatus(t("form.detectFailed"), "error");
      }
    }
  }

  private async loadCoverFromUrl(url: string, notify: boolean, sequence?: number): Promise<void> {
    this.coverStatus.setText(t("form.coverDetecting"));
    try {
      const image = await this.plugin.coverStore.fetchImage(url, this.refererFor(url));
      if (sequence !== undefined && sequence !== this.detectionSeq) return;
      this.setCoverBuffer(image.buffer, image.extension);
      this.coverStatus.setText("");
    } catch (error) {
      if (sequence !== undefined && sequence !== this.detectionSeq) return;
      console.warn("[video-library] Could not fetch cover", url, error);
      this.coverStatus.setText(t("notice.coverFailed"));
      if (notify) new Notice(t("notice.coverFailed"));
    }
  }

  private setCoverBuffer(buffer: ArrayBuffer, extension: string): void {
    this.coverBuffer = buffer;
    this.coverExtension = extension;
    this.coverRemoved = false;
    this.revokePreview();
    this.coverPreviewUrl = this.plugin.coverStore.previewBuffer(buffer, extension);
    this.coverImg.src = this.coverPreviewUrl;
  }

  private revokePreview(): void {
    if (this.coverPreviewUrl) {
      URL.revokeObjectURL(this.coverPreviewUrl);
      this.coverPreviewUrl = null;
    }
  }

  private async renderCover(): Promise<void> {
    if (this.coverBuffer) {
      this.setCoverBuffer(this.coverBuffer, this.coverExtension);
      return;
    }
    if (this.coverRemoved || !this.coverPath) {
      this.coverImg.removeAttribute("src");
      this.coverImg.addClass("is-hidden");
      this.coverPlaceholder.removeClass("is-hidden");
      this.coverEmptyText.setText(t("form.coverEmpty"));
      this.updateCoverButtons();
      return;
    }

    const sequence = ++this.coverRequest;
    this.coverEmptyText.setText(t("misc.loading"));
    this.coverPlaceholder.removeClass("is-hidden");
    const url = await this.plugin.coverStore.getUrl(this.coverPath);
    if (sequence !== this.coverRequest) return;
    if (url) {
      this.coverImg.src = url;
    } else {
      this.coverImg.addClass("is-hidden");
      this.coverPlaceholder.removeClass("is-hidden");
      this.coverEmptyText.setText(t("form.coverEmpty"));
    }
    this.updateCoverButtons();
  }

  private updateCoverButtons(): void {
    const remove = this.contentEl.querySelector<HTMLElement>(".vl-remove-cover");
    if (remove) remove.toggleClass("is-hidden", !this.coverBuffer && !this.coverPath);
  }

  private async autoCover(): Promise<void> {
    this.coverStatus.setText(t("form.coverDetecting"));
    let thumbnail = this.metadata?.thumbnailUrl;
    if (!thumbnail && this.parsed?.provider === "youtube" && this.parsed.videoId) {
      thumbnail = `https://i.ytimg.com/vi/${this.parsed.videoId}/hqdefault.jpg`;
    }
    if (!thumbnail) {
      if (this.sourceMode === "url" && this.normalizeSourceUrl()) {
        await this.detect(true);
        thumbnail = this.metadata?.thumbnailUrl;
      }
    }
    if (!thumbnail) {
      this.coverStatus.setText(t("notice.coverFailed"));
      new Notice(t("notice.coverFailed"));
      return;
    }
    await this.loadCoverFromUrl(thumbnail, true);
  }

  private promptImageUrl(): void {
    new TextPromptModal(this.app, {
      title: t("action.imageUrl"),
      description: t("form.coverHint"),
      placeholder: "https://…/cover.jpg",
      submitText: t("action.choose"),
      validate: (value) => {
        if (!value) return t("form.invalidUrl");
        if (!/^https?:\/\//i.test(value)) return t("form.invalidUrl");
        return null;
      },
      onSubmit: async (value) => {
        const image = await this.plugin.coverStore.fetchImage(value, this.refererFor(value));
        this.setCoverBuffer(image.buffer, image.extension);
        this.coverStatus.setText("");
      }
    }).open();
  }

  private chooseLocalImage(): void {
    pickVaultFile(this.app, "image", (file) => {
      void (async () => {
        try {
          const buffer = await this.app.vault.readBinary(file);
          const extension = ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"].includes(
            file.extension.toLowerCase()
          )
            ? file.extension.toLowerCase()
            : "jpg";
          this.setCoverBuffer(buffer, extension);
          this.coverStatus.setText("");
        } catch {
          new Notice(t("notice.coverFailed"));
        }
      })();
    });
  }

  private async handlePaste(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.type.toLowerCase().startsWith("image/")) continue;

      const file = item.getAsFile();
      if (!file) continue;

      event.preventDefault();
      event.stopPropagation();

      if (file.size > 25 * 1024 * 1024) {
        new Notice(t("notice.imageTooLarge"));
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const type = file.type.toLowerCase();
        const extension = type.includes("jpeg")
          ? "jpg"
          : type.includes("webp")
            ? "webp"
            : type.includes("gif")
              ? "gif"
              : type.includes("avif")
                ? "avif"
                : type.includes("bmp")
                  ? "bmp"
                  : "png";
        this.setCoverBuffer(buffer, extension);
        this.coverStatus.setText(t("form.coverPasted"));
        new Notice(t("notice.coverPasted"));
      } catch {
        new Notice(t("notice.coverFailed"));
      }
      return;
    }
  }

  private removeCover(): void {
    this.coverBuffer = null;
    this.coverRemoved = true;
    this.revokePreview();
    this.coverImg.removeAttribute("src");
    this.coverImg.addClass("is-hidden");
    this.coverPlaceholder.removeClass("is-hidden");
    this.coverEmptyText.setText(t("form.coverEmpty"));
    this.coverStatus.setText(t("notice.coverRemoved"));
    this.updateCoverButtons();
  }

  private captureFromVideo(): void {
    const source = this.getEditableVideoSource();
    if (!source) {
      new Notice(t("notice.captureFailed"));
      return;
    }

    new FramePickerModal(
      this.app,
      this.plugin.coverStore,
      source,
      this.metadata?.duration || this.item?.duration,
      (buffer) => {
        this.setCoverBuffer(buffer, "jpg");
        this.coverStatus.setText(t("form.coverFrameSelected"));
      }
    ).open();
  }

  private async save(): Promise<void> {
    this.formError.setText("");
    const isLocal = this.sourceMode === "local";
    if (isLocal && !this.localPath) {
      this.formError.setText(t("form.requiredSource"));
      return;
    }
    if (!isLocal && !this.urlInput.value.trim()) {
      this.formError.setText(t("form.requiredSource"));
      return;
    }

    this.saveButton.disabled = true;
    this.saveButton.setText(t("action.saving"));

    try {
      let url = "";
      let parsed = this.parsed;

      if (!isLocal) {
        url = this.normalizeSourceUrl();
        parsed = parseVideoUrl(url);
        if (!parsed) {
          this.formError.setText(t("form.invalidUrl"));
          this.saveButton.disabled = false;
          this.saveButton.setText(t("action.save"));
          return;
        }

        if (!this.metadata || this.metadata.canonicalUrl !== parsed.canonicalUrl) {
          await this.detect(false);
        }
        parsed = this.parsed;
        if (this.metadata?.canonicalUrl) url = this.metadata.canonicalUrl;
        else url = parsed?.canonicalUrl || url;
        parsed = parseVideoUrl(url) || parsed;
      }

      const duplicate = this.plugin.findDuplicate(url, isLocal ? this.localPath : undefined, this.item?.id);
      if (duplicate) {
        this.formError.setText(t("form.duplicate"));
        this.saveButton.disabled = false;
        this.saveButton.setText(t("action.save"));
        return;
      }

      let coverPath = this.coverRemoved ? undefined : this.coverPath;
      if (this.coverBuffer) {
        const oldCover = this.coverPath;
        coverPath = await this.plugin.coverStore.saveBuffer(this.coverBuffer, this.coverExtension);
        if (oldCover && oldCover !== coverPath) await this.plugin.coverStore.delete(oldCover);
      } else if (this.coverRemoved && this.coverPath) {
        await this.plugin.coverStore.delete(this.coverPath);
      }

      const tags = await this.plugin.ensureTags(this.selectedTags);
      const now = Date.now();
      const title =
        this.titleInput.value.trim() ||
        this.metadata?.title ||
        (isLocal ? this.localPath?.split("/").pop() || t("form.untitled") : fallbackTitleFromUrl(url));

      const item: VideoItem = {
        id: this.item?.id || uid("vid"),
        url: isLocal ? "" : url,
        provider: isLocal ? "local" : parsed?.provider || "web",
        videoId: isLocal ? undefined : parsed?.videoId,
        title,
        author: this.author,
        description: this.item?.description,
        categoryId: this.categorySelect.value || UNCATEGORIZED_ID,
        folderId: this.item?.folderId || this.folderId,
        tags,
        notes: this.notesInput.value.trim() || undefined,
        coverPath,
        thumbnailUrl: this.metadata?.thumbnailUrl || this.item?.thumbnailUrl,
        localPath: isLocal ? this.localPath : undefined,
        localExternal: isLocal ? this.localExternal : undefined,
        localLinkPath: isLocal && this.localExternal ? this.item?.localLinkPath : undefined,
        lastPlayedAt: this.item?.lastPlayedAt,
        duration: this.metadata?.duration || this.item?.duration,
        epId: this.metadata?.epId || parsed?.epId || this.item?.epId,
        preview: this.previewConfig,
        favorite: this.item?.favorite,
        createdAt: this.item?.createdAt || now,
        updatedAt: now
      };

      if (this.item) {
        await this.plugin.updateVideo(item);
        new Notice(t("notice.updated"));
      } else {
        await this.plugin.addVideo(item);
        new Notice(t("notice.added"));
      }

      const shouldCapture = isLocal && !item.coverPath;
      this.close();
      if (shouldCapture) {
        window.setTimeout(() => void this.plugin.captureCoverFor(item, true), 250);
      }
    } catch (error) {
      this.formError.setText(error instanceof Error ? error.message : t("form.saveFailed"));
      this.saveButton.disabled = false;
      this.saveButton.setText(t("action.save"));
    }
  }

  onClose(): void {
    window.clearTimeout(this.detectTimer);
    this.detectionSeq += 1;
    if (this.pasteHandler) {
      this.modalEl.removeEventListener("paste", this.pasteHandler);
      this.pasteHandler = null;
    }
    this.revokePreview();
    this.contentEl.empty();
  }
}
