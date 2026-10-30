import { App, normalizePath, requestUrl, TFile } from "obsidian";

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp"
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function extensionFromType(contentType: string | undefined): string {
  const type = (contentType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("avif")) return "avif";
  if (type.includes("bmp")) return "bmp";
  return "jpg";
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const match = new URL(url).pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif|bmp)$/);
    return match ? match[1].replace("jpeg", "jpg") : undefined;
  } catch {
    return undefined;
  }
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function waitForEvent(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video ${event} failed`));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`video ${event} timed out`));
    }, timeoutMs);
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export class CoverStore {
  private objectUrls = new Map<string, string>();
  private coversDir: string;

  constructor(private app: App, private pluginDir: string) {
    this.coversDir = normalizePath(`${pluginDir}/covers`);
  }

  get directory(): string {
    return this.coversDir;
  }

  async ensureDirectory(): Promise<void> {
    if (!(await this.app.vault.adapter.exists(this.coversDir))) {
      await this.app.vault.adapter.mkdir(this.coversDir);
    }
  }

  async getUrl(path: string | undefined): Promise<string | null> {
    if (!path) return null;
    const cached = this.objectUrls.get(path);
    if (cached) return cached;
    try {
      const buffer = await this.app.vault.adapter.readBinary(normalizePath(path));
      const extension = path.split(".").pop()?.toLowerCase() || "jpg";
      const blob = new Blob([buffer], { type: IMAGE_TYPES[extension] || "image/jpeg" });
      const url = URL.createObjectURL(blob);
      this.objectUrls.set(path, url);
      return url;
    } catch {
      return null;
    }
  }

  previewBuffer(buffer: ArrayBuffer, extension = "jpg"): string {
    const blob = new Blob([buffer], { type: IMAGE_TYPES[extension] || "image/jpeg" });
    return URL.createObjectURL(blob);
  }

  async saveBuffer(buffer: ArrayBuffer, extension = "jpg"): Promise<string> {
    await this.ensureDirectory();
    const safeExtension = IMAGE_TYPES[extension] ? extension : "jpg";
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${safeExtension}`;
    const path = normalizePath(`${this.coversDir}/${name}`);
    await this.app.vault.adapter.writeBinary(path, buffer);
    return path;
  }

  async saveVaultImage(file: TFile): Promise<string> {
    const buffer = await this.app.vault.readBinary(file);
    const extension = file.extension.toLowerCase();
    return this.saveBuffer(buffer, extension);
  }

  async fetchImage(url: string, referer?: string): Promise<{ buffer: ArrayBuffer; extension: string }> {
    const headers: Record<string, string> = {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    };
    if (referer) headers.Referer = referer;

    const response = await requestUrl({ url, method: "GET", headers });
    const contentType = headerValue(response.headers, "content-type");
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Not an image: ${contentType}`);
    }
    if (response.arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image is too large");
    }
    const extension = extensionFromType(contentType) || extensionFromUrl(url) || "jpg";
    return { buffer: response.arrayBuffer, extension };
  }

  async downloadImage(url: string, referer?: string): Promise<string> {
    const image = await this.fetchImage(url, referer);
    return this.saveBuffer(image.buffer, image.extension);
  }

  async delete(path: string | undefined): Promise<void> {
    if (!path) return;
    const url = this.objectUrls.get(path);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(path);
    }
    try {
      if (await this.app.vault.adapter.exists(normalizePath(path))) {
        await this.app.vault.adapter.remove(normalizePath(path));
      }
    } catch {
      // A missing cover should never block deleting a video.
    }
  }

  async count(): Promise<number> {
    try {
      if (!(await this.app.vault.adapter.exists(this.coversDir))) return 0;
      const listing = await this.app.vault.adapter.list(this.coversDir);
      return listing.files.filter((file) => /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file)).length;
    } catch {
      return 0;
    }
  }

  async captureVideoFrame(src: string, ratio = 0.12): Promise<ArrayBuffer | null> {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.top = "0";
    video.style.width = "2px";
    video.style.height = "2px";
    video.style.opacity = "0";
    video.src = src;
    document.body.appendChild(video);

    try {
      video.load();
      await waitForEvent(video, "loadedmetadata", 15000);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration > 0.4) {
        const target = Math.min(Math.max(duration * ratio, 0.1), duration - 0.1);
        video.currentTime = target;
        try {
          await waitForEvent(video, "seeked", 10000);
        } catch {
          await waitForEvent(video, "loadeddata", 5000);
        }
      } else {
        await waitForEvent(video, "loadeddata", 10000);
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
      return blob ? await blob.arrayBuffer() : null;
    } catch {
      return null;
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
  }

  dispose(): void {
    for (const url of this.objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }
}
