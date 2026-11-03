export type Provider = "bilibili" | "youtube" | "vimeo" | "direct" | "web" | "local" | "cloud";

export type CloudProvider = "baidu" | "quark" | "aliyun" | "onedrive";

export type NoteAttachmentMode = "same" | "subfolder" | "custom";

export type LanguageSetting = "auto" | "zh" | "en";

export type SortMode = "newest" | "oldest" | "title-asc" | "title-desc" | "manual";

export type CardSize = "small" | "medium" | "large";

export type ViewMode = "grid" | "list";

export type TagMatchMode = "any" | "all";

export const DATA_VERSION = 6;

export const UNCATEGORIZED_ID = "uncategorized";

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  coverPath?: string;
  createdAt: number;
  sortOrder?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export type MarkerKind = "link" | "site";

export interface Marker {
  id: string;
  name: string;
  color: string;
  kind?: MarkerKind;
  enabled?: boolean;
  autoProvider?: Provider;
  metatubeProvider?: string;
  capabilities?: string[];
  url?: string;
  description?: string;
  sortOrder?: number;
  createdAt: number;
}

export interface CloudAccount {
  provider: CloudProvider;
  enabled: boolean;
  credential: string;
  displayName?: string;
  updatedAt?: number;
}

export interface NoteNode {
  id: string;
  time: number;
  comment: string;
  summary: string;
  tags: string[];
  images?: string[];
  coverImage?: string;
  imagePath?: string;
  parentId?: string;
  groupId?: string;
  createdAt: number;
}

export interface NoteSection {
  id: string;
  title: string;
  summary: string;
  createdAt: number;
}

export interface NoteGroup {
  id: string;
  videoId: string;
  folderPath: string;
  notePath: string;
  title: string;
  coverPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrashNote {
  id: string;
  videoId: string;
  videoTitle: string;
  notePath: string;
  folderPath: string;
  block: string;
  node: NoteNode;
  deletedAt: number;
}

export interface TrashImage {
  id: string;
  videoId: string;
  videoTitle: string;
  nodeId: string;
  time?: number;
  kind?: "cover" | "summary";
  path: string;
  trashPath: string;
  notePath: string;
  folderPath: string;
  deletedAt: number;
}

export interface TrashGroup {
  id: string;
  videoId: string;
  videoTitle: string;
  groupId: string;
  title: string;
  notePath: string;
  folderPath: string;
  trashPath: string;
  coverPath?: string;
  deletedAt: number;
}

export const DEFAULT_MARKERS: Marker[] = [
  {
    id: "marker_bilibili",
    name: "B站",
    color: "#fb7299",
    kind: "link",
    enabled: true,
    autoProvider: "bilibili",
    createdAt: 0
  },
  {
    id: "marker_youtube",
    name: "YouTube",
    color: "#ff5c5c",
    kind: "link",
    enabled: true,
    autoProvider: "youtube",
    createdAt: 0
  }
];

export const TAG_COLORS = [
  "#e46b6b",
  "#e8a33d",
  "#d6c04a",
  "#5bb98c",
  "#4f9dd9",
  "#8b7fe8",
  "#d36bb3",
  "#7a8a99"
];

export interface PreviewClip {
  start: number;
  end: number;
}

export interface PreviewConfig {
  duration: number;
  clips: PreviewClip[];
}

export const DEFAULT_PREVIEW_DURATION = 4;
export const MAX_PREVIEW_DURATION = 300;

export function sanitizePreviewConfig(value: unknown): PreviewConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as { duration?: unknown; clips?: unknown };
  const durationNumber = Number(source.duration);
  const duration = Number.isFinite(durationNumber)
    ? Math.min(MAX_PREVIEW_DURATION, Math.max(1, Math.round(durationNumber * 10) / 10))
    : DEFAULT_PREVIEW_DURATION;

  const clips: PreviewClip[] = [];
  if (Array.isArray(source.clips)) {
    for (const entry of source.clips.slice(0, 20)) {
      if (!entry || typeof entry !== "object") continue;
      const clip = entry as { start?: unknown; end?: unknown };
      const start = Number(clip.start);
      const end = Number(clip.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end - start < 0.1) continue;
      clips.push({
        start: Math.round(start * 10) / 10,
        end: Math.round(end * 10) / 10
      });
    }
  }

  return { duration, clips };
}

export function clonePreviewConfig(config: PreviewConfig | undefined): PreviewConfig | undefined {
  return config ? { duration: config.duration, clips: config.clips.map((clip) => ({ ...clip })) } : undefined;
}

