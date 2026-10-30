import { App, PluginSettingTab, Setting } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import type { CardSize, LanguageSetting } from "../types";

export class VideoLibrarySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VideoLibraryPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vl-settings");

    containerEl.createEl("h2", { text: t("settings.title") });
    containerEl.createEl("p", { text: t("app.tagline"), cls: "vl-settings-tagline" });

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", t("settings.auto"))
          .addOption("zh", t("settings.zh"))
          .addOption("en", t("settings.en"))
          .setValue(this.plugin.data.settings.language)
          .onChange(async (value) => {
            await this.plugin.setLanguageSetting(value as LanguageSetting);
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.cardSize"))
      .setDesc(t("settings.cardSizeDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("small", t("settings.small"))
          .addOption("medium", t("settings.medium"))
          .addOption("large", t("settings.large"))
          .setValue(this.plugin.data.settings.cardSize)
          .onChange(async (value) => {
            await this.plugin.setCardSize(value as CardSize);
          });
      });

    new Setting(containerEl)
      .setName(t("settings.open"))
      .setDesc(t("settings.openDesc"))
      .addButton((button) => {
        button.setButtonText(t("action.openLibrary")).setCta().onClick(() => {
          void this.plugin.openView();
        });
      });

    const dataPath = `${this.plugin.manifest.dir || ".obsidian/plugins/video-library"}/data.json`;
    const dataSetting = new Setting(containerEl)
      .setName(t("settings.data"))
      .setDesc(t("settings.dataDesc", { path: dataPath }));

    const coversSetting = new Setting(containerEl)
      .setName(t("settings.covers"))
      .setDesc(t("settings.coversDesc", { count: "…" }));
    void this.plugin.coverStore.count().then((count) => {
      coversSetting.setDesc(t("settings.coversDesc", { count }));
    });

    dataSetting.addButton((button) => {
      button.setButtonText(t("action.refresh")).onClick(() => {
        this.display();
      });
    });

    new Setting(containerEl)
      .setName(t("settings.about"))
      .setDesc(t("settings.aboutDesc", { version: this.plugin.manifest.version }));
  }
}
