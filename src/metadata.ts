import { requestUrl } from "obsidian";
import type { ParsedVideo, VideoMetadata } from "./types";
import { buildBilibiliEmbed, fallbackTitleFromUrl, normalizeUrlInput, parseVideoUrl } from "./providers";

const HTML_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  canonical?: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    if (value.startsWith("//")) return `https:${value}`;
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

function secureMediaUrl(value: string | undefined, base: string): string | undefined {
  const resolved = absoluteUrl(value, base);
  if (!resolved) return undefined;
  try {
    const url = new URL(resolved);
    if (url.protocol === "http:" && /(^|\.)(hdslb\.com|bilibili\.com)$/i.test(url.hostname)) {
      url.protocol = "https:";
    }
    return url.href;
  } catch {
    return resolved;
  }
}

export function extractPageMeta(html: string, baseUrl: string): PageMeta {
  const meta: Record<string, string> = {};
  const metaRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(html))) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.property || attributes.name || "").toLowerCase();
    if (key && attributes.content) {
      if (!meta[key]) meta[key] = attributes.content;
    }
  }

  const linkRegex = /<link\b[^>]*>/gi;
  let canonical: string | undefined;
  while ((match = linkRegex.exec(html))) {
    const attributes = parseAttributes(match[0]);
    if ((attributes.rel || "").toLowerCase() === "canonical" && attributes.href) {
      canonical = attributes.href;
      break;
    }
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = meta["og:title"] || meta["twitter:title"] || titleMatch?.[1] || "";
  const image = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || meta["twitter:image:src"];

  return {
    title: cleanTitle(rawTitle),
    description: meta["og:description"] || meta.description || meta["twitter:description"],
    image: absoluteUrl(image, baseUrl),
    siteName: meta["og:site_name"],
    canonical: absoluteUrl(canonical || meta["og:url"], baseUrl)
  };
}

