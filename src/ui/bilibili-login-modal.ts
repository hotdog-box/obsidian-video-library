import { App, Modal, Notice } from "obsidian";
import QRCode from "qrcode";
import { pollBilibiliLogin, startBilibiliLogin, type BilibiliLoginStart } from "../bilibili";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";

export class BilibiliLoginModal extends Modal {
  private canvas: HTMLCanvasElement | null = null;
  private statusEl: HTMLElement | null = null;
  private pollTimer = 0;
  private current: BilibiliLoginStart | null = null;
  private busy = false;

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private onLoggedIn: () => void
  ) {
    super(app);
    this.modalEl.addClass("vl-bili-login-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("bilibili.loginTitle"));
    this.contentEl.createEl("p", { text: t("bilibili.loginHint"), cls: "vl-modal-description" });
    const card = this.contentEl.createDiv({ cls: "vl-bili-qr-card" });
    this.canvas = card.createEl("canvas", { cls: "vl-bili-qr", attr: { width: "240", height: "240" } });
    this.statusEl = card.createDiv({ cls: "vl-bili-status", text: t("bilibili.waiting") });
    const buttons = this.contentEl.createDiv({ cls: "vl-modal-buttons" });
    const refresh = buttons.createEl("button", { text: t("bilibili.refresh"), attr: { type: "button" } });
    refresh.addEventListener("click", () => void this.refresh());
    const close = buttons.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    close.addEventListener("click", () => this.close());
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.stopPolling();
    if (!this.canvas || !this.statusEl) return;
    this.statusEl.setText(t("bilibili.loading"));
    try {
      this.current = await startBilibiliLogin();
      await QRCode.toCanvas(this.canvas, this.current.url, {
        width: 240,
        margin: 1,
        color: { dark: "#111111", light: "#ffffff" }
      });
      this.statusEl.setText(t("bilibili.waiting"));
      this.startPolling();
    } catch (error) {
      this.statusEl.setText(t("bilibili.failed", { error: String(error) }));
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => void this.poll(), 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = 0;
    }
  }

  private async poll(): Promise<void> {
    if (this.busy || !this.current) return;
    this.busy = true;
    try {
      const result = await pollBilibiliLogin(this.current.key);
      if (result.status === "waiting") {
        this.statusEl?.setText(t("bilibili.waiting"));
      } else if (result.status === "scanned") {
        this.statusEl?.setText(t("bilibili.scanned"));
      } else if (result.status === "expired") {
        this.stopPolling();
        this.statusEl?.setText(t("bilibili.expired"));
      } else if (result.status === "success" && result.cookie) {
        this.stopPolling();
        this.plugin.data.settings.bilibiliCookie = result.cookie;
        this.plugin.data.settings.bilibiliUser = result.user || "Bilibili";
        await this.plugin.persist();
        this.onLoggedIn();
        new Notice(t("bilibili.success"));
        this.close();
      } else if (result.status === "error") {
        this.statusEl?.setText(t("bilibili.failed", { error: result.message || "" }));
      }
    } catch (error) {
      this.statusEl?.setText(t("bilibili.failed", { error: String(error) }));
    } finally {
      this.busy = false;
    }
  }

  onClose(): void {
    this.stopPolling();
    this.contentEl.empty();
  }
}
