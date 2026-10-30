import type { ParsedVideo, Provider } from "./types";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com"
]);

const BILIBILI_HOSTS = new Set([
  "bilibili.com",
  "m.bilibili.com",
  "player.bilibili.com",
  "b23.tv"
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "player.vimeo.com"]);

const DIRECT_EXTENSIONS = new Set(["mp4", "webm", "ogv", "ogg", "mov", "m4v"]);

export function normalizeUrlInput(raw: string): string {
  let value = raw.trim();
  if (!value) return value;
  if (value.startsWith("//")) value = `https:${value}`;
  if (/^www\./i.test(value)) value = `https://${value}`;
  if (/^(m\.)?(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|vimeo\.com)\//i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function youtubeId(url: URL): string | undefined {
  const host = hostOf(url);
  if (host === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0];
  }
  if (!YOUTUBE_HOSTS.has(host)) return undefined;

  const v = url.searchParams.get("v");
  if (v) return v;

  const match = url.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?#]+)/i);
  return match?.[1];
}

function validYoutubeId(id: string | undefined): string | undefined {
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
}

function parseBilibiliId(url: URL): string | undefined {
  const bvid = url.searchParams.get("bvid");
  if (bvid && /^BV[0-9A-Za-z]{10}$/.test(bvid)) {
    return `BV${bvid.slice(2)}`;
  }
  const aid = url.searchParams.get("aid");
  if (aid && /^\d+$/.test(aid)) return `av${aid}`;

  const pathMatch = url.pathname.match(/\/video\/((?:BV[0-9A-Za-z]{10})|(?:av\d+))/i);
  if (pathMatch) {
    const found = pathMatch[1];
    if (/^bv/i.test(found)) return `BV${found.slice(2)}`;
    return found.toLowerCase();
  }
  return undefined;
}

function parseBilibili(url: URL): ParsedVideo {
  const videoId = parseBilibiliId(url);
  const pageValue = Number(url.searchParams.get("p") || "1");
  const page = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1;
  const host = hostOf(url);

  return {
    provider: "bilibili",
    videoId,
    canonicalUrl: videoId ? `https://www.bilibili.com/video/${videoId}` : url.href,
    embedUrl: videoId ? buildBilibiliEmbed(videoId, page) : undefined,
    isShortLink: host === "b23.tv",
    page
  };
}

function parseYoutube(url: URL): ParsedVideo | undefined {
  const id = validYoutubeId(youtubeId(url));
  if (!id) return undefined;
  return {
    provider: "youtube",
    videoId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`
  };
}

function parseVimeo(url: URL): ParsedVideo | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts.find((part) => /^\d{5,12}$/.test(part));
  if (!id) return undefined;
  const index = parts.indexOf(id);
  const hash = parts[index + 1] && /^[a-zA-Z0-9]+$/.test(parts[index + 1]) ? parts[index + 1] : undefined;
  const embed = `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`;
  return {
    provider: "vimeo",
    videoId: id,
    vimeoHash: hash,
    canonicalUrl: url.href,
    embedUrl: embed
  };
}

function directExtension(url: URL): string | undefined {
  const match = url.pathname.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match && DIRECT_EXTENSIONS.has(match[1]) ? match[1] : undefined;
}

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const normalized = normalizeUrlInput(raw);
  if (!isValidHttpUrl(normalized)) return null;

  const url = new URL(normalized);
  const host = hostOf(url);

  const youtube = parseYoutube(url);
  if (youtube) return youtube;

  if (BILIBILI_HOSTS.has(host) || host.endsWith(".bilibili.com")) {
    return parseBilibili(url);
  }

  if (VIMEO_HOSTS.has(host) || host.endsWith(".vimeo.com")) {
    const vimeo = parseVimeo(url);
    if (vimeo) return vimeo;
  }

  const extension = directExtension(url);
  if (extension) {
    return {
      provider: "direct",
      canonicalUrl: url.href
    };
  }

  return {
    provider: "web",
    canonicalUrl: url.href
  };
}

export function buildBilibiliEmbed(videoId: string, page = 1): string {
  const params = new URLSearchParams({
    page: String(page),
    high_quality: "1",
    danmaku: "0",
    autoplay: "0"
  });
  if (/^av\d+$/i.test(videoId)) {
    params.set("aid", videoId.slice(2));
  } else {
    params.set("bvid", videoId);
  }
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

export function buildEmbedUrl(provider: Provider, videoId?: string, page = 1, vimeoHash?: string): string | undefined {
  if (provider === "youtube" && videoId) {
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
  }
  if (provider === "bilibili" && videoId) {
    return buildBilibiliEmbed(videoId, page);
  }
  if (provider === "vimeo" && videoId) {
    return `https://player.vimeo.com/video/${videoId}${vimeoHash ? `?h=${vimeoHash}` : ""}`;
  }
  return undefined;
}

export function fallbackTitleFromUrl(raw: string): string {
  try {
    const url = new URL(normalizeUrlInput(raw));
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    const cleaned = last.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ").trim();
    if (cleaned && cleaned.length > 1) return cleaned;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.trim() || "Video";
  }
}

export function hostLabel(raw: string): string {
  try {
    return new URL(normalizeUrlInput(raw)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function defaultCoverFor(provider: Provider): string {
  return provider;
}
