import { App, FuzzySuggestModal } from "obsidian";
import { t } from "../i18n";
import type VideoLibraryPlugin from "../main";

interface FolderChoice {
  id: string | null;
  label: string;
}

export class MoveToFolderModal extends FuzzySuggestModal<FolderChoice> {
  constructor(
    app: App,
    private plugin: VideoLibraryPlugin,
    private videos: Set<string>,
    private folders: Set<string>,
    private onMoved: (count: number) => void
  ) {
    super(app);
    this.setPlaceholder(t("move.search"));
    this.setInstructions([
      { command: "↑↓", purpose: t("move.instruction") },
      { command: "↵", purpose: t("action.confirm") }
    ]);
    this.modalEl.addClass("vl-move-modal");
  }

  getItems(): FolderChoice[] {
    const items: FolderChoice[] = [{ id: null, label: t("move.root") }];
    const blocked = this.plugin.descendantFolderIds(this.folders);
    const walk = (parentId: string | null, depth: number): void => {
      for (const folder of this.plugin.getSubfolders(parentId)) {
        if (!blocked.has(folder.id)) {
          items.push({ id: folder.id, label: `${"  ".repeat(depth)}${folder.name}` });
        }
        walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return items;
  }

  getItemText(item: FolderChoice): string {
    return item.label;
  }

  onChooseItem(item: FolderChoice): void {
    const count = this.videos.size + this.folders.size;
    void this.plugin.moveItems(this.videos, this.folders, item.id).then(() => {
      this.onMoved(count);
    });
  }
}

