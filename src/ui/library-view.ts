import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { ConfirmModal, formatDate, iconButton, openExternal } from "./common";
import { HoverPreview } from "./hover-preview";
import { BatchRenameModal } from "./batch-rename-modal";
import { TagManagerModal } from "./tag-manager-modal";
import { formatDuration, providerName, t, type MessageKey } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { SortMode, VideoItem } from "../types";
import { UNCATEGORIZED_ID } from "../types";
import { CategoryManagerModal } from "./category-modal";
import { VideoEditModal } from "./video-modal";
import { VideoPlayerModal } from "./player-modal";
import { PreviewConfigModal } from "./preview-config-modal";

export const VIEW_TYPE = "video-library-view";

type Filter = "all" | "favorites" | typeof UNCATEGORIZED_ID | string;

export class VideoLibraryView extends ItemView {
  private filter: Filter = "all";
  private query = "";
  private rendered = false;
  private searchTimer = 0;
  private audioSaveTimer = 0;
  private gridWrap!: HTMLElement;
  private headingEl!: HTMLElement;
  private countEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private clearSearchEl!: HTMLElement;
  private navItems = new Map<string, HTMLElement>();
  private selectedIds = new Set<string>();
  private lastSelectedId: string | null = null;
  private visibleVideoIds: string[] = [];
  private selectionBar!: HTMLElement;
  private selectionCountEl!: HTMLElement;
  private batchCategorySelect!: HTMLSelectElement;
  private selectedTags = new Set<string>();
  private tagFilterBar!: HTMLElement;
  private tagFilterChips!: HTMLElement;
  private tagModeButtons = new Map<"any" | "all", HTMLButtonElement>();
  private tagClearButton!: HTMLButtonElement;
  private marqueeEl: HTMLElement | null = null;
  private marqueeStart: { x: number; y: number; mode: "toggle" | "add" | "subtract" } | null = null;
  private marqueeMoved = false;
  private blockNextClick = false;
  private marqueeMoveHandler = (event: PointerEvent) => this.onMarqueeMove(event);
  private marqueeUpHandler = (event: PointerEvent) => this.onMarqueeUp(event);

