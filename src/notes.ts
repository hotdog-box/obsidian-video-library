import { App, normalizePath, Notice, TFile } from "obsidian";
import { t } from "./i18n";
import type VideoLibraryPlugin from "./main";
import type { NoteGroup, NoteNode, NoteSection, TrashImage, TrashNote, VideoItem } from "./types";
import { uid } from "./types";

const NOTE_MARKER = /^<!--\s*vl-note:\s*(.*?)\s*-->\s*$/;
const SECTION_MARKER = /^<!--\s*vl-section:\s*(.*?)\s*-->\s*$/;
const NOTE_HEADER = /^#{2,3}\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[·\-]\s*(.*))?$/;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function parseClock(value: string): number {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function sanitizeName(raw: string, fallback = "未命名"): string {
  const name = raw
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  return name || fallback;
}

function uniqueName(base: string, extension: string, exists: (path: string) => boolean, folder: string): string {
  let index = 1;
  let name = `${base}${extension}`;
  while (exists(normalizePath(`${folder}/${name}`))) {
    index += 1;
    name = `${base} (${index})${extension}`;
  }
  return name;
}

function frontmatterFor(video: VideoItem): string {
  const title = video.title || t("misc.untitled");
  return [
    "---",
    "video-library-note: true",
    `video-id: ${JSON.stringify(video.id)}`,
    `video-title: ${JSON.stringify(title)}`,
    `created: ${new Date().toISOString()}`,
    "---",
    "",
    `# ${title}`,
    "",
    ""
  ].join("\n");
}

function protocolLink(videoId: string, time: number): string {
  return `[▶ ${formatClock(time)}](obsidian://video-library?action=play&video=${encodeURIComponent(
    videoId
  )}&t=${time.toFixed(2)})`;
}

function blockFor(video: VideoItem, node: NoteNode): string {
  const cover = node.coverImage || node.imagePath;
  const meta = JSON.stringify({
    id: node.id,
    time: node.time,
    tags: node.tags,
    cover,
    image: cover,
    parentId: node.parentId,
    groupId: node.groupId,
    createdAt: node.createdAt
  });
  const heading = `${node.groupId || node.parentId ? "###" : "##"} ${formatClock(node.time)}${node.comment ? ` · ${node.comment}` : ""}`;
  const parts = [
    heading,
    `<!-- vl-note: ${meta} -->`,
    "",
    protocolLink(video.id, node.time),
    "",
    cover ? `![[${cover}]]` : "",
    ...(cover ? [""] : []),
    node.summary,
    "",
    "---",
    ""
  ];
  return parts.join("\n");
}

function removeImageFromSummary(summary: string, path: string): string {
  return summary
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.includes(`![[${path}]]`) &&
        !line.includes(`](${path})`)
    )
    .join("\n")
    .trim();
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isSystemLine(line: string): boolean {
  const value = line.trim();
  return (
    value.length === 0 ||
    value === "---" ||
    value.startsWith("<!-- vl-note:") ||
    value.startsWith("[▶ ") ||
    /^!\[\[.*\]\]$/.test(value) ||
    /^!\[.*\]\(.*\)$/.test(value)
  );
}

export class NoteStore {
  constructor(private app: App, private plugin: VideoLibraryPlugin) {}

  private get settings() {
    return this.plugin.data.settings;
  }

  private get root(): string {
    return normalizePath(this.settings.notesRoot.trim() || "视频笔记");
  }

  get attachmentRoot(): string {
    if (this.settings.noteAttachmentMode === "custom") {
      return normalizePath(this.settings.noteAttachmentFolder.trim() || "附件");
    }
    return this.root;
  }

