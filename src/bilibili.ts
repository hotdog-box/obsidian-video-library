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

export interface BilibiliStreamInfo {
  videoUrl: string;
  audioUrl?: string;
  duration?: number;
  quality: string;
  referer: string;
}

function cookieHeader(cookie: string): Record<string, string> {
  return cookie.trim() ? { Cookie: cookie.trim() } : {};
}

async function biliGet<T>(url: string, cookie = ""): Promise<BiliResponse<T>> {
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
  return response.json as BiliResponse<T>;
}

function parseLoginCookie(url: string): string | undefined {
  try {
    const params = new URL(url).searchParams;
    const sessdata = params.get("SESSDATA");
    const biliJct = params.get("bili_jct");
    const dedeUserId = params.get("DedeUserID");
    if (!sessdata) return undefined;
    const parts = [`SESSDATA=${sessdata}`];
    if (biliJct) parts.push(`bili_jct=${biliJct}`);
    if (dedeUserId) parts.push(`DedeUserID=${dedeUserId}`);
    return parts.join("; ");
  } catch {
    return undefined;
  }
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
  const response = await biliGet<{ url?: string; code?: number; message?: string }>(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`
  );
  if (response.code !== 0) return { status: "error", message: response.message };
  const code = Number(response.data?.code);
  if (code === 86101) return { status: "waiting" };
  if (code === 86090) return { status: "scanned" };
  if (code === 86038) return { status: "expired" };
  if (code !== 0) return { status: "error", message: response.data?.message || "Login failed" };
  const cookie = response.data?.url ? parseLoginCookie(response.data.url) : undefined;
  if (!cookie) return { status: "error", message: "Login succeeded but no cookie was returned" };
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
    const avc = videos.filter((item) => item.codecid === 7);
    const pool = avc.length > 0 ? avc : videos;
    pool.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    const selected = pool[0];
    const remoteVideo = selected.baseUrl || selected.base_url;
    if (!remoteVideo) return null;
    const audios = [...(data.dash.audio || [])].filter((item) => item.baseUrl || item.base_url);
    audios.sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0));
    const remoteAudio = audios[0]?.baseUrl || audios[0]?.base_url;
    return {
      videoUrl: streamServer.urlFor(remoteVideo, headers),
      audioUrl: remoteAudio ? streamServer.urlFor(remoteAudio, headers) : undefined,
      duration: data.dash.duration,
      quality: QUALITY_NAMES[Number(selected.id) || 0] || "Bilibili",
      referer
    };
  }

  const progressive = data.durl?.[0]?.url;
  if (progressive) {
    return {
      videoUrl: streamServer.urlFor(progressive, headers),
      duration: data.durl?.[0]?.length,
      quality: QUALITY_NAMES[Number(data.quality) || 64] || "Bilibili",
      referer
    };
  }
  return null;
}