  constructor(leaf: WorkspaceLeaf, private plugin: VideoLibraryPlugin) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("app.name");
  }

  getIcon(): string {
    return "film";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("vl-view");
    this.rendered = true;
    this.render();
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.searchTimer);
    this.removeMarqueeListeners();
    this.marqueeEl?.remove();
    this.marqueeEl = null;
    if (this.audioSaveTimer) {
      window.clearTimeout(this.audioSaveTimer);
      this.audioSaveTimer = 0;
      void this.plugin.persist();
    }
    HoverPreview.stopActive();
    this.rendered = false;
    this.bodyEl().empty();
  }

  private bodyEl(): HTMLElement {
    return this.containerEl.children[1] as HTMLElement;
  }

  refresh(): void {
    if (!this.rendered) return;
    HoverPreview.stopActive();
    const existingIds = new Set(this.plugin.data.videos.map((video) => video.id));
    for (const id of [...this.selectedIds]) {
      if (!existingIds.has(id)) this.selectedIds.delete(id);
    }
    const existingTags = new Set(this.plugin.data.tags.map((tag) => tag.name));
    for (const name of [...this.selectedTags]) {
      if (!existingTags.has(name)) this.selectedTags.delete(name);
    }
    if (
      this.filter !== "all" &&
      this.filter !== "favorites" &&
      this.filter !== UNCATEGORIZED_ID &&
      !this.plugin.getCategory(this.filter)
    ) {
      this.filter = "all";
    }
    const body = this.bodyEl();
    const scroll = body.querySelector<HTMLElement>(".vl-main")?.scrollTop || 0;
    this.render();
    const next = body.querySelector<HTMLElement>(".vl-main");
    if (next) next.scrollTop = scroll;
  }

  private render(): void {
    const body = this.bodyEl();
    body.empty();
    const root = body.createDiv({ cls: `vl-root is-size-${this.plugin.data.settings.cardSize}` });
    this.renderSidebar(root);
    this.renderMain(root);
    this.renderGrid();
  }

  private renderSidebar(root: HTMLElement): void {
    const sidebar = root.createDiv({ cls: "vl-sidebar" });
    const brand = sidebar.createDiv({ cls: "vl-brand" });
    const logo = brand.createDiv({ cls: "vl-logo" });
    setIcon(logo, "clapperboard");
    const brandText = brand.createDiv({ cls: "vl-brand-text" });
    brandText.createDiv({ text: t("app.name"), cls: "vl-brand-title" });
    brandText.createDiv({ text: t("app.subtitle"), cls: "vl-brand-subtitle" });

    const add = sidebar.createEl("button", {
      cls: "vl-add-button",
      attr: { type: "button", "data-vl-action": "add" }
    });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("action.addVideo") });
    add.addEventListener("click", () => this.openAdd());

    const nav = sidebar.createDiv({ cls: "vl-nav" });
    this.navItems.clear();
    this.navItem(nav, "all", "library", t("nav.all"), this.plugin.categoryCount("all"));
    this.navItem(nav, "favorites", "star", t("nav.favorites"), this.plugin.categoryCount("favorites"));
    this.navItem(
      nav,
      UNCATEGORIZED_ID,
      "inbox",
      t("nav.uncategorized"),
      this.plugin.categoryCount(UNCATEGORIZED_ID)
    );

    const section = sidebar.createDiv({ cls: "vl-nav-section" });
    const sectionHeader = section.createDiv({ cls: "vl-nav-section-header" });
    sectionHeader.createSpan({ text: t("nav.categories") });
    const manage = sectionHeader.createEl("button", {
      cls: "vl-text-icon-button",
      attr: { type: "button", title: t("nav.manageCategories") }
    });
    setIcon(manage, "settings-2");
    manage.addEventListener("click", () => this.openCategories());

    const categoryNav = section.createDiv({ cls: "vl-nav" });
    for (const category of this.plugin.data.categories) {
      const item = categoryNav.createDiv({
        cls: "vl-nav-item",
        attr: { role: "button", tabindex: "0" }
      });
      const dot = item.createSpan({ cls: "vl-category-dot" });
      dot.style.backgroundColor = category.color;
      item.createSpan({ text: category.name, cls: "vl-nav-label" });
      item.createSpan({ text: String(this.plugin.categoryCount(category.id)), cls: "vl-nav-count" });
      this.bindNavItem(item, category.id);
      this.navItems.set(category.id, item);
    }

    if (this.plugin.data.categories.length === 0) {
      categoryNav.createDiv({ text: t("category.empty"), cls: "vl-nav-empty" });
    }

    const footer = sidebar.createDiv({ cls: "vl-sidebar-footer" });
    const settings = footer.createEl("button", { cls: "vl-footer-button", attr: { type: "button" } });
    setIcon(settings.createSpan({ cls: "vl-btn-icon" }), "settings");
    settings.createSpan({ text: t("action.settings") });
    settings.addEventListener("click", () => this.openSettings());
  }

  private navItem(parent: HTMLElement, id: string, icon: string, label: string, count: number): void {
    const item = parent.createDiv({
      cls: "vl-nav-item",
      attr: { role: "button", tabindex: "0" }
    });
    const iconEl = item.createSpan({ cls: "vl-nav-icon" });
    setIcon(iconEl, icon);
    item.createSpan({ text: label, cls: "vl-nav-label" });
    item.createSpan({ text: String(count), cls: "vl-nav-count" });
    this.bindNavItem(item, id);
    this.navItems.set(id, item);
  }

  private bindNavItem(item: HTMLElement, id: string): void {
    item.addEventListener("click", () => this.setFilter(id));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.setFilter(id);
      }
    });
  }

  private setFilter(filter: Filter): void {
    this.filter = filter;
    if (filter !== "all" && filter !== "favorites" && filter !== UNCATEGORIZED_ID) {
      if (!this.plugin.getCategory(filter)) this.filter = "all";
    }
    this.clearSelection();
    this.updateNavActive();
    this.renderGrid();
    const main = this.bodyEl().querySelector<HTMLElement>(".vl-main");
    if (main) main.scrollTop = 0;
  }

  private updateNavActive(): void {
    for (const [id, item] of this.navItems) {
      item.toggleClass("is-active", id === this.filter);
    }
  }

  private renderMain(root: HTMLElement): void {
    const main = root.createDiv({ cls: "vl-main" });
    const header = main.createDiv({ cls: "vl-main-header" });
    const toolbar = header.createDiv({ cls: "vl-toolbar" });
    const heading = toolbar.createDiv({ cls: "vl-heading" });
    this.headingEl = heading.createEl("h2", { text: this.filterName() });
    this.countEl = heading.createSpan({ cls: "vl-count" });

    const actions = toolbar.createDiv({ cls: "vl-toolbar-actions" });
    const search = actions.createDiv({ cls: "vl-search" });
    const searchIcon = search.createSpan({ cls: "vl-search-icon" });
    setIcon(searchIcon, "search");
    this.searchInput = search.createEl("input", {
      type: "search",
      cls: "vl-search-input",
      attr: { placeholder: t("search.placeholder") }
    });
    this.searchInput.value = this.query;
    this.clearSearchEl = search.createSpan({ cls: "vl-search-clear" });
    setIcon(this.clearSearchEl, "x");
    this.clearSearchEl.toggleClass("is-hidden", !this.query);
    this.clearSearchEl.addEventListener("click", () => {
      this.query = "";
      this.searchInput.value = "";
      this.clearSearchEl.addClass("is-hidden");
      this.renderGrid();
      this.searchInput.focus();
    });
    this.searchInput.addEventListener("input", () => {
      this.query = this.searchInput.value;
      this.clearSelection();
      this.clearSearchEl.toggleClass("is-hidden", !this.query);
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.renderGrid(), 120);
    });

    const sort = actions.createEl("select", {
      cls: "dropdown vl-sort",
      attr: { "aria-label": t("sort.newest") }
    });
    const sortOptions: Array<{ value: SortMode; key: MessageKey }> = [
      { value: "newest", key: "sort.newest" },
      { value: "oldest", key: "sort.oldest" },
      { value: "title-asc", key: "sort.titleAsc" },
      { value: "title-desc", key: "sort.titleDesc" }
    ];
    for (const option of sortOptions) {
      sort.createEl("option", { text: t(option.key), value: option.value });
    }
    sort.value = this.plugin.data.settings.sort;
    sort.addEventListener("change", () => {
      void this.plugin.setSort(sort.value as SortMode);
      this.renderGrid();
    });

    const add = actions.createEl("button", { cls: "vl-toolbar-add mod-cta", attr: { type: "button" } });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("action.add") });
    add.addEventListener("click", () => this.openAdd());

    this.buildSelectionBar(header);
    this.buildTagFilter(header);
    this.gridWrap = main.createDiv({ cls: "vl-grid-wrap" });
    this.gridWrap.addEventListener("pointerdown", (event) => this.onGridPointerDown(event));
    this.gridWrap.addEventListener(
      "click",
      (event) => {
        if (!this.blockNextClick) return;
        this.blockNextClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
    this.updateNavActive();
  }

  private filterName(): string {
    if (this.filter === "all") return t("nav.all");
    if (this.filter === "favorites") return t("nav.favorites");
    if (this.filter === UNCATEGORIZED_ID) return t("nav.uncategorized");
    return this.plugin.categoryName(this.filter);
  }

  private buildSelectionBar(parent: HTMLElement): void {
    this.selectionBar = parent.createDiv({ cls: "vl-selection-bar" });
    const head = this.selectionBar.createDiv({ cls: "vl-selection-head" });
    this.selectionCountEl = head.createSpan({ cls: "vl-selection-count" });

    const quick = head.createDiv({ cls: "vl-selection-quick" });
    this.selectionButton(quick, "check-check", t("selection.selectAll"), () => this.selectAllVisible());
    this.selectionButton(quick, "repeat-2", t("selection.invert"), () => this.invertSelection());
    this.selectionButton(quick, "x", t("selection.clear"), () => this.clearSelection());

    const actions = this.selectionBar.createDiv({ cls: "vl-selection-actions" });
    this.batchCategorySelect = actions.createEl("select", {
      cls: "dropdown vl-batch-category",
      attr: { "aria-label": t("selection.moveTo") }
    });
    this.batchCategorySelect.createEl("option", { text: t("selection.moveTo"), value: "", attr: { disabled: "true", selected: "true" } });
    this.batchCategorySelect.createEl("option", {
      text: t("category.uncategorizedName"),
      value: UNCATEGORIZED_ID
    });
    for (const category of this.plugin.data.categories) {
      this.batchCategorySelect.createEl("option", { text: category.name, value: category.id });
    }
    this.batchCategorySelect.addEventListener("change", () => {
      const value = this.batchCategorySelect.value;
      this.batchCategorySelect.value = "";
      if (value) void this.batchSetCategory(value);
    });

    this.selectionButton(actions, "star", t("selection.favorite"), () => void this.batchFavorite(true));
    this.selectionButton(actions, "star-off", t("selection.unfavorite"), () => void this.batchFavorite(false));
    this.selectionButton(actions, "pencil", t("selection.rename"), () => this.openBatchRename());
    this.selectionButton(actions, "trash-2", t("selection.delete"), () => this.confirmBatchDelete(), "is-danger");

    this.selectionBar.createDiv({ text: t("selection.hint"), cls: "vl-selection-hint" });
  }

  private selectionButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    className = ""
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-selection-btn ${className}`.trim(),
      attr: { type: "button" }
    });
    setIcon(button.createSpan({ cls: "vl-btn-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", onClick);
  }

  private buildTagFilter(parent: HTMLElement): void {
    this.tagFilterBar = parent.createDiv({ cls: "vl-tag-filter" });
    this.tagFilterBar.createSpan({ text: t("tag.filter"), cls: "vl-tag-filter-label" });
    this.tagFilterChips = this.tagFilterBar.createDiv({ cls: "vl-tag-filter-chips" });

    if (this.plugin.data.tags.length === 0) {
      this.tagFilterChips.createSpan({ text: t("tag.noTags"), cls: "vl-tag-filter-empty" });
    }

    for (const tag of this.plugin.data.tags) {
      const chip = this.tagFilterChips.createEl("button", {
        cls: "vl-tag-chip",
        attr: {
          type: "button",
          "data-tag-name": tag.name,
          "aria-pressed": "false"
        }
      });
      const dot = chip.createSpan({ cls: "vl-tag-dot" });
      dot.style.backgroundColor = tag.color;
      chip.createSpan({ text: tag.name });
      chip.addEventListener("click", () => this.toggleTagFilter(tag.name));
    }

    const controls = this.tagFilterBar.createDiv({ cls: "vl-tag-filter-controls" });
    const mode = controls.createDiv({ cls: "vl-tag-mode" });
    mode.createSpan({ text: t("tag.matchStrength"), cls: "vl-tag-mode-label" });
    for (const value of ["any", "all"] as const) {
      const button = mode.createEl("button", {
        text: value === "any" ? t("tag.filterAny") : t("tag.filterAll"),
        attr: {
          type: "button",
          "data-tag-mode": value,
          title: value === "any" ? t("tag.matchAnyHint") : t("tag.matchAllHint")
        }
      });
      button.addEventListener("click", () => void this.setTagMatchMode(value));
      this.tagModeButtons.set(value, button);
    }

    this.tagClearButton = controls.createEl("button", {
      cls: "vl-tag-filter-button",
      text: t("tag.filterClear"),
      attr: { type: "button" }
    });
    this.tagClearButton.addEventListener("click", () => this.clearTagFilter());

    const manage = controls.createEl("button", {
      cls: "vl-tag-filter-button",
      attr: { type: "button", title: t("tag.manage"), "aria-label": t("tag.manage") }
    });
    setIcon(manage, "settings-2");
    manage.addEventListener("click", () => this.openTagManager());

    this.updateTagFilterUi();
  }

  private updateTagFilterUi(): void {
    if (!this.tagFilterBar) return;
    for (const chip of Array.from(this.tagFilterChips.querySelectorAll(".vl-tag-chip")) as HTMLElement[]) {
      const active = this.selectedTags.has(chip.dataset.tagName || "");
      chip.toggleClass("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    }
    const mode = this.plugin.data.settings.tagMatchMode;
    for (const [value, button] of this.tagModeButtons) {
      button.toggleClass("is-active", value === mode);
    }
    this.tagClearButton.toggleClass("is-hidden", this.selectedTags.size === 0);
  }

  private toggleTagFilter(name: string): void {
    if (this.selectedTags.has(name)) {
      this.selectedTags.delete(name);
    } else {
      this.selectedTags.add(name);
    }
    this.updateTagFilterUi();
    this.renderGrid();
  }

  private clearTagFilter(): void {
    this.selectedTags.clear();
    this.updateTagFilterUi();
    this.renderGrid();
  }

  private async setTagMatchMode(mode: "any" | "all"): Promise<void> {
    await this.plugin.setTagMatchMode(mode);
    this.updateTagFilterUi();
    this.renderGrid();
  }

  private openTagManager(): void {
    new TagManagerModal(this.app, this.plugin, () => {
      this.refresh();
    }).open();
  }

  private updateSelectionUi(): void {
    if (!this.selectionBar) return;
    const count = this.selectedIds.size;
    this.selectionBar.toggleClass("is-empty", count === 0);
    this.selectionCountEl.setText(t("selection.selected", { count }));

    const quick = this.selectionBar.querySelectorAll<HTMLButtonElement>(".vl-selection-quick button");
    quick.forEach((button, index) => {
      button.disabled = index < 2 ? this.visibleVideoIds.length === 0 : count === 0;
    });
    this.batchCategorySelect.disabled = count === 0;
    const actionButtons = this.selectionBar.querySelectorAll<HTMLButtonElement>(".vl-selection-actions button");
    actionButtons.forEach((button) => {
      button.disabled = count === 0;
    });

    for (const card of Array.from(this.gridWrap.querySelectorAll(".vl-card")) as HTMLElement[]) {
      const id = card.dataset.videoId || "";
      const selected = this.selectedIds.has(id);
      card.toggleClass("is-selected", selected);
      const check = card.querySelector(".vl-card-check") as HTMLElement | null;
      if (check) {
        check.toggleClass("is-checked", selected);
        check.setAttribute("aria-pressed", selected ? "true" : "false");
        check.setAttribute("title", selected ? t("selection.uncheck") : t("selection.check"));
        setIcon(check, selected ? "check" : "square");
      }
    }
  }

  private clearSelection(): void {
    this.selectedIds.clear();
    this.lastSelectedId = null;
    this.updateSelectionUi();
  }

  private selectAllVisible(): void {
    this.selectedIds = new Set(this.visibleVideoIds);
    this.lastSelectedId = this.visibleVideoIds[this.visibleVideoIds.length - 1] || null;
    this.updateSelectionUi();
  }

  private invertSelection(): void {
    this.selectedIds = new Set(this.visibleVideoIds.filter((id) => !this.selectedIds.has(id)));
    this.lastSelectedId = this.visibleVideoIds[this.visibleVideoIds.length - 1] || null;
    this.updateSelectionUi();
  }

  private toggleSelection(id: string, event: MouseEvent): void {
    if (event.shiftKey && this.lastSelectedId) {
      const start = this.visibleVideoIds.indexOf(this.lastSelectedId);
      const end = this.visibleVideoIds.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        for (let index = from; index <= to; index += 1) {
          this.selectedIds.add(this.visibleVideoIds[index]);
        }
        this.lastSelectedId = id;
        this.updateSelectionUi();
        return;
      }
    }

    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.lastSelectedId = id;
    this.updateSelectionUi();
  }

  private selectedVideos(): VideoItem[] {
    return this.plugin.data.videos.filter((video) => this.selectedIds.has(video.id));
  }

  private async batchSetCategory(categoryId: string): Promise<void> {
    const ids = new Set(this.selectedIds);
    if (ids.size === 0) return;
    await this.plugin.updateVideos(ids, (video) => {
      video.categoryId = categoryId;
    });
    new Notice(t("selection.categoryChanged", { count: ids.size }));
    this.clearSelection();
  }

  private async batchFavorite(favorite: boolean): Promise<void> {
    const ids = new Set(this.selectedIds);
    if (ids.size === 0) return;
    await this.plugin.updateVideos(ids, (video) => {
      video.favorite = favorite;
    });
    new Notice(t("selection.favoriteChanged"));
    this.clearSelection();
  }

  private openBatchRename(): void {
    const count = this.selectedIds.size;
    if (count === 0) return;
    new BatchRenameModal(this.app, count, (find, replace) => {
      void (async () => {
        const ids = new Set(this.selectedIds);
        let changed = 0;
        await this.plugin.updateVideos(ids, (video) => {
          if (!video.title.includes(find)) return;
          video.title = video.title.split(find).join(replace).trim() || t("misc.untitled");
          changed += 1;
        });
        new Notice(
          changed > 0
            ? t("selection.renamed", { count: changed })
            : t("selection.noMatch", { find })
        );
        this.clearSelection();
      })();
    }).open();
  }

  private confirmBatchDelete(): void {
    const videos = this.selectedVideos();
    if (videos.length === 0) return;
    new ConfirmModal(this.app, {
      title: t("selection.deleteTitle", { count: videos.length }),
      description: t("selection.deleteDesc"),
      confirmText: t("confirm.delete"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.deleteVideos(videos);
        new Notice(t("selection.deleted", { count: videos.length }));
        this.clearSelection();
      }
    }).open();
  }

  private onGridPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, a, .vl-preview-audio")) return;

    this.removeMarqueeListeners();
    this.marqueeEl?.remove();
    this.marqueeEl = null;
    this.marqueeStart = {
      x: event.clientX,
      y: event.clientY,
      mode: event.ctrlKey || event.metaKey ? "subtract" : event.shiftKey ? "add" : "toggle"
    };
    this.marqueeMoved = false;

    window.addEventListener("pointermove", this.marqueeMoveHandler);
    window.addEventListener("pointerup", this.marqueeUpHandler);
  }

  private onMarqueeMove(event: PointerEvent): void {
    if (!this.marqueeStart) return;
    const dx = event.clientX - this.marqueeStart.x;
    const dy = event.clientY - this.marqueeStart.y;
    if (!this.marqueeMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

    if (!this.marqueeMoved) {
      this.marqueeMoved = true;
      this.blockNextClick = true;
      const marquee = document.createElement("div");
      marquee.className = "vl-marquee";
      document.body.appendChild(marquee);
      this.marqueeEl = marquee;
      this.gridWrap.addClass("is-marquee-active");
    }
    event.preventDefault();

    const left = Math.min(this.marqueeStart.x, event.clientX);
    const top = Math.min(this.marqueeStart.y, event.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    if (this.marqueeEl) {
      this.marqueeEl.style.left = `${left}px`;
      this.marqueeEl.style.top = `${top}px`;
      this.marqueeEl.style.width = `${width}px`;
      this.marqueeEl.style.height = `${height}px`;
    }

    const hits = new Set(this.marqueeHits({ left, top, right: left + width, bottom: top + height }));
    for (const card of Array.from(this.gridWrap.querySelectorAll(".vl-card")) as HTMLElement[]) {
      card.toggleClass("is-marquee-hit", hits.has(card.dataset.videoId || ""));
    }
  }

  private onMarqueeUp(event: PointerEvent): void {
    if (!this.marqueeStart) return;
    const mode = this.marqueeStart.mode;
    const hits = this.marqueeMoved
      ? this.marqueeHits({
          left: Math.min(this.marqueeStart.x, event.clientX),
          top: Math.min(this.marqueeStart.y, event.clientY),
          right: Math.max(this.marqueeStart.x, event.clientX),
          bottom: Math.max(this.marqueeStart.y, event.clientY)
        })
      : [];

    this.removeMarqueeListeners();
    this.marqueeEl?.remove();
    this.marqueeEl = null;
    this.marqueeStart = null;
    this.gridWrap.removeClass("is-marquee-active");

    for (const card of Array.from(this.gridWrap.querySelectorAll(".vl-card")) as HTMLElement[]) {
      card.removeClass("is-marquee-hit");
    }

    if (!this.marqueeMoved) return;
    this.marqueeMoved = false;
    if (mode === "add") {
      for (const id of hits) this.selectedIds.add(id);
    } else if (mode === "subtract") {
      for (const id of hits) this.selectedIds.delete(id);
    } else {
      for (const id of hits) {
        if (this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
        } else {
          this.selectedIds.add(id);
        }
      }
    }
    this.lastSelectedId = hits[hits.length - 1] || null;
    this.updateSelectionUi();
    window.setTimeout(() => {
      this.blockNextClick = false;
    }, 0);
  }

  private marqueeHits(rect: { left: number; top: number; right: number; bottom: number }): string[] {
    const hits: string[] = [];
    for (const card of Array.from(this.gridWrap.querySelectorAll(".vl-card")) as HTMLElement[]) {
      const cardRect = card.getBoundingClientRect();
      const intersects =
        cardRect.left < rect.right &&
        cardRect.right > rect.left &&
        cardRect.top < rect.bottom &&
        cardRect.bottom > rect.top;
      if (intersects && card.dataset.videoId) hits.push(card.dataset.videoId);
    }
    return hits;
  }

  private removeMarqueeListeners(): void {
    window.removeEventListener("pointermove", this.marqueeMoveHandler);
    window.removeEventListener("pointerup", this.marqueeUpHandler);
  }

  private filteredVideos(): VideoItem[] {
    const query = this.query.trim().toLowerCase();
    let videos = this.plugin.data.videos.filter((video) => {
      if (this.filter === "favorites" && !video.favorite) return false;
      if (
        this.filter !== "all" &&
        this.filter !== "favorites" &&
        (video.categoryId || UNCATEGORIZED_ID) !== this.filter
      ) {
        return false;
      }
      if (this.selectedTags.size > 0) {
        const videoTags = new Set(video.tags.map((tag) => tag.toLowerCase()));
        const selected = [...this.selectedTags].map((tag) => tag.toLowerCase());
        const matches =
          this.plugin.data.settings.tagMatchMode === "all"
            ? selected.every((tag) => videoTags.has(tag))
            : selected.some((tag) => videoTags.has(tag));
        if (!matches) return false;
      }
      if (!query) return true;
      const haystack = [
        video.title,
        video.author,
        video.url,
        video.notes,
        video.tags.join(" "),
        this.plugin.categoryName(video.categoryId)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const mode = this.plugin.data.settings.sort;
    videos = [...videos].sort((a, b) => {
      if (mode === "oldest") return a.createdAt - b.createdAt;
      if (mode === "title-asc") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      if (mode === "title-desc") return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
      return b.createdAt - a.createdAt;
    });
    return videos;
  }

  private renderGrid(): void {
    if (!this.gridWrap) return;
    const videos = this.filteredVideos();
    this.visibleVideoIds = videos.map((video) => video.id);
    const existing = new Set(this.visibleVideoIds);
    for (const id of [...this.selectedIds]) {
      if (!existing.has(id)) this.selectedIds.delete(id);
    }
    this.headingEl.setText(this.filterName());
    this.countEl.setText(t(videos.length === 1 ? "count.one" : "count.many", { count: videos.length }));
    this.gridWrap.empty();

    if (videos.length === 0) {
      this.renderEmpty();
      this.updateSelectionUi();
      return;
    }

    const grid = this.gridWrap.createDiv({ cls: "vl-grid" });
    for (const video of videos) {
      this.renderCard(grid, video);
    }
    this.updateSelectionUi();
  }

  private renderEmpty(): void {
    const hasVideos = this.plugin.data.videos.length > 0;
    const empty = this.gridWrap.createDiv({ cls: "vl-empty" });
    const icon = empty.createDiv({ cls: "vl-empty-icon" });
    setIcon(icon, hasVideos ? "search-x" : "film");
    empty.createEl("h3", {
      text: hasVideos ? t("empty.filterTitle") : t("empty.libraryTitle")
    });
    empty.createEl("p", {
      text: hasVideos ? t("empty.filterDesc") : t("empty.libraryDesc")
    });

    if (!hasVideos) {
      const add = empty.createEl("button", { text: t("empty.cta"), cls: "mod-cta" });
      add.addEventListener("click", () => this.openAdd());
    } else {
      const clear = empty.createEl("button", { text: t("action.clearFilters") });
      clear.addEventListener("click", () => {
        this.filter = "all";
        this.query = "";
        if (this.searchInput) this.searchInput.value = "";
        if (this.clearSearchEl) this.clearSearchEl.addClass("is-hidden");
        this.updateNavActive();
        this.renderGrid();
      });
    }
  }

  private renderCard(grid: HTMLElement, video: VideoItem): void {
    const card = grid.createDiv({
      cls: "vl-card",
      attr: { tabindex: "0", role: "button", "aria-label": video.title }
    });
    card.dataset.provider = video.provider;
    card.dataset.videoId = video.id;
    const cover = card.createDiv({ cls: "vl-card-cover" });
    const check = cover.createEl("button", {
      cls: "vl-card-check",
      attr: {
        type: "button",
        title: t("selection.check"),
        "aria-label": t("selection.check"),
        "aria-pressed": "false"
      }
    });
    setIcon(check, "square");
    check.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleSelection(video.id, event);
    });

    const placeholder = cover.createDiv({ cls: "vl-card-placeholder" });
    setIcon(placeholder.createSpan({ cls: "vl-card-placeholder-icon" }), "film");

    if (video.coverPath) {
      const img = cover.createEl("img", {
        cls: "vl-card-image is-hidden",
        attr: { alt: "", loading: "lazy", decoding: "async", draggable: "false" }
      });
      void this.plugin.coverStore.getUrl(video.coverPath).then((url) => {
        if (!url) return;
        img.src = url;
        img.removeClass("is-hidden");
        placeholder.addClass("is-hidden");
      });
      img.addEventListener("error", () => {
        img.addClass("is-hidden");
        placeholder.removeClass("is-hidden");
      });
    }

    cover.createSpan({ text: providerName(video.provider), cls: "vl-provider-badge vl-card-provider" });
    if (video.duration) {
      cover.createSpan({ text: formatDuration(video.duration), cls: "vl-card-duration" });
    }

    const favorite = cover.createEl("button", {
      cls: `vl-card-favorite ${video.favorite ? "is-favorite" : ""}`,
      attr: {
        type: "button",
        title: video.favorite ? t("action.unfavorite") : t("action.favorite"),
        "aria-label": video.favorite ? t("action.unfavorite") : t("action.favorite")
      }
    });
    setIcon(favorite, "star");
    favorite.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.plugin.toggleFavorite(video);
    });

    const actions = cover.createDiv({ cls: "vl-card-actions" });
    iconButton(actions, "play", t("action.play"), () => this.openPlayer(video), "vl-card-action");
    iconButton(actions, "pencil", t("action.edit"), () => this.openEdit(video), "vl-card-action");
    if (video.url) {
      iconButton(
        actions,
        "external-link",
        t("action.openOriginal"),
        () => openExternal(this.plugin.getVideoPageUrl(video)),
        "vl-card-action"
      );
    }

    const body = card.createDiv({ cls: "vl-card-body" });
    body.createEl("h3", { text: video.title || t("misc.untitled"), cls: "vl-card-title" });

    const meta = body.createDiv({ cls: "vl-card-meta" });
    const category = this.plugin.getCategory(video.categoryId);
    const categoryEl = meta.createSpan({ cls: "vl-card-category" });
    const dot = categoryEl.createSpan({ cls: "vl-category-dot" });
    dot.style.backgroundColor = category?.color || "var(--text-faint)";
    categoryEl.createSpan({ text: this.plugin.categoryName(video.categoryId) });
    if (video.author) {
      meta.createSpan({ text: video.author, cls: "vl-card-author" });
    }

    if (video.tags.length > 0) {
      const tags = body.createDiv({ cls: "vl-card-tags" });
      for (const tag of video.tags.slice(0, 3)) {
        tags.createSpan({ text: `#${tag}`, cls: "vl-tag" });
      }
      if (video.tags.length > 3) {
        tags.createSpan({ text: `+${video.tags.length - 3}`, cls: "vl-tag vl-tag-more" });
      }
    }

    const date = body.createDiv({ cls: "vl-card-date", text: formatDate(video.createdAt) });

    const previewSource =
      video.provider === "local" || video.provider === "direct" ? this.plugin.getVideoSource(video) : null;
    let preview: HoverPreview | null = null;
    if (previewSource) {
      card.addEventListener("mouseenter", () => {
        preview?.stop();
        preview = new HoverPreview(previewSource, cover, {
          duration: video.preview?.duration,
          clips: video.preview?.clips,
          fallbackDuration: video.duration,
          muted: this.plugin.data.settings.previewMuted,
          volume: this.plugin.data.settings.previewVolume,
          onAudioChange: (muted, volume) => this.savePreviewAudio(muted, volume)
        });
        preview.start();
      });
      card.addEventListener("mouseleave", () => {
        preview?.stop();
        preview = null;
      });
    }

    card.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault();
        this.toggleSelection(video.id, event);
        return;
      }
      this.openPlayer(video);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openPlayer(video);
      }
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showContextMenu(event, video);
    });
  }

  private showContextMenu(event: MouseEvent, video: VideoItem): void {
    HoverPreview.stopActive();
    const menu = new Menu();    menu.addItem((item) =>
      item
        .setTitle(t("action.play"))
        .setIcon("play")
        .onClick(() => this.openPlayer(video))
    );
    menu.addItem((item) =>
      item
        .setTitle(t("action.edit"))
        .setIcon("pencil")
        .onClick(() => this.openEdit(video))
    );
    if (video.provider === "local" || video.provider === "direct") {
      menu.addItem((item) =>
        item
          .setTitle(t("preview.configure"))
          .setIcon("sliders-horizontal")
          .onClick(() => this.openPreviewConfig(video))
      );
    }
    if (video.url) {
      menu.addItem((item) =>
        item
          .setTitle(t("action.openOriginal"))
          .setIcon("external-link")
          .onClick(() => openExternal(this.plugin.getVideoPageUrl(video)))
      );
      menu.addItem((item) =>
        item
          .setTitle(t("menu.copyLink"))
          .setIcon("copy")
          .onClick(() => void this.copyText(this.plugin.getVideoPageUrl(video)))
      );
    }
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(t("action.delete"))
        .setIcon("trash-2")
        .onClick(() => this.confirmDelete(video))
    );
    menu.showAtMouseEvent(event);
  }

  private savePreviewAudio(muted: boolean, volume: number): void {
    this.plugin.data.settings.previewMuted = muted;
    this.plugin.data.settings.previewVolume = Math.min(1, Math.max(0, volume));
    window.clearTimeout(this.audioSaveTimer);
    this.audioSaveTimer = window.setTimeout(() => {
      this.audioSaveTimer = 0;
      void this.plugin.persist();
    }, 250);
  }

  private async copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      new Notice(t("notice.copied"));
    } catch {
      new Notice(t("error.generic"));
    }
  }

  private openAdd(): void {
    new VideoEditModal(this.app, this.plugin, null).open();
  }

  private openEdit(video: VideoItem): void {
    HoverPreview.stopActive();
    new VideoEditModal(this.app, this.plugin, video).open();
  }

  private openPlayer(video: VideoItem): void {
    HoverPreview.stopActive();
    new VideoPlayerModal(this.app, this.plugin, video).open();
  }

  private openPreviewConfig(video: VideoItem): void {
    const source = this.plugin.getVideoSource(video);
    if (!source) {
      new Notice(t("preview.onlyLocal"));
      return;
    }
    new PreviewConfigModal(
      this.app,
      source,
      video.duration,
      video.preview,
      (config) => {
        video.preview = config;
        video.updatedAt = Date.now();
        void this.plugin.updateVideo(video);
      }
    ).open();
  }

  private confirmDelete(video: VideoItem): void {
    new ConfirmModal(this.app, {
      title: t("confirm.deleteVideoTitle"),
      description: t("confirm.deleteVideoDesc", { title: video.title }),
      confirmText: t("confirm.delete"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.deleteVideo(video);
        new Notice(t("notice.deleted"));
      }
    }).open();
  }

  private openCategories(): void {
    new CategoryManagerModal(this.app, this.plugin, () => {
      this.refresh();
    }).open();
  }

  private openSettings(): void {
    const appWithSettings = this.app as unknown as {
      setting?: { open: () => void; openTabById: (id: string) => void };
    };
    try {
      appWithSettings.setting?.open();
      appWithSettings.setting?.openTabById("video-library");
    } catch {
      new Notice(t("action.settings"));
    }
  }
}
