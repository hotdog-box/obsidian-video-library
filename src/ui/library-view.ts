import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import { ConfirmModal, formatDate, iconButton, openExternal } from "./common";
import { formatDuration, providerName, t, type MessageKey } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { SortMode, VideoItem } from "../types";
import { UNCATEGORIZED_ID } from "../types";
import { CategoryManagerModal } from "./category-modal";
import { VideoEditModal } from "./video-modal";
import { VideoPlayerModal } from "./player-modal";

export const VIEW_TYPE = "video-library-view";

type Filter = "all" | "favorites" | typeof UNCATEGORIZED_ID | string;

export class VideoLibraryView extends ItemView {
  private filter: Filter = "all";
  private query = "";
  private rendered = false;
  private searchTimer = 0;
  private gridWrap!: HTMLElement;
  private headingEl!: HTMLElement;
  private countEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private clearSearchEl!: HTMLElement;
  private navItems = new Map<string, HTMLElement>();

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
    this.rendered = false;
    this.bodyEl().empty();
  }

  private bodyEl(): HTMLElement {
    return this.containerEl.children[1] as HTMLElement;
  }

  refresh(): void {
    if (!this.rendered) return;
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
    const toolbar = main.createDiv({ cls: "vl-toolbar" });
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

    this.gridWrap = main.createDiv({ cls: "vl-grid-wrap" });
    this.updateNavActive();
  }

  private filterName(): string {
    if (this.filter === "all") return t("nav.all");
    if (this.filter === "favorites") return t("nav.favorites");
    if (this.filter === UNCATEGORIZED_ID) return t("nav.uncategorized");
    return this.plugin.categoryName(this.filter);
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
    this.headingEl.setText(this.filterName());
    this.countEl.setText(t(videos.length === 1 ? "count.one" : "count.many", { count: videos.length }));
    this.gridWrap.empty();

    if (videos.length === 0) {
      this.renderEmpty();
      return;
    }

    const grid = this.gridWrap.createDiv({ cls: "vl-grid" });
    for (const video of videos) {
      this.renderCard(grid, video);
    }
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
    const placeholder = cover.createDiv({ cls: "vl-card-placeholder" });
    setIcon(placeholder.createSpan({ cls: "vl-card-placeholder-icon" }), "film");

    if (video.coverPath) {
      const img = cover.createEl("img", {
        cls: "vl-card-image is-hidden",
        attr: { alt: "", loading: "lazy", decoding: "async" }
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
        () => openExternal(video.url),
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

    card.addEventListener("click", () => this.openPlayer(video));
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
    const menu = new Menu();
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
    if (video.url) {
      menu.addItem((item) =>
        item
          .setTitle(t("action.openOriginal"))
          .setIcon("external-link")
          .onClick(() => openExternal(video.url))
      );
      menu.addItem((item) =>
        item
          .setTitle(t("menu.copyLink"))
          .setIcon("copy")
          .onClick(() => void this.copyText(video.url))
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
    new VideoEditModal(this.app, this.plugin, video).open();
  }

  private openPlayer(video: VideoItem): void {
    new VideoPlayerModal(this.app, this.plugin, video).open();
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
