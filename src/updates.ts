import { requestUrl } from "obsidian";

export interface UpdateAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface UpdateRelease {
  tag_name: string;
  name: string;
  html_url: string;
  body?: string;
  published_at?: string;
  assets: UpdateAsset[];
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number(part.replace(/[^0-9].*$/, "")) || 0);
}

export function isNewerVersion(remote: string, local: string): boolean {
  const left = versionParts(remote);
  const right = versionParts(local);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export async function fetchLatestRelease(): Promise<UpdateRelease | null> {
  const response = await requestUrl({
    url: "https://api.github.com/repos/hotdog-box/obsidian-video-library/releases/latest",
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "video-library-update-check"
    }
  });
  const data = response.json as Partial<UpdateRelease>;
  if (!data.tag_name || !data.html_url) return null;
  return {
    tag_name: String(data.tag_name),
    name: String(data.name || data.tag_name),
    html_url: String(data.html_url),
    body: data.body ? String(data.body) : undefined,
    published_at: data.published_at ? String(data.published_at) : undefined,
    assets: Array.isArray(data.assets)
      ? data.assets
          .filter((asset) => asset && asset.name && asset.browser_download_url)
          .map((asset) => ({
            name: String(asset.name),
            browser_download_url: String(asset.browser_download_url),
            size: Number(asset.size) || undefined
          }))
      : []
  };
}
