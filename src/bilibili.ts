import { requestUrl } from "obsidian";
import type { VideoItem } from "./types";
import { parseVideoUrl } from "./providers";
import type { StreamServer } from "./stream-server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const QUALITY_NAMES: Record<number, string> = {
  127: "8K",
  126: "Dolby Vision",
  125: "HDR",
  120: "4K",
  116: "1080P60",
  112: "1080P+",
  80: "1080P",
  74: "720P60",
  64: "720P",
  32: "480P",
  16: "360P"
};

interface BiliResponse<T> {
  code?: number;
  message?: string;
  data?: T;
}

export interface BilibiliLoginStart {
  url: string;
  key: string;
}

export interface BilibiliLoginPoll {
  status: "waiting" | "scanned" | "success" | "expired" | "error";
  message?: string;
  cookie?: string;
  user?: string;
}

export interface BilibiliQuality {
  id: number;
  label: string;
  videoUrl: string;
  audioUrl?: string;
}

export interface BilibiliStreamInfo {
  videoUrl: string;
  audioUrl?: string;
  duration?: number;
  quality: string;
  referer: string;
  qualities: BilibiliQuality[];
}

function cookieHeader(cookie: string): Record<string, string> {
  return cookie.trim() ? { Cookie: cookie.trim() } : {};
}

async function biliGetWithHeaders<T>(
  url: string,
  cookie = ""
): Promise<{ json: BiliResponse<T>; headers: Record<string, string> }> {
  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.bilibili.com/",
      "User-Agent": UA,
      ...cookieHeader(cookie)
    }
  });
  return {
    json: response.json as BiliResponse<T>,
    headers: (response.headers || {}) as Record<string, string>
  };
}

async function biliGet<T>(url: string, cookie = ""): Promise<BiliResponse<T>> {
  return (await biliGetWithHeaders<T>(url, cookie)).json;
}

function parseSetCookieHeader(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  const raw = headers["set-cookie"] || headers["Set-Cookie"];
  if (!raw) return result;
  const text = Array.isArray(raw) ? raw.join("\n") : String(raw);
  for (const name of ["SESSDATA", "bili_jct", "DedeUserID"]) {
    const match = text.match(new RegExp(`(?:^|[,\\n])\\s*${name}=([^;\\n]+)`));
    if (match?.[1]) result[name] = decodeURIComponent(match[1]);
  }
  return result;
}

function mergeLoginCookie(url: string | undefined, headers: Record<string, string>): string | undefined {
  const values: Record<string, string> = {};
  if (url) {
    try {
      const params = new URL(url).searchParams;
      for (const name of ["SESSDATA", "bili_jct", "DedeUserID"]) {
        const value = params.get(name);
        if (value) values[name] = value;
      }
    } catch {
      // Ignore malformed redirect URLs.
    }
  }
  Object.assign(values, parseSetCookieHeader(headers));
  if (!values.SESSDATA) return undefined;
  const parts = [`SESSDATA=${values.SESSDATA}`];
  if (values.bili_jct) parts.push(`bili_jct=${values.bili_jct}`);
  if (values.DedeUserID) parts.push(`DedeUserID=${values.DedeUserID}`);
  return parts.join("; ");
}

export async function startBilibiliLogin(): Promise<BilibiliLoginStart> {
  const response = await biliGet<{ url?: string; qrcode_key?: string }>(
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
  );
  if (response.code !== 0 || !response.data?.url || !response.data.qrcode_key) {
    throw new Error(response.message || "Could not create a Bilibili login QR code");
  }
  return { url: response.data.url, key: response.data.qrcode_key };
}

