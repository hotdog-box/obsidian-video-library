import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { ClientRequest } from "node:http";

interface HttpModule {
  createServer: (handler: (request: IncomingMessage, response: ServerResponse) => void) => Server;
  get: (url: string, options: Record<string, unknown>, callback: (response: IncomingMessage) => void) => ClientRequest;
}

type HttpsModule = HttpModule;

function loadNode<T>(id: string): T | null {
  const loader = (window as unknown as { require?: (module: string) => unknown }).require;
  return typeof loader === "function" ? (loader(id) as T) : null;
}

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class StreamServer {
  private server: Server | null = null;
  private port = 0;
  private token = "";
  private starting: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.server) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const http = loadNode<HttpModule>("http");
      if (!http?.createServer) {
        reject(new Error("Node HTTP module unavailable"));
        return;
      }
      this.token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const server = http.createServer((request, response) => {
        void this.handle(http, request, response);
      });
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (typeof address === "object" && address) this.port = address.port;
        this.server = server;
        resolve();
      });
    }).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  get ready(): boolean {
    return Boolean(this.server && this.port);
  }

  urlFor(remoteUrl: string, headers: Record<string, string> = {}): string {
    if (!this.ready) return remoteUrl;
    const encodedHeaders = Buffer.from(JSON.stringify(headers), "utf8").toString("base64url");
    return `http://127.0.0.1:${this.port}/stream/${this.token}?url=${encodeURIComponent(
      remoteUrl
    )}&h=${encodedHeaders}`;
  }

  private async handle(http: HttpModule, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${this.port || 80}`);
    if (!requestUrl.pathname.startsWith(`/stream/${this.token}`)) {
      response.statusCode = 403;
      response.end("Forbidden");
      return;
    }
    const remote = requestUrl.searchParams.get("url");
    if (!remote) {
      response.statusCode = 400;
      response.end("Missing url");
      return;
    }
    let headers: Record<string, string> = {
      "User-Agent": DEFAULT_UA,
      Accept: "*/*"
    };
    const encoded = requestUrl.searchParams.get("h");
    if (encoded) {
      try {
        const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, string>;
        headers = { ...headers, ...decoded };
      } catch {
        // Ignore malformed headers.
      }
    }
    if (request.headers.range) headers.Range = request.headers.range;

    const target = new URL(remote);
    const isHttps = target.protocol === "https:";
    const module = loadNode<HttpsModule>(isHttps ? "https" : "http") || http;
    const client = module.get(
      target.toString(),
      {
        method: "GET",
        headers
      },
      (upstream) => {
        if (
          upstream.statusCode &&
          [301, 302, 303, 307, 308].includes(upstream.statusCode) &&
          upstream.headers.location
        ) {
          const next = new URL(upstream.headers.location, target).toString();
          const retryHeaders = Buffer.from(JSON.stringify(headers), "utf8").toString("base64url");
          const location = `http://127.0.0.1:${this.port}/stream/${this.token}?url=${encodeURIComponent(
            next
          )}&h=${retryHeaders}`;
          response.statusCode = 302;
          response.setHeader("Location", location);
          response.end();
          upstream.resume();
          return;
        }
        response.statusCode = upstream.statusCode || 502;
        for (const name of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
          "last-modified"
        ]) {
          const value = upstream.headers[name];
          if (value) response.setHeader(name, value);
        }
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
        response.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
        response.setHeader("Cache-Control", "no-store");
        upstream.pipe(response);
      }
    );
    client.on("error", (error) => {
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.end(String(error));
      } else {
        response.destroy(error);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
    }
  }
}
