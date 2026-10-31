import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CoverStore } from "./covers";
import { setLanguage, t } from "./i18n";
import { normalizeUrlInput, parseVideoUrl, fallbackTitleFromUrl } from "./providers";
import {
  Category,
  CardSize,
  createDefaultData,
  DATA_VERSION,
  Folder,
  LanguageSetting,
  PluginData,
  sanitizePreviewConfig,
  SortMode,
  Tag,
  TAG_COLORS,
  TagMatchMode,
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

function nodeRequire(id: string): any {
  const loader = (window as unknown as { require?: (module: string) => unknown }).require;
  return typeof loader === "function" ? loader(id) : null;
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
    const folders: Folder[] = Array.isArray(loaded.folders)
      ? loaded.folders
          .filter((folder): folder is Folder => Boolean(folder && folder.id && folder.name))
          .map((folder) => ({
            id: String(folder.id),
            name: String(folder.name).trim(),
            parentId: folder.parentId ? String(folder.parentId) : null,
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
            return {
              ...video,
              id: video.id || uid("vid"),
              provider,
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
    settings.tagMatchMode = settings.tagMatchMode === "all" ? "all" : "any";
    if (typeof settings.pinnedCollapsed !== "boolean") settings.pinnedCollapsed = false;

    this.data = {
      version: DATA_VERSION,
      categories,
      folders,
      videos,
      tags,
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

  async deleteFolders(ids: Set<string>): Promise<number> {
    let deleted = 0;
    for (const id of [...ids]) {
      const folder = this.getFolder(id);
      if (!folder) continue;
      const parentId = folder.parentId || null;
      for (const video of this.data.videos) {
        if (video.folderId === id) video.folderId = parentId || undefined;
      }
      for (const child of this.data.folders) {
        if (child.parentId === id) child.parentId = parentId;
      }
      this.data.folders = this.data.folders.filter((candidate) => candidate.id !== id);
      deleted += 1;
    }
    if (deleted > 0) {
      await this.persist();
      this.refreshViews();
    }
    return deleted;
  }

  async moveItems(videoIds: Set<string>, folderIds: Set<string>, targetFolderId: string | null): Promise<void> {
    if (targetFolderId && !this.getFolder(targetFolderId)) return;
    for (const video of this.data.videos) {
      if (!videoIds.has(video.id)) continue;
      video.folderId = targetFolderId || undefined;
      video.updatedAt = Date.now();
    }
    for (const folder of this.data.folders) {
      if (!folderIds.has(folder.id)) continue;
      if (targetFolderId && (folder.id === targetFolderId || this.isFolderWithin(targetFolderId, folder.id))) {
        continue;
      }
      folder.parentId = targetFolderId;
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
      if (!canonical.some((name) => name.toLowerCase() === tag!.name.toLowerCase())) {
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

  async addVideo(video: VideoItem): Promise<void> {
    await this.ensureExternalLink(video);
    this.data.videos.unshift(video);
    await this.persist();
    this.refreshViews();
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
    const fs = nodeRequire("fs");
    if (!absolute || !fs?.existsSync || !fs?.linkSync || !fs.existsSync(video.localPath)) return;
    try {
      fs.mkdirSync(absolute.slice(0, absolute.lastIndexOf("/")), { recursive: true });
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
    const fs = nodeRequire("fs");
    try {
      if (absolute && fs?.existsSync?.(absolute) && fs?.unlinkSync) fs.unlinkSync(absolute);
    } catch {
      // The cached link is disposable.
    }
  }

  externalFileExists(path: string | undefined): boolean {
    if (!path) return false;
    const fs = nodeRequire("fs");
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
        const electron = nodeRequire("electron");
        if (electron?.shell?.trashItem) {
          try {
            await electron.shell.trashItem(video.localPath);
            return true;
          } catch {
            // Fall back to unlinking if the shell trash API is unavailable.
          }
        }
        const fs = nodeRequire("fs");
        if (!fs?.promises?.unlink) return false;
        await fs.promises.unlink(video.localPath);
        return true;
      }
      const file = this.getLocalFile(video.localPath);
      if (!file) return false;
      if (this.app.fileManager?.trashFile) {
        try {
          await this.app.fileManager.trashFile(file);
          return true;
        } catch {
          // Fall back to a direct vault delete.
        }
      }
      await this.app.vault.delete(file);
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
        const fs = nodeRequire("fs");
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