  groupFor(videoId: string): NoteGroup | undefined {
    return this.plugin.data.noteGroups.find((group) => group.videoId === videoId);
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = normalizePath(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  private noteFileFor(group: NoteGroup): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(group.notePath);
    return file instanceof TFile ? file : null;
  }

  async resolveGroup(video: VideoItem): Promise<NoteGroup> {
    const existing = this.groupFor(video.id);
    if (existing) {
      const file = this.noteFileFor(existing);
      if (file) return existing;
      const moved = await this.findNoteByVideoId(video.id);
      if (moved) {
        existing.notePath = moved.path;
        existing.folderPath = moved.parent?.path || existing.folderPath;
        video.notePath = moved.path;
        video.noteFolder = existing.folderPath;
        await this.plugin.persist();
        return existing;
      }
      await this.ensureFolder(existing.folderPath);
      if (!(await this.app.vault.adapter.exists(existing.notePath))) {
        await this.app.vault.create(existing.notePath, frontmatterFor(video));
      }
      return existing;
    }

    const found = await this.findNoteByVideoId(video.id);
    if (found) {
      const group: NoteGroup = {
        id: uid("notegroup"),
        videoId: video.id,
        folderPath: found.parent?.path || this.root,
        notePath: found.path,
        title: found.basename,
        createdAt: found.stat.ctime,
        updatedAt: found.stat.mtime
      };
      this.plugin.data.noteGroups.push(group);
      video.notePath = group.notePath;
      video.noteFolder = group.folderPath;
      await this.plugin.persist();
      return group;
    }

    return this.createGroup(video);
  }

  private async createGroup(video: VideoItem): Promise<NoteGroup> {
    const title = sanitizeName(video.title || t("misc.untitled"));
    await this.ensureFolder(this.root);
    const flat = this.settings.notesGrouping === "flat";
    const folderBase = sanitizeName(`${title}`);
    let folder = flat ? this.root : normalizePath(`${this.root}/${folderBase}`);
    let suffix = 1;
    while (!flat && (await this.app.vault.adapter.exists(folder))) {
      const noteAt = normalizePath(`${folder}/${sanitizeName(title)}.md`);
      if (await this.app.vault.adapter.exists(noteAt)) {
        const content = await this.app.vault.adapter.read(noteAt);
        if (content.includes(`"video-id": "${video.id}"`) || content.includes(`video-id: ${JSON.stringify(video.id)}`)) {
          const found = this.app.vault.getAbstractFileByPath(noteAt);
          if (found instanceof TFile) {
            const group: NoteGroup = {
              id: uid("notegroup"),
              videoId: video.id,
              folderPath: folder,
              notePath: noteAt,
              title: found.basename,
              createdAt: found.stat.ctime,
              updatedAt: found.stat.mtime
            };
            this.plugin.data.noteGroups.push(group);
            video.notePath = noteAt;
            video.noteFolder = folder;
            await this.plugin.persist();
            return group;
          }
        }
      }
      suffix += 1;
      folder = normalizePath(`${this.root}/${folderBase} ${suffix}`);
    }

    await this.ensureFolder(folder);
    const noteName = uniqueName(
      sanitizeName(title),
      ".md",
      (path) => Boolean(this.app.vault.getAbstractFileByPath(path)),
      folder
    );
    const notePath = normalizePath(`${folder}/${noteName}`);
    this.plugin.noteWriteGuard = Date.now() + 900;
    await this.app.vault.create(notePath, frontmatterFor(video));
    const group: NoteGroup = {
      id: uid("notegroup"),
      videoId: video.id,
      folderPath: folder,
      notePath,
      title: noteName.replace(/\.md$/i, ""),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.plugin.data.noteGroups.push(group);
    video.notePath = notePath;
    video.noteFolder = folder;
    await this.plugin.persist();
    return group;
  }

  async findNoteByVideoId(videoId: string): Promise<TFile | null> {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.["video-library-note"] === true && frontmatter?.["video-id"] === videoId) {
        return file;
      }
      try {
        const head = (await this.app.vault.adapter.read(file.path)).slice(0, 600);
        if (
          head.includes("video-library-note: true") &&
          (head.includes(`video-id: ${JSON.stringify(videoId)}`) ||
            head.includes(`"video-id": ${JSON.stringify(videoId)}`))
        ) {
          return file;
        }
      } catch {
        // Ignore unreadable files.
      }
    }
    return null;
  }

  async readText(group: NoteGroup): Promise<string> {
    const file = this.noteFileFor(group);
    if (!file) return "";
    try {
      return await this.app.vault.adapter.read(file.path);
    } catch {
      return "";
    }
  }

  async listNodes(video: VideoItem): Promise<NoteNode[]> {
    const group = this.groupFor(video.id);
    if (!group) return [];
    const resolved = await this.resolveGroup(video);
    const text = await this.readText(resolved);
    return this.parseNodes(text);
  }

