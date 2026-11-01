import { App, Modal, Notice, setIcon } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";
import {
  DEFAULT_SCRAPE_FIELDS,
  MetaTubeMovie,
  MetaTubeSearchResult,
  normalizeDate,
  ScrapeFieldOptions,
  scrapeQueries
} from "../scraping";
import type { VideoItem } from "../types";

export class ScrapeModal extends Modal {
  private queryInput!: HTMLInputElement;
  private providerSelect!: HTMLSelectElement;
  private searchButton!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private previewEl!: HTMLElement;
  private results: MetaTubeSearchResult[] = [];
  private selected: MetaTubeMovie | null = null;
  private options: ScrapeFieldOptions = { ...DEFAULT_SCRAPE_FIELDS };

  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private video: VideoItem,
    private onApplied: (updated: VideoItem) => void
  ) {
    super(app);
    this.modalEl.addClass("vl-scrape-modal");
  }

  onOpen(): void {
    this.titleEl.setText(t("scrape.title"));
    const { contentEl } = this;
    contentEl.createEl("p", { text: t("scrape.desc"), cls: "vl-modal-description" });

    if (!this.plugin.data.settings.metatubeUrl.trim()) {
      const setup = contentEl.createDiv({ cls: "vl-scrape-setup" });
      setup.createEl("h4", { text: t("scrape.setupTitle") });
      setup.createEl("p", { text: t("scrape.setupDesc") });
      const open = setup.createEl("button", { text: t("scrape.openSettings"), attr: { type: "button" } });
      open.addEventListener("click", () => {
        this.close();
        const appWithSettings = this.app as unknown as {
          setting?: { open: () => void; openTabById: (id: string) => void };
        };
        appWithSettings.setting?.open();
        appWithSettings.setting?.openTabById("video-library");
      });
      return;
    }

    const searchRow = contentEl.createDiv({ cls: "vl-scrape-search" });
    this.queryInput = searchRow.createEl("input", {
      type: "search",
      cls: "vl-text-input",
      attr: { placeholder: t("scrape.searchPlaceholder"), value: scrapeQueries(this.video)[0] || this.video.title }
    });
    this.providerSelect = searchRow.createEl("select", {
      cls: "dropdown vl-scrape-provider",
      attr: { "aria-label": t("scrape.provider") }
    });
    this.providerSelect.createEl("option", { text: t("scrape.allProviders"), value: "" });
    const sites = this.plugin.enabledScrapeSites();
    const selectedSites = this.plugin
      .markersForVideo(this.video)
      .filter((marker) => marker.kind === "site" && marker.enabled !== false);
    const visibleSites = selectedSites.length > 0 ? selectedSites : sites;
    for (const site of visibleSites) {
      this.providerSelect.createEl("option", { text: site.name, value: site.id });
    }
    const preferred = selectedSites[0]?.id;
    if (preferred) this.providerSelect.value = preferred;

    this.searchButton = searchRow.createEl("button", {
      text: t("scrape.search"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    this.searchButton.addEventListener("click", () => void this.search());
    this.queryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.search();
      }
    });

    this.statusEl = contentEl.createDiv({ cls: "vl-scrape-status" });
    this.resultsEl = contentEl.createDiv({ cls: "vl-scrape-results" });
    this.previewEl = contentEl.createDiv({ cls: "vl-scrape-preview" });

    window.setTimeout(() => {
      this.queryInput.focus();
      this.queryInput.select();
    }, 50);
  }

  private async search(): Promise<void> {
    const query = this.queryInput.value.trim();
    if (!query) {
      this.statusEl.setText(t("scrape.enterQuery"));
      return;
    }
    this.selected = null;
    this.results = [];
    this.resultsEl.empty();
    this.previewEl.empty();
    this.searchButton.disabled = true;
    this.statusEl.setText(t("scrape.searching"));
    try {
      const client = this.plugin.metaTubeClient();
      const site = this.plugin.getMarker(this.providerSelect.value);
      this.results = await client.search(query, site?.metatubeProvider);
      if (this.results.length === 0) {
        this.statusEl.setText(t("scrape.noResults"));
        return;
      }
      this.statusEl.setText(t("scrape.resultCount", { count: this.results.length }));
      this.renderResults();
    } catch (error) {
      this.statusEl.setText(
        t("scrape.failed", { error: error instanceof Error ? error.message : String(error) })
      );
    } finally {
      this.searchButton.disabled = false;
    }
  }

  private renderResults(): void {
    this.resultsEl.empty();
    for (const result of this.results) {
      const row = this.resultsEl.createDiv({ cls: "vl-scrape-result" });
      const cover = row.createDiv({ cls: "vl-scrape-result-cover" });
      const image = cover.createEl("img", { attr: { alt: "" } });
      const url = result.cover_url || result.thumb_url;
      if (url) image.src = url;
      else cover.addClass("is-no-cover");
      const info = row.createDiv({ cls: "vl-scrape-result-info" });
      info.createDiv({ text: result.title, cls: "vl-scrape-result-title" });
      const meta = info.createDiv({ cls: "vl-scrape-result-meta" });
      meta.createSpan({ text: result.provider });
      if (result.number) meta.createSpan({ text: result.number });
      const date = normalizeDate(result.release_date);
      if (date) meta.createSpan({ text: date });
      if (result.actors?.length) meta.createSpan({ text: result.actors.join(" / ") });
      const choose = row.createEl("button", { text: t("scrape.use"), attr: { type: "button" } });
      choose.addEventListener("click", () => void this.choose(result));
    }
  }

  private async choose(result: MetaTubeSearchResult): Promise<void> {
    this.statusEl.setText(t("scrape.loadingDetail"));
    this.previewEl.empty();
    try {
      const client = this.plugin.metaTubeClient();
      this.selected = await client.movie(result.provider, result.id);
      this.options = { ...DEFAULT_SCRAPE_FIELDS };
      this.statusEl.setText("");
      this.renderPreview();
    } catch (error) {
      this.statusEl.setText(
        t("scrape.failed", { error: error instanceof Error ? error.message : String(error) })
      );
    }
  }

  private renderPreview(): void {
    const movie = this.selected;
    if (!movie) return;
    this.previewEl.empty();
    const header = this.previewEl.createDiv({ cls: "vl-scrape-preview-head" });
    if (movie.cover_url) {
      const image = header.createEl("img", { attr: { alt: "" } });
      image.src = movie.cover_url;
    }
    const title = header.createDiv({ cls: "vl-scrape-preview-title" });
    title.createDiv({ text: movie.title, cls: "vl-scrape-preview-name" });
    const meta = title.createDiv({ cls: "vl-scrape-result-meta" });
    meta.createSpan({ text: movie.provider });
    if (movie.number) meta.createSpan({ text: movie.number });
    if (movie.release_date) meta.createSpan({ text: normalizeDate(movie.release_date) || movie.release_date });

    const fields = this.previewEl.createDiv({ cls: "vl-scrape-fields" });
    this.addField(fields, "cover", t("scrape.fieldCover"), movie.cover_url || "—");
    this.addField(fields, "title", t("scrape.fieldTitle"), movie.title);
    this.addField(fields, "author", t("scrape.fieldAuthor"), movie.director || "—");
    this.addField(fields, "studio", t("scrape.fieldStudio"), movie.maker || movie.label || "—");
    this.addField(fields, "series", t("scrape.fieldSeries"), movie.series || "—");
    this.addField(fields, "performers", t("scrape.fieldPerformers"), movie.actors?.join(" / ") || "—");
    this.addField(fields, "tags", t("scrape.fieldTags"), movie.genres?.join(" / ") || "—");
    this.addField(fields, "description", t("scrape.fieldDescription"), movie.summary || "—");
    this.addField(fields, "releaseDate", t("scrape.fieldReleaseDate"), normalizeDate(movie.release_date) || "—");
    this.addField(
      fields,
      "duration",
      t("scrape.fieldDuration"),
      movie.runtime ? `${movie.runtime} min` : "—"
    );

    const footer = this.previewEl.createDiv({ cls: "vl-modal-buttons vl-scrape-actions" });
    const cancel = footer.createEl("button", { text: t("action.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.selected = null;
      this.previewEl.empty();
    });
    const apply = footer.createEl("button", {
      text: t("scrape.apply"),
      cls: "mod-cta",
      attr: { type: "button" }
    });
    apply.addEventListener("click", () => void this.apply(apply));
  }

  private addField(
    parent: HTMLElement,
    key: keyof ScrapeFieldOptions,
    label: string,
    value: string
  ): void {
    const row = parent.createEl("label", { cls: "vl-scrape-field" });
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = this.options[key];
    checkbox.disabled = value === "—";
    checkbox.addEventListener("change", () => {
      this.options[key] = checkbox.checked;
    });
    const name = row.createSpan({ text: label, cls: "vl-scrape-field-label" });
    if (key === "title") name.addClass("is-important");
    row.createSpan({ text: value, cls: "vl-scrape-field-value" });
  }

  private async apply(button: HTMLButtonElement): Promise<void> {
    if (!this.selected) return;
    button.disabled = true;
    try {
      const updated = await this.plugin.applyMetaTubeMovie(this.video, this.selected, this.options);
      Object.assign(this.video, updated);
      new Notice(t("scrape.applied"));
      this.onApplied(updated);
      this.close();
    } catch (error) {
      button.disabled = false;
      this.statusEl.setText(
        t("scrape.failed", { error: error instanceof Error ? error.message : String(error) })
      );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
