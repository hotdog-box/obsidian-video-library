import { App, Notice, PluginSettingTab, setIcon, Setting, type SettingDefinitionItem } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CardSize, CloudProvider, LanguageSetting, Marker, NoteAttachmentMode } from "../types";
import { isNewerVersion } from "../updates";
import { BilibiliLoginModal } from "./bilibili-login-modal";
import { CloudAddModal } from "./cloud-add-modal";
import { CloudLoginModal } from "./cloud-login-modal";
import { ConfirmModal } from "./common";
import { MarkerEditModal } from "./marker-modal";

export class VideoLibrarySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VideoLibraryPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const dataPath = `${this.plugin.manifest.dir || `${this.app.vault.configDir}/plugins/video-library`}/data.json`;
    return [
      {
        type: "group",
        heading: t("settings.title"),
        items: [
          {
            name: t("settings.language"),
            desc: t("settings.languageDesc"),
            control: {
              type: "dropdown",
              key: "language",
              defaultValue: "auto",
              options: {
                auto: t("settings.auto"),
                zh: t("settings.zh"),
                en: t("settings.en")
              }
            }
          },
          {
            name: t("settings.cardSize"),
            desc: t("settings.cardSizeDesc"),
            control: {
              type: "dropdown",
              key: "cardSize",
              defaultValue: "medium",
              options: {
                small: t("settings.small"),
                medium: t("settings.medium"),
                large: t("settings.large")
              }
            }
          },
          {
            name: t("settings.related"),
            desc: t("settings.relatedDesc"),
            control: {
              type: "toggle",
              key: "relatedEnabled",
              defaultValue: true
            }
          },
          {
            name: t("settings.open"),
            desc: t("settings.openDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "book-open", t("settings.open"), () => {
                void this.plugin.openView();
              }, true);
            }
          },
          {
            name: t("settings.data"),
            desc: t("settings.dataDesc", { path: dataPath })
          },
          {
            name: t("settings.openDataFolder"),
            desc: t("settings.openDataFolderDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "folder-open", t("settings.openDataFolder"), () => {
                void this.plugin.openPluginFolder("data").then((ok) => {
                  if (!ok) new Notice(t("settings.openFolderFailed"));
                });
              });
            }
          },
          {
            name: t("settings.openCoversFolder"),
            desc: t("settings.openCoversFolderDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "image", t("settings.openCoversFolder"), () => {
                void this.plugin.openPluginFolder("covers").then((ok) => {
                  if (!ok) new Notice(t("settings.openFolderFailed"));
                });
              });
            }
          },
          {
            name: t("settings.covers"),
            desc: t("settings.coversDesc", { count: "…" }),
            render: (setting: Setting) => {
              void this.plugin.coverStore.count().then((count) => {
                setting.setDesc(t("settings.coversDesc", { count }));
              });
            }
          },
          {
            name: t("settings.about"),
            desc: t("settings.aboutDesc", { version: this.plugin.manifest.version })
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.bilibiliHeading"),
        items: [
          {
            name: t("settings.bilibiliAccount"),
            desc: t("settings.bilibiliAccountDesc"),
            render: (setting: Setting) => this.renderBilibili(setting)
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.cloudHeading"),
        items: [
          ...(["baidu", "quark", "aliyun", "onedrive"] as CloudProvider[]).map((provider) => ({
            name: t(`cloud.${provider}` as never),
            desc: t("settings.cloudAccountDesc"),
            render: (setting: Setting) => this.renderCloudAccount(setting, provider)
          })),
          {
            name: t("cloud.addVideo"),
            desc: t("cloud.addVideoDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "plus", t("cloud.addVideo"), () => {
                new CloudAddModal(this.app, this.plugin).open();
              });
            }
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.notesHeading"),
        items: [
          {
            name: t("settings.notesRoot"),
            desc: t("settings.notesRootDesc"),
            control: {
              type: "text",
              key: "notesRoot",
              defaultValue: "视频笔记",
              placeholder: "视频笔记"
            }
          },
          {
            name: t("settings.noteAttachmentMode"),
            desc: t("settings.noteAttachmentModeDesc"),
            control: {
              type: "dropdown",
              key: "noteAttachmentMode",
              defaultValue: "subfolder",
              options: {
                same: t("settings.attachmentSame"),
                subfolder: t("settings.attachmentSubfolder"),
                custom: t("settings.attachmentCustom")
              }
            }
          },
          {
            name: t("settings.noteAttachmentFolder"),
            desc: t("settings.noteAttachmentFolderDesc"),
            control: {
              type: "text",
              key: "noteAttachmentFolder",
              defaultValue: "attachments",
              placeholder: "attachments"
            }
          },
          {
            name: t("settings.noteMarkerShortcut"),
            desc: t("settings.noteMarkerShortcutDesc"),
            control: {
              type: "text",
              key: "noteMarkerShortcut",
              defaultValue: "Alt+M",
              placeholder: "Alt+M"
            }
          },
          {
            name: t("settings.noteSummaryShortcut"),
            desc: t("settings.noteSummaryShortcutDesc"),
            control: {
              type: "text",
              key: "noteSummaryShortcut",
              defaultValue: "Alt+G",
              placeholder: "Alt+G"
            }
          },
          {
            name: t("notes.openManager"),
            desc: t("settings.notesManagerDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "notebook-pen", t("notes.openManager"), () => {
                void this.plugin.openNotesView();
              }, true);
            }
          }
        ]
      },
      {
        type: "group",
        heading: t("scrape.sitesHeading"),
        items: [
          {
            name: t("scrape.sites"),
            desc: t("scrape.sitesDesc"),
            render: (setting: Setting) => this.renderScrapeSites(setting)
          }
        ]
      },
      {
        type: "group",
        heading: t("scrape.settingsHeading"),
        items: [
          {
            name: t("scrape.metatubeServerPath"),
            desc: t("scrape.metatubeServerPathDesc"),
            control: {
              type: "text",
              key: "metatubeServerPath",
              defaultValue: "",
              placeholder: "D:\\MetaTube\\metatube-server.exe"
            }
          },
          {
            name: t("scrape.startServer"),
            desc: t("scrape.startServerDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "play", t("scrape.startServer"), () => {
                void this.plugin.startMetaTubeServer().then((result) => {
                  new Notice(
                    result.ok
                      ? t(result.started ? "scrape.serverStarted" : "scrape.serverAlreadyRunning")
                      : t("scrape.connectionFailed", { error: result.error || "" })
                  );
                  this.update();
                });
              }, true);
            }
          },
          {
            name: t("scrape.stopServer"),
            desc: t("scrape.stopServerDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "square", t("scrape.stopServer"), () => {
                void this.plugin.stopMetaTubeServer().then(() => {
                  new Notice(t("scrape.serverStopped"));
                  this.update();
                });
              });
            }
          },
          {
            name: t("scrape.metatubeUrl"),
            desc: t("scrape.metatubeUrlDesc"),
            control: {
              type: "text",
              key: "metatubeUrl",
              defaultValue: "",
              placeholder: "http://127.0.0.1:8080"
            }
          },
          {
            name: t("scrape.metatubeToken"),
            desc: t("scrape.metatubeTokenDesc"),
            control: {
              type: "text",
              key: "metatubeToken",
              defaultValue: "",
              placeholder: t("scrape.metatubeTokenPlaceholder")
            }
          },
          {
            name: t("scrape.auto"),
            desc: t("scrape.autoDesc"),
            control: {
              type: "toggle",
              key: "scrapeAuto",
              defaultValue: false
            }
          },
          {
            name: t("scrape.testConnection"),
            desc: t("scrape.testConnectionDesc"),
            render: (setting: Setting) => {
              this.renderAction(setting, "plug-zap", t("scrape.testConnection"), () => {
                void this.plugin.testMetaTube().then((result) => {
                  new Notice(
                    result.ok
                      ? t("scrape.connectionOk", { count: result.count || 0 })
                      : t("scrape.connectionFailed", { error: result.error || "" })
                  );
                });
              });
            }
          }
        ]
      },
      {
        type: "group",
        heading: t("update.heading"),
        items: [
          {
            name: t("update.auto"),
            desc: t("update.autoDesc"),
            control: {
              type: "toggle",
              key: "autoCheckUpdates",
              defaultValue: true
            }
          },
          {
            name: t("update.row"),
            desc: t("update.rowDesc", { version: this.plugin.manifest.version }),
            render: (setting: Setting) => this.renderUpdate(setting)
          }
        ]
      }
    ];
  }

  private renderUpdate(setting: Setting): void {
    setting.settingEl.addClass("vl-settings-account-row");
    setting.controlEl.empty();
    const wrap = setting.controlEl.createDiv({ cls: "vl-settings-account" });
    const info = wrap.createDiv({ cls: "vl-settings-account-info" });
    const release = this.plugin.latestRelease;
    const newer = Boolean(release && isNewerVersion(release.tag_name, this.plugin.manifest.version));
    info.createSpan({
      cls: `vl-settings-account-status${newer ? " is-on" : ""}`,
      text: this.plugin.updateChecking
        ? t("update.checking")
        : release
          ? newer
            ? t("update.availableShort", { version: release.tag_name })
            : t("update.latest", { version: this.plugin.manifest.version })
          : t("update.notChecked")
    });
    const actions = wrap.createDiv({ cls: "vl-settings-account-actions" });
    const check = actions.createEl("button", {
      cls: "vl-settings-action",
      text: t("update.check"),
      attr: { type: "button" }
    });
    check.disabled = this.plugin.updateChecking;
    check.addEventListener("click", () => {
      void this.plugin.checkForUpdates(true).then(() => this.update());
    });
    if (newer) {
      const install = actions.createEl("button", {
        cls: "vl-settings-action is-primary",
        text: t("update.install"),
        attr: { type: "button" }
      });
      install.disabled = this.plugin.updateInstalling;
      install.addEventListener("click", () => {
        void this.plugin.installUpdate();
      });
    }
  }

  private renderBilibili(setting: Setting): void {
    setting.settingEl.addClass("vl-settings-account-row");
    setting.controlEl.empty();
    const wrap = setting.controlEl.createDiv({ cls: "vl-settings-account" });
    const dot = wrap.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: "#fb7299" });
    const info = wrap.createDiv({ cls: "vl-settings-account-info" });
    const cookie = this.plugin.data.settings.bilibiliCookie;
    info.createSpan({
      cls: `vl-settings-account-status${cookie ? " is-on" : ""}`,
      text: cookie
        ? t("settings.bilibiliLogged", {
            user: this.plugin.data.settings.bilibiliUser || "Bilibili"
          })
        : t("settings.bilibiliNotLogged")
    });
    const actions = wrap.createDiv({ cls: "vl-settings-account-actions" });
    if (cookie) {
      const logout = actions.createEl("button", {
        cls: "vl-settings-action",
        text: t("settings.bilibiliLogout"),
        attr: { type: "button" }
      });
      logout.addEventListener("click", () => {
        void this.plugin.logoutBilibili().then(() => this.update());
      });
    } else {
      const login = actions.createEl("button", {
        cls: "vl-settings-action is-primary",
        text: t("settings.bilibiliLogin"),
        attr: { type: "button" }
      });
      login.addEventListener("click", () => {
        new BilibiliLoginModal(this.app, this.plugin, () => this.update()).open();
      });
    }
  }

  private renderCloudAccount(setting: Setting, provider: CloudProvider): void {
    setting.settingEl.addClass("vl-settings-account-row");
    setting.controlEl.empty();
    const wrap = setting.controlEl.createDiv({ cls: "vl-settings-account" });
    const colors: Record<CloudProvider, string> = {
      baidu: "#4f9dd9",
      quark: "#e8a33d",
      aliyun: "#e46b6b",
      onedrive: "#4f9dd9"
    };
    const dot = wrap.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: colors[provider] });
    const info = wrap.createDiv({ cls: "vl-settings-account-info" });
    const account = this.plugin.cloudAccount(provider);
    const connected = Boolean(account?.enabled && account.credential);
    info.createSpan({
      cls: `vl-settings-account-status${connected ? " is-on" : ""}`,
      text: connected
        ? t("settings.cloudLogged", { user: account?.displayName || t(`cloud.${provider}` as never) })
        : t("settings.cloudNotLogged")
    });
    const actions = wrap.createDiv({ cls: "vl-settings-account-actions" });
    if (connected) {
      const logout = actions.createEl("button", {
        cls: "vl-settings-action",
        text: t("settings.cloudLogout"),
        attr: { type: "button" }
      });
      logout.addEventListener("click", () => {
        void this.plugin.disconnectCloudAccount(provider).then(() => this.update());
      });
    } else {
      const login = actions.createEl("button", {
        cls: "vl-settings-action",
        text: t("settings.cloudLogin"),
        attr: { type: "button" }
      });
      login.addEventListener("click", () => {
        new CloudLoginModal(this.app, this.plugin, provider, () => this.update()).open();
      });
    }
  }

  private renderScrapeSites(setting: Setting): void {
    setting.settingEl.addClass("vl-settings-sites-row");
    setting.controlEl.empty();
    setting.controlEl.addClass("vl-settings-sites-control");
    const wrap = setting.controlEl.createDiv({ cls: "vl-settings-sites" });
    const sites = this.plugin.scrapeSites();
    const enabled = sites.filter((site) => site.enabled !== false).length;
    const head = wrap.createDiv({ cls: "vl-settings-sites-head" });
    head.createSpan({
      text:
        sites.length > 0
          ? t("scrape.enabledSites", { enabled, total: sites.length })
          : t("scrape.sitesNotConfigured")
    });

    const list = wrap.createDiv({ cls: "vl-settings-site-list" });
    if (sites.length === 0) {
      const empty = list.createDiv({ cls: "vl-settings-sites-empty" });
      const emptyIcon = empty.createDiv({ cls: "vl-settings-sites-empty-icon" });
      setIcon(emptyIcon, "globe-2");
      empty.createDiv({ cls: "vl-settings-sites-empty-title", text: t("scrape.noSites") });
      empty.createDiv({ cls: "vl-settings-sites-empty-desc", text: t("scrape.noSitesDesc") });
    }
    for (const site of sites) {
      this.renderSiteRow(list, site);
    }

    const footer = wrap.createDiv({ cls: "vl-settings-sites-footer" });
    this.footerButton(footer, "plus", t("scrape.addSite"), () => {
      new MarkerEditModal(this.app, this.plugin, null, () => this.update(), "site").open();
    }, sites.length === 0);
    this.footerButton(footer, "upload", t("scrape.importSites"), () => this.pickSiteFile());
    this.footerButton(footer, "download", t("scrape.exportSites"), () => this.exportSites(sites), false, sites.length === 0);
    if (sites.length > 0) {
      this.footerButton(footer, "plug-zap", t("scrape.testEnabledSites"), (button) => {
        button.disabled = true;
        void Promise.all(
          sites
            .filter((site) => site.enabled !== false)
            .map((site) => this.plugin.testScrapeSite(site))
        ).then((results) => {
          const ok = results.filter((result) => result.ok).length;
          const failed = results.length - ok;
          new Notice(
            failed === 0
              ? t("scrape.allSitesOk", { count: ok })
              : t("scrape.allSitesPartial", { ok, failed })
          );
          button.disabled = false;
        });
      });
    }
  }

  private renderAction(
    setting: Setting,
    icon: string,
    label: string,
    onClick: () => void,
    primary = false
  ): void {
    setting.settingEl.addClass("vl-settings-action-row");
    setting.controlEl.empty();
    const button = setting.controlEl.createEl("button", {
      cls: `vl-settings-action${primary ? " is-primary" : ""}`,
      attr: { type: "button", "aria-label": label, title: label }
    });
    const iconEl = button.createSpan({ cls: "vl-settings-action-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ cls: "vl-settings-action-label", text: label });
    button.addEventListener("click", onClick);
  }

  private footerButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: (button: HTMLButtonElement) => void,
    primary = false,
    disabled = false
  ): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: `vl-settings-footer-btn${primary ? " is-primary" : ""}`,
      attr: { type: "button" }
    });
    const iconEl = button.createSpan({ cls: "vl-btn-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ text: label });
    button.disabled = disabled;
    button.addEventListener("click", () => onClick(button));
    return button;
  }

  private pickSiteFile(): void {
    const doc = this.containerEl.ownerDocument;
    const win = doc.defaultView;
    const input = createEl("input", {
      type: "file",
      attr: { accept: ".json,application/json" }
    });
    input.setCssStyles({
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "1px",
      height: "1px",
      opacity: "0"
    });
    doc.body.appendChild(input);

    let handled = false;
    const cleanup = (): void => {
      if (handled) return;
      handled = true;
      input.remove();
    };

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) return;
        void file
          .text()
          .then((text) => JSON.parse(text.replace(/^\uFEFF/, "")) as unknown)
          .then((payload) => this.plugin.importScrapeSites(payload))
          .then((count) => {
            if (count === 0) {
              new Notice(t("scrape.noSitesInFile"));
              return;
            }
            new Notice(t("scrape.importedSites", { count }));
            this.update();
          })
          .catch((error) => {
            console.error("video-library: failed to import scrape sites", error);
            new Notice(t("scrape.importFailed"));
          });
      },
      { once: true }
    );
    input.addEventListener("cancel", cleanup, { once: true });

    try {
      win?.focus();
    } catch {
      // Ignore focus failures; the picker below is what matters.
    }
    input.click();
  }

  private exportSites(sites: Marker[]): void {
    if (sites.length === 0) {
      new Notice(t("scrape.noSitesToExport"));
      return;
    }
    const payload = {
      version: 1,
      type: "video-library-scrape-sites",
      generatedAt: new Date().toISOString(),
      sites: sites.map((site) => ({
        ...site,
        capabilities: (site.capabilities || []).filter((capability) => capability !== "欧美")
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const doc = this.containerEl.ownerDocument;
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    const link = createEl("a", {
      attr: {
        href: url,
        download: `video-library-scrape-sites-${date}.json`
      }
    });
    doc.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    new Notice(t("scrape.exportedSites"));
  }

  private renderSiteRow(parent: HTMLElement, site: Marker): void {
    const row = parent.createDiv({ cls: `vl-settings-site ${site.enabled === false ? "is-disabled" : ""}`.trim() });
    const toggle = row.createEl("input", { type: "checkbox", cls: "vl-settings-site-toggle" });
    toggle.checked = site.enabled !== false;
    toggle.addEventListener("change", () => {
      void this.plugin.setMarkerEnabled(site.id, toggle.checked).then(() => {
        row.toggleClass("is-disabled", !toggle.checked);
        this.update();
      });
    });

    const body = row.createDiv({ cls: "vl-settings-site-body" });
    const title = body.createDiv({ cls: "vl-settings-site-title" });
    const dot = title.createSpan({ cls: "vl-category-dot" });
    dot.setCssStyles({ backgroundColor: site.color });
    title.createSpan({ text: site.name });
    const capabilities = title.createSpan({ cls: "vl-settings-site-caps" });
    for (const capability of site.capabilities || []) {
      capabilities.createSpan({ text: capability });
    }
    if (!site.metatubeProvider && site.id !== "site_metatube") {
      capabilities.createSpan({ text: t("scrape.unadapted"), cls: "is-warning" });
    }

    const url = body.createEl("input", {
      type: "text",
      cls: "vl-text-input vl-settings-site-url",
      attr: { value: site.url || "", placeholder: t("scrape.siteUrlPlaceholder") }
    });
    url.addEventListener("change", () => {
      void this.plugin.saveMarker({ ...site, url: url.value.trim() || undefined });
    });

    const actions = row.createDiv({ cls: "vl-settings-site-actions" });
    this.siteAction(actions, "chevron-up", t("scrape.moveUp"), () => this.moveSite(site, -1));
    this.siteAction(actions, "chevron-down", t("scrape.moveDown"), () => this.moveSite(site, 1));
    const status = actions.createSpan({ cls: "vl-settings-site-status" });
    const test = actions.createEl("button", {
      cls: "vl-settings-site-action",
      attr: { type: "button", title: t("scrape.test"), "aria-label": t("scrape.test") }
    });
    setIcon(test, "flask-conical");
    test.addEventListener("click", () => {
      test.disabled = true;
      status.setText(t("scrape.testing"));
      void this.plugin.testScrapeSite(site).then((result) => {
        status.setText(result.ok ? t("scrape.testOk") : result.error || t("scrape.testFailed"));
        status.toggleClass("is-error", !result.ok);
        test.disabled = false;
      });
    });
    this.siteAction(actions, "x", t("action.delete"), () => {
      new ConfirmModal(this.app, {
        title: t("marker.deleteTitle"),
        description: t("marker.deleteDesc", {
          name: site.name,
          count: this.plugin.data.videos.filter((video) => video.markers?.includes(site.id)).length
        }),
        confirmText: t("confirm.delete"),
        danger: true,
        onConfirm: async () => {
          await this.plugin.deleteMarker(site.id);
          this.update();
        }
      }).open();
    }, "is-danger");
  }

  private siteAction(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    className = ""
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-settings-site-action ${className}`.trim(),
      attr: { type: "button", title: label, "aria-label": label }
    });
    setIcon(button, icon);
    button.addEventListener("click", onClick);
  }

  private moveSite(site: Marker, direction: number): void {
    const siteIds = this.plugin.scrapeSites().map((candidate) => candidate.id);
    const index = siteIds.indexOf(site.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siteIds.length) return;
    [siteIds[index], siteIds[target]] = [siteIds[target], siteIds[index]];
    let siteIndex = 0;
    const ordered = this.plugin.data.markers.map((marker) => {
      if (marker.kind !== "site") return marker.id;
      const id = siteIds[siteIndex];
      siteIndex += 1;
      return id;
    });
    void this.plugin.reorderMarkers(ordered).then(() => this.update());
  }

  getControlValue(key: string): unknown {
    if (key === "language") return this.plugin.data.settings.language;
    if (key === "cardSize") return this.plugin.data.settings.cardSize;
    if (key === "metatubeUrl") return this.plugin.data.settings.metatubeUrl;
    if (key === "metatubeToken") return this.plugin.data.settings.metatubeToken;
    if (key === "metatubeServerPath") return this.plugin.data.settings.metatubeServerPath;
    if (key === "scrapeAuto") return this.plugin.data.settings.scrapeAuto;
    if (key === "relatedEnabled") return this.plugin.data.settings.relatedEnabled;
    if (key === "notesRoot") return this.plugin.data.settings.notesRoot;
    if (key === "noteAttachmentMode") return this.plugin.data.settings.noteAttachmentMode;
    if (key === "noteAttachmentFolder") return this.plugin.data.settings.noteAttachmentFolder;
    if (key === "noteMarkerShortcut") return this.plugin.data.settings.noteMarkerShortcut;
    if (key === "noteSummaryShortcut") return this.plugin.data.settings.noteSummaryShortcut;
    if (key === "autoCheckUpdates") return this.plugin.data.settings.autoCheckUpdates;
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "language") {
      await this.plugin.setLanguageSetting(value as LanguageSetting);
      this.update();
    } else if (key === "cardSize") {
      await this.plugin.setCardSize(value as CardSize);
    } else if (key === "metatubeUrl") {
      const url = String(value || "").trim();
      this.plugin.data.settings.metatubeUrl = url;
      const serverSite = this.plugin.data.markers.find((marker) => marker.id === "site_metatube");
      if (serverSite) serverSite.url = url;
      await this.plugin.persist();
    } else if (key === "metatubeToken") {
      this.plugin.data.settings.metatubeToken = String(value || "").trim();
      await this.plugin.persist();
    } else if (key === "metatubeServerPath") {
      this.plugin.data.settings.metatubeServerPath = String(value || "").trim();
      await this.plugin.persist();
    } else if (key === "scrapeAuto") {
      this.plugin.data.settings.scrapeAuto = Boolean(value);
      await this.plugin.persist();
    } else if (key === "relatedEnabled") {
      this.plugin.data.settings.relatedEnabled = Boolean(value);
      await this.plugin.persist();
      this.plugin.refreshViews();
    } else if (key === "notesRoot") {
      this.plugin.data.settings.notesRoot = String(value || "").trim() || "视频笔记";
      await this.plugin.persist();
    } else if (key === "noteAttachmentMode") {
      const mode = String(value || "subfolder") as NoteAttachmentMode;
      this.plugin.data.settings.noteAttachmentMode =
        mode === "same" || mode === "custom" ? mode : "subfolder";
      await this.plugin.persist();
    } else if (key === "noteAttachmentFolder") {
      this.plugin.data.settings.noteAttachmentFolder =
        String(value || "").trim() || "attachments";
      await this.plugin.persist();
    } else if (key === "noteMarkerShortcut") {
      this.plugin.data.settings.noteMarkerShortcut =
        String(value || "").trim() || "Alt+M";
      await this.plugin.persist();
    } else if (key === "noteSummaryShortcut") {
      this.plugin.data.settings.noteSummaryShortcut =
        String(value || "").trim() || "Alt+G";
      await this.plugin.persist();
    } else if (key === "autoCheckUpdates") {
      this.plugin.data.settings.autoCheckUpdates = Boolean(value);
      await this.plugin.persist();
    }
  }
}
