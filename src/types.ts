export type Provider = "bilibili" | "youtube" | "vimeo" | "direct" | "web" | "local";

export type LanguageSetting = "auto" | "zh" | "en";

export type SortMode = "newest" | "oldest" | "title-asc" | "title-desc";

export type CardSize = "small" | "medium" | "large";

export const DATA_VERSION = 1;

export const UNCATEGORIZED_ID = "uncategorized";

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

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
  description?: string;
  categoryId: string;
  tags: string[];
  notes?: string;
  coverPath?: string;
  thumbnailUrl?: string;
  localPath?: string;
  duration?: number;
  epId?: number;
  preview?: PreviewConfig;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PluginSettings {
  language: LanguageSetting;
  sort: SortMode;
  cardSize: CardSize;
}

export interface PluginData {
  version: number;
  videos: VideoItem[];
  categories: Category[];
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
  cardSize: "medium"
};

export function createDefaultData(): PluginData {
  return {
    version: DATA_VERSION,
    videos: [],
    categories: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