export async function pollBilibiliLogin(key: string): Promise<BilibiliLoginPoll> {
  const result = await biliGetWithHeaders<{
    url?: string;
    code?: number;
    message?: string;
    refresh_token?: string;
  }>(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`
  );
  const response = result.json;
  if (response.code !== 0) return { status: "error", message: response.message };
  const code = Number(response.data?.code);
  if (code === 86101) return { status: "waiting" };
  if (code === 86090) return { status: "scanned" };
  if (code === 86038) return { status: "expired" };
  if (code !== 0) return { status: "error", message: response.data?.message || "Login failed" };
  const cookie = mergeLoginCookie(response.data?.url, result.headers);
  if (!cookie) {
    return {
      status: "error",
      message: "Login succeeded but SESSDATA was not returned. Bilibili may require phone verification; try again."
    };
  }
  const user = await getBilibiliUser(cookie);
  return { status: "success", cookie, user: user?.name };
}

export async function getBilibiliUser(cookie: string): Promise<{ name: string; avatar?: string } | null> {
  try {
    const response = await biliGet<{ isLogin?: boolean; uname?: string; face?: string }>(
      "https://api.bilibili.com/x/web-interface/nav",
      cookie
    );
    if (response.code !== 0 || !response.data?.isLogin) return null;
    return { name: response.data.uname || "Bilibili", avatar: response.data.face };
  } catch {
    return null;
  }
}

async function getCid(id: string, cookie: string): Promise<number | undefined> {
  try {
    const param = /^av\d+$/i.test(id)
      ? `aid=${encodeURIComponent(id.slice(2))}`
      : `bvid=${encodeURIComponent(id)}`;
    const response = await biliGet<Array<{ cid?: number; page?: number }>>(
      `https://api.bilibili.com/x/player/pagelist?${param}&jsonp=jsonp`,
      cookie
    );
    return response.code === 0 ? Number(response.data?.[0]?.cid) || undefined : undefined;
  } catch {
    return undefined;
  }
}

interface DashMedia {
  id?: number;
  baseUrl?: string;
  base_url?: string;
  bandwidth?: number;
  codecid?: number;
}

interface PlayUrlData {
  quality?: number;
  dash?: {
    duration?: number;
    video?: DashMedia[];
    audio?: DashMedia[];
  };
  durl?: Array<{ url?: string; length?: number }>;
  accept_quality?: number[];
}

export async function resolveBilibiliStream(
  video: VideoItem,
  cookie: string,
  streamServer: StreamServer
): Promise<BilibiliStreamInfo | null> {
  const parsed = video.url ? parseVideoUrl(video.url) : null;
  const bvid = video.videoId || parsed?.videoId;
  if (!bvid) return null;
  const cid = await getCid(bvid, cookie);
  if (!cid) return null;
  const isAv = /^av\d+$/i.test(bvid);
  const query = new URLSearchParams({
    ...(isAv ? { aid: bvid.slice(2) } : { bvid }),
    cid: String(cid),
    qn: "127",
    fnval: "4048",
    fourk: "1",
    platform: "pc"
  });
  const response = await biliGet<PlayUrlData>(
    `https://api.bilibili.com/x/player/playurl?${query.toString()}`,
    cookie
  );
  if (response.code !== 0 || !response.data) return null;
  const data = response.data;
  const referer = `https://www.bilibili.com/video/${bvid}`;
  const headers = { Referer: referer, "User-Agent": UA };

  if (data.dash?.video?.length) {
    const videos = [...data.dash.video].filter((item) => item.baseUrl || item.base_url);
    const audios = [...(data.dash.audio || [])].filter((item) => item.baseUrl || item.base_url);
    audios.sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0));
    const remoteAudio = audios[0]?.baseUrl || audios[0]?.base_url;
    const byQuality = new Map<number, DashMedia>();
    for (const item of videos) {
      const id = Number(item.id) || 0;
      const existing = byQuality.get(id);
      if (!existing || (item.codecid === 7 && existing.codecid !== 7)) byQuality.set(id, item);
    }
    const qualities: BilibiliQuality[] = [...byQuality.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([id, item]) => {
        const remoteVideo = item.baseUrl || item.base_url || "";
        return {
          id,
          label: QUALITY_NAMES[id] || String(id),
          videoUrl: streamServer.urlFor(remoteVideo, headers),
          audioUrl: remoteAudio ? streamServer.urlFor(remoteAudio, headers) : undefined
        };
      })
      .filter((item) => Boolean(item.videoUrl));
    const selected = qualities[0];
    if (!selected) return null;
    return {
      videoUrl: selected.videoUrl,
      audioUrl: selected.audioUrl,
      duration: data.dash.duration,
      quality: selected.label,
      referer,
      qualities
    };
  }

  const progressive = data.durl?.[0]?.url;
  if (progressive) {
    const quality = QUALITY_NAMES[Number(data.quality) || 64] || "Bilibili";
    return {
      videoUrl: streamServer.urlFor(progressive, headers),
      duration: data.durl?.[0]?.length,
      quality,
      referer,
      qualities: [
        {
          id: Number(data.quality) || 64,
          label: quality,
          videoUrl: streamServer.urlFor(progressive, headers)
        }
      ]
    };
  }
  return null;
}
