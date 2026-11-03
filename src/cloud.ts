import { requestUrl } from "obsidian";
import type { CloudProvider } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function cloudHeaders(provider: CloudProvider, credential: string): Record<string, string> {
  const value = credential.trim();
  if (!value) return {};
  if (provider === "baidu") {
    let cookie = value.includes("=") ? value : `BDUSS=${value}`;
    if (!/(?:^|;\s*)BDUSS=/.test(cookie)) {
      const match = cookie.match(/(?:^|;\s*)BDUSS_BFESS=([^;]+)/);
      if (match?.[1]) cookie = `BDUSS=${match[1]}; ${cookie}`;
    }
    return {
      Cookie: cookie,
      Referer: "https://pan.baidu.com/",
      "User-Agent": UA
    };
  }
  if (provider === "quark") {
    return {
      Cookie: value.includes("=") ? value : `__puus=${value}`,
      Referer: "https://pan.quark.cn/",
      "User-Agent": UA
    };
  }
  const token = value.replace(/^Bearer\s+/i, "");
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": UA
  };
}

export async function testCloudAccount(
  provider: CloudProvider,
  credential: string
): Promise<{ ok: boolean; name?: string; error?: string }> {
  if (!credential.trim()) return { ok: false, error: "Credential is empty" };
  const headers = cloudHeaders(provider, credential);
  try {
    if (provider === "baidu") {
      const response = await requestUrl({
        url: "https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo",
        method: "GET",
        headers
      });
      const data = response.json as { errno?: number; baidu_name?: string };
      if (data.errno === 0) return { ok: true, name: data.baidu_name || "Baidu Pan" };
      return { ok: false, error: `Baidu errno ${data.errno ?? "unknown"}` };
    }
    if (provider === "quark") {
      const response = await requestUrl({
        url: "https://drive-pc.quark.cn/1/clouddrive/config?pr=ucpro&fr=pc",
        method: "GET",
        headers
      });
      const data = response.json as { code?: number; message?: string; data?: { nickname?: string } };
      if (data.code === 0) return { ok: true, name: data.data?.nickname || "Quark Drive" };
      return { ok: false, error: data.message || `Quark code ${data.code ?? "unknown"}` };
    }
    if (provider === "aliyun") {
      const response = await requestUrl({
        url: "https://api.aliyundrive.com/v2/user/get",
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}"
      });
      const data = response.json as { nick_name?: string; user_name?: string; message?: string };
      if (data.user_name || data.nick_name) return { ok: true, name: data.nick_name || data.user_name };
      return { ok: false, error: data.message || "Aliyun token rejected" };
    }
    const response = await requestUrl({
      url: "https://graph.microsoft.com/v1.0/me",
      method: "GET",
      headers
    });
    const data = response.json as { displayName?: string; userPrincipalName?: string };
    return { ok: true, name: data.displayName || data.userPrincipalName || "OneDrive" };
  } catch (error) {
    const status = (error as { status?: number }).status;
    return { ok: false, error: status ? `HTTP ${status}` : String(error) };
  }
}
