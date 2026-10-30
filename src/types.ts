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
