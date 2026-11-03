import type { CloudProvider } from "./types";

interface CookieLike {
  name: string;
  value: string;
  domain?: string;
}

interface ElectronRemote {
  BrowserWindow?: new (options: Record<string, unknown>) => {
    loadURL: (url: string) => Promise<void>;
    on: (event: string, callback: () => void) => void;
    focus: () => void;
    show: () => void;
    webContents: { executeJavaScript: (code: string) => Promise<unknown> };
  };
  session?: {
    defaultSession?: {
      cookies: {
        get: (filter: { domain?: string }) => Promise<CookieLike[]>;
      };
    };
  };
}

function remote(): ElectronRemote | null {
  try {
    const electron = (window as unknown as {
      require?: (id: string) => { remote?: ElectronRemote };
    }).require?.("electron");
    return electron?.remote || null;
  } catch {
    return null;
  }
}

const LOGIN_URLS: Partial<Record<CloudProvider, string>> = {
  baidu: "https://pan.baidu.com/",
  quark: "https://pan.quark.cn/",
  aliyun: "https://www.aliyundrive.com/"
};

const COOKIE_DOMAINS: Partial<Record<CloudProvider, string>> = {
  baidu: ".baidu.com",
  quark: ".quark.cn",
  aliyun: ".aliyundrive.com"
};

const COOKIE_NAMES: Partial<Record<CloudProvider, string[]>> = {
  baidu: ["BDUSS", "STOKEN", "PANWEB", "BAIDUID", "BDUSS_BFESS"],
  quark: ["__puus", "__pus", "__kp", "__uid", "b-user-id"],
  aliyun: ["token", "refresh_token", "access_token"]
};

export async function captureCloudLogin(provider: CloudProvider): Promise<string | null> {
  const api = remote();
  const url = LOGIN_URLS[provider];
  if (!api?.BrowserWindow || !url) return null;
  const win = new api.BrowserWindow({
    width: 960,
    height: 760,
    title: `登录 ${provider}`,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadURL(url).catch(() => undefined);
  win.focus();
  win.show();
  await new Promise<void>((resolve) => {
    win.on("closed", () => resolve());
  });
  await new Promise((resolve) => window.setTimeout(resolve, 700));

  if (provider === "aliyun") {
    return null;
  }
  const domain = COOKIE_DOMAINS[provider];
  const names = COOKIE_NAMES[provider] || [];
  const store = api.session?.defaultSession;
  if (!store || !domain) return null;
  try {
    const cookies = await store.cookies.get({});
    const selected = cookies.filter(
      (cookie) => names.includes(cookie.name) && (!cookie.domain || cookie.domain.includes(domain.replace(/^\./, "")))
    );
    if (selected.length === 0) return null;
    return selected.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch {
    return null;
  }
}