  parseNodes(text: string): NoteNode[] {
    const lines = text.split(/\r?\n/);
    const nodes: NoteNode[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(NOTE_MARKER);
      if (!match) continue;
      let data: {
        id?: string;
        time?: number;
        tags?: string[];
        image?: string;
        images?: string[];
        cover?: string;
        parentId?: string;
        groupId?: string;
        createdAt?: number;
      };
      try {
        data = JSON.parse(match[1]) as typeof data;
      } catch {
        continue;
      }
      const time = Number(data.time);
      if (!Number.isFinite(time)) continue;
      let headingIndex = index - 1;
      while (headingIndex >= 0 && lines[headingIndex].trim() === "") headingIndex -= 1;
      const heading = headingIndex >= 0 ? lines[headingIndex].match(NOTE_HEADER) : null;
      const comment = heading?.[2]?.trim() || "";
      const start = heading ? headingIndex : index;
      let end = lines.length;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (lines[next].match(NOTE_MARKER) || /^#{2,3}\s+/.test(lines[next])) {
          end = next;
          break;
        }
      }
      const bodyLines = lines.slice(index + 1, end);
      const body: string[] = [];
      const imagePaths: string[] = [];
      let cover = data.cover ? String(data.cover) : data.image ? String(data.image) : "";
      let coverConsumed = false;
      for (const line of bodyLines) {
        const imageMatch = line.trim().match(/^!\[\[(.*?)\]\]$/);
        const markdownImage = line.trim().match(/^!\[.*\]\((.*?)\)$/);
        const path = imageMatch?.[1] || markdownImage?.[1];
        if (path) {
          imagePaths.push(path);
          if (!cover) {
            cover = path;
            coverConsumed = true;
            continue;
          }
          if (path === cover && !coverConsumed) {
            coverConsumed = true;
            continue;
          }
          // Pasted images stay in the summary so Markdown rendering keeps their position.
          body.push(line);
          continue;
        }
        if (!isSystemLine(line)) body.push(line);
      }
      const summary = body.join("\n").trim();
      nodes.push({
        id: String(data.id || uid("note")),
        time,
        comment,
        summary,
        tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)).filter(Boolean) : [],
        images: imagePaths,
        coverImage: cover || undefined,
        imagePath: cover || undefined,
        parentId: data.parentId ? String(data.parentId) : undefined,
        groupId: data.groupId ? String(data.groupId) : undefined,
        createdAt: Number(data.createdAt) || Date.now()
      });
    }
    return nodes.sort((a, b) => a.time - b.time);
  }

  async discoverGroups(): Promise<void> {
    let changed = false;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.["video-library-note"] !== true) continue;
      const videoId = String(frontmatter?.["video-id"] || "");
      if (!videoId || this.groupFor(videoId)) continue;
      const video = this.plugin.data.videos.find((item) => item.id === videoId);
      if (!video) continue;
      this.plugin.data.noteGroups.push({
        id: uid("notegroup"),
        videoId,
        folderPath: file.parent?.path || this.root,
        notePath: file.path,
        title: file.basename,
        createdAt: file.stat.ctime,
        updatedAt: file.stat.mtime
      });
      video.notePath = file.path;
      video.noteFolder = file.parent?.path;
      changed = true;
    }
    if (changed) {
      await this.plugin.persist();
      this.plugin.refreshViews();
    }
  }

  async syncPreview(video: VideoItem): Promise<void> {
    const group = this.groupFor(video.id);
    if (!group) return;
    const nodes = await this.listNodes(video);
    const settings = this.plugin.data.settings;
    if (nodes.length > 0) {
      const clipDuration = Math.max(1, Math.min(settings.notePreviewMax, settings.notePreviewDuration));
      video.preview = {
        duration: Math.min(settings.notePreviewMax, Math.max(1, settings.notePreviewTotal)),
        clips: nodes.map((node) => ({
          start: node.time,
          end: node.time + clipDuration
        }))
      };
      video.previewFromNotes = true;
    } else if (video.previewFromNotes) {
      video.preview = undefined;
      video.previewFromNotes = false;
    }
    await this.plugin.persist();
  }

  parseSections(text: string): NoteSection[] {
    const lines = text.split(/\r?\n/);
    const sections: NoteSection[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const marker = lines[index].match(SECTION_MARKER);
      if (!marker) continue;
      let data: { id?: string; title?: string; summary?: string; createdAt?: number };
      try {
        data = JSON.parse(marker[1]) as typeof data;
      } catch {
        continue;
      }
      let headingIndex = index - 1;
      while (headingIndex >= 0 && lines[headingIndex].trim() === "") headingIndex -= 1;
      const heading = headingIndex >= 0 ? lines[headingIndex].match(/^##\s+(.*)$/) : null;
      let end = lines.length;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (
          lines[next].match(SECTION_MARKER) ||
          lines[next].match(NOTE_MARKER) ||
          /^##\s+/.test(lines[next])
        ) {
          end = next;
          break;
        }
      }
      const body = lines
        .slice(index + 1, end)
        .filter((line) => line.trim() && line.trim() !== "---")
        .join("\n")
        .trim();
      sections.push({
        id: String(data.id || uid("notegroup")),
        title: String(data.title || heading?.[1] || "分组"),
        summary: data.summary ? String(data.summary) : body,
        createdAt: Number(data.createdAt) || Date.now()
      });
    }
    return sections;
  }

  async listSections(video: VideoItem): Promise<NoteSection[]> {
    const group = this.groupFor(video.id);
    if (!group) return [];
    const text = await this.readText(group);
    const sections = this.parseSections(text);
    video.noteSections = sections;
    return sections;
  }

  async addSection(video: VideoItem, title: string, summary = ""): Promise<NoteSection> {
    const sections = await this.listSections(video);
    const section: NoteSection = {
      id: uid("section"),
      title: title.trim() || "分组",
      summary: summary.trim(),
      createdAt: Date.now()
    };
    video.noteSections = [...sections, section];
    await this.rebuildNote(video);
    return section;
  }

  async updateSection(
    video: VideoItem,
    sectionId: string,
    title: string,
    summary: string
  ): Promise<void> {
    const sections = await this.listSections(video);
    const section = sections.find((item) => item.id === sectionId);
    if (!section) return;
    section.title = title.trim() || section.title;
    section.summary = summary.trim();
    video.noteSections = sections;
    await this.rebuildNote(video);
  }

  async deleteSection(video: VideoItem, sectionId: string): Promise<void> {
    const sections = await this.listSections(video);
    video.noteSections = sections.filter((item) => item.id !== sectionId);
    const nodes = await this.listNodes(video);
    for (const node of nodes) {
      if (node.groupId === sectionId) {
        await this.updateNode(video, { ...node, groupId: undefined, parentId: undefined });
      }
    }
    await this.rebuildNote(video);
  }

  async assignGroup(video: VideoItem, nodeId: string, sectionId: string | undefined): Promise<void> {
    const nodes = await this.listNodes(video);
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    await this.updateNode(video, { ...node, groupId: sectionId, parentId: undefined });
    await this.rebuildNote(video);
  }

  async rebuildNote(video: VideoItem): Promise<void> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    const nodes = await this.listNodes(video);
    const sections = video.noteSections || (await this.listSections(video));
    const lines = text.split(/\r?\n/);
    let firstHeading = lines.findIndex((line) => /^##\s+/.test(line));
    if (firstHeading < 0) firstHeading = lines.length;
    const header = lines.slice(0, firstHeading).join("\n").trimEnd();
    const sectionIds = new Set(sections.map((section) => section.id));
    const ungrouped = nodes.filter((node) => !node.groupId || !sectionIds.has(node.groupId));
    const parts: string[] = [];
    for (const node of ungrouped) parts.push(blockFor(video, { ...node, groupId: undefined }));
    for (const section of sections) {
      const meta = JSON.stringify({
        id: section.id,
        title: section.title,
        summary: section.summary,
        createdAt: section.createdAt
      });
      parts.push(`## ${section.title}\n<!-- vl-section: ${meta} -->\n\n${section.summary}\n\n---`);
      for (const node of nodes.filter((item) => item.groupId === section.id)) {
        parts.push(blockFor(video, node));
      }
    }
    await this.writeGroup(group, `${header}\n\n${parts.join("\n\n")}\n`);
    await this.plugin.persist();
    await this.syncPreview(video);
  }

  async reload(video: VideoItem): Promise<NoteNode[]> {
    const group = this.groupFor(video.id);
    if (!group) return [];
    const text = await this.readText(group);
    return this.parseNodes(text);
  }

  private async writeGroup(group: NoteGroup, text: string): Promise<void> {
    this.plugin.noteWriteGuard = Date.now() + 900;
    const file = this.noteFileFor(group);
    if (file) await this.app.vault.adapter.write(file.path, text);
    else await this.app.vault.create(group.notePath, text);
    group.updatedAt = Date.now();
  }

  async addNode(
    video: VideoItem,
    time: number,
    options: { comment?: string; summary?: string; tags?: string[]; image?: ArrayBuffer | null; extension?: string } = {}
  ): Promise<NoteNode> {
    const group = await this.resolveGroup(video);
    let imagePath: string | undefined;
    if (options.image) {
      imagePath = await this.saveScreenshot(video, group, time, options.image, options.extension || "png");
    }
    const node: NoteNode = {
      id: uid("note"),
      time: Math.max(0, Number(time) || 0),
      comment: options.comment?.trim() || "",
      summary: options.summary?.trim() || "",
      tags: options.tags?.map((tag) => tag.trim()).filter(Boolean) || [],
      images: imagePath ? [imagePath] : [],
      coverImage: imagePath,
      imagePath,
      createdAt: Date.now()
    };
    const text = await this.readText(group);
    const next = `${text.trimEnd()}\n\n${blockFor(video, node)}`;
    await this.writeGroup(group, next);
    await this.plugin.persist();
    await this.syncPreview(video);
    return node;
  }

  async updateNode(video: VideoItem, node: NoteNode): Promise<void> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    const lines = text.split(/\r?\n/);
    const markerIndex = lines.findIndex((line) => {
      const match = line.match(NOTE_MARKER);
      if (!match) return false;
      try {
        return (JSON.parse(match[1]) as { id?: string }).id === node.id;
      } catch {
        return false;
      }
    });
    if (markerIndex < 0) return;
    let start = markerIndex - 1;
    while (start >= 0 && lines[start].trim() === "") start -= 1;
    if (start < 0 || !NOTE_HEADER.test(lines[start])) start = markerIndex;
    let end = lines.length;
    for (let next = markerIndex + 1; next < lines.length; next += 1) {
      if (lines[next].match(NOTE_MARKER) || /^#{2,3}\s+/.test(lines[next])) {
        end = next;
        break;
      }
    }
    const before = lines.slice(0, start).join("\n").trimEnd();
    const after = lines.slice(end).join("\n").trimStart();
    const next = `${before}\n\n${blockFor(video, node)}${after ? `\n${after}` : ""}`;
    await this.writeGroup(group, next);
    await this.plugin.persist();
    await this.syncPreview(video);
  }

  async deleteNode(video: VideoItem, nodeId: string): Promise<boolean> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    const lines = text.split(/\r?\n/);
    const markerIndex = lines.findIndex((line) => {
      const match = line.match(NOTE_MARKER);
      if (!match) return false;
      try {
        return (JSON.parse(match[1]) as { id?: string }).id === nodeId;
      } catch {
        return false;
      }
    });
    if (markerIndex < 0) return false;
    let start = markerIndex - 1;
    while (start >= 0 && lines[start].trim() === "") start -= 1;
    if (start < 0 || !NOTE_HEADER.test(lines[start])) start = markerIndex;
    let end = lines.length;
    for (let next = markerIndex + 1; next < lines.length; next += 1) {
      if (lines[next].match(NOTE_MARKER) || /^#{2,3}\s+/.test(lines[next])) {
        end = next;
        break;
      }
    }
    const block = lines.slice(start, end).join("\n").trim();
    const node = this.parseNodes(block)[0] || {
      id: nodeId,
      time: 0,
      comment: "",
      summary: "",
      tags: [],
      createdAt: Date.now()
    };
    const trash: TrashNote = {
      id: uid("trash"),
      videoId: video.id,
      videoTitle: video.title,
      notePath: group.notePath,
      folderPath: group.folderPath,
      block,
      node,
      deletedAt: Date.now()
    };
    this.plugin.data.trashNotes.unshift(trash);
    const next = `${lines.slice(0, start).join("\n").trimEnd()}\n\n${lines
      .slice(end)
      .join("\n")
      .trimStart()}`.trimEnd();
    await this.writeGroup(group, next);
    await this.plugin.persist();
    await this.syncPreview(video);
    return true;
  }

  async restoreTrash(trashId: string): Promise<boolean> {
    const trash = this.plugin.data.trashNotes.find((item) => item.id === trashId);
    if (!trash) return false;
    const video = this.plugin.data.videos.find((item) => item.id === trash.videoId);
    if (!video) return false;
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    await this.writeGroup(group, `${text.trimEnd()}\n\n${trash.block}\n`);
    this.plugin.data.trashNotes = this.plugin.data.trashNotes.filter((item) => item.id !== trashId);
    await this.plugin.persist();
    await this.syncPreview(video);
    return true;
  }

  async purgeTrash(trashId: string): Promise<boolean> {
    const trash = this.plugin.data.trashNotes.find((item) => item.id === trashId);
    if (!trash) return false;
    const imagePaths = this.imagePathsInBlock(trash.block);
    for (const path of imagePaths) {
      try {
        if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
      } catch {
        // Ignore missing attachments.
      }
    }
    this.plugin.data.trashNotes = this.plugin.data.trashNotes.filter((item) => item.id !== trashId);
    const group = this.plugin.data.noteGroups.find((item) => item.videoId === trash.videoId);
    if (group) {
      const text = await this.readText(group);
      if (this.parseNodes(text).length === 0) {
        const file = this.noteFileFor(group);
        if (file) {
          try {
            await this.app.vault.delete(file, true);
          } catch {
            // Ignore.
          }
        }
        this.plugin.data.noteGroups = this.plugin.data.noteGroups.filter((item) => item.id !== group.id);
        const video = this.plugin.data.videos.find((item) => item.id === group.videoId);
        if (video) {
          video.notePath = undefined;
          video.noteFolder = undefined;
        }
      }
    }
    await this.plugin.persist();
    return true;
  }

  private get trashDir(): string {
    return normalizePath(`${this.plugin.manifest.dir || ".obsidian/plugins/video-library"}/notes-trash/images`);
  }

  private get trashGroupDir(): string {
    return normalizePath(`${this.plugin.manifest.dir || ".obsidian/plugins/video-library"}/notes-trash/groups`);
  }

  async trashGroup(video: VideoItem): Promise<boolean> {
    const group = await this.resolveGroup(video);
    if (group.folderPath === this.root) return false;
    const id = uid("trashgroup");
    const trashPath = normalizePath(`${this.trashGroupDir}/${id}`);
    try {
      await this.ensureFolder(this.trashGroupDir);
      await this.app.vault.adapter.rename(group.folderPath, trashPath);
    } catch {
      return false;
    }
    this.plugin.data.trashGroups.unshift({
      id,
      videoId: video.id,
      videoTitle: video.title,
      groupId: group.id,
      title: group.title,
      notePath: group.notePath,
      folderPath: group.folderPath,
      trashPath,
      coverPath: group.coverPath,
      deletedAt: Date.now()
    });
    this.plugin.data.noteGroups = this.plugin.data.noteGroups.filter((item) => item.id !== group.id);
    video.notePath = undefined;
    video.noteFolder = undefined;
    video.noteCoverPath = undefined;
    await this.plugin.persist();
    await this.syncPreview(video);
    return true;
  }

  async restoreGroup(id: string): Promise<boolean> {
    const record = this.plugin.data.trashGroups.find((item) => item.id === id);
    if (!record) return false;
    const video = this.plugin.data.videos.find((item) => item.id === record.videoId);
    if (!video) return false;
    try {
      if (await this.app.vault.adapter.exists(record.folderPath)) {
        const suffix = Date.now().toString(36);
        record.folderPath = normalizePath(`${record.folderPath} ${suffix}`);
        record.notePath = normalizePath(
          `${record.folderPath}/${record.notePath.split("/").pop() || record.title + ".md"}`
        );
      }
      const parent = record.folderPath.split("/").slice(0, -1).join("/");
      if (parent) await this.ensureFolder(parent);
      await this.app.vault.adapter.rename(record.trashPath, record.folderPath);
    } catch {
      return false;
    }
    const group: NoteGroup = {
      id: record.groupId || uid("notegroup"),
      videoId: record.videoId,
      folderPath: record.folderPath,
      notePath: record.notePath,
      title: record.title,
      coverPath: record.coverPath,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.plugin.data.noteGroups.push(group);
    video.notePath = group.notePath;
    video.noteFolder = group.folderPath;
    this.plugin.data.trashGroups = this.plugin.data.trashGroups.filter((item) => item.id !== id);
    await this.plugin.persist();
    await this.syncPreview(video);
    return true;
  }

  async purgeGroup(id: string): Promise<boolean> {
    const record = this.plugin.data.trashGroups.find((item) => item.id === id);
    if (!record) return false;
    try {
      await this.app.vault.adapter.rmdir(record.trashPath, true);
    } catch {
      // Ignore.
    }
    this.plugin.data.trashGroups = this.plugin.data.trashGroups.filter((item) => item.id !== id);
    await this.plugin.persist();
    return true;
  }

  async trashImage(video: VideoItem, node: NoteNode, imagePath?: string): Promise<boolean> {
    const source = imagePath || node.coverImage || node.imagePath;
    if (!source) return false;
    const group = await this.resolveGroup(video);
    const extension = source.split(".").pop()?.toLowerCase() || "png";
    const id = uid("trashimg");
    const trashPath = normalizePath(`${this.trashDir}/${id}.${extension}`);
    try {
      const buffer = await this.app.vault.adapter.readBinary(source);
      await this.ensureFolder(this.trashDir);
      await this.app.vault.adapter.writeBinary(trashPath, buffer);
      await this.app.vault.adapter.remove(source);
    } catch {
      return false;
    }
    const record: TrashImage = {
      id,
      videoId: video.id,
      videoTitle: video.title,
      nodeId: node.id,
      time: node.time,
      kind: source === (node.coverImage || node.imagePath) ? "cover" : "summary",
      path: source,
      trashPath,
      notePath: group.notePath,
      folderPath: group.folderPath,
      deletedAt: Date.now()
    };
    this.plugin.data.trashImages.unshift(record);
    const images = (node.images?.length ? node.images : node.imagePath ? [node.imagePath] : []).filter(
      (path) => path !== source
    );
    const coverImage = node.coverImage === source ? undefined : node.coverImage || node.imagePath;
    const summary = removeImageFromSummary(node.summary, source);
    await this.updateNode(video, {
      ...node,
      summary,
      images,
      coverImage,
      imagePath: coverImage
    });
    await this.plugin.persist();
    return true;
  }

  async restoreImage(id: string): Promise<boolean> {
    const record = this.plugin.data.trashImages.find((item) => item.id === id);
    if (!record) return false;
    const video = this.plugin.data.videos.find((item) => item.id === record.videoId);
    if (!video) return false;
    try {
      const buffer = await this.app.vault.adapter.readBinary(record.trashPath);
      const parent = record.path.split("/").slice(0, -1).join("/");
      if (parent) await this.ensureFolder(parent);
      await this.app.vault.adapter.writeBinary(record.path, buffer);
    } catch {
      return false;
    }
    const nodes = await this.listNodes(video);
    const node = nodes.find((item) => item.id === record.nodeId);
    if (node) {
      const images = [...(node.images?.length ? node.images : node.imagePath ? [node.imagePath] : [])];
      if (!images.includes(record.path)) images.push(record.path);
      const coverImage =
        record.kind === "cover" ? record.path : node.coverImage || node.imagePath;
      const summary =
        record.kind === "summary"
          ? `${node.summary.trimEnd()}\n\n![[${record.path}]]`.trim()
          : node.summary;
      await this.updateNode(video, {
        ...node,
        summary,
        images,
        coverImage,
        imagePath: coverImage
      });
    }
    this.plugin.data.trashImages = this.plugin.data.trashImages.filter((item) => item.id !== id);
    try {
      await this.app.vault.adapter.remove(record.trashPath);
    } catch {
      // Ignore a missing trash copy.
    }
    await this.plugin.persist();
    return true;
  }

  async purgeImage(id: string): Promise<boolean> {
    const record = this.plugin.data.trashImages.find((item) => item.id === id);
    if (!record) return false;
    try {
      if (await this.app.vault.adapter.exists(record.trashPath)) {
        await this.app.vault.adapter.remove(record.trashPath);
      }
    } catch {
      // Ignore.
    }
    this.plugin.data.trashImages = this.plugin.data.trashImages.filter((item) => item.id !== id);
    await this.plugin.persist();
    return true;
  }

  async clearTrash(): Promise<void> {
    for (const trash of [...this.plugin.data.trashNotes]) {
      await this.purgeTrash(trash.id);
    }
    for (const image of [...this.plugin.data.trashImages]) {
      await this.purgeImage(image.id);
    }
    for (const group of [...this.plugin.data.trashGroups]) {
      await this.purgeGroup(group.id);
    }
    try {
      await this.app.vault.adapter.rmdir(this.trashDir, true);
    } catch {
      // Ignore an already missing trash folder.
    }
  }

  async reorderNodes(video: VideoItem, orderedIds: string[]): Promise<void> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    const lines = text.split(/\r?\n/);
    const blocks: Array<{ id: string; lines: string[] }> = [];
    let headerEnd = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
      const marker = lines[index].match(NOTE_MARKER);
      if (!marker) continue;
      let data: { id?: string };
      try {
        data = JSON.parse(marker[1]) as { id?: string };
      } catch {
        continue;
      }
      let start = index - 1;
      while (start >= 0 && lines[start].trim() === "") start -= 1;
      if (start < 0 || !NOTE_HEADER.test(lines[start])) start = index;
      let end = lines.length;
      for (let next = index + 1; next < lines.length; next += 1) {
        if (lines[next].match(NOTE_MARKER) || /^#{2,3}\s+/.test(lines[next])) {
          end = next;
          break;
        }
      }
      if (blocks.length === 0) headerEnd = start;
      blocks.push({ id: String(data.id || ""), lines: lines.slice(start, end) });
    }
    if (blocks.length === 0) return;
    const map = new Map(blocks.map((block) => [block.id, block]));
    const ordered = orderedIds.map((id) => map.get(id)).filter((block): block is { id: string; lines: string[] } => Boolean(block));
    for (const block of blocks) if (!ordered.includes(block)) ordered.push(block);
    const header = lines.slice(0, headerEnd).join("\n").trimEnd();
    const body = ordered.map((block) => block.lines.join("\n").trim()).join("\n\n");
    await this.writeGroup(group, `${header}\n\n${body}\n`);
    await this.plugin.persist();
    await this.syncPreview(video);
  }

  async setNodeImages(video: VideoItem, node: NoteNode, images: string[]): Promise<void> {
    await this.updateNode(video, {
      ...node,
      images,
      imagePath: images[0]
    });
  }

  imagePathsInBlock(block: string): string[] {
    const paths = new Set<string>();
    for (const match of block.matchAll(/!\[\[(.*?)\]\]/g)) {
      if (match[1]) paths.add(normalizePath(match[1]));
    }
    for (const match of block.matchAll(/!\[.*\]\((.*?)\)/g)) {
      if (match[1] && !/^https?:/i.test(match[1])) paths.add(normalizePath(match[1]));
    }
    const marker = block.match(NOTE_MARKER);
    if (marker) {
      try {
        const data = JSON.parse(marker[1]) as { image?: string };
        if (data.image) paths.add(normalizePath(data.image));
      } catch {
        // Ignore malformed metadata.
      }
    }
    return [...paths];
  }

  async saveScreenshot(
    video: VideoItem,
    group: NoteGroup,
    time: number,
    buffer: ArrayBuffer,
    extension = "png"
  ): Promise<string> {
    const folder = this.attachmentFolder(group);
    await this.ensureFolder(folder);
    const base = sanitizeName(`${video.title || "视频"}-${formatClock(time).replace(/:/g, "-")}`, "截图");
    const name = uniqueName(base, `.${extension}`, (path) => Boolean(this.app.vault.getAbstractFileByPath(path)), folder);
    const path = normalizePath(`${folder}/${name}`);
    await this.app.vault.createBinary(path, buffer);
    return path;
  }

  async saveImageBuffer(video: VideoItem, buffer: ArrayBuffer, extension = "png"): Promise<string> {
    const group = await this.resolveGroup(video);
    return this.saveScreenshot(video, group, Date.now() / 1000, buffer, extension);
  }

  attachmentFolder(group: NoteGroup): string {
    if (this.settings.noteAttachmentMode === "same") return normalizePath(group.folderPath);
    if (this.settings.noteAttachmentMode === "custom") {
      return normalizePath(this.settings.noteAttachmentFolder.trim() || "附件");
    }
    const sub = sanitizeName(this.settings.noteAttachmentFolder.trim() || "attachments", "attachments");
    return normalizePath(`${group.folderPath}/${sub}`);
  }

  async appendImage(video: VideoItem, imagePath: string): Promise<void> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    await this.writeGroup(group, `${text.trimEnd()}\n\n![[${imagePath}]]\n`);
    await this.plugin.persist();
  }

  async appendDivider(video: VideoItem): Promise<void> {
    const group = await this.resolveGroup(video);
    const text = await this.readText(group);
    await this.writeGroup(group, `${text.trimEnd()}\n\n---\n\n`);
    await this.plugin.persist();
  }

  async renameGroup(video: VideoItem, nextTitle: string): Promise<void> {
    const group = await this.resolveGroup(video);
    const clean = sanitizeName(nextTitle, group.title);
    if (clean === group.title) return;
    const file = this.noteFileFor(group);
    const folder = group.folderPath;
    const name = uniqueName(clean, ".md", (path) => Boolean(this.app.vault.getAbstractFileByPath(path)), folder);
    const nextPath = normalizePath(`${folder}/${name}`);
    if (file) {
      await this.app.vault.rename(file, nextPath);
      try {
        const text = await this.app.vault.adapter.read(nextPath);
        const updated = text
          .replace(/^video-title:.*$/m, `video-title: ${JSON.stringify(clean)}`)
          .replace(/^#\s+.*$/m, `# ${clean}`);
        await this.app.vault.adapter.write(nextPath, updated);
      } catch {
        // Keep the rename even if the heading update fails.
      }
    }
    group.title = clean;
    group.notePath = nextPath;
    group.updatedAt = Date.now();
    video.notePath = nextPath;
    video.noteFolder = folder;
    await this.plugin.persist();
  }

  async setGroupCover(video: VideoItem, path: string | undefined): Promise<void> {
    const group = await this.resolveGroup(video);
    group.coverPath = path;
    group.updatedAt = Date.now();
    video.noteCoverPath = path;
    await this.plugin.persist();
  }

  displayPath(path: string | undefined): string | null {
    if (!path) return null;
    try {
      return this.app.vault.adapter.getResourcePath(path);
    } catch {
      return null;
    }
  }

  async openNote(video: VideoItem): Promise<void> {
    this.plugin.focusMainWindow();
    const group = await this.resolveGroup(video);
    const file = this.noteFileFor(group);
    if (!file) {
      new Notice(t("notes.noteMissing"));
      return;
    }
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  async ensureAllGroups(): Promise<void> {
    for (const video of this.plugin.data.videos) {
      if (video.provider === "web") continue;
      await this.resolveGroup(video);
    }
  }
}

