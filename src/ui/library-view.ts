import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { ConfirmModal, formatDate, iconButton, openExternal, TextPromptModal } from "./common";
import { HoverPreview } from "./hover-preview";
import { BatchRenameModal } from "./batch-rename-modal";
import { TagManagerModal } from "./tag-manager-modal";
import { formatDuration, providerName, t, type MessageKey } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { Category, Folder, SortMode, VideoItem } from "../types";
import { UNCATEGORIZED_ID } from "../types";
import { CategoryEditModal, CategoryManagerModal } from "./category-modal";
import { VideoEditModal } from "./video-modal";
import { VideoPlayerModal } from "./player-modal";
import { PreviewConfigModal } from "./preview-config-modal";
import { FolderCoverModal } from "./folder-cover-modal";
import { MoveToFolderModal } from "./move-modal";

export const VIEW_TYPE = "video-library-view";

type Filter = string;
type HomeHeroMode = "forYou" | "played" | "recent" | "pinned" | "favorites" | "local";

export class VideoLibraryView extends ItemView {
  private filter: Filter = "home";
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
  private selectedFolderIds = new Set<string>();
  private currentFolderId: string | null = null;
  private expandedFolderIds = new Set<string>();
  private folderTreeInitialized = false;
  private lastSelectedKey: string | null = null;
  private visibleVideoIds: string[] = [];
  private visibleFolderIds: string[] = [];
  private visibleOrder: Array<{ type: "video" | "folder"; id: string }> = [];
  private selectionBar!: HTMLElement;
  private selectionCountEl!: HTMLElement;
  private batchCategorySelect!: HTMLSelectElement;
  private viewToggleButtons = new Map<"grid" | "list", HTMLButtonElement>();
  private selectedTags = new Set<string>();
  private tagFilterBar!: HTMLElement;
  private tagFilterChips!: HTMLElement;
  private tagModeButtons = new Map<"any" | "all", HTMLButtonElement>();
  private tagClearButton!: HTMLButtonElement;
  private draggingId: string | null = null;
  private dragPayload: { videos: string[]; folders: string[] } | null = null;
  private categoryDragId: string | null = null;
  private homeCarouselTimer = 0;
  private homeCarouselSeq = 0;
  private homeCarouselIndex = 0;
  private homeCarouselItems: VideoItem[] = [];
  private homeHeroMode: HomeHeroMode = "forYou";
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
    window.clearTimeout(this.homeCarouselTimer);
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
    const existingFolders = new Set(this.plugin.data.folders.map((folder) => folder.id));
    for (const id of [...this.selectedFolderIds]) {
      if (!existingFolders.has(id)) this.selectedFolderIds.delete(id);
    }
    if (this.currentFolderId && !this.plugin.getFolder(this.currentFolderId)) {
      this.currentFolderId = null;
    }
    for (const id of [...this.expandedFolderIds]) {
      if (!existingFolders.has(id)) this.expandedFolderIds.delete(id);
    }
    if (this.currentFolderId) {
      for (const folder of this.plugin.folderPath(this.currentFolderId)) {
        this.expandedFolderIds.add(folder.id);
      }
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
    window.clearTimeout(this.homeCarouselTimer);
    const body = this.bodyEl();
    body.empty();
    const root = body.createDiv({ cls: `vl-root is-size-${this.plugin.data.settings.cardSize}` });
    this.renderSidebar(root);
    if (this.filter === "home") {
      this.renderHome(root);
      return;
    }
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
    this.navItem(nav, "home", "home", t("nav.home"), this.plugin.data.videos.length);
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
        cls: "vl-nav-item vl-category-nav-item",
        attr: { role: "button", tabindex: "0", "data-category-id": category.id }
      });
      item.dataset.categoryId = category.id;
      const dot = item.createSpan({ cls: "vl-category-dot" });
      dot.setCssStyles({ backgroundColor: category.color });
      item.createSpan({ text: category.name, cls: "vl-nav-label" });
      item.createSpan({ text: String(this.plugin.categoryCount(category.id)), cls: "vl-nav-count" });
      this.bindNavItem(item, category.id);
      this.bindCategoryDrag(item, category);
      item.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showCategoryContextMenu(event, category.id);
      });
      this.navItems.set(category.id, item);
    }

    if (this.plugin.data.categories.length === 0) {
      categoryNav.createDiv({ text: t("category.empty"), cls: "vl-nav-empty" });
    }

    const folderSection = sidebar.createDiv({ cls: "vl-nav-section vl-folder-tree-section" });
    const folderHeader = folderSection.createDiv({ cls: "vl-nav-section-header" });
    folderHeader.createSpan({ text: t("nav.folders") });
    const addFolder = folderHeader.createEl("button", {
      cls: "vl-text-icon-button",
      attr: { type: "button", title: t("folder.new"), "aria-label": t("folder.new") }
    });
    setIcon(addFolder, "folder-plus");
    addFolder.addEventListener("click", () => {
      this.filter = "all";
      this.currentFolderId = null;
      this.render();
      this.promptNewFolder();
    });
    this.renderFolderTree(folderSection);

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

  private renderFolderTree(parent: HTMLElement): void {
    const tree = parent.createDiv({ cls: "vl-folder-tree" });
    const roots = this.plugin.getSubfolders(null);
    if (roots.length === 0) {
      tree.createDiv({ text: t("folder.treeEmpty"), cls: "vl-nav-empty" });
      return;
    }

    const rootRow = tree.createDiv({
      cls: `vl-folder-tree-item vl-folder-tree-root ${this.filter === "all" && !this.currentFolderId ? "is-active" : ""}`.trim(),
      attr: { role: "button", tabindex: "0" }
    });
    const rootIcon = rootRow.createSpan({ cls: "vl-nav-icon" });
    setIcon(rootIcon, "library");
    rootRow.createSpan({ text: t("move.root"), cls: "vl-nav-label" });
    rootRow.createSpan({ text: String(this.plugin.data.videos.length), cls: "vl-nav-count" });
    rootRow.addEventListener("click", () => this.openFolder(null));
    rootRow.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openFolder(null);
      }
    });
    this.bindFolderDrop(rootRow, null);

    for (const folder of roots) {
      this.renderFolderTreeNode(tree, folder, 0);
    }
    this.folderTreeInitialized = true;
  }

  private renderFolderTreeNode(parent: HTMLElement, folder: Folder, depth: number): void {
    const children = this.plugin.getSubfolders(folder.id);
    if (!this.folderTreeInitialized && depth === 0) this.expandedFolderIds.add(folder.id);
    const expanded = this.expandedFolderIds.has(folder.id);
    const active = this.filter === "all" && this.currentFolderId === folder.id;
    const wrap = parent.createDiv({ cls: "vl-folder-tree-branch" });
    const row = wrap.createDiv({
      cls: `vl-folder-tree-item ${active ? "is-active" : ""}`.trim(),
      attr: { role: "button", tabindex: "0", "data-folder-id": folder.id }
    });
    row.setCssStyles({ paddingLeft: `${6 + depth * 12}px` });

    let toggle: HTMLButtonElement | null = null;
    if (children.length > 0) {
      toggle = row.createEl("button", {
        cls: "vl-folder-tree-toggle",
        attr: {
          type: "button",
          "aria-label": expanded ? t("folder.collapse") : t("folder.expand"),
          title: expanded ? t("folder.collapse") : t("folder.expand")
        }
      });
      setIcon(toggle, expanded ? "chevron-down" : "chevron-right");
    } else {
      row.createSpan({ cls: "vl-folder-tree-spacer" });
    }

    const icon = row.createSpan({ cls: "vl-folder-tree-icon" });
    setIcon(icon, "folder");
    row.createSpan({ text: folder.name, cls: "vl-nav-label" });
    row.createSpan({ text: String(this.plugin.folderVideosRecursive(folder.id).length), cls: "vl-nav-count" });

    row.addEventListener("click", () => this.openFolder(folder.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.openFolder(folder.id);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.ensureContextSelection("folder", folder.id, event);
      this.showFolderContextMenu(event, folder);
    });
    this.bindFolderDrop(row, folder.id);

    if (children.length === 0) return;
    const childWrap = wrap.createDiv({ cls: "vl-folder-tree-children" });
    childWrap.toggleClass("is-collapsed", !expanded);
    for (const child of children) this.renderFolderTreeNode(childWrap, child, depth + 1);

    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = !this.expandedFolderIds.has(folder.id);
      if (next) this.expandedFolderIds.add(folder.id);
      else this.expandedFolderIds.delete(folder.id);
      childWrap.toggleClass("is-collapsed", !next);
      setIcon(toggle, next ? "chevron-down" : "chevron-right");
      const label = next ? t("folder.collapse") : t("folder.expand");
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
    });
  }

  private setFilter(filter: Filter): void {
    const wasHome = this.filter === "home";
    this.filter = filter;
    if (filter !== "all" && filter !== "favorites" && filter !== UNCATEGORIZED_ID && filter !== "home") {
      if (!this.plugin.getCategory(filter)) this.filter = "all";
    }
    this.currentFolderId = null;
    this.clearSelection();
    this.updateNavActive();
    if (this.filter === "home" || wasHome) {
      this.render();
      return;
    }
    this.renderGrid();
    const main = this.bodyEl().querySelector<HTMLElement>(".vl-main");
    if (main) main.scrollTop = 0;
  }

  private bindCategoryDrag(item: HTMLElement, category: Category): void {
    item.draggable = true;
    item.setAttribute("draggable", "true");
    item.addEventListener("dragstart", (event) => {
      this.categoryDragId = category.id;
      item.addClass("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", category.id);
      }
    });
    item.addEventListener("dragover", (event) => {
      if (!this.categoryDragId || this.categoryDragId === category.id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const rect = item.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      for (const nav of Array.from(item.parentElement?.children || [])) {
        nav.classList.remove("drop-before", "drop-after");
      }
      item.addClass(after ? "drop-after" : "drop-before");
    });
    item.addEventListener("dragleave", () => item.removeClass("drop-before", "drop-after"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const dragged = this.categoryDragId;
      const after = item.classList.contains("drop-after");
      this.clearCategoryDragState();
      if (!dragged || dragged === category.id) return;
      const ids = this.plugin.data.categories.map((candidate) => candidate.id);
      const from = ids.indexOf(dragged);
      if (from < 0) return;
      ids.splice(from, 1);
      const target = ids.indexOf(category.id);
      if (target < 0) return;
      ids.splice(after ? target + 1 : target, 0, dragged);
      void this.plugin.reorderCategories(ids);
    });
    item.addEventListener("dragend", () => this.clearCategoryDragState());
  }

  private clearCategoryDragState(): void {
    this.categoryDragId = null;
    for (const item of Array.from(this.bodyEl().querySelectorAll<HTMLElement>(".vl-category-nav-item"))) {
      item.removeClass("is-dragging", "drop-before", "drop-after");
    }
  }

  private showCategoryContextMenu(event: MouseEvent, categoryId: string): void {
    const category = this.plugin.getCategory(categoryId);
    if (!category) return;
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(t("action.rename"))
        .setIcon("pencil")
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, category, () => this.refresh()).open();
        })
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(t("action.delete"))
        .setIcon("trash-2")
        .onClick(() => this.confirmDeleteCategory(category.id))
    );
    menu.showAtMouseEvent(event);
  }

  private confirmDeleteCategory(categoryId: string): void {
    const category = this.plugin.getCategory(categoryId);
    if (!category) return;
    const count = this.plugin.categoryCount(categoryId);
    new ConfirmModal(this.app, {
      title: t("category.deleteTitle"),
      description: t("category.deleteDesc", { name: category.name, count }),
      confirmText: t("category.deleteConfirm"),
      danger: true,
      onConfirm: async () => {
        await this.plugin.deleteCategory(categoryId);
        new Notice(t("category.deleted"));
        if (this.filter === categoryId) this.filter = "all";
        this.refresh();
      }
    }).open();
  }

  private updateNavActive(): void {
    for (const [id, item] of this.navItems) {
      item.toggleClass("is-active", id === this.filter);
    }
    for (const row of Array.from(this.bodyEl().querySelectorAll<HTMLElement>(".vl-folder-tree-item"))) {
      const folderId = row.dataset.folderId || null;
      const active =
        this.filter === "all" &&
        (folderId ? this.currentFolderId === folderId : this.currentFolderId === null);
      row.toggleClass("is-active", active);
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
      { value: "title-desc", key: "sort.titleDesc" },
      { value: "manual", key: "sort.manual" }
    ];
    for (const option of sortOptions) {
      sort.createEl("option", { text: t(option.key), value: option.value });
    }
    sort.value = this.plugin.data.settings.sort;
    sort.addEventListener("change", () => {
      void this.plugin.setSort(sort.value as SortMode);
      this.renderGrid();
    });

    const viewSwitch = actions.createDiv({ cls: "vl-view-switch" });
    this.viewToggleButtons.clear();
    const currentMode = this.plugin.data.settings.viewMode === "list" ? "list" : "grid";
    for (const mode of ["grid", "list"] as const) {
      const button = viewSwitch.createEl("button", {
        cls: `vl-view-switch-button ${currentMode === mode ? "is-active" : ""}`.trim(),
        attr: {
          type: "button",
          title: t(mode === "grid" ? "view.grid" : "view.list"),
          "aria-label": t(mode === "grid" ? "view.grid" : "view.list"),
          "aria-pressed": currentMode === mode ? "true" : "false"
        }
      });
      setIcon(button, mode === "grid" ? "layout-grid" : "list");
      button.addEventListener("click", () => {
        void this.plugin.setViewMode(mode);
      });
      this.viewToggleButtons.set(mode, button);
    }

    const add = actions.createEl("button", { cls: "vl-toolbar-add mod-cta", attr: { type: "button" } });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("action.add") });
    add.addEventListener("click", () => this.openAdd());

    this.buildSelectionBar(header);
    this.buildBreadcrumb(header);
    this.buildTagFilter(header);
    this.gridWrap = main.createDiv({ cls: "vl-grid-wrap" });
    this.gridWrap.addEventListener("pointerdown", (event) => this.onGridPointerDown(event));
    this.gridWrap.addEventListener("contextmenu", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".vl-card")) return;
      event.preventDefault();
      this.showEmptyContextMenu(event);
    });
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
    if (this.filter === "home") return t("nav.home");
    if (this.filter === "all") {
      if (this.currentFolderId) return this.plugin.getFolder(this.currentFolderId)?.name || t("nav.all");
      return t("nav.all");
    }
    if (this.filter === "favorites") return t("nav.favorites");
    if (this.filter === UNCATEGORIZED_ID) return t("nav.uncategorized");
    return this.plugin.categoryName(this.filter);
  }

  private renderHome(root: HTMLElement): void {
    const main = root.createDiv({ cls: "vl-main vl-home" });
    main.addEventListener("contextmenu", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".vl-home-card")) return;
      event.preventDefault();
      this.showEmptyContextMenu(event);
    });
    const header = main.createDiv({ cls: "vl-home-header" });
    const title = header.createDiv({ cls: "vl-home-title" });
    title.createEl("h1", { text: t("home.title") });
    title.createEl("p", { text: t("home.subtitle") });
    const actions = header.createDiv({ cls: "vl-home-header-actions" });
    const add = actions.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
    setIcon(add.createSpan({ cls: "vl-btn-icon" }), "plus");
    add.createSpan({ text: t("action.addVideo") });
    add.addEventListener("click", () => this.openAdd());
    const library = actions.createEl("button", { attr: { type: "button" } });
    setIcon(library.createSpan({ cls: "vl-btn-icon" }), "library");
    library.createSpan({ text: t("nav.all") });
    library.addEventListener("click", () => this.setFilter("all"));

    const allVideos = [...this.plugin.data.videos];
    if (allVideos.length === 0) {
      const empty = main.createDiv({ cls: "vl-home-empty" });
      const icon = empty.createDiv({ cls: "vl-home-empty-icon" });
      setIcon(icon, "clapperboard");
      empty.createEl("h2", { text: t("empty.libraryTitle") });
      empty.createEl("p", { text: t("empty.libraryDesc") });
      const cta = empty.createEl("button", { text: t("empty.cta"), cls: "mod-cta" });
      cta.addEventListener("click", () => this.openAdd());
      this.updateNavActive();
      return;
    }

    const pinned = allVideos
      .filter((video) => video.pinned)
      .sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt));
    const favorites = allVideos.filter((video) => video.favorite);
    const recent = [...allVideos].sort((a, b) => b.createdAt - a.createdAt);
    const played = allVideos
      .filter((video) => video.lastPlayedAt)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
    const pool: VideoItem[] = [];
    const seen = new Set<string>();
    for (const video of [...played, ...pinned, ...favorites, ...recent]) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      pool.push(video);
    }
    const localVideos = allVideos.filter((video) => video.provider === "local");
    const pools: Record<HomeHeroMode, VideoItem[]> = {
      forYou: pool.slice(0, 6),
      played: played.slice(0, 6),
      recent: recent.slice(0, 6),
      pinned: pinned.slice(0, 6),
      favorites: favorites.slice(0, 6),
      local: localVideos.slice(0, 6)
    };
    if (!pools[this.homeHeroMode] || pools[this.homeHeroMode].length === 0) {
      this.homeHeroMode = "forYou";
    }
    this.homeCarouselItems = pools[this.homeHeroMode].slice(0, 6);
    this.renderHeroCarousel(main);

    if (pinned.length > 0) this.renderHomeRow(main, t("home.pinned"), pinned, "pin", "all");
    this.renderHomeRow(main, t("home.recent"), recent.slice(0, 16), "clock", "all");
    if (favorites.length > 0) {
      this.renderHomeRow(main, t("home.favorites"), favorites, "star", "favorites");
    }
    if (localVideos.length > 0) this.renderHomeRow(main, t("home.local"), localVideos, "file-video", "all");
    for (const category of this.plugin.data.categories) {
      const items = recent.filter((video) => (video.categoryId || UNCATEGORIZED_ID) === category.id);
      if (items.length > 0) this.renderHomeRow(main, category.name, items, "folder", category.id, category.color);
    }
    this.updateNavActive();
  }

  private homeHeroCount(mode: HomeHeroMode): number {
    const videos = this.plugin.data.videos;
    if (mode === "forYou") return videos.length;
    if (mode === "played") return videos.filter((video) => video.lastPlayedAt).length;
    if (mode === "pinned") return videos.filter((video) => video.pinned).length;
    if (mode === "favorites") return videos.filter((video) => video.favorite).length;
    if (mode === "local") return videos.filter((video) => video.provider === "local").length;
    return videos.length;
  }

  private renderHeroCarousel(parent: HTMLElement): void {
    const videos = this.homeCarouselItems;
    if (videos.length === 0) return;
    const hero = parent.createDiv({ cls: "vl-home-hero" });
    const switchWrap = hero.createDiv({ cls: "vl-home-hero-switch" });
    switchWrap.createSpan({ text: t("home.showcase"), cls: "vl-home-hero-switch-label" });
    const switchSelect = switchWrap.createEl("select", {
      cls: "dropdown vl-home-hero-select",
      attr: { "aria-label": t("home.showcase") }
    });
    const modes: Array<{ value: HomeHeroMode; key: MessageKey }> = [
      { value: "forYou", key: "home.showcaseForYou" },
      { value: "played", key: "home.showcasePlayed" },
      { value: "recent", key: "home.showcaseRecent" },
      { value: "pinned", key: "home.showcasePinned" },
      { value: "favorites", key: "home.showcaseFavorites" },
      { value: "local", key: "home.showcaseLocal" }
    ];
    for (const mode of modes) {
      const option = switchSelect.createEl("option", { text: t(mode.key), value: mode.value });
      if (this.homeHeroCount(mode.value) === 0) option.disabled = true;
    }
    switchSelect.value = this.homeHeroMode;
    switchSelect.addEventListener("change", () => {
      this.homeHeroMode = switchSelect.value as HomeHeroMode;
      this.render();
    });
    const background = hero.createDiv({ cls: "vl-home-hero-bg" });
    const image = background.createEl("img", { attr: { alt: "" } });
    const content = hero.createDiv({ cls: "vl-home-hero-content" });
    const eyebrow = content.createDiv({ cls: "vl-home-hero-eyebrow" });
    const title = content.createEl("h2");
    const meta = content.createDiv({ cls: "vl-home-hero-meta" });
    const description = content.createDiv({ cls: "vl-home-hero-desc is-hidden" });
    const buttons = content.createDiv({ cls: "vl-home-hero-buttons" });
    const play = buttons.createEl("button", { cls: "vl-home-play mod-cta", attr: { type: "button" } });
    setIcon(play.createSpan({ cls: "vl-btn-icon" }), "play");
    play.createSpan({ text: t("action.play") });
    play.addEventListener("click", () => {
      const video = this.homeCarouselItems[this.homeCarouselIndex];
      if (video) this.openPlayer(video);
    });
    const details = buttons.createEl("button", { text: t("action.edit"), attr: { type: "button" } });
    details.addEventListener("click", () => {
      const video = this.homeCarouselItems[this.homeCarouselIndex];
      if (video) this.openEdit(video);
    });

    const dots = hero.createDiv({ cls: "vl-home-hero-dots" });
    const arrows = hero.createDiv({ cls: "vl-home-hero-arrows" });
    const previous = arrows.createEl("button", { attr: { type: "button", "aria-label": t("home.previous") } });
    setIcon(previous, "chevron-left");
    const next = arrows.createEl("button", { attr: { type: "button", "aria-label": t("home.next") } });
    setIcon(next, "chevron-right");
    if (videos.length < 2) {
      dots.addClass("is-hidden");
      arrows.addClass("is-hidden");
    }

    const show = (index: number): void => {
      const length = this.homeCarouselItems.length;
      if (length === 0) return;
      this.homeCarouselIndex = (index + length) % length;
      const video = this.homeCarouselItems[this.homeCarouselIndex];
      const seq = ++this.homeCarouselSeq;
      hero.removeClass("is-no-cover");
      image.removeAttribute("src");
      if (video.coverPath) {
        void this.plugin.coverStore.getUrl(video.coverPath).then((url) => {
          if (seq !== this.homeCarouselSeq) return;
          if (url) image.src = url;
          else hero.addClass("is-no-cover");
        });
      } else if (video.thumbnailUrl) {
        image.src = video.thumbnailUrl;
      } else {
        hero.addClass("is-no-cover");
      }

      eyebrow.empty();
      if (video.pinned) {
        setIcon(eyebrow.createSpan(), "pin");
        eyebrow.createSpan({ text: t("home.featuredPinned") });
      } else if (video.favorite) {
        setIcon(eyebrow.createSpan(), "star");
        eyebrow.createSpan({ text: t("home.featuredFavorite") });
      } else if (video.lastPlayedAt) {
        setIcon(eyebrow.createSpan(), "history");
        eyebrow.createSpan({ text: t("home.featuredPlayed") });
      } else {
        eyebrow.createSpan({ text: t("home.featuredRecent") });
      }
      title.setText(video.title);
      meta.empty();
      meta.createSpan({ text: this.plugin.categoryName(video.categoryId) });
      meta.createSpan({ text: providerName(video.provider) });
      if (video.author) meta.createSpan({ text: video.author });
      if (video.description) {
        description.setText(video.description);
        description.removeClass("is-hidden");
      } else {
        description.addClass("is-hidden");
      }

      for (const dot of Array.from(dots.children)) {
        dot.classList.toggle("is-active", Number(dot.getAttribute("data-index")) === this.homeCarouselIndex);
      }
    };

    videos.forEach((video, index) => {
      const dot = dots.createEl("button", {
        cls: "vl-home-hero-dot",
        attr: { type: "button", "data-index": String(index), "aria-label": video.title }
      });
      dot.addEventListener("click", () => {
        show(index);
        schedule();
      });
    });
    previous.addEventListener("click", () => {
      show(this.homeCarouselIndex - 1);
      schedule();
    });
    next.addEventListener("click", () => {
      show(this.homeCarouselIndex + 1);
      schedule();
    });

    const schedule = (): void => {
      window.clearTimeout(this.homeCarouselTimer);
      if (this.homeCarouselItems.length < 2) return;
      this.homeCarouselTimer = window.setTimeout(() => {
        show(this.homeCarouselIndex + 1);
        schedule();
      }, 6500);
    };
    hero.addEventListener("mouseenter", () => window.clearTimeout(this.homeCarouselTimer));
    hero.addEventListener("mouseleave", schedule);
    image.addEventListener("load", () => hero.removeClass("is-no-cover"));
    image.addEventListener("error", () => hero.addClass("is-no-cover"));
    show(0);
    schedule();
  }

  private renderHomeRow(
    parent: HTMLElement,
    titleText: string,
    videos: VideoItem[],
    icon: string,
    filter: Filter,
    color?: string
  ): void {
    if (videos.length === 0) return;
    const section = parent.createDiv({ cls: "vl-home-section" });
    const head = section.createDiv({ cls: "vl-home-section-head" });
    const title = head.createDiv({ cls: "vl-home-section-title" });
    if (color) {
      const dot = title.createSpan({ cls: "vl-category-dot" });
      dot.setCssStyles({ backgroundColor: color });
    } else {
      setIcon(title.createSpan({ cls: "vl-home-section-icon" }), icon);
    }
    title.createSpan({ text: titleText });
    title.createSpan({ text: String(videos.length), cls: "vl-home-section-count" });
    const more = head.createEl("button", { cls: "vl-home-more", attr: { type: "button" } });
    more.createSpan({ text: t("home.viewAll") });
    setIcon(more.createSpan({ cls: "vl-btn-icon" }), "arrow-right");
    more.addEventListener("click", () => this.setFilter(filter));

    const track = section.createDiv({ cls: "vl-home-track" });
    for (const video of videos) {
      const card = track.createDiv({ cls: "vl-home-card", attr: { tabindex: "0", role: "button" } });
      const cover = card.createDiv({ cls: "vl-home-card-cover" });
      const image = cover.createEl("img", { attr: { alt: "" } });
      this.applyCover(image, video, () => cover.addClass("is-no-cover"));
      cover.createSpan({ text: formatDuration(video.duration), cls: "vl-home-card-duration" });
      const body = card.createDiv({ cls: "vl-home-card-body" });
      body.createDiv({ text: video.title, cls: "vl-home-card-title" });
      const meta = body.createDiv({ cls: "vl-home-card-meta" });
      meta.createSpan({ text: providerName(video.provider) });
      if (video.author) meta.createSpan({ text: video.author });
      card.addEventListener("click", () => this.openPlayer(video));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.openPlayer(video);
      });
    }
  }

  private applyCover(image: HTMLImageElement, video: VideoItem, onMissing: () => void): void {
    if (video.coverPath) {
      void this.plugin.coverStore.getUrl(video.coverPath).then((url) => {
        if (url) image.src = url;
        else onMissing();
      });
    } else if (video.thumbnailUrl) {
      image.src = video.thumbnailUrl;
    } else {
      onMissing();
    }
    image.addEventListener("error", onMissing);
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
    this.selectionButton(actions, "pin", t("pin.pinSelected"), () => void this.batchPin(true));
    this.selectionButton(actions, "pin-off", t("pin.unpinSelected"), () => void this.batchPin(false));
    this.selectionButton(actions, "pencil", t("selection.rename"), () => this.openBatchRename());
    this.selectionButton(
      actions,
      "folder-input",
      t("folder.moveTo"),
      () => this.openMoveModal(),
      "",
      "any"
    );
    this.selectionButton(actions, "trash-2", t("selection.delete"), () => this.confirmBatchDelete(), "is-danger", "any");

    this.selectionBar.createDiv({ text: t("selection.hint"), cls: "vl-selection-hint" });
  }

  private selectionButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    className = "",
    scope: "videos" | "any" = "videos"
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-selection-btn ${className}`.trim(),
      attr: { type: "button" }
    });
    button.dataset.selectionScope = scope;
    setIcon(button.createSpan({ cls: "vl-btn-icon" }), icon);
    button.createSpan({ text: label });
    button.addEventListener("click", onClick);
  }

  private buildBreadcrumb(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "vl-breadcrumb" });
    if (this.filter !== "all") {
      bar.addClass("is-hidden");
      return;
    }

    const root = bar.createEl("button", {
      cls: `vl-crumb ${this.currentFolderId ? "" : "is-current"}`.trim(),
      text: t("nav.all"),
      attr: { type: "button" }
    });
    root.addEventListener("click", () => this.openFolder(null));
    this.bindFolderDrop(root, null);

    const path = this.currentFolderId ? this.plugin.folderPath(this.currentFolderId) : [];
    for (const folder of path) {
      const separator = bar.createSpan({ cls: "vl-crumb-separator" });
      setIcon(separator, "chevron-right");
      const crumb = bar.createEl("button", {
        cls: `vl-crumb ${folder.id === this.currentFolderId ? "is-current" : ""}`.trim(),
        text: folder.name,
        attr: { type: "button" }
      });
      crumb.addEventListener("click", () => this.openFolder(folder.id));
      this.bindFolderDrop(crumb, folder.id);
    }

    const add = bar.createEl("button", {
      cls: "vl-breadcrumb-add",
      attr: { type: "button", title: t("folder.new"), "aria-label": t("folder.new") }
    });
    setIcon(add, "folder-plus");
    add.addEventListener("click", () => this.promptNewFolder());
  }

  private openFolder(id: string | null): void {
    this.filter = "all";
    this.currentFolderId = id;
    if (id) {
      for (const folder of this.plugin.folderPath(id)) this.expandedFolderIds.add(folder.id);
    }
    this.clearSelection();
    this.render();
    const main = this.bodyEl().querySelector<HTMLElement>(".vl-main");
    if (main) main.scrollTop = 0;
  }

  private promptNewFolder(): void {
    new TextPromptModal(this.app, {
      title: t("folder.new"),
      placeholder: t("folder.namePlaceholder"),
      submitText: t("action.create"),
      onSubmit: async (value) => {
        const result = await this.plugin.createFolder(value, this.currentFolderId);
        if (!result.ok) {
          throw new Error(result.reason === "duplicate" ? t("folder.duplicate") : t("folder.nameRequired"));
        }
        new Notice(t("folder.created"));
        this.refresh();
      }
    }).open();
  }

  private promptRenameFolder(folderId: string): void {
    const folder = this.plugin.getFolder(folderId);
    if (!folder) return;
    new TextPromptModal(this.app, {
      title: t("folder.rename"),
      value: folder.name,
      placeholder: t("folder.namePlaceholder"),
      onSubmit: async (value) => {
        const result = await this.plugin.renameFolder(folderId, value);
        if (!result.ok) {
          throw new Error(result.reason === "duplicate" ? t("folder.duplicate") : t("folder.nameRequired"));
        }
        new Notice(t("folder.renamed"));
        this.refresh();
      }
    }).open();
  }

  private confirmDeleteFolder(folderId: string): void {
    const folder = this.plugin.getFolder(folderId);
    if (!folder) return;
    const contents = this.plugin.folderVideosRecursive(folderId);
    const hasLocalFiles = contents.some((video) => Boolean(video.localPath));
    new ConfirmModal(this.app, {
      title: t("folder.deleteTitle"),
      description: t("folder.deleteContentsDesc", {
        name: folder.name,
        count: contents.length
      }),
      confirmText: t("confirm.delete"),
      danger: true,
      checkbox: hasLocalFiles ? { label: t("confirm.deleteLocalFiles") } : undefined,
      onConfirm: async (deleteLocalFiles) => {
        const result = await this.plugin.deleteFolders(new Set([folderId]), deleteLocalFiles);
        new Notice(t("folder.deletedItems", { folders: result.folders, videos: result.videos }));
        if (this.currentFolderId && !this.plugin.getFolder(this.currentFolderId)) {
          this.currentFolderId = null;
        }
        this.clearSelection();
        this.refresh();
      }
    }).open();
  }

  private bindFolderDrop(element: HTMLElement, folderId: string | null): void {
    element.addEventListener("dragover", (event) => {
      if (!this.dragPayload) return;
      event.preventDefault();
      element.addClass("is-drop-target");
    });
    element.addEventListener("dragleave", () => element.removeClass("is-drop-target"));
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      element.removeClass("is-drop-target");
      if (!this.dragPayload) return;
      void this.moveDragToFolder(folderId);
    });
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
      dot.setCssStyles({ backgroundColor: tag.color });
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
    for (const chip of Array.from(this.tagFilterChips.querySelectorAll<HTMLElement>(".vl-tag-chip"))) {
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

  private selectableElements(): HTMLElement[] {
    if (!this.gridWrap) return [];
    return Array.from(this.gridWrap.querySelectorAll<HTMLElement>(".vl-card, .vl-list-row"));
  }

  private updateSelectionUi(): void {
    if (!this.selectionBar) return;
    const count = this.selectedIds.size + this.selectedFolderIds.size;
    this.selectionBar.toggleClass("is-empty", count === 0);
    this.selectionCountEl.setText(t("selection.selected", { count }));

    const quick = this.selectionBar.querySelectorAll<HTMLButtonElement>(".vl-selection-quick button");
    quick.forEach((button, index) => {
      button.disabled = index < 2 ? this.visibleOrder.length === 0 : count === 0;
    });
    this.batchCategorySelect.disabled = this.selectedIds.size === 0;
    const actionButtons = this.selectionBar.querySelectorAll<HTMLButtonElement>(".vl-selection-actions button");
    actionButtons.forEach((button) => {
      button.disabled = button.dataset.selectionScope === "any" ? count === 0 : this.selectedIds.size === 0;
    });

    for (const card of this.selectableElements()) {
      const type = card.dataset.itemType === "folder" ? "folder" : "video";
      const id = card.dataset.itemId || card.dataset.videoId || "";
      const selected = type === "folder" ? this.selectedFolderIds.has(id) : this.selectedIds.has(id);
      card.toggleClass("is-selected", selected);
      const check = card.querySelector<HTMLElement>(".vl-card-check");
      if (check) {
        check.toggleClass("is-checked", selected);
        check.setAttribute("aria-pressed", selected ? "true" : "false");
        check.setAttribute("title", selected ? t("selection.uncheck") : t("selection.check"));
        setIcon(check, selected ? "check" : "square");
      }
    }
  }

  private selectionKey(type: "video" | "folder", id: string): string {
    return `${type}:${id}`;
  }

  private isKeySelected(key: string): boolean {
    const [type, ...rest] = key.split(":");
    const id = rest.join(":");
    return type === "folder" ? this.selectedFolderIds.has(id) : this.selectedIds.has(id);
  }

  private setKeySelected(key: string, selected: boolean): void {
    const [type, ...rest] = key.split(":");
    const id = rest.join(":");
    if (type === "folder") {
      if (selected) this.selectedFolderIds.add(id);
      else this.selectedFolderIds.delete(id);
    } else {
      if (selected) this.selectedIds.add(id);
      else this.selectedIds.delete(id);
    }
  }

  private clearSelection(): void {
    this.selectedIds.clear();
    this.selectedFolderIds.clear();
    this.lastSelectedKey = null;
    this.updateSelectionUi();
  }

  private selectAllVisible(): void {
    this.selectedIds.clear();
    this.selectedFolderIds.clear();
    for (const item of this.visibleOrder) {
      this.setKeySelected(this.selectionKey(item.type, item.id), true);
    }
    this.lastSelectedKey = this.visibleOrder.length
      ? this.selectionKey(
          this.visibleOrder[this.visibleOrder.length - 1].type,
          this.visibleOrder[this.visibleOrder.length - 1].id
        )
      : null;
    this.updateSelectionUi();
  }

  private invertSelection(): void {
    for (const item of this.visibleOrder) {
      const key = this.selectionKey(item.type, item.id);
      this.setKeySelected(key, !this.isKeySelected(key));
    }
    const last = this.visibleOrder[this.visibleOrder.length - 1];
    this.lastSelectedKey = last ? this.selectionKey(last.type, last.id) : null;
    this.updateSelectionUi();
  }

  private toggleSelection(type: "video" | "folder", id: string, event: MouseEvent | KeyboardEvent): void {
    const key = this.selectionKey(type, id);
    if (event.shiftKey && this.lastSelectedKey) {
      const start = this.visibleOrder.findIndex(
        (item) => this.selectionKey(item.type, item.id) === this.lastSelectedKey
      );
      const end = this.visibleOrder.findIndex(
        (item) => this.selectionKey(item.type, item.id) === key
      );
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        for (let index = from; index <= to; index += 1) {
          this.setKeySelected(
            this.selectionKey(this.visibleOrder[index].type, this.visibleOrder[index].id),
            true
          );
        }
        this.lastSelectedKey = key;
        this.updateSelectionUi();
        return;
      }
    }

    this.setKeySelected(key, !this.isKeySelected(key));
    this.lastSelectedKey = key;
    this.updateSelectionUi();
  }

  private selectOnly(type: "video" | "folder", id: string): void {
    this.selectedIds.clear();
    this.selectedFolderIds.clear();
    this.setKeySelected(this.selectionKey(type, id), true);
    this.lastSelectedKey = this.selectionKey(type, id);
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

  private async batchPin(pinned: boolean): Promise<void> {
    const ids = new Set(this.selectedIds);
    if (ids.size === 0) return;
    await this.plugin.setPinned(ids, pinned);
    new Notice(
      t(pinned ? "pin.pinnedNotice" : "pin.unpinnedNotice", { count: ids.size })
    );
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
    const folderIds = new Set(this.selectedFolderIds);
    if (videos.length === 0 && folderIds.size === 0) return;
    const total = videos.length + folderIds.size;
    const folderVideos = [...folderIds].flatMap((id) => this.plugin.folderVideosRecursive(id));
    const hasLocalFiles = [...videos, ...folderVideos].some((video) => Boolean(video.localPath));
    new ConfirmModal(this.app, {
      title: t("selection.deleteTitle", { count: total }),
      description:
        folderIds.size > 0
          ? `${t("selection.deleteDesc")} ${t("selection.deleteFolderDesc")}`
          : t("selection.deleteDesc"),
      confirmText: t("confirm.delete"),
      danger: true,
      checkbox: hasLocalFiles ? { label: t("confirm.deleteLocalFiles") } : undefined,
      onConfirm: async (deleteLocalFiles) => {
        if (videos.length > 0) await this.plugin.deleteVideos(videos, deleteLocalFiles);
        let removedVideos = 0;
        if (folderIds.size > 0) {
          const result = await this.plugin.deleteFolders(folderIds, deleteLocalFiles);
          removedVideos = result.videos;
        }
        new Notice(t("selection.deleted", { count: total + removedVideos }));
        if (this.currentFolderId && !this.plugin.getFolder(this.currentFolderId)) {
          this.currentFolderId = null;
        }
        this.clearSelection();
        this.refresh();
      }
    }).open();
  }

  private openMoveModal(): void {
    const videos = new Set(this.selectedIds);
    const folders = new Set(this.selectedFolderIds);
    if (videos.size === 0 && folders.size === 0) return;
    new MoveToFolderModal(this.app, this.plugin, videos, folders, (count) => {
      new Notice(t("folder.moved", { count }));
      this.clearSelection();
    }).open();
  }

  private onGridPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, a, .vl-preview-audio, .vl-card, .vl-list-row")) return;

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
      const marquee = document.body.createDiv({ cls: "vl-marquee" });
      this.marqueeEl = marquee;
      this.gridWrap.addClass("is-marquee-active");
    }
    event.preventDefault();

    const left = Math.min(this.marqueeStart.x, event.clientX);
    const top = Math.min(this.marqueeStart.y, event.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    if (this.marqueeEl) {
      this.marqueeEl.setCssStyles({
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
    }

    const hits = new Set(this.marqueeHits({ left, top, right: left + width, bottom: top + height }));
    for (const card of this.selectableElements()) {
      const type = card.dataset.itemType === "folder" ? "folder" : "video";
      const id = card.dataset.itemId || card.dataset.videoId || "";
      card.toggleClass("is-marquee-hit", hits.has(this.selectionKey(type, id)));
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

    for (const card of this.selectableElements()) {
      card.removeClass("is-marquee-hit");
    }

    if (!this.marqueeMoved) return;
    this.marqueeMoved = false;
    if (mode === "add") {
      for (const key of hits) this.setKeySelected(key, true);
    } else if (mode === "subtract") {
      for (const key of hits) this.setKeySelected(key, false);
    } else {
      for (const key of hits) {
        this.setKeySelected(key, !this.isKeySelected(key));
      }
    }
    this.lastSelectedKey = hits[hits.length - 1] || null;
    this.updateSelectionUi();
    window.setTimeout(() => {
      this.blockNextClick = false;
    }, 0);
  }

  private marqueeHits(rect: { left: number; top: number; right: number; bottom: number }): string[] {
    const hits: string[] = [];
    for (const card of this.selectableElements()) {
      const cardRect = card.getBoundingClientRect();
      const intersects =
        cardRect.left < rect.right &&
        cardRect.right > rect.left &&
        cardRect.top < rect.bottom &&
        cardRect.bottom > rect.top;
      if (!intersects) continue;
      const type = card.dataset.itemType === "folder" ? "folder" : "video";
      const id = card.dataset.itemId || card.dataset.videoId || "";
      if (id) hits.push(this.selectionKey(type, id));
    }
    return hits;
  }

  private removeMarqueeListeners(): void {
    window.removeEventListener("pointermove", this.marqueeMoveHandler);
    window.removeEventListener("pointerup", this.marqueeUpHandler);
  }

  private onCardDragStart(
    event: DragEvent,
    type: "video" | "folder",
    id: string,
    card: HTMLElement
  ): void {
    event.stopPropagation();
    const itemSelected =
      type === "folder" ? this.selectedFolderIds.has(id) : this.selectedIds.has(id);
    if (!itemSelected) this.selectOnly(type, id);
    this.draggingId = id;
    this.dragPayload = {
      videos: [...this.selectedIds],
      folders: [...this.selectedFolderIds]
    };
    card.addClass("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      const payload = JSON.stringify(this.dragPayload);
      event.dataTransfer.setData("application/x-vl-items", payload);
      event.dataTransfer.setData("text/plain", payload);
    }
  }

  private onCardDragOver(event: DragEvent, video: VideoItem, card: HTMLElement): void {
    if (!this.dragPayload) return;
    if (this.dragPayload.videos.includes(video.id)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.clearDropIndicators();
    const targetFolder = video.folderId || null;
    const sameFolder = targetFolder === (this.currentFolderId || null);
    const draggedVideos = this.dragPayload.videos
      .map((id) => this.plugin.data.videos.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is VideoItem => Boolean(candidate));
    const pinnedMatches =
      draggedVideos.length > 0 && draggedVideos.every((candidate) => Boolean(candidate.pinned) === Boolean(video.pinned));
    if (sameFolder && pinnedMatches && this.dragPayload.folders.length === 0) {
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      card.addClass(after ? "drop-after" : "drop-before");
    } else {
      card.addClass("drop-into");
    }
  }

  private onFolderDragOver(event: DragEvent, folder: Folder, card: HTMLElement): void {
    if (!this.dragPayload) return;
    if (
      this.dragPayload.folders.some(
        (id) => id === folder.id || this.plugin.isFolderWithin(folder.id, id)
      )
    ) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.clearDropIndicators();
    card.addClass("drop-into");
  }

  private onCardDragLeave(card: HTMLElement): void {
    card.removeClass("drop-before", "drop-after", "drop-into");
  }

  private onCardDrop(event: DragEvent, video: VideoItem, card: HTMLElement): void {
    event.preventDefault();
    const payload = this.dragPayload;
    const after = card.classList.contains("drop-after");
    this.clearDragState();
    if (!payload || payload.videos.includes(video.id)) return;
    const targetFolderId = video.folderId || null;
    void this.plugin
      .moveItems(new Set(payload.videos), new Set(payload.folders), targetFolderId, {
        videoId: video.id,
        after
      })
      .then(() => {
        new Notice(t("folder.moved", { count: payload.videos.length + payload.folders.length }));
        this.clearSelection();
      });
  }

  private onFolderDrop(event: DragEvent, folder: Folder, card: HTMLElement): void {
    event.preventDefault();
    card.removeClass("drop-into");
    if (!this.dragPayload) {
      this.clearDragState();
      return;
    }
    void this.moveDragToFolder(folder.id);
  }

  private async moveDragToFolder(folderId: string | null): Promise<void> {
    const payload = this.dragPayload;
    if (!payload) return;
    const count = payload.videos.length + payload.folders.length;
    this.clearDragState();
    await this.plugin.moveItems(new Set(payload.videos), new Set(payload.folders), folderId);
    new Notice(t("folder.moved", { count }));
    this.clearSelection();
  }

  private async reorderByDrop(draggedId: string, targetId: string, after: boolean): Promise<void> {
    const dragged = this.plugin.data.videos.find((video) => video.id === draggedId);
    const target = this.plugin.data.videos.find((video) => video.id === targetId);
    if (!dragged || !target || Boolean(dragged.pinned) !== Boolean(target.pinned)) return;

    const group = this.plugin.data.videos.filter(
      (video) =>
        Boolean(video.pinned) === Boolean(target.pinned) &&
        (video.folderId || null) === (target.folderId || null)
    );
    const mode = this.plugin.data.settings.sort;
    group.sort((a, b) => {
      if (mode === "manual") return (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt);
      if (target.pinned) return (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt);
      if (mode === "oldest") return a.createdAt - b.createdAt;
      if (mode === "title-asc") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      if (mode === "title-desc") return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
      return b.createdAt - a.createdAt;
    });

    const from = group.findIndex((video) => video.id === draggedId);
    if (from < 0) return;
    group.splice(from, 1);
    const targetIndex = group.findIndex((video) => video.id === targetId);
    if (targetIndex < 0) return;
    group.splice(after ? targetIndex + 1 : targetIndex, 0, dragged);
    await this.plugin.reorderVideos(group.map((video) => video.id));
  }

  private clearDropIndicators(): void {
    for (const card of this.selectableElements()) {
      card.removeClass("drop-before", "drop-after", "drop-into");
    }
  }

  private clearDragState(): void {
    this.draggingId = null;
    this.dragPayload = null;
    for (const card of this.selectableElements()) {
      card.removeClass("is-dragging", "drop-before", "drop-after", "drop-into");
    }
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
      if (this.filter === "all") {
        const folderId = video.folderId || null;
        if (folderId !== (this.currentFolderId || null)) return false;
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
      if (mode === "manual") {
        return (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt);
      }
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
    const folders = this.filter === "all" ? this.plugin.getSubfolders(this.currentFolderId) : [];
    const pinned = videos
      .filter((video) => video.pinned)
      .sort((a, b) => {
        if (this.plugin.data.settings.sort === "manual") {
          return (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt);
        }
        return (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt);
      });
    const regular = videos.filter((video) => !video.pinned);
    const collapsed = this.plugin.data.settings.pinnedCollapsed;
    const displayedVideos = collapsed ? regular : [...pinned, ...regular];
    this.visibleVideoIds = displayedVideos.map((video) => video.id);
    this.visibleFolderIds = folders.map((folder) => folder.id);
    this.visibleOrder = [
      ...(collapsed ? [] : pinned.map((video) => ({ type: "video" as const, id: video.id }))),
      ...folders.map((folder) => ({ type: "folder" as const, id: folder.id })),
      ...regular.map((video) => ({ type: "video" as const, id: video.id }))
    ];
    const existingVideos = new Set(this.visibleVideoIds);
    for (const id of [...this.selectedIds]) {
      if (!existingVideos.has(id)) this.selectedIds.delete(id);
    }
    const existingFolders = new Set(this.visibleFolderIds);
    for (const id of [...this.selectedFolderIds]) {
      if (!existingFolders.has(id)) this.selectedFolderIds.delete(id);
    }
    this.headingEl.setText(this.filterName());
    this.countEl.setText(t(videos.length === 1 ? "count.one" : "count.many", { count: videos.length }));
    this.gridWrap.empty();

    if (videos.length === 0 && folders.length === 0) {
      this.renderEmpty();
      this.updateSelectionUi();
      return;
    }

    if (pinned.length > 0) {
      this.renderPinnedSection(pinned, collapsed);
    }

    const listMode = this.plugin.data.settings.viewMode === "list";
    if (folders.length > 0 || regular.length > 0) {
      const grid = this.gridWrap.createDiv({ cls: listMode ? "vl-list" : "vl-grid" });
      for (const folder of folders) {
        if (listMode) this.renderFolderRow(grid, folder);
        else this.renderFolderCard(grid, folder);
      }
      for (const video of regular) {
        if (listMode) this.renderVideoRow(grid, video);
        else this.renderCard(grid, video);
      }
    }
    this.updateSelectionUi();
  }

  private renderPinnedSection(pinned: VideoItem[], collapsed: boolean): void {
    const section = this.gridWrap.createDiv({ cls: "vl-pinned-section" });
    const header = section.createEl("button", {
      cls: "vl-pinned-header",
      attr: {
        type: "button",
        "aria-expanded": collapsed ? "false" : "true",
        title: collapsed ? t("pin.expand") : t("pin.collapse")
      }
    });
    const pinIcon = header.createSpan({ cls: "vl-pinned-icon" });
    setIcon(pinIcon, "pin");
    header.createSpan({ text: t("pin.pinnedSection"), cls: "vl-pinned-title" });
    header.createSpan({ text: String(pinned.length), cls: "vl-pinned-count" });
    const chevron = header.createSpan({ cls: "vl-pinned-chevron" });
    setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
    header.addEventListener("click", () => {
      void this.plugin.setPinnedCollapsed(!collapsed).then(() => {
        this.renderGrid();
      });
    });

    if (collapsed) return;
    const listMode = this.plugin.data.settings.viewMode === "list";
    const grid = section.createDiv({
      cls: listMode ? "vl-list vl-pinned-list" : "vl-grid vl-pinned-grid"
    });
    for (const video of pinned) {
      if (listMode) this.renderVideoRow(grid, video);
      else this.renderCard(grid, video);
    }
  }

  private renderEmpty(): void {
    const inFolder = this.filter === "all" && this.currentFolderId !== null;
    const hasVideos = this.plugin.data.videos.length > 0;
    const empty = this.gridWrap.createDiv({ cls: "vl-empty" });
    const icon = empty.createDiv({ cls: "vl-empty-icon" });
    setIcon(icon, inFolder ? "folder-open" : hasVideos ? "search-x" : "film");
    empty.createEl("h3", {
      text: inFolder ? t("folder.empty") : hasVideos ? t("empty.filterTitle") : t("empty.libraryTitle")
    });
    empty.createEl("p", {
      text: inFolder ? t("folder.emptyDesc") : hasVideos ? t("empty.filterDesc") : t("empty.libraryDesc")
    });

    if (inFolder) {
      const addFolder = empty.createEl("button", { text: t("folder.new"), cls: "mod-cta" });
      addFolder.addEventListener("click", () => this.promptNewFolder());
    } else if (!hasVideos) {
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

  private attachHoverPreview(host: HTMLElement, cover: HTMLElement, video: VideoItem): void {
    const previewSource =
      video.provider === "local" || video.provider === "direct" ? this.plugin.getVideoSource(video) : null;
    if (!previewSource) return;
    let preview: HoverPreview | null = null;
    host.addEventListener("mouseenter", () => {
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
    host.addEventListener("mouseleave", () => {
      preview?.stop();
      preview = null;
    });
  }

  private renderVideoRow(container: HTMLElement, video: VideoItem): void {
    const row = container.createDiv({
      cls: "vl-list-row",
      attr: {
        tabindex: "0",
        role: "button",
        "aria-label": video.title,
        "data-item-type": "video",
        "data-item-id": video.id
      }
    });
    row.dataset.provider = video.provider;
    row.dataset.videoId = video.id;
    row.dataset.itemType = "video";
    row.dataset.itemId = video.id;
    row.draggable = true;
    row.setAttribute("draggable", "true");

    const check = row.createEl("button", {
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
      this.toggleSelection("video", video.id, event);
    });

    const thumb = row.createDiv({ cls: "vl-list-thumb" });
    const placeholder = thumb.createDiv({ cls: "vl-card-placeholder" });
    setIcon(placeholder.createSpan({ cls: "vl-card-placeholder-icon" }), "film");
    const img = thumb.createEl("img", {
      cls: "vl-list-image is-hidden",
      attr: { alt: "", loading: "lazy", decoding: "async", draggable: "false" }
    });
    img.addEventListener("load", () => {
      img.removeClass("is-hidden");
      placeholder.addClass("is-hidden");
    });
    img.addEventListener("error", () => {
      img.addClass("is-hidden");
      placeholder.removeClass("is-hidden");
    });
    this.applyCover(img, video, () => {
      img.addClass("is-hidden");
      placeholder.removeClass("is-hidden");
    });
    if (video.duration) {
      thumb.createSpan({ text: formatDuration(video.duration), cls: "vl-list-duration" });
    }

    const main = row.createDiv({ cls: "vl-list-main" });
    main.createDiv({ text: video.title || t("misc.untitled"), cls: "vl-list-title" });
    const meta = main.createDiv({ cls: "vl-list-meta" });
    const category = this.plugin.getCategory(video.categoryId);
    const categoryEl = meta.createSpan({ cls: "vl-card-category" });
    const dot = categoryEl.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: category?.color || "var(--text-faint)" });
    categoryEl.createSpan({ text: this.plugin.categoryName(video.categoryId) });
    meta.createSpan({ text: providerName(video.provider), cls: "vl-provider-badge" });
    if (video.author) meta.createSpan({ text: video.author, cls: "vl-card-author" });
    meta.createSpan({ text: formatDate(video.createdAt), cls: "vl-list-date" });
    if (video.tags.length > 0) {
      const tags = main.createDiv({ cls: "vl-list-tags" });
      for (const tag of video.tags.slice(0, 4)) tags.createSpan({ text: `#${tag}`, cls: "vl-tag" });
      if (video.tags.length > 4) {
        tags.createSpan({ text: `+${video.tags.length - 4}`, cls: "vl-tag vl-tag-more" });
      }
    }

    const end = row.createDiv({ cls: "vl-list-end" });
    const actions = end.createDiv({ cls: "vl-list-actions" });
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
    const dragHandle = iconButton(actions, "grip-vertical", t("pin.drag"), () => {}, "vl-card-action vl-card-drag");
    dragHandle.draggable = true;
    dragHandle.setAttribute("draggable", "true");
    dragHandle.addEventListener("dragstart", (event) => this.onCardDragStart(event, "video", video.id, row));
    dragHandle.addEventListener("dragend", () => this.clearDragState());

    row.addEventListener("dragstart", (event) => this.onCardDragStart(event, "video", video.id, row));
    row.addEventListener("dragend", () => this.clearDragState());
    row.addEventListener("dragover", (event) => this.onCardDragOver(event, video, row));
    row.addEventListener("dragleave", () => row.removeClass("drop-before", "drop-after", "drop-into"));
    row.addEventListener("drop", (event) => this.onCardDrop(event, video, row));

    row.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        event.preventDefault();
        this.toggleSelection("video", video.id, event);
        return;
      }
      this.selectOnly("video", video.id);
    });
    row.addEventListener("dblclick", () => this.openPlayer(video));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.openPlayer(video);
      } else if (event.key === " ") {
        event.preventDefault();
        this.toggleSelection("video", video.id, event);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.ensureContextSelection("video", video.id, event);
      this.showContextMenu(event, video);
    });

    this.attachHoverPreview(row, thumb, video);
  }

  private renderFolderRow(container: HTMLElement, folder: Folder): void {
    const row = container.createDiv({
      cls: "vl-list-row vl-list-folder-row",
      attr: {
        tabindex: "0",
        role: "button",
        "aria-label": folder.name,
        "data-item-type": "folder",
        "data-item-id": folder.id
      }
    });
    row.dataset.itemType = "folder";
    row.dataset.itemId = folder.id;
    row.draggable = true;
    row.setAttribute("draggable", "true");

    const check = row.createEl("button", {
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
      this.toggleSelection("folder", folder.id, event);
    });

    const thumb = row.createDiv({ cls: "vl-list-thumb vl-list-folder-thumb" });
    const icon = thumb.createDiv({ cls: "vl-folder-icon" });
    setIcon(icon, "folder");
    if (folder.coverPath) {
      const img = thumb.createEl("img", {
        cls: "vl-folder-cover-image is-hidden",
        attr: { alt: "", loading: "lazy", decoding: "async", draggable: "false" }
      });
      void this.plugin.coverStore.getUrl(folder.coverPath).then((url) => {
        if (!url) return;
        img.src = url;
        img.removeClass("is-hidden");
        icon.addClass("is-hidden");
      });
    }

    const total = this.plugin.folderVideosRecursive(folder.id).length;
    const main = row.createDiv({ cls: "vl-list-main" });
    main.createDiv({ text: folder.name, cls: "vl-list-title" });
    const meta = main.createDiv({ cls: "vl-list-meta" });
    meta.createSpan({ text: t("folder.videoCount", { count: total }) });
    meta.createSpan({ text: t("folder.folderCount", { count: this.plugin.getSubfolders(folder.id).length }) });
    if (folder.parentId) {
      const path = this.plugin.folderPath(folder.parentId).map((entry) => entry.name);
      if (path.length > 0) meta.createSpan({ text: path.join(" / "), cls: "vl-list-date" });
    }

    const end = row.createDiv({ cls: "vl-list-end" });
    const actions = end.createDiv({ cls: "vl-list-actions" });
    iconButton(actions, "folder-open", t("folder.open"), () => this.openFolder(folder.id), "vl-card-action");
    iconButton(actions, "image", t("folder.changeCover"), () => this.openFolderCover(folder), "vl-card-action");
    iconButton(actions, "pencil", t("folder.rename"), () => this.promptRenameFolder(folder.id), "vl-card-action");
    iconButton(actions, "trash-2", t("action.delete"), () => this.confirmDeleteFolder(folder.id), "vl-card-action");
    const chevron = end.createSpan({ cls: "vl-list-chevron" });
    setIcon(chevron, "chevron-right");

    row.addEventListener("dragstart", (event) => this.onCardDragStart(event, "folder", folder.id, row));
    row.addEventListener("dragend", () => this.clearDragState());
    row.addEventListener("dragover", (event) => this.onFolderDragOver(event, folder, row));
    row.addEventListener("dragleave", () => row.removeClass("drop-into"));
    row.addEventListener("drop", (event) => this.onFolderDrop(event, folder, row));

    row.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        this.toggleSelection("folder", folder.id, event);
        return;
      }
      this.selectOnly("folder", folder.id);
    });
    row.addEventListener("dblclick", () => this.openFolder(folder.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.openFolder(folder.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.ensureContextSelection("folder", folder.id, event);
      this.showFolderContextMenu(event, folder);
    });
  }

  private renderFolderCard(grid: HTMLElement, folder: Folder): void {
    const card = grid.createDiv({
      cls: "vl-card vl-folder-card",
      attr: {
        tabindex: "0",
        role: "button",
        "aria-label": folder.name,
        "data-item-type": "folder",
        "data-item-id": folder.id
      }
    });
    card.dataset.itemType = "folder";
    card.dataset.itemId = folder.id;

    const cover = card.createDiv({ cls: "vl-card-cover vl-folder-cover" });
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
      this.toggleSelection("folder", folder.id, event);
    });

    const icon = cover.createDiv({ cls: "vl-folder-icon" });
    setIcon(icon, "folder");
    if (folder.coverPath) {
      const img = cover.createEl("img", {
        cls: "vl-folder-cover-image",
        attr: { alt: "", loading: "lazy", decoding: "async", draggable: "false" }
      });
      void this.plugin.coverStore.getUrl(folder.coverPath).then((url) => {
        if (!url) return;
        img.src = url;
        img.removeClass("is-hidden");
        icon.addClass("is-hidden");
      });
      img.addClass("is-hidden");
    }
    cover.createDiv({
      text: t("folder.videoCount", { count: this.plugin.folderVideosRecursive(folder.id).length }),
      cls: "vl-folder-video-count"
    });

    const actions = cover.createDiv({ cls: "vl-card-actions" });
    const dragHandle = iconButton(actions, "grip-vertical", t("pin.drag"), () => {}, "vl-card-action vl-card-drag");
    dragHandle.draggable = true;
    dragHandle.setAttribute("draggable", "true");
    dragHandle.addEventListener("dragstart", (event) => this.onCardDragStart(event, "folder", folder.id, card));
    dragHandle.addEventListener("dragend", () => this.clearDragState());
    iconButton(actions, "folder-open", t("folder.open"), () => this.openFolder(folder.id), "vl-card-action");
    iconButton(actions, "image", t("folder.changeCover"), () => this.openFolderCover(folder), "vl-card-action");
    iconButton(actions, "pencil", t("folder.rename"), () => this.promptRenameFolder(folder.id), "vl-card-action");
    iconButton(actions, "trash-2", t("action.delete"), () => this.confirmDeleteFolder(folder.id), "vl-card-action");

    const body = card.createDiv({ cls: "vl-card-body" });
    body.createEl("h3", { text: folder.name, cls: "vl-card-title" });
    const meta = body.createDiv({ cls: "vl-card-meta" });
    const total = this.plugin.folderVideosRecursive(folder.id).length;
    meta.createSpan({ text: t("folder.videoCount", { count: total }) });
    meta.createSpan({
      text: t("folder.folderCount", { count: this.plugin.getSubfolders(folder.id).length }),
      cls: "vl-card-author"
    });

    card.draggable = true;
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (event) => this.onCardDragStart(event, "folder", folder.id, card));
    card.addEventListener("dragend", () => this.clearDragState());

    card.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        this.toggleSelection("folder", folder.id, event);
        return;
      }
      this.selectOnly("folder", folder.id);
    });
    card.addEventListener("dblclick", () => this.openFolder(folder.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.openFolder(folder.id);
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.ensureContextSelection("folder", folder.id, event);
      this.showFolderContextMenu(event, folder);
    });
    card.addEventListener("dragover", (event) => this.onFolderDragOver(event, folder, card));
    card.addEventListener("dragleave", () => card.removeClass("drop-into"));
    card.addEventListener("drop", (event) => this.onFolderDrop(event, folder, card));
  }

  private openFolderCover(folder: Folder): void {
    new FolderCoverModal(this.app, this.plugin, folder, () => {
      this.refresh();
    }).open();
  }

  private ensureContextSelection(type: "video" | "folder", id: string, event: MouseEvent): void {
    const selected = type === "folder" ? this.selectedFolderIds.has(id) : this.selectedIds.has(id);
    if (!selected || event.ctrlKey || event.metaKey) {
      this.selectOnly(type, id);
    }
  }

  private showEmptyContextMenu(event: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(t("action.addVideo"))
        .setIcon("plus")
        .onClick(() => this.openAdd())
    );
    if (this.filter === "all") {
      menu.addItem((item) =>
        item
          .setTitle(t("folder.new"))
          .setIcon("folder-plus")
          .onClick(() => this.promptNewFolder())
      );
    }
    if (this.selectedIds.size + this.selectedFolderIds.size > 0) {
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(t("folder.moveSelected"))
          .setIcon("folder-input")
          .onClick(() => this.openMoveModal())
      );
    }
    menu.showAtMouseEvent(event);
  }

  private showFolderContextMenu(event: MouseEvent, folder: Folder): void {
    const menu = new Menu();
    const multi = this.selectedIds.size + this.selectedFolderIds.size > 1;
    menu.addItem((item) =>
      item.setTitle(t("folder.open")).setIcon("folder-open").onClick(() => this.openFolder(folder.id))
    );
    menu.addItem((item) =>
      item
        .setTitle(t("folder.changeCover"))
        .setIcon("image")
        .onClick(() => this.openFolderCover(folder))
    );
    menu.addItem((item) =>
      item.setTitle(t("folder.rename")).setIcon("pencil").onClick(() => this.promptRenameFolder(folder.id))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(t("folder.moveTo"))
        .setIcon("folder-input")
        .onClick(() => this.openMoveModal())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(multi ? t("selection.delete") : t("action.delete"))
        .setIcon("trash-2")
        .onClick(() => (multi ? this.confirmBatchDelete() : this.confirmDeleteFolder(folder.id)))
    );
    menu.showAtMouseEvent(event);
  }
  private renderCard(grid: HTMLElement, video: VideoItem): void {
    const card = grid.createDiv({
      cls: "vl-card",
      attr: {
        tabindex: "0",
        role: "button",
        "aria-label": video.title,
        "data-item-type": "video",
        "data-item-id": video.id
      }
    });
    card.dataset.provider = video.provider;
    card.dataset.videoId = video.id;
    card.dataset.itemType = "video";
    card.dataset.itemId = video.id;
    card.draggable = true;
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (event) => this.onCardDragStart(event, "video", video.id, card));
    card.addEventListener("dragend", () => this.clearDragState());
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
      this.toggleSelection("video", video.id, event);
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

    const pin = cover.createEl("button", {
      cls: `vl-card-pin ${video.pinned ? "is-pinned" : ""}`,
      attr: {
        type: "button",
        title: video.pinned ? t("pin.unpin") : t("pin.pin"),
        "aria-label": video.pinned ? t("pin.unpin") : t("pin.pin")
      }
    });
    setIcon(pin, "pin");
    pin.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.plugin.setPinned(new Set([video.id]), !video.pinned);
    });

    const actions = cover.createDiv({ cls: "vl-card-actions" });
    const dragHandle = iconButton(actions, "grip-vertical", t("pin.drag"), () => {}, "vl-card-action vl-card-drag");
    dragHandle.draggable = true;
    dragHandle.setAttribute("draggable", "true");
    dragHandle.addEventListener("dragstart", (event) => this.onCardDragStart(event, "video", video.id, card));
    dragHandle.addEventListener("dragend", () => this.clearDragState());
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

    card.addEventListener("dragover", (event) => this.onCardDragOver(event, video, card));
    card.addEventListener("dragleave", () => this.onCardDragLeave(card));
    card.addEventListener("drop", (event) => this.onCardDrop(event, video, card));

    const body = card.createDiv({ cls: "vl-card-body" });
    body.createEl("h3", { text: video.title || t("misc.untitled"), cls: "vl-card-title" });

    const meta = body.createDiv({ cls: "vl-card-meta" });
    const category = this.plugin.getCategory(video.categoryId);
    const categoryEl = meta.createSpan({ cls: "vl-card-category" });
    const dot = categoryEl.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: category?.color || "var(--text-faint)" });
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

    body.createDiv({ cls: "vl-card-date", text: formatDate(video.createdAt) });

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
        this.toggleSelection("video", video.id, event);
        return;
      }
      this.selectOnly("video", video.id);
    });
    card.addEventListener("dblclick", () => this.openPlayer(video));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.openPlayer(video);
      } else if (event.key === " ") {
        event.preventDefault();
        this.toggleSelection("video", video.id, event);
      }
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.ensureContextSelection("video", video.id, event);
      this.showContextMenu(event, video);
    });
  }

  private showContextMenu(event: MouseEvent, video: VideoItem): void {
    HoverPreview.stopActive();
    const menu = new Menu();
    const multi = this.selectedIds.size + this.selectedFolderIds.size > 1;
    menu.addItem((item) =>
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
    menu.addItem((item) =>
      item
        .setTitle(video.pinned ? t("pin.unpin") : t("pin.pin"))
        .setIcon("pin")
        .onClick(() => void this.plugin.setPinned(new Set([video.id]), !video.pinned))
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
        .setTitle(multi ? t("folder.moveSelected") : t("folder.moveTo"))
        .setIcon("folder-input")
        .onClick(() => this.openMoveModal())
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(multi ? t("selection.delete") : t("action.delete"))
        .setIcon("trash-2")
        .onClick(() => (multi ? this.confirmBatchDelete() : this.confirmDelete(video)))
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
    new VideoEditModal(this.app, this.plugin, null, this.currentFolderId || undefined).open();
  }

  private openEdit(video: VideoItem): void {
    HoverPreview.stopActive();
    new VideoEditModal(this.app, this.plugin, video).open();
  }

  private openPlayer(video: VideoItem): void {
    HoverPreview.stopActive();
    void this.plugin.markPlayed(video.id);
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
      checkbox: video.localPath ? { label: t("confirm.deleteLocalFile") } : undefined,
      onConfirm: async (deleteLocalFile) => {
        await this.plugin.deleteVideo(video, deleteLocalFile);
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
