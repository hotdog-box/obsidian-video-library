import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CoverStore } from "./covers";
import { setLanguage, t } from "./i18n";
import { normalizeUrlInput, parseVideoUrl, fallbackTitleFromUrl } from "./providers";
import {
  Category,
  CardSize,
  createDefaultData,
  DATA_VERSION,
  LanguageSetting,
  PluginData,
  sanitizePreviewConfig,
  SortMode,
  uid,
  UNCATEGORIZED_ID,
  VideoItem
} from "./types";
import { VideoLibraryView, VIEW_TYPE } from "./ui/library-view";
import { VideoEditModal } from "./ui/video-modal";
import { VideoLibrarySettingTab } from "./ui/settings-tab";

export type CategoryMutationResult =
  | { ok: true; category: Category }
  | { ok: false; reason: "empty" | "duplicate" };

export default class VideoLibraryPlugin extends Plugin {
  data: PluginData = createDefaultData();
  coverStore!: CoverStore;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLanguage(this.data.settings.language);

    const pluginDir = this.manifest.dir || ".obsidian/plugins/video-library";
    this.coverStore = new CoverStore(this.app, pluginDir);

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new VideoLibraryView(leaf, this));

    this.addRibbonIcon("film", t("app.name"), () => {
      void this.openView();
    });

    this.addCommand({
      id: "open-video-library",
      name: t("action.openLibrary"),
      callback: () => {
        void this.openView();
      }
    });

    this.addCommand({
      id: "add-video",
      name: t("action.addVideo"),
      callback: () => {
        new VideoEditModal(this.app, this).open();
      }
    });

    this.addSettingTab(new VideoLibrarySettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.coverStore?.dispose();
  }

  async openView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    let leaf = existing[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    const base = createDefaultData();
    if (!loaded || typeof loaded !== "object") {
      this.data = base;
      return;
    }

    const categories = Array.isArray(loaded.categories)
      ? loaded.categories
          .filter((category): category is Category => Boolean(category && category.id && category.name))
          .map((category) => ({
            id: String(category.id),
            name: String(category.name),
            color: String(category.color || "#4f9dd9"),
            createdAt: Number(category.createdAt) || Date.now()
          }))
      : [];

    const categoryIds = new Set(categories.map((category) => category.id));
    const videos = Array.isArray(loaded.videos)
      ? loaded.videos
          .filter((video): video is VideoItem => Boolean(video && (video.url || video.localPath)))
          .map((video) => {
            const parsed = video.url ? parseVideoUrl(video.url) : null;
            const provider = video.provider || parsed?.provider || (video.localPath ? "local" : "web");
            return {
              ...video,
              id: video.id || uid("vid"),
              provider,
              title: video.title || (video.url ? fallbackTitleFromUrl(video.url) : t("form.untitled")),
              categoryId:
                video.categoryId && categoryIds.has(video.categoryId) ? video.categoryId : UNCATEGORIZED_ID,
              tags: Array.isArray(video.tags) ? video.tags.filter(Boolean).map(String) : [],
              preview: sanitizePreviewConfig(video.preview),
              createdAt: Number(video.createdAt) || Date.now(),
              updatedAt: Number(video.updatedAt) || Number(video.createdAt) || Date.now()
            } as VideoItem;
          })
      : [];

    const settings = {
      ...base.settings,
      ...(loaded.settings || {})
    };
    if (typeof settings.previewMuted !== "boolean") settings.previewMuted = true;
    settings.previewVolume = Number.isFinite(Number(settings.previewVolume))
      ? Math.min(1, Math.max(0, Number(settings.previewVolume)))
      : 0.8;

    this.data = {
      version: DATA_VERSION,
      categories,
      videos,
      settings
    };
  }

  async persist(): Promise<void> {
    await this.saveData(this.data);
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof VideoLibraryView) view.refresh();
    }
  }

  async setLanguageSetting(language: LanguageSetting): Promise<void> {
    this.data.settings.language = language;
    setLanguage(language);
    await this.persist();
    this.refreshViews();
  }

  async setSort(sort: SortMode): Promise<void> {
    this.data.settings.sort = sort;
    await this.persist();
  }

  async setCardSize(size: CardSize): Promise<void> {
    this.data.settings.cardSize = size;
    await this.persist();
    this.refreshViews();
  }

  getCategory(id: string): Category | undefined {
    return this.data.categories.find((category) => category.id === id);
  }

  categoryName(id: string): string {
    if (id === UNCATEGORIZED_ID) return t("category.uncategorizedName");
    return this.getCategory(id)?.name || t("category.uncategorizedName");
  }

  categoryCount(id: string): number {
    if (id === "all") return this.data.videos.length;
    if (id === "favorites") return this.data.videos.filter((video) => video.favorite).length;
    return this.data.videos.filter((video) => (video.categoryId || UNCATEGORIZED_ID) === id).length;
  }

  async createCategory(name: string, color: string): Promise<CategoryMutationResult> {
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    if (this.data.categories.some((category) => category.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    const category: Category = {
      id: uid("cat"),
      name: clean,
      color,
      createdAt: Date.now()
    };
    this.data.categories.push(category);
    await this.persist();
    this.refreshViews();
    return { ok: true, category };
  }

  async renameCategory(id: string, name: string): Promise<CategoryMutationResult> {
    const category = this.getCategory(id);
    if (!category) return { ok: false, reason: "empty" };
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    if (
      this.data.categories.some(
        (candidate) => candidate.id !== id && candidate.name.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return { ok: false, reason: "duplicate" };
    }
    category.name = clean;
    await this.persist();
    this.refreshViews();
    return { ok: true, category };
  }

  async deleteCategory(id: string): Promise<number> {
    const index = this.data.categories.findIndex((category) => category.id === id);
    if (index < 0) return 0;
    let moved = 0;
    for (const video of this.data.videos) {
      if (video.categoryId === id) {
        video.categoryId = UNCATEGORIZED_ID;
        video.updatedAt = Date.now();
        moved += 1;
      }
    }
    this.data.categories.splice(index, 1);
    await this.persist();
    this.refreshViews();
    return moved;
  }

  async addVideo(video: VideoItem): Promise<void> {
    this.data.videos.unshift(video);
    await this.persist();
    this.refreshViews();
  }

  async updateVideo(video: VideoItem): Promise<void> {
    const index = this.data.videos.findIndex((candidate) => candidate.id === video.id);
    if (index >= 0) {
      this.data.videos[index] = video;
    } else {
      this.data.videos.unshift(video);
    }
    await this.persist();
    this.refreshViews();
  }

  async deleteVideo(video: VideoItem): Promise<void> {
    this.data.videos = this.data.videos.filter((candidate) => candidate.id !== video.id);
    await this.coverStore.delete(video.coverPath);
    await this.persist();
    this.refreshViews();
  }

  async toggleFavorite(video: VideoItem): Promise<void> {
    const target = this.data.videos.find((candidate) => candidate.id === video.id);
    if (!target) return;
    target.favorite = !target.favorite;
    target.updatedAt = Date.now();
    await this.persist();
    this.refreshViews();
  }

  findDuplicate(url: string, localPath: string | undefined, excludeId?: string): VideoItem | undefined {
    const key = localPath ? `local:${localPath}` : parseVideoUrl(url)?.canonicalUrl || normalizeUrlInput(url);
    return this.data.videos.find((video) => {
      if (video.id === excludeId) return false;
      const candidateKey = video.localPath
        ? `local:${video.localPath}`
        : parseVideoUrl(video.url)?.canonicalUrl || normalizeUrlInput(video.url);
      return candidateKey === key || (!localPath && video.url === url);
    });
  }

  getLocalFile(path: string | undefined): TFile | null {
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  getVideoSource(video: VideoItem): string | null {
    if (video.provider === "local") {
      if (!video.localPath) return null;
      const file = this.getLocalFile(video.localPath);
      if (!file) return null;
      return this.app.vault.adapter.getResourcePath(video.localPath);
    }
    return video.url || null;
  }

  getVideoPageUrl(video: VideoItem): string {
    if (video.provider === "bilibili" && video.epId) {
      return `https://www.bilibili.com/bangumi/play/ep${video.epId}`;
    }
    return video.url;
  }

  async captureCoverFor(video: VideoItem, notify = true): Promise<boolean> {
    const source = this.getVideoSource(video);
    if (!source) {
      if (notify) new Notice(t("notice.captureFailed"));
      return false;
    }
    if (notify) new Notice(t("notice.captureStarted"));
    const buffer = await this.coverStore.captureVideoFrame(source);
    if (!buffer) {
      if (notify) new Notice(t("notice.captureFailed"));
      return false;
    }
    const oldCover = video.coverPath;
    video.coverPath = await this.coverStore.saveBuffer(buffer, "jpg");
    video.updatedAt = Date.now();
    await this.persist();
    await this.coverStore.delete(oldCover);
    this.refreshViews();
    if (notify) new Notice(t("notice.coverUpdated"));
    return true;
  }
}
