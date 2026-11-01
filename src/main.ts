import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CoverStore } from "./covers";
import { setLanguage, t } from "./i18n";
import { normalizeUrlInput, parseVideoUrl, fallbackTitleFromUrl } from "./providers";
import {
  Category,
  CardSize,
  createDefaultData,
  DATA_VERSION,
  DEFAULT_MARKERS,
  DEFAULT_SCRAPE_SITES,
  Folder,
  LanguageSetting,
  Marker,
  MarkerKind,
  PluginData,
  Provider,
  sanitizePreviewConfig,
  SortMode,
  Tag,
  TAG_COLORS,
  TagMatchMode,
  uid,
  UNCATEGORIZED_ID,
  VideoItem,
  ViewMode
} from "./types";
import {
  DEFAULT_SCRAPE_FIELDS,
  MetaTubeClient,
  MetaTubeMovie,
  normalizeDate,
  scrapeQueries,
  ScrapeFieldOptions
} from "./scraping";
import { VideoLibraryView, VIEW_TYPE } from "./ui/library-view";
import { VideoEditModal } from "./ui/video-modal";
import { VideoLibrarySettingTab } from "./ui/settings-tab";

export type CategoryMutationResult =
  | { ok: true; category: Category }
  | { ok: false; reason: "empty" | "duplicate" };

interface DirentLike {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

interface FsLike {
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkSync: (path: string) => void;
  linkSync: (existingPath: string, newPath: string) => void;
  copyFileSync: (existingPath: string, newPath: string) => void;
  statSync?: (path: string) => { size: number; isFile: () => boolean };
  readdirSync: (path: string, options: { withFileTypes: true }) => DirentLike[];
  promises?: {
    unlink?: (path: string) => Promise<void>;
  };
}

interface PathLike {
  basename: (path: string) => string;
  dirname?: (path: string) => string;
  join: (...parts: string[]) => string;
}

interface ElectronLike {
  shell?: {
    trashItem?: (path: string) => Promise<void>;
    openPath?: (path: string) => Promise<string>;
  };
}

interface ChildProcessLike {
  pid?: number;
  kill: () => boolean;
  unref: () => void;
}

interface ChildProcessModuleLike {
  spawn: (
    command: string,
    args: string[],
    options: {
      cwd?: string;
      detached?: boolean;
      stdio?: "ignore" | "inherit" | "pipe";
      windowsHide?: boolean;
    }
  ) => ChildProcessLike;
  execFile?: (
    file: string,
    args: string[],
    callback?: (error: Error | null) => void
  ) => unknown;
}

function nodeRequire<T>(id: string): T | null {
  const loader = (window as unknown as { require?: (module: string) => unknown }).require;
  return typeof loader === "function" ? (loader(id) as T) : null;
}

function getNodeFs(): FsLike | null {
  return nodeRequire<FsLike>("fs");
}

function getNodePath(): PathLike | null {
  return nodeRequire<PathLike>("path");
}

function getElectron(): ElectronLike | null {
  return nodeRequire<ElectronLike>("electron");
}

function externalFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("//")) return `file:${encodeURI(normalized)}`;
  return `file:///${encodeURI(normalized)}`;
}

function externalLinkName(path: string): string {
  let hash = 5381;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 33) ^ path.charCodeAt(index);
  }
  const extension = path.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  return `ext_${(hash >>> 0).toString(36)}.${extension}`;
}

export type TagMutationResult =
  | { ok: true; tag: Tag }
  | { ok: false; reason: "empty" | "duplicate" };

export type FolderMutationResult =
  | { ok: true; folder: Folder }
  | { ok: false; reason: "empty" | "duplicate" };

export default class VideoLibraryPlugin extends Plugin {
  data: PluginData = createDefaultData();
  coverStore!: CoverStore;
  private metaTubeProcess: ChildProcessLike | null = null;
  private coverQueue: string[] = [];
  private coverQueueSet = new Set<string>();
  private coverQueueRunning = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLanguage(this.data.settings.language);

