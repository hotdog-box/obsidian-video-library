export type Provider = "bilibili" | "youtube" | "vimeo" | "direct" | "web" | "local";

export type LanguageSetting = "auto" | "zh" | "en";

export type SortMode = "newest" | "oldest" | "title-asc" | "title-desc" | "manual";

export type CardSize = "small" | "medium" | "large";

export type ViewMode = "grid" | "list";

export type TagMatchMode = "any" | "all";

export const DATA_VERSION = 3;

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
  categoryId: string;
  folderId?: string | null;
  tags: string[];
  notes?: string;
  coverPath?: string;
  thumbnailUrl?: string;
  localPath?: string;
  localExternal?: boolean;
  localLinkPath?: string;
  duration?: number;
  epId?: number;
  preview?: PreviewConfig;
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
}

export interface PluginData {
  version: number;
  videos: VideoItem[];
  categories: Category[];
  folders: Folder[];
  tags: Tag[];
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

export const DEFAULT_SETTINGS: PluginSettings = {
  language: "auto",
  sort: "newest",
  cardSize: "medium",
  viewMode: "grid",
  previewMuted: true,
  previewVolume: 0.8,
  tagMatchMode: "any",
  pinnedCollapsed: false
};

export function createDefaultData(): PluginData {
  return {
    version: DATA_VERSION,
    videos: [],
    categories: [],
    folders: [],
    tags: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