export function cleanTitle(raw: string): string {
  let value = decodeEntities(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  value = value
    .replace(/\s*[-_|]\s*YouTube\s*$/i, "")
    .replace(/\s*[-_|]\s*Bilibili\s*$/i, "")
    .replace(/_哔哩哔哩_bilibili\s*$/i, "")
    .replace(/\s*[-_|]\s*哔哩哔哩\s*$/i, "")
    .trim();
  return value;
}

async function getPage(url: string): Promise<{ html: string; meta: PageMeta }> {
  const response = await requestUrl({
    url,
    method: "GET",
    headers: HTML_HEADERS
  });
  const html = response.text;
  return { html, meta: extractPageMeta(html, url) };
}

async function resolveBilibiliShortLink(url: string): Promise<{ url: string; meta: PageMeta }> {
  const page = await getPage(url);
  const fromMeta = page.meta.canonical;
  const fromHtml = page.html.match(/https?:\/\/www\.bilibili\.com\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i)?.[0];
  return { url: fromMeta || fromHtml || url, meta: page.meta };
}

async function fetchBilibili(url: string, parsed: ParsedVideo): Promise<VideoMetadata> {
  let bvid = parsed.videoId;
  let canonical = parsed.canonicalUrl;
  let pageMeta: PageMeta | undefined;
  const page = parsed.page || 1;

  if (!bvid || parsed.isShortLink) {
    try {
      const resolved = await resolveBilibiliShortLink(url);
      const next = parseVideoUrl(resolved.url);
      if (next?.provider === "bilibili" && next.videoId) {
        bvid = next.videoId;
        canonical = next.canonicalUrl;
        pageMeta = resolved.meta;
      }
    } catch {
      // The page fallback below will report what it can.
    }
  }

  if (bvid) {
    try {
      const query = /^av\d+$/i.test(bvid) ? `aid=${bvid.slice(2)}` : `bvid=${bvid}`;
      const response = await requestUrl({
        url: `https://api.bilibili.com/x/web-interface/view?${query}`,
        method: "GET",
        headers: {
          Referer: "https://www.bilibili.com/",
          Accept: "application/json"
        }
      });
      const json = response.json as {
        code?: number;
        data?: {
          bvid?: string;
          title?: string;
          pic?: string;
          duration?: number;
          owner?: { name?: string };
        };
      };
      if (json?.code === 0 && json.data) {
        const data = json.data;
        const resolvedId = data.bvid || bvid;
        return {
          title: data.title ? cleanTitle(data.title) : undefined,
          author: data.owner?.name,
          thumbnailUrl: data.pic ? secureMediaUrl(data.pic, "https://www.bilibili.com/") : undefined,
          duration: data.duration,
          videoId: resolvedId,
          canonicalUrl: `https://www.bilibili.com/video/${resolvedId}${page > 1 ? `?p=${page}` : ""}`,
          embedUrl: buildBilibiliEmbed(resolvedId, page)
        };
      }
    } catch {
      // Fall through to the HTML metadata.
    }
  }

  try {
    if (!pageMeta) {
      const pageResult = await getPage(canonical.startsWith("http") ? canonical : url);
      pageMeta = pageResult.meta;
    }
    return {
      title: pageMeta.title,
      thumbnailUrl: secureMediaUrl(pageMeta.image, "https://www.bilibili.com/"),
      canonicalUrl: bvid
        ? `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ""}`
        : pageMeta.canonical || canonical,
      videoId: bvid,
      embedUrl: bvid ? buildBilibiliEmbed(bvid, page) : undefined
    };
  } catch {
    return { videoId: bvid, embedUrl: bvid ? buildBilibiliEmbed(bvid, page) : undefined };
  }
}

async function fetchYoutube(parsed: ParsedVideo): Promise<VideoMetadata> {
  const id = parsed.videoId;
  const fallback: VideoMetadata = {
    title: id ? `YouTube video ${id}` : undefined,
    thumbnailUrl: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined,
    videoId: id,
    canonicalUrl: parsed.canonicalUrl,
    embedUrl: parsed.embedUrl
  };

  try {
    const response = await requestUrl({
      url: `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}&format=json`,
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const json = response.json as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      ...fallback,
      title: json.title ? cleanTitle(json.title) : fallback.title,
      author: json.author_name,
      thumbnailUrl: json.thumbnail_url || fallback.thumbnailUrl
    };
  } catch {
    try {
      const page = await getPage(parsed.canonicalUrl);
      return {
        ...fallback,
        title: page.meta.title || fallback.title,
        thumbnailUrl: page.meta.image || fallback.thumbnailUrl
      };
    } catch {
      return fallback;
    }
  }
}

async function fetchVimeo(parsed: ParsedVideo): Promise<VideoMetadata> {
  try {
    const response = await requestUrl({
      url: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.canonicalUrl)}`,
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const json = response.json as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      duration?: number;
    };
    return {
      title: json.title ? cleanTitle(json.title) : undefined,
      author: json.author_name,
      thumbnailUrl: json.thumbnail_url,
      duration: json.duration,
      canonicalUrl: parsed.canonicalUrl,
      videoId: parsed.videoId,
      embedUrl: parsed.embedUrl
    };
  } catch {
    return {
      canonicalUrl: parsed.canonicalUrl,
      videoId: parsed.videoId,
      embedUrl: parsed.embedUrl
    };
  }
}

async function fetchWeb(url: string): Promise<VideoMetadata> {
  const page = await getPage(url);
  return {
    title: page.meta.title,
    author: page.meta.siteName,
    thumbnailUrl: page.meta.image,
    canonicalUrl: page.meta.canonical || url
  };
}

export async function fetchVideoMetadata(rawUrl: string, parsed: ParsedVideo): Promise<VideoMetadata> {
  const url = normalizeUrlInput(rawUrl);

  switch (parsed.provider) {
    case "bilibili":
      return fetchBilibili(url, parsed);
    case "youtube":
      return fetchYoutube(parsed);
    case "vimeo":
      return fetchVimeo(parsed);
    case "direct":
      return {
        title: fallbackTitleFromUrl(url),
        canonicalUrl: parsed.canonicalUrl
      };
    case "local":
      return {};
    default:
      return fetchWeb(url);
  }
}
