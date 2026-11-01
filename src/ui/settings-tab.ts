import { App, Notice, PluginSettingTab, setIcon, Setting, type SettingDefinitionItem } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CardSize, LanguageSetting, Marker } from "../types";
import { ConfirmModal } from "./common";
import { MarkerEditModal, MarkerManagerModal } from "./marker-modal";

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
            name: t("settings.open"),
            desc: t("settings.openDesc"),
            action: () => {
              void this.plugin.openView();
            }
          },
          {
            name: t("settings.data"),
            desc: t("settings.dataDesc", { path: dataPath })
          },
          {
            name: t("settings.openDataFolder"),
            desc: t("settings.openDataFolderDesc"),
            action: () => {
              void this.plugin.openPluginFolder("data").then((ok) => {
                if (!ok) new Notice(t("settings.openFolderFailed"));
              });
            }
          },
          {
            name: t("settings.openCoversFolder"),
            desc: t("settings.openCoversFolderDesc"),
            action: () => {
              void this.plugin.openPluginFolder("covers").then((ok) => {
                if (!ok) new Notice(t("settings.openFolderFailed"));
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
            action: () => {
              void this.plugin.startMetaTubeServer().then((result) => {
                new Notice(
                  result.ok
                    ? t(result.started ? "scrape.serverStarted" : "scrape.serverAlreadyRunning")
                    : t("scrape.connectionFailed", { error: result.error || "" })
                );
                this.update();
              });
            }
          },
          {
            name: t("scrape.stopServer"),
            desc: t("scrape.stopServerDesc"),
            action: () => {
              void this.plugin.stopMetaTubeServer().then(() => {
                new Notice(t("scrape.serverStopped"));
                this.update();
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
            name: t("marker.manage"),
            desc: t("marker.manageDesc"),
            action: () => {
              new MarkerManagerModal(this.app, this.plugin, () => this.update()).open();
            }
          },
          {
            name: t("scrape.testConnection"),
            desc: t("scrape.testConnectionDesc"),
            action: () => {
              void this.plugin.testMetaTube().then((result) => {
                new Notice(
                  result.ok
                    ? t("scrape.connectionOk", { count: result.count || 0 })
                    : t("scrape.connectionFailed", { error: result.error || "" })
                );
              });
            }
          }
        ]
      }
    ];
  }

  private renderScrapeSites(setting: Setting): void {
    setting.settingEl.addClass("vl-settings-sites-row");
    setting.controlEl.empty();
    setting.controlEl.addClass("vl-settings-sites-control");
    const wrap = setting.controlEl.createDiv({ cls: "vl-settings-sites" });
    const sites = this.plugin.scrapeSites();
    const enabled = sites.filter((site) => site.enabled !== false).length;
    const head = wrap.createDiv({ cls: "vl-settings-sites-head" });
    head.createSpan({ text: t("scrape.enabledSites", { enabled, total: sites.length }) });

    const list = wrap.createDiv({ cls: "vl-settings-site-list" });
    for (const site of sites) {
      this.renderSiteRow(list, site);
    }

    const footer = wrap.createDiv({ cls: "vl-settings-sites-footer" });
    const add = footer.createEl("button", { text: t("scrape.addSite"), attr: { type: "button" } });
    add.addEventListener("click", () => {
      new MarkerEditModal(this.app, this.plugin, null, () => this.update(), "site").open();
    });
    const testAll = footer.createEl("button", {
      text: t("scrape.testEnabledSites"),
      attr: { type: "button" }
    });
    testAll.addEventListener("click", () => {
      testAll.disabled = true;
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
        testAll.disabled = false;
      });
    });
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
    this.siteAction(actions, "↑", t("scrape.moveUp"), () => this.moveSite(site, -1));
    this.siteAction(actions, "↓", t("scrape.moveDown"), () => this.moveSite(site, 1));
    const status = actions.createSpan({ cls: "vl-settings-site-status" });
    const test = actions.createEl("button", { text: t("scrape.test"), attr: { type: "button" } });
    test.addEventListener("click", () => {
      test.disabled = true;
      status.setText(t("scrape.testing"));
      void this.plugin.testScrapeSite(site).then((result) => {
        status.setText(result.ok ? t("scrape.testOk") : result.error || t("scrape.testFailed"));
        status.toggleClass("is-error", !result.ok);
        test.disabled = false;
      });
    });
    this.siteAction(actions, "×", t("action.delete"), () => {
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
    text: string,
    label: string,
    onClick: () => void,
    className = ""
  ): void {
    const button = parent.createEl("button", {
      cls: `vl-settings-site-action ${className}`.trim(),
      text,
      attr: { type: "button", title: label, "aria-label": label }
    });
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
    }
  }
}
