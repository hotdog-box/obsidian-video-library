export type Provider = "bilibili" | "youtube" | "vimeo" | "direct" | "web" | "local";

export type LanguageSetting = "auto" | "zh" | "en";

export type SortMode = "newest" | "oldest" | "title-asc" | "title-desc" | "manual";

export type CardSize = "small" | "medium" | "large";

export type ViewMode = "grid" | "list";

export type TagMatchMode = "any" | "all";

export const DATA_VERSION = 5;

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

export const DEFAULT_SCRAPE_SITES: Marker[] = [
  {
    id: "site_metatube",
    name: "metatube-server",
    color: "#8b7fe8",
    kind: "site",
    enabled: true,
    capabilities: ["有码", "无码", "欧美"],
    url: "http://127.0.0.1:8080",
    description: "自建 MetaTube 聚合服务，一次配置即可查询多个来源。",
    createdAt: 0
  },
  {
    id: "site_fc2",
    name: "FC2 官方",
    color: "#e8a33d",
    kind: "site",
    enabled: true,
    metatubeProvider: "FC2",
    capabilities: ["有码", "无码", "欧美"],
    url: "https://adult.contents.fc2.com",
    description: "FC2-PPV 一手来源，标题、发售日、标签和卖家信息都在这里。",
    createdAt: 0
  },
  {
    id: "site_javdb",
    name: "JavDB",
    color: "#4f9dd9",
    kind: "site",
    enabled: false,
    capabilities: ["有码", "无码"],
    url: "https://javdb.com",
    description: "资料最全，但需要独立适配器；当前版本暂未启用。",
    createdAt: 0
  },
  {
    id: "site_javbus",
    name: "JavBus",
    color: "#5bb98c",
    kind: "site",
    enabled: true,
    metatubeProvider: "JavBus",
    capabilities: ["有码", "无码"],
    url: "https://www.javbus.com",
    description: "老牌聚合站，字段稳定，有码资料较全。",
    createdAt: 0
  },
  {
    id: "site_jav321",
    name: "JAV321",
    color: "#d6c04a",
    kind: "site",
    enabled: true,
    metatubeProvider: "JAV321",
    capabilities: ["有码"],
    url: "https://www.jav321.com",
    description: "不吃 Cloudflare，纯表单检索，适合作为补充来源。",
    createdAt: 0
  },
  {
    id: "site_mgs",
    name: "MGStage",
    color: "#d36bb3",
    kind: "site",
    enabled: true,
    metatubeProvider: "MGS",
    capabilities: ["有码"],
    url: "https://www.mgstage.com",
    description: "片商官方网站，片商资料准确。",
    createdAt: 0
  },
  {
    id: "site_heyzo",
    name: "HEYZO 官方",
    color: "#e46b6b",
    kind: "site",
    enabled: true,
    metatubeProvider: "HEYZO",
    capabilities: ["无码"],
    url: "https://www.heyzo.com",
    description: "片商官方网站，无码资料和番号匹配度高。",
    createdAt: 0
  },
  {
    id: "site_r18",
    name: "R18.dev",
    color: "#7a8a99",
    kind: "site",
    enabled: false,
    capabilities: ["有码", "无码"],
    url: "https://r18.dev",
    description: "需要独立适配器；当前版本暂未启用。",
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
  metatubeUrl: string;
  metatubeToken: string;
  metatubeServerPath: string;
  scrapeAuto: boolean;
}

export interface PluginData {
  version: number;
  videos: VideoItem[];
  categories: Category[];
  folders: Folder[];
  tags: Tag[];
  markers: Marker[];
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
  pinnedCollapsed: false,
  metatubeUrl: "",
  metatubeToken: "",
  metatubeServerPath: "",
  scrapeAuto: false
};

export function createDefaultData(): PluginData {
  return {
    version: DATA_VERSION,
    videos: [],
    categories: [],
    folders: [],
    tags: [],
    markers: [...DEFAULT_MARKERS, ...DEFAULT_SCRAPE_SITES].map((marker) => ({
      ...marker,
      createdAt: Date.now()
    })),
    settings: { ...DEFAULT_SETTINGS }
  };
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