export interface VideoItem {
  id: string;
  url: string;
  provider: Provider;
  videoId?: string;
  title: string;
  author?: string;
  studio?: string;
  series?: string;
  performers?: string[];
  description?: string;
  releaseDate?: string;
  markers?: string[];
  externalId?: string;
  metadataSource?: string;
  scrapedAt?: number;
  categoryId: string;
  folderId?: string | null;
  tags: string[];
  notes?: string;
  coverPath?: string;
  thumbnailUrl?: string;
  localPath?: string;
  localExternal?: boolean;
  localLinkPath?: string;
  cloudProvider?: CloudProvider;
  streamUrl?: string;
  notePath?: string;
  noteFolder?: string;
  noteCoverPath?: string;
  duration?: number;
  page?: number;
  epId?: number;
  preview?: PreviewConfig;
  previewFromNotes?: boolean;
  noteSections?: NoteSection[];
  favorite?: boolean;
  pinned?: boolean;
  pinnedAt?: number;
  sortOrder?: number;
  lastPlayedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PluginSettings {
  language: LanguageSetting;
  sort: SortMode;
  cardSize: CardSize;
  viewMode: ViewMode;
  previewMuted: boolean;
  previewVolume: number;
  tagMatchMode: TagMatchMode;
  pinnedCollapsed: boolean;
  metatubeUrl: string;
  metatubeToken: string;
  metatubeServerPath: string;
  scrapeAuto: boolean;
  relatedEnabled: boolean;
  notesRoot: string;
  notesGrouping: "video" | "flat";
  notesViewMode: "grid" | "list";
  noteAttachmentMode: NoteAttachmentMode;
  noteAttachmentFolder: string;
  noteScreenshotWidth: number;
  notePreviewDuration: number;
  notePreviewTotal: number;
  notePreviewMax: number;
  noteMarkerShortcut: string;
  noteSummaryShortcut: string;
  bilibiliCookie: string;
  bilibiliUser: string;
  autoCheckUpdates: boolean;
  cloudAccounts: Record<CloudProvider, CloudAccount>;
}

export interface PluginData {
  version: number;
  videos: VideoItem[];
  categories: Category[];
  folders: Folder[];
  tags: Tag[];
  markers: Marker[];
  noteGroups: NoteGroup[];
  trashNotes: TrashNote[];
  trashImages: TrashImage[];
  trashGroups: TrashGroup[];
  settings: PluginSettings;
}

export interface ParsedVideo {
  provider: Provider;
  videoId?: string;
  canonicalUrl: string;
  embedUrl?: string;
  isShortLink?: boolean;
  page?: number;
  vimeoHash?: string;
  epId?: number;
  seasonId?: number;
}

export interface VideoMetadata {
  title?: string;
  author?: string;
  thumbnailUrl?: string;
  duration?: number;
  canonicalUrl?: string;
  videoId?: string;
  embedUrl?: string;
  epId?: number;
}

export function defaultCloudAccounts(): Record<CloudProvider, CloudAccount> {
  return {
    baidu: { provider: "baidu", enabled: false, credential: "" },
    quark: { provider: "quark", enabled: false, credential: "" },
    aliyun: { provider: "aliyun", enabled: false, credential: "" },
    onedrive: { provider: "onedrive", enabled: false, credential: "" }
  };
}

export const DEFAULT_SETTINGS: PluginSettings = {
  language: "auto",
  sort: "newest",
  cardSize: "medium",
  viewMode: "grid",
  previewMuted: true,
  previewVolume: 0.8,
  tagMatchMode: "any",
  pinnedCollapsed: false,
  metatubeUrl: "",
  metatubeToken: "",
  metatubeServerPath: "",
  scrapeAuto: false,
  relatedEnabled: true,
  notesRoot: "视频笔记",
  notesGrouping: "video",
  notesViewMode: "grid",
  noteAttachmentMode: "subfolder",
  noteAttachmentFolder: "attachments",
  noteScreenshotWidth: 1920,
  notePreviewDuration: 2,
  notePreviewTotal: 10,
  notePreviewMax: 300,
  noteMarkerShortcut: "Alt+M",
  noteSummaryShortcut: "Alt+G",
  bilibiliCookie: "",
  bilibiliUser: "",
  autoCheckUpdates: true,
  cloudAccounts: defaultCloudAccounts()
};

export function createDefaultData(): PluginData {
  return {
    version: DATA_VERSION,
    videos: [],
    categories: [],
    folders: [],
    tags: [],
    markers: DEFAULT_MARKERS.map((marker) => ({
      ...marker,
      createdAt: Date.now()
    })),
    noteGroups: [],
    trashNotes: [],
    trashImages: [],
    trashGroups: [],
    settings: {
      ...DEFAULT_SETTINGS,
      cloudAccounts: defaultCloudAccounts()
    }
  };
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
