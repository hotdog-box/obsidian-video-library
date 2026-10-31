import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CardSize, LanguageSetting } from "../types";

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
      }
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "language") return this.plugin.data.settings.language;
    if (key === "cardSize") return this.plugin.data.settings.cardSize;
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "language") {
      await this.plugin.setLanguageSetting(value as LanguageSetting);
      this.update();
    } else if (key === "cardSize") {
      await this.plugin.setCardSize(value as CardSize);
    }
  }
}