    const pluginDir = this.manifest.dir || `${this.app.vault.configDir}/plugins/video-library`;
    this.coverStore = new CoverStore(this.app, pluginDir);

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new VideoLibraryView(leaf, this));

    this.addRibbonIcon("film", t("app.name"), () => {
      void this.openView();
    });

    this.addCommand({
      id: "open",
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
    const folders: Folder[] = Array.isArray(loaded.folders)
      ? loaded.folders
          .filter((folder): folder is Folder => Boolean(folder && folder.id && folder.name))
          .map((folder) => ({
            id: String(folder.id),
            name: String(folder.name).trim(),
            parentId: folder.parentId ? String(folder.parentId) : null,
            coverPath: folder.coverPath ? String(folder.coverPath) : undefined,
            createdAt: Number(folder.createdAt) || Date.now(),
            sortOrder: Number.isFinite(Number(folder.sortOrder)) ? Number(folder.sortOrder) : undefined
          }))
          .filter((folder) => Boolean(folder.name))
      : [];
    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const folder of folders) {
      if (folder.parentId && !folderIds.has(folder.parentId)) folder.parentId = null;
    }

    let tagsMigrated = !Array.isArray(loaded.tags) || !Array.isArray(loaded.folders);
    const tags: Tag[] = Array.isArray(loaded.tags)
      ? loaded.tags
          .filter((tag): tag is Tag => Boolean(tag && tag.id && tag.name))
          .map((tag) => ({
            id: String(tag.id),
            name: String(tag.name).trim(),
            color: String(tag.color || TAG_COLORS[0]),
            createdAt: Number(tag.createdAt) || Date.now()
          }))
          .filter((tag) => Boolean(tag.name))
      : [];

    const ensureTag = (rawName: string): Tag | undefined => {
      const name = rawName.trim();
      if (!name) return undefined;
      const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      const tag: Tag = {
        id: uid("tag"),
        name,
        color: TAG_COLORS[tags.length % TAG_COLORS.length],
        createdAt: Date.now()
      };
      tags.push(tag);
      tagsMigrated = true;
      return tag;
    };

    const needsSiteSeed = Number(loaded.version || 0) < 5;
    let markersMigrated = !Array.isArray(loaded.markers) || needsSiteSeed;
    const markers: Marker[] = !Array.isArray(loaded.markers)
      ? [...DEFAULT_MARKERS, ...DEFAULT_SCRAPE_SITES].map((marker) => ({
          ...marker,
          createdAt: Date.now()
        }))
      : (loaded.markers || [])
          .filter((marker): marker is Marker => Boolean(marker && marker.id && marker.name))
          .map((marker, index) => {
            const autoProvider = marker.autoProvider
              ? (String(marker.autoProvider) as Provider)
              : undefined;
            const metatubeProvider = marker.metatubeProvider
              ? String(marker.metatubeProvider).trim() || undefined
              : undefined;
            const kind: MarkerKind =
              marker.kind === "link" || (!metatubeProvider && autoProvider) ? "link" : "site";
            return {
              id: String(marker.id),
              name: String(marker.name).trim(),
              color: String(marker.color || TAG_COLORS[0]),
              kind,
              enabled: marker.enabled !== false,
              autoProvider,
              metatubeProvider,
              capabilities: Array.isArray(marker.capabilities)
                ? marker.capabilities.map((value) => String(value)).filter(Boolean)
                : [],
              url: marker.url ? String(marker.url).trim() || undefined : undefined,
              description: marker.description
                ? String(marker.description).trim() || undefined
                : undefined,
              sortOrder: Number.isFinite(Number(marker.sortOrder))
                ? Number(marker.sortOrder)
                : index,
              createdAt: Number(marker.createdAt) || Date.now()
            };
          })
          .filter((marker) => Boolean(marker.name));

    if (needsSiteSeed) {
      for (const site of DEFAULT_SCRAPE_SITES) {
        if (markers.some((marker) => marker.id === site.id)) continue;
        markers.push({ ...site, createdAt: Date.now() });
      }
    }
    markers.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    markers.forEach((marker, index) => {
      marker.sortOrder = index;
    });
    const markerIds = new Set(markers.map((marker) => marker.id));
    const autoMarkerFor = (provider: Provider): string | undefined =>
      markers.find((marker) => marker.kind === "link" && marker.autoProvider === provider)?.id;

    const videos = Array.isArray(loaded.videos)
      ? loaded.videos
          .filter((video): video is VideoItem => Boolean(video && (video.url || video.localPath)))
          .map((video) => {
            const parsed = video.url ? parseVideoUrl(video.url) : null;
            const provider = video.provider || parsed?.provider || (video.localPath ? "local" : "web");
            const normalizedTags: string[] = [];
            if (Array.isArray(video.tags)) {
              for (const rawTag of video.tags) {
                const tag = ensureTag(String(rawTag));
                if (tag && !normalizedTags.some((name) => name.toLowerCase() === tag.name.toLowerCase())) {
                  normalizedTags.push(tag.name);
                }
              }
            }
            const videoMarkers = Array.isArray(video.markers)
              ? video.markers.map((id) => String(id)).filter((id) => markerIds.has(id))
              : [];
            if (!Array.isArray(video.markers)) {
              const auto = autoMarkerFor(provider);
              if (auto) videoMarkers.push(auto);
            }
            const rawPerformers = (video as { performers?: unknown }).performers;
            const performers = (Array.isArray(rawPerformers)
              ? rawPerformers
              : typeof rawPerformers === "string"
                ? rawPerformers.split(/[,，、/;；\n]+/)
                : []
            )
              .map((name) => String(name).trim())
              .filter((name, index, list) => Boolean(name) && list.indexOf(name) === index);
            return {
              ...video,
              id: video.id || uid("vid"),
              provider,
              studio: video.studio ? String(video.studio).trim() || undefined : undefined,
              series: video.series ? String(video.series).trim() || undefined : undefined,
              performers,
              markers: videoMarkers,
              releaseDate: video.releaseDate ? String(video.releaseDate).trim() || undefined : undefined,
              externalId: video.externalId ? String(video.externalId).trim() || undefined : undefined,
              metadataSource: video.metadataSource
                ? String(video.metadataSource).trim() || undefined
                : undefined,
              scrapedAt: Number(video.scrapedAt) || undefined,
              localExternal: Boolean(video.localExternal),
              title: video.title || (video.url ? fallbackTitleFromUrl(video.url) : t("form.untitled")),
              categoryId:
                video.categoryId && categoryIds.has(video.categoryId) ? video.categoryId : UNCATEGORIZED_ID,
              folderId: video.folderId && folderIds.has(video.folderId) ? video.folderId : undefined,
              tags: normalizedTags,
              preview: sanitizePreviewConfig(video.preview),
              pinned: Boolean(video.pinned),
              pinnedAt: Number(video.pinnedAt) || undefined,
              sortOrder: Number.isFinite(Number(video.sortOrder)) ? Number(video.sortOrder) : undefined,
              lastPlayedAt: Number(video.lastPlayedAt) || undefined,
              createdAt: Number(video.createdAt) || Date.now(),
              updatedAt: Number(video.updatedAt) || Number(video.createdAt) || Date.now()
            };
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
    settings.tagMatchMode = settings.tagMatchMode === "all" ? "all" : "any";
    settings.viewMode = settings.viewMode === "list" ? "list" : "grid";
    if (typeof settings.pinnedCollapsed !== "boolean") settings.pinnedCollapsed = false;
    settings.metatubeUrl = typeof settings.metatubeUrl === "string" ? settings.metatubeUrl.trim() : "";
    settings.metatubeToken = typeof settings.metatubeToken === "string" ? settings.metatubeToken.trim() : "";
    settings.metatubeServerPath =
      typeof settings.metatubeServerPath === "string" ? settings.metatubeServerPath.trim() : "";
    settings.scrapeAuto = Boolean(settings.scrapeAuto);
    if (markersMigrated) tagsMigrated = true;

    this.data = {
      version: DATA_VERSION,
      categories,
      folders,
      videos,
      tags,
      markers,
      settings
    };

    for (const video of this.data.videos) {
      if (video.localExternal) {
        await this.ensureExternalLink(video);
        if (video.localLinkPath) tagsMigrated = true;
      }
    }

    if (tagsMigrated) await this.persist();
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

  async setViewMode(mode: ViewMode): Promise<void> {
    this.data.settings.viewMode = mode === "list" ? "list" : "grid";
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

  async reorderCategories(orderedIds: string[]): Promise<void> {
    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    this.data.categories.sort((a, b) => {
      const aPos = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bPos = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aPos - bPos;
    });
    await this.persist();
    this.refreshViews();
  }

  getFolder(id: string): Folder | undefined {
    return this.data.folders.find((folder) => folder.id === id);
  }

  getSubfolders(parentId: string | null): Folder[] {
    return this.data.folders
      .filter((folder) => (folder.parentId || null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  folderPath(id: string): Folder[] {
    const path: Folder[] = [];
    let current = this.getFolder(id);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? this.getFolder(current.parentId) : undefined;
    }
    return path;
  }

  folderCount(id: string): number {
    return this.data.videos.filter((video) => video.folderId === id).length;
  }

  isFolderWithin(folderId: string, possibleAncestorId: string): boolean {
    let current = this.getFolder(folderId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === possibleAncestorId) return true;
      seen.add(current.id);
      current = current.parentId ? this.getFolder(current.parentId) : undefined;
    }
    return false;
  }

  async createFolder(name: string, parentId: string | null): Promise<FolderMutationResult> {
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    const siblings = this.data.folders.filter((folder) => (folder.parentId || null) === parentId);
    if (siblings.some((folder) => folder.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    const folder: Folder = {
      id: uid("folder"),
      name: clean,
      parentId,
      createdAt: Date.now()
    };
    this.data.folders.push(folder);
    await this.persist();
    this.refreshViews();
    return { ok: true, folder };
  }

  async renameFolder(id: string, name: string): Promise<FolderMutationResult> {
    const folder = this.getFolder(id);
    if (!folder) return { ok: false, reason: "empty" };
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    const siblings = this.data.folders.filter(
      (candidate) => candidate.id !== id && (candidate.parentId || null) === (folder.parentId || null)
    );
    if (siblings.some((candidate) => candidate.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    folder.name = clean;
    await this.persist();
    this.refreshViews();
    return { ok: true, folder };
  }

  descendantFolderIds(ids: Iterable<string>): Set<string> {
    const result = new Set<string>();
    const queue = [...ids];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || result.has(id)) continue;
      result.add(id);
      for (const folder of this.data.folders) {
        if (folder.parentId === id) queue.push(folder.id);
      }
    }
    return result;
  }

  folderVideosRecursive(folderId: string): VideoItem[] {
    const ids = this.descendantFolderIds([folderId]);
    return this.data.videos.filter((video) => Boolean(video.folderId && ids.has(video.folderId)));
  }

  async deleteFolders(
    ids: Set<string>,
    deleteLocalFiles = false
  ): Promise<{ folders: number; videos: number }> {
    const allIds = this.descendantFolderIds(ids);
    const videos = this.data.videos.filter((video) => Boolean(video.folderId && allIds.has(video.folderId)));
    if (deleteLocalFiles) {
      for (const video of videos) {
        if (!(await this.deleteLocalSource(video))) new Notice(t("notice.localFileDeleteFailed"));
      }
    }
    for (const video of videos) this.removeExternalLink(video);
    const deletedVideoIds = new Set(videos.map((video) => video.id));
    this.data.videos = this.data.videos.filter((video) => !deletedVideoIds.has(video.id));
    for (const video of videos) {
      await this.coverStore.delete(video.coverPath);
    }
    const folders = this.data.folders.filter((folder) => allIds.has(folder.id));
    for (const folder of folders) {
      await this.coverStore.delete(folder.coverPath);
    }
    this.data.folders = this.data.folders.filter((folder) => !allIds.has(folder.id));
    if (folders.length > 0) {
      await this.persist();
      this.refreshViews();
    }
    return { folders: folders.length, videos: videos.length };
  }

  async setFolderCover(folderId: string, coverPath: string | undefined): Promise<void> {
    const folder = this.getFolder(folderId);
    if (!folder) return;
    const previous = folder.coverPath;
    folder.coverPath = coverPath;
    await this.persist();
    if (previous && previous !== coverPath) await this.coverStore.delete(previous);
    this.refreshViews();
  }

  async duplicateFirstVideoCover(folderId: string): Promise<{ buffer: ArrayBuffer; extension: string } | null> {
    const ids = this.descendantFolderIds([folderId]);
    for (const video of this.data.videos) {
      if (!video.folderId || !ids.has(video.folderId) || !video.coverPath) continue;
      const image = await this.coverStore.read(video.coverPath);
      if (image) return image;
    }
    return null;
  }

  async moveItems(
    videoIds: Set<string>,
    folderIds: Set<string>,
    targetFolderId: string | null,
    position?: { videoId: string; after: boolean } | null
  ): Promise<void> {
    if (targetFolderId && !this.getFolder(targetFolderId)) return;
    const now = Date.now();
    for (const video of this.data.videos) {
      if (!videoIds.has(video.id)) continue;
      video.folderId = targetFolderId || undefined;
      video.updatedAt = now;
    }
    for (const folder of this.data.folders) {
      if (!folderIds.has(folder.id)) continue;
      if (targetFolderId && (folder.id === targetFolderId || this.isFolderWithin(targetFolderId, folder.id))) {
        continue;
      }
      folder.parentId = targetFolderId;
    }

    if (position) {
      const target = this.data.videos.find((video) => video.id === position.videoId);
      if (target && (target.folderId || null) === (targetFolderId || null)) {
        const group = this.data.videos.filter(
          (video) =>
            Boolean(video.pinned) === Boolean(target.pinned) &&
            (video.folderId || null) === (targetFolderId || null) &&
            !videoIds.has(video.id)
        );
        group.sort((a, b) => {
          if (a.sortOrder !== undefined || b.sortOrder !== undefined) {
            return (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt);
          }
          return a.createdAt - b.createdAt;
        });
        const targetIndex = group.findIndex((video) => video.id === position.videoId);
        if (targetIndex >= 0) {
          const moving = this.data.videos.filter((video) => videoIds.has(video.id));
          group.splice(position.after ? targetIndex + 1 : targetIndex, 0, ...moving);
          const order = new Map(group.map((video, index) => [video.id, index]));
          for (const video of this.data.videos) {
            const index = order.get(video.id);
            if (index !== undefined) video.sortOrder = index;
          }
          this.data.settings.sort = "manual";
        }
      }
    }

    await this.persist();
    this.refreshViews();
  }

  getTagByName(name: string): Tag | undefined {
    const lower = name.trim().toLowerCase();
    return this.data.tags.find((tag) => tag.name.toLowerCase() === lower);
  }

  tagCount(name: string): number {
    const lower = name.toLowerCase();
    return this.data.videos.filter((video) =>
      video.tags.some((tag) => tag.toLowerCase() === lower)
    ).length;
  }

  async createTag(name: string): Promise<TagMutationResult> {
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    if (this.getTagByName(clean)) return { ok: false, reason: "duplicate" };
    const tag: Tag = {
      id: uid("tag"),
      name: clean,
      color: TAG_COLORS[this.data.tags.length % TAG_COLORS.length],
      createdAt: Date.now()
    };
    this.data.tags.push(tag);
    await this.persist();
    return { ok: true, tag };
  }

  async ensureTags(names: string[]): Promise<string[]> {
    const canonical: string[] = [];
    for (const raw of names) {
      const clean = raw.trim();
      if (!clean) continue;
      let tag = this.getTagByName(clean);
      if (!tag) {
        tag = {
          id: uid("tag"),
          name: clean,
          color: TAG_COLORS[this.data.tags.length % TAG_COLORS.length],
          createdAt: Date.now()
        };
        this.data.tags.push(tag);
      }
      if (!canonical.some((name) => name.toLowerCase() === tag.name.toLowerCase())) {
        canonical.push(tag.name);
      }
    }
    return canonical;
  }

  async renameTag(id: string, name: string): Promise<TagMutationResult> {
    const tag = this.data.tags.find((candidate) => candidate.id === id);
    if (!tag) return { ok: false, reason: "empty" };
    const clean = name.trim();
    if (!clean) return { ok: false, reason: "empty" };
    if (
      this.data.tags.some(
        (candidate) => candidate.id !== id && candidate.name.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return { ok: false, reason: "duplicate" };
    }
    const oldName = tag.name;
    tag.name = clean;
    for (const video of this.data.videos) {
      if (!video.tags.includes(oldName)) continue;
      video.tags = video.tags.map((value) => (value === oldName ? clean : value));
      video.updatedAt = Date.now();
    }
    await this.persist();
    this.refreshViews();
    return { ok: true, tag };
  }

  async deleteTag(id: string): Promise<number> {
    const tag = this.data.tags.find((candidate) => candidate.id === id);
    if (!tag) return 0;
    let changed = 0;
    for (const video of this.data.videos) {
      if (!video.tags.includes(tag.name)) continue;
      video.tags = video.tags.filter((name) => name !== tag.name);
      video.updatedAt = Date.now();
      changed += 1;
    }
    this.data.tags = this.data.tags.filter((candidate) => candidate.id !== id);
    await this.persist();
    this.refreshViews();
    return changed;
  }

  async setTagMatchMode(mode: TagMatchMode): Promise<void> {
    this.data.settings.tagMatchMode = mode;
    await this.persist();
  }

  getMarker(id: string): Marker | undefined {
    return this.data.markers.find((marker) => marker.id === id);
  }

  markerName(id: string): string {
    return this.getMarker(id)?.name || id;
  }

  markersForVideo(video: VideoItem): Marker[] {
    return (video.markers || [])
      .map((id) => this.getMarker(id))
      .filter((marker): marker is Marker => Boolean(marker));
  }

  autoMarkerForProvider(provider: Provider): Marker | undefined {
    return this.data.markers.find(
      (marker) => marker.kind === "link" && marker.autoProvider === provider
    );
  }

  scrapeSites(): Marker[] {
    return this.data.markers.filter((marker) => marker.kind === "site");
  }

  enabledScrapeSites(): Marker[] {
    return this.scrapeSites().filter((marker) => marker.enabled !== false);
  }

  private ensureAutoMarker(video: VideoItem): void {
    if (video.provider === "local") return;
    const marker = this.autoMarkerForProvider(video.provider);
    if (!marker) return;
    const current = video.markers || [];
    if (!current.includes(marker.id)) video.markers = [...current, marker.id];
  }

  async saveMarker(marker: Marker): Promise<void> {
    const clean = marker.name.trim();
    if (!clean) return;
    const existing = this.data.markers.find((candidate) => candidate.id === marker.id);
    const duplicate = this.data.markers.find(
      (candidate) => candidate.id !== marker.id && candidate.name.toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) return;
    const next: Marker = {
      ...marker,
      name: clean,
      color: marker.color || TAG_COLORS[0],
      kind: marker.kind === "link" ? "link" : "site",
      enabled: marker.enabled !== false,
      metatubeProvider: marker.metatubeProvider?.trim() || undefined,
      capabilities: marker.capabilities || [],
      url: marker.url?.trim() || undefined,
      description: marker.description?.trim() || undefined,
      sortOrder: existing?.sortOrder ?? this.data.markers.length,
      createdAt: existing?.createdAt || marker.createdAt || Date.now()
    };
    if (existing) {
      Object.assign(existing, next);
    } else {
      this.data.markers.push(next);
    }
    await this.persist();
    this.refreshViews();
  }

  async setMarkerEnabled(id: string, enabled: boolean): Promise<void> {
    const marker = this.getMarker(id);
    if (!marker) return;
    marker.enabled = enabled;
    await this.persist();
    this.refreshViews();
  }

  async reorderMarkers(orderedIds: string[]): Promise<void> {
    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    this.data.markers.sort(
      (a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
    this.data.markers.forEach((marker, index) => {
      marker.sortOrder = index;
    });
    await this.persist();
    this.refreshViews();
  }

  async deleteMarker(id: string): Promise<void> {
    this.data.markers = this.data.markers.filter((marker) => marker.id !== id);
    for (const video of this.data.videos) {
      if (!video.markers?.includes(id)) continue;
      video.markers = video.markers.filter((markerId) => markerId !== id);
      video.updatedAt = Date.now();
    }
    await this.persist();
    this.refreshViews();
  }

  metaTubeClient(): MetaTubeClient {
    return new MetaTubeClient({
      url: this.data.settings.metatubeUrl,
      token: this.data.settings.metatubeToken
    });
  }

  private metaTubePort(): number {
    try {
      const parsed = new URL(this.data.settings.metatubeUrl || "http://127.0.0.1:8080");
      return Number(parsed.port) || 8080;
    } catch {
      return 8080;
    }
  }

  async testScrapeSite(marker: Marker): Promise<{ ok: boolean; error?: string }> {
    if (marker.kind !== "site") return { ok: false, error: t("scrape.notASite") };
    if (marker.enabled === false) return { ok: false, error: t("scrape.siteDisabled") };
    const client = this.metaTubeClient();
    if (!client.configured) return { ok: false, error: t("scrape.notConfigured") };
    try {
      const providers = await client.providers();
      if (marker.metatubeProvider && !providers[marker.metatubeProvider]) {
        return { ok: false, error: t("scrape.providerMissing", { provider: marker.metatubeProvider }) };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async metaTubeServiceStatus(): Promise<boolean> {
    return (await this.testMetaTube()).ok;
  }

  async startMetaTubeServer(): Promise<{ ok: boolean; started?: boolean; error?: string }> {
    if (await this.metaTubeServiceStatus()) return { ok: true, started: false };
    const executable = this.data.settings.metatubeServerPath.trim();
    if (!executable) return { ok: false, error: t("scrape.serverPathMissing") };
    const fs = getNodeFs();
    if (fs?.existsSync && !fs.existsSync(executable)) {
      return { ok: false, error: t("scrape.serverFileMissing", { path: executable }) };
    }
    const childProcess = nodeRequire<ChildProcessModuleLike>("child_process");
    if (!childProcess?.spawn) return { ok: false, error: t("scrape.serverProcessUnavailable") };
    const nodePath = getNodePath();
    const cwd = nodePath?.dirname ? nodePath.dirname(executable) : undefined;
    const args = ["-port", String(this.metaTubePort())];
    if (this.data.settings.metatubeToken.trim()) {
      args.push("-token", this.data.settings.metatubeToken.trim());
    }
    try {
      const child = childProcess.spawn(executable, args, {
        cwd,
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      this.metaTubeProcess = child;
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
      const status = await this.testMetaTube();
      if (!status.ok) return { ok: false, error: status.error || t("scrape.connectionFailed", { error: "" }) };
      return { ok: true, started: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopMetaTubeServer(): Promise<{ ok: boolean; error?: string }> {
    try {
      this.metaTubeProcess?.kill();
      this.metaTubeProcess = null;
      const childProcess = nodeRequire<ChildProcessModuleLike>("child_process");
      if (childProcess?.execFile) {
        try {
          childProcess.execFile("taskkill", ["/IM", "metatube-server.exe", "/F"], () => {
            // Fire and forget; the process may already be gone.
          });
        } catch {
          // Ignore a missing taskkill; the tracked child was stopped above.
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private pluginAbsolutePath(): string | null {
    const base = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.();
    if (!base || !this.manifest.dir) return null;
    return `${base.replace(/[\\/]+$/, "")}/${this.manifest.dir}`;
  }

  async openPluginFolder(kind: "data" | "covers"): Promise<boolean> {
    const base = this.pluginAbsolutePath();
    if (!base) return false;
    const target = kind === "covers" ? `${base}/covers` : base;
    const electron = getElectron();
    if (electron?.shell?.openPath) {
      const result = await electron.shell.openPath(target);
      return !result;
    }
    return false;
  }

  async testMetaTube(): Promise<{ ok: boolean; count?: number; error?: string }> {
    const client = this.metaTubeClient();
    if (!client.configured) return { ok: false, error: t("scrape.notConfigured") };
    try {
      const providers = await client.providers();
      return { ok: true, count: Object.keys(providers).length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async applyMetaTubeMovie(
    video: VideoItem,
    movie: MetaTubeMovie,
    options: ScrapeFieldOptions = DEFAULT_SCRAPE_FIELDS
  ): Promise<VideoItem> {
    const updated: VideoItem = {
      ...video,
      tags: [...video.tags],
      performers: video.performers ? [...video.performers] : [],
      markers: video.markers ? [...video.markers] : []
    };

    if (options.cover && movie.cover_url) {
      try {
        const base = this.data.settings.metatubeUrl.replace(/\/+$/, "");
        const coverUrl = /^https?:\/\//i.test(movie.cover_url)
          ? movie.cover_url
          : `${base}${movie.cover_url.startsWith("/") ? "" : "/"}${movie.cover_url}`;
        const image = await this.coverStore.fetchImage(coverUrl, movie.homepage);
        const previous = updated.coverPath;
        updated.coverPath = await this.coverStore.saveBuffer(image.buffer, image.extension);
        if (previous && previous !== updated.coverPath) await this.coverStore.delete(previous);
      } catch {
        // A cover failure should not block the metadata update.
      }
    }

    if (options.title && movie.title) updated.title = movie.title;
    if (options.author && movie.director) updated.author = movie.director;
    if (options.studio) updated.studio = movie.maker || movie.label || updated.studio;
    if (options.series) updated.series = movie.series || updated.series;
    if (options.performers && movie.actors && movie.actors.length > 0) {
      updated.performers = [...movie.actors];
    }
    if (options.tags && movie.genres && movie.genres.length > 0) {
      updated.tags = await this.ensureTags([...updated.tags, ...movie.genres]);
    }
    if (options.description && movie.summary) updated.description = movie.summary;
    if (options.releaseDate && movie.release_date) {
      updated.releaseDate = normalizeDate(movie.release_date) || updated.releaseDate;
    }
    if (options.duration && movie.runtime && movie.runtime > 0) {
      updated.duration = movie.runtime <= 600 ? movie.runtime * 60 : movie.runtime;
    }
    updated.externalId = movie.id;
    updated.metadataSource = `metatube:${movie.provider}`;
    updated.scrapedAt = Date.now();
    updated.updatedAt = Date.now();
    await this.updateVideo(updated);
    return updated;
  }

  async autoScrapeVideo(videoId: string): Promise<void> {
    if (!this.data.settings.scrapeAuto) return;
    const video = this.data.videos.find((candidate) => candidate.id === videoId);
    if (!video) return;
    const client = this.metaTubeClient();
    if (!client.configured) return;
    const selectedSites = this.markersForVideo(video).filter(
      (candidate) => candidate.kind === "site" && candidate.enabled !== false
    );
    const sites = selectedSites.length > 0 ? selectedSites : this.enabledScrapeSites();
    if (sites.length === 0) return;
    try {
      for (const query of scrapeQueries(video)) {
        for (const site of sites) {
          const results = await client.search(query, site.metatubeProvider);
          if (results.length === 0) continue;
          if (results.length > 1) {
            new Notice(t("scrape.multipleCandidates", { count: results.length }));
            return;
          }
          const movie = await client.movie(results[0].provider, results[0].id);
          await this.applyMetaTubeMovie(video, movie);
          new Notice(t("scrape.autoApplied", { title: video.title }));
          return;
        }
      }
      new Notice(t("scrape.noResults"));
    } catch (error) {
      console.warn("[video-library] Auto scrape failed", error);
    }
  }

  async addVideo(video: VideoItem): Promise<void> {
    this.ensureAutoMarker(video);
    await this.ensureExternalLink(video);
    this.data.videos.unshift(video);
    await this.persist();
    this.refreshViews();
    if (video.provider !== "local") {
      window.setTimeout(() => void this.autoScrapeVideo(video.id), 1200);
    }
  }

  async importExternalFiles(
    paths: string[],
    folderId: string | null = null,
    categoryId = UNCATEGORIZED_ID
  ): Promise<{ imported: number; skipped: number; ids: string[] }> {
    const nodePath = getNodePath();
    let imported = 0;
    let skipped = 0;
    const ids: string[] = [];
    for (const filePath of paths) {
      if (!nodePath?.basename || this.findDuplicate("", filePath)) {
        skipped += 1;
        continue;
      }
      const name = nodePath.basename(filePath);
      const title = name.replace(/\.[^.]+$/, "") || name;
      const now = Date.now() - imported;
      const video: VideoItem = {
        id: uid("vid"),
        url: "",
        provider: "local",
        title,
        categoryId,
        folderId: folderId || undefined,
        tags: [],
        localPath: filePath,
        localExternal: true,
        createdAt: now,
        updatedAt: now
      };
      await this.ensureExternalLink(video);
      this.data.videos.push(video);
      ids.push(video.id);
      imported += 1;
    }
    if (imported > 0) {
      await this.persist();
      this.refreshViews();
      this.queueCoverCaptures(ids);
    }
    return { imported, skipped, ids };
  }

  async importExternalFolder(
    folderPath: string,
    parentFolderId: string | null = null
  ): Promise<{ imported: number; skipped: number; folders: number; categories: number; ids: string[] }> {
    const fs = getNodeFs();
    const nodePath = getNodePath();
    if (!fs?.readdirSync || !nodePath?.basename) {
      return { imported: 0, skipped: 0, folders: 0, categories: 0, ids: [] };
    }
    const videoExtensions = new Set([
      "mp4", "mkv", "webm", "mov", "avi", "wmv", "flv", "m4v", "ts", "mpg", "mpeg", "rmvb", "3gp"
    ]);
    let imported = 0;
    let skipped = 0;
    let folders = 0;
    let categories = 0;
    const ids: string[] = [];

    const ensureFolder = (parentId: string | null, name: string): string => {
      const existing = this.data.folders.find(
        (folder) =>
          (folder.parentId || null) === parentId && folder.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) return existing.id;
      const folder: Folder = {
        id: uid("folder"),
        name,
        parentId,
        createdAt: Date.now()
      };
      this.data.folders.push(folder);
      folders += 1;
      return folder.id;
    };

    const ensureCategory = (name: string): string => {
      const clean = name.trim() || t("category.uncategorizedName");
      const existing = this.data.categories.find(
        (category) => category.name.toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing.id;
      const category: Category = {
        id: uid("cat"),
        name: clean,
        color: ["#e46b6b", "#e8a33d", "#5bb98c", "#4f9dd9", "#8b7fe8", "#d36bb3"][
          this.data.categories.length % 6
        ],
        createdAt: Date.now()
      };
      this.data.categories.push(category);
      categories += 1;
      return category.id;
    };

    const walk = async (
      directory: string,
      folderId: string,
      categoryId: string,
      depth: number
    ): Promise<void> => {
      let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const fullPath = nodePath.join(directory, entry.name);
        if (entry.isDirectory()) {
          const childFolderId = ensureFolder(folderId, entry.name);
          const childCategoryId = depth === 0 ? ensureCategory(entry.name) : categoryId;
          await walk(fullPath, childFolderId, childCategoryId, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        const extension = entry.name.split(".").pop()?.toLowerCase() || "";
        if (!videoExtensions.has(extension)) continue;
        if (this.findDuplicate("", fullPath)) {
          skipped += 1;
          continue;
        }
        const now = Date.now() - imported;
        const video: VideoItem = {
          id: uid("vid"),
          url: "",
          provider: "local",
          title: entry.name.replace(/\.[^.]+$/, ""),
          categoryId,
          folderId: folderId || undefined,
          tags: [],
          localPath: fullPath,
          localExternal: true,
          createdAt: now,
          updatedAt: now
        };
        await this.ensureExternalLink(video);
        this.data.videos.push(video);
        ids.push(video.id);
        imported += 1;
      }
    };

    const rootName = nodePath.basename(folderPath) || "Imported folder";
    const rootFolderId = ensureFolder(parentFolderId, rootName);
    const rootCategoryId = ensureCategory(rootName);
    await walk(folderPath, rootFolderId, rootCategoryId, 0);
    await this.persist();
    this.refreshViews();
    this.queueCoverCaptures(ids);
    return { imported, skipped, folders, categories, ids };
  }

  async updateVideo(video: VideoItem): Promise<void> {
    const index = this.data.videos.findIndex((candidate) => candidate.id === video.id);
    const previous = index >= 0 ? this.data.videos[index] : undefined;
    if (previous && (previous.localPath !== video.localPath || !video.localExternal)) {
      this.removeExternalLink(previous);
    }
    if (video.localExternal) await this.ensureExternalLink(video);
    else {
      this.removeExternalLink(video);
      video.localLinkPath = undefined;
    }
    if (index >= 0) {
      this.data.videos[index] = video;
    } else {
      this.data.videos.unshift(video);
    }
    await this.persist();
    this.refreshViews();
  }

  async deleteVideo(video: VideoItem, deleteLocalFile = false): Promise<void> {
    if (deleteLocalFile && !(await this.deleteLocalSource(video))) {
      new Notice(t("notice.localFileDeleteFailed"));
    }
    this.removeExternalLink(video);
    this.data.videos = this.data.videos.filter((candidate) => candidate.id !== video.id);
    await this.coverStore.delete(video.coverPath);
    await this.persist();
    this.refreshViews();
  }

  async deleteVideos(videos: VideoItem[], deleteLocalFiles = false): Promise<void> {
    const ids = new Set(videos.map((video) => video.id));
    if (deleteLocalFiles) {
      for (const video of videos) {
        if (!(await this.deleteLocalSource(video))) new Notice(t("notice.localFileDeleteFailed"));
      }
    }
    for (const video of videos) this.removeExternalLink(video);
    this.data.videos = this.data.videos.filter((candidate) => !ids.has(candidate.id));
    for (const video of videos) {
      await this.coverStore.delete(video.coverPath);
    }
    await this.persist();
    this.refreshViews();
  }

  async updateVideos(ids: Set<string>, mutate: (video: VideoItem) => void): Promise<void> {
    const now = Date.now();
    for (const video of this.data.videos) {
      if (!ids.has(video.id)) continue;
      mutate(video);
      video.updatedAt = now;
    }
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

  async markPlayed(videoId: string): Promise<void> {
    const video = this.data.videos.find((candidate) => candidate.id === videoId);
    if (!video) return;
    video.lastPlayedAt = Date.now();
    await this.persist();
  }

  async setPinned(ids: Set<string>, pinned: boolean): Promise<void> {
    const now = Date.now();
    for (const video of this.data.videos) {
      if (!ids.has(video.id)) continue;
      video.pinned = pinned;
      video.pinnedAt = pinned ? now : undefined;
      video.updatedAt = now;
    }
    await this.persist();
    this.refreshViews();
  }

  async reorderVideos(orderedIds: string[]): Promise<void> {
    const positions = new Map(orderedIds.map((id, index) => [id, index]));
    for (const video of this.data.videos) {
      const position = positions.get(video.id);
      if (position === undefined) continue;
      video.sortOrder = position;
      video.updatedAt = Date.now();
    }
    this.data.settings.sort = "manual";
    await this.persist();
    this.refreshViews();
  }

  async setPinnedCollapsed(collapsed: boolean): Promise<void> {
    this.data.settings.pinnedCollapsed = collapsed;
    await this.persist();
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

  private externalLinkRelative(path: string): string | null {
    if (!this.manifest.dir) return null;
    return `${this.manifest.dir}/external-links/${externalLinkName(path)}`;
  }

  private externalLinkAbsolute(relative: string): string | null {
    const base = (this.app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.();
    if (!base) return null;
    return `${base.replace(/[\\/]+$/, "")}/${relative}`;
  }

  async ensureExternalLink(video: VideoItem): Promise<void> {
    if (!video.localExternal || !video.localPath) {
      video.localLinkPath = undefined;
      return;
    }
    const relative = this.externalLinkRelative(video.localPath);
    if (!relative) return;
    const absolute = this.externalLinkAbsolute(relative);
    const fs = getNodeFs();
    if (!absolute || !fs?.existsSync || !fs?.linkSync || !fs.existsSync(video.localPath)) return;
    try {
      fs.mkdirSync(absolute.slice(0, absolute.lastIndexOf("/")), { recursive: true });
      if (fs.existsSync(absolute) && fs.statSync) {
        try {
          const cached = fs.statSync(absolute);
          const source = fs.statSync(video.localPath);
          if (cached.isFile() && source.isFile() && cached.size === source.size && cached.size > 0) {
            video.localLinkPath = relative;
            return;
          }
        } catch {
          // A damaged cache entry is rebuilt below.
        }
      }
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      try {
        fs.linkSync(video.localPath, absolute);
      } catch {
        fs.copyFileSync(video.localPath, absolute);
      }
      video.localLinkPath = relative;
    } catch {
      video.localLinkPath = undefined;
    }
  }

  private removeExternalLink(video: VideoItem): void {
    if (!video.localLinkPath) return;
    const absolute = this.externalLinkAbsolute(video.localLinkPath);
    const fs = getNodeFs();
    try {
      if (absolute && fs?.existsSync?.(absolute) && fs?.unlinkSync) fs.unlinkSync(absolute);
    } catch {
      // The cached link is disposable.
    }
  }

  externalFileExists(path: string | undefined): boolean {
    if (!path) return false;
    const fs = getNodeFs();
    if (!fs?.existsSync) return true;
    try {
      return Boolean(fs.existsSync(path));
    } catch {
      return false;
    }
  }

  getExternalFileUrl(path: string): string {
    return externalFileUrl(path);
  }

  async deleteLocalSource(video: VideoItem): Promise<boolean> {
    if (!video.localPath) return false;
    try {
      if (video.localExternal) {
        const electron = getElectron();
        if (electron?.shell?.trashItem) {
          try {
            await electron.shell.trashItem(video.localPath);
            return true;
          } catch {
            // Fall back to unlinking if the shell trash API is unavailable.
          }
        }
        const fs = getNodeFs();
        if (!fs?.promises?.unlink) return false;
        await fs.promises.unlink(video.localPath);
        return true;
      }
      const file = this.getLocalFile(video.localPath);
      if (!file) return false;
      await this.app.fileManager.trashFile(file);
      return true;
    } catch {
      return false;
    }
  }

  getVideoSource(video: VideoItem): string | null {
    if (video.provider === "local") {
      if (!video.localPath) return null;
      if (video.localExternal) {
        const relative = video.localLinkPath || this.externalLinkRelative(video.localPath);
        if (!relative) return null;
        const absolute = this.externalLinkAbsolute(relative);
        const fs = getNodeFs();
        if (absolute && fs?.existsSync?.(absolute)) {
          return this.app.vault.adapter.getResourcePath(relative);
        }
        return null;
      }
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

  getVideoFileSize(video: VideoItem): number | undefined {
    if (!video.localPath) return undefined;
    if (!video.localExternal) {
      const file = this.getLocalFile(video.localPath);
      return file?.stat.size;
    }
    const fs = getNodeFs();
    if (!fs?.statSync) return undefined;
    try {
      return fs.statSync(video.localPath).size;
    } catch {
      return undefined;
    }
  }

  async captureCoverFor(video: VideoItem, notify = true, ratio = 0.12): Promise<boolean> {
    const source = this.getVideoSource(video);
    if (!source) {
      if (notify) new Notice(t("notice.captureFailed"));
      return false;
    }
    if (notify) new Notice(t("notice.captureStarted"));
    const buffer = await this.coverStore.captureVideoFrame(source, ratio);
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

  queueCoverCaptures(videoIds: string[], notify = true): void {
    const added: string[] = [];
    for (const id of videoIds) {
      if (this.coverQueueSet.has(id)) continue;
      const video = this.data.videos.find((candidate) => candidate.id === id);
      if (!video || video.coverPath || !this.getVideoSource(video)) continue;
      this.coverQueueSet.add(id);
      this.coverQueue.push(id);
      added.push(id);
    }
    if (added.length === 0) return;
    if (notify) new Notice(t("notice.coverQueueStarted", { count: added.length }));
    void this.processCoverQueue();
  }

  private async processCoverQueue(): Promise<void> {
    if (this.coverQueueRunning) return;
    this.coverQueueRunning = true;
    let captured = 0;
    let failed = 0;
    try {
      while (this.coverQueue.length > 0) {
        const id = this.coverQueue.shift();
        if (!id) continue;
        this.coverQueueSet.delete(id);
        const video = this.data.videos.find((candidate) => candidate.id === id);
        if (!video || video.coverPath) continue;
        const source = this.getVideoSource(video);
        if (!source) {
          failed += 1;
          continue;
        }
        let buffer: ArrayBuffer | null = null;
        for (let attempt = 0; attempt < 2 && !buffer; attempt += 1) {
          const ratio = 0.1 + Math.random() * 0.8;
          buffer = await this.coverStore.captureVideoFrame(source, ratio);
        }
        if (!buffer) {
          failed += 1;
          continue;
        }
        video.coverPath = await this.coverStore.saveBuffer(buffer, "jpg");
        video.updatedAt = Date.now();
        captured += 1;
        await this.persist();
        if (captured % 5 === 0) this.refreshViews();
      }
    } finally {
      this.coverQueueRunning = false;
      this.refreshViews();
      if (captured > 0) {
        new Notice(t("notice.coverQueueDone", { count: captured, failed }));
      }
      if (this.coverQueue.length > 0) void this.processCoverQueue();
    }
  }
}
