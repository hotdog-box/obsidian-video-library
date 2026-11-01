import { requestUrl } from "obsidian";
import type { VideoItem } from "./types";

export interface MetaTubeSearchResult {
  id: string;
  number?: string;
  title: string;
  provider: string;
  homepage?: string;
  thumb_url?: string;
  cover_url?: string;
  score?: number;
  actors?: string[];
  release_date?: string;
}

export interface MetaTubeMovie {
  id: string;
  number?: string;
  title: string;
  summary?: string;
  provider: string;
  homepage?: string;
  director?: string;
  actors?: string[];
  thumb_url?: string;
  cover_url?: string;
  big_cover_url?: string;
  maker?: string;
  label?: string;
  series?: string;
  genres?: string[];
  score?: number;
  runtime?: number;
  release_date?: string;
  preview_images?: string[];
}

export interface MetaTubeConfig {
  url: string;
  token: string;
}

export interface ScrapeFieldOptions {
  cover: boolean;
  title: boolean;
  author: boolean;
  studio: boolean;
  series: boolean;
  performers: boolean;
  tags: boolean;
  description: boolean;
  releaseDate: boolean;
  duration: boolean;
}

export const DEFAULT_SCRAPE_FIELDS: ScrapeFieldOptions = {
  cover: true,
  title: false,
  author: true,
  studio: true,
  series: true,
  performers: true,
  tags: true,
  description: true,
  releaseDate: true,
  duration: true
};

interface MetaTubeResponse<T> {
  data?: T;
  error?: { message?: string; code?: number } | string;
}

export class MetaTubeClient {
  constructor(private config: MetaTubeConfig) {}

  get configured(): boolean {
    return Boolean(this.config.url.trim());
  }

  private baseUrl(): string {
    return this.config.url.trim().replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.token.trim()) headers.Authorization = `Bearer ${this.config.token.trim()}`;
    return headers;
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.configured) throw new Error("MetaTube URL is not configured");
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("MetaTube request timed out")), 8000);
    });
    const response = await Promise.race([
      requestUrl({ url: `${this.baseUrl()}${path}`, method: "GET", headers: this.headers() }),
      timeout
    ]);
    if (response.status >= 400) {
      throw new Error(`MetaTube HTTP ${response.status}`);
    }
    const payload = response.json as MetaTubeResponse<T>;
    if (payload.error) {
      const message =
        typeof payload.error === "string" ? payload.error : payload.error.message || "MetaTube request failed";
      throw new Error(message);
    }
    if (payload.data === undefined) throw new Error("MetaTube returned no data");
    return payload.data;
  }

  async search(query: string, provider?: string): Promise<MetaTubeSearchResult[]> {
    const params = new URLSearchParams({ q: query, fallback: "true" });
    if (provider?.trim()) params.set("provider", provider.trim());
    return this.get<MetaTubeSearchResult[]>(`/v1/movies/search?${params.toString()}`);
  }

  async movie(provider: string, id: string): Promise<MetaTubeMovie> {
    return this.get<MetaTubeMovie>(
      `/v1/movies/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`
    );
  }

  async providers(): Promise<Record<string, string>> {
    const data = await this.get<{ movie_providers?: Record<string, string> }>("/v1/providers");
    return data.movie_providers || {};
  }
}

export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

export function cleanScrapeQuery(title: string): string {
  return title
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[（(][^）)]{1,30}[）)]/g, " ")
    .replace(/\b(?:1080p|720p|2160p|4k|fhd|hd|sd|uncensored|leak|完整版|无码|中字)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scrapeQueries(video: VideoItem): string[] {
  const title = cleanScrapeQuery(video.title || "");
  const queries: string[] = [];
  const code = title.match(/\b([A-Za-z]{2,8})[-_ ]?(\d{2,6})\b/);
  if (code) queries.push(`${code[1].toUpperCase()}-${code[2]}`);
  if (title) queries.push(title);
  return [...new Set(queries)];
}

export function metatubeProviderForVideo(video: VideoItem, markers: { id: string; metatubeProvider?: string }[]): string | undefined {
  const ids = video.markers || [];
  for (const marker of markers) {
    if (!ids.includes(marker.id)) continue;
    if (marker.metatubeProvider?.trim()) return marker.metatubeProvider.trim();
  }
  return undefined;
}
