// Folder context: a short CLAUDE.md/AGENTS.md per folder, generated from the observations that touched its files.
// The generated text lives in a managed block; everything the user wrote outside the block is preserved.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FOLDER_BEGIN = "<!-- aletheia:folder-context:begin -->";
export const FOLDER_END = "<!-- aletheia:folder-context:end -->";

const FOLDER_CONTEXT_KEY = "folder_context.projects";

/** True when this project has opted in to folder context files. */
export function folderContextEnabled(store, project) {
  const projects = store.setting(FOLDER_CONTEXT_KEY, []);
  return Array.isArray(projects) && projects.includes(project);
}

export function setFolderContextEnabled(store, project, enabled) {
  const projects = new Set(store.setting(FOLDER_CONTEXT_KEY, []).filter((name) => name !== project));
  if (enabled) projects.add(project);
  store.setSetting(FOLDER_CONTEXT_KEY, [...projects]);
}

/** Fold a flat list of {path, ...} entries into per-folder groups. */
export function groupByFolder(entries) {
  const folders = new Map();
  for (const entry of entries) {
    const folder = dirname(entry.path) || ".";
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder).push(entry);
  }
  return folders;
}

/** The minimal markdown for one folder: a purpose line, then recent decisions and gotchas. */
export function renderFolderContextBlock(entries) {
  const byType = (type) => entries.filter((entry) => entry.type === type);
  const purpose = byType("summary").concat(byType("prompt")).sort((a, b) => b.atEpoch - a.atEpoch)[0];
  const decisions = byType("decision").slice(0, 5).map((entry) => `- ${entry.title}`);
  const gotchas = byType("gotcha").slice(0, 5).map((entry) => `- ${entry.title}`);
  const lines = ["# Folder context", "", "Managed by aletheia-mem. This block is regenerated; text outside it is kept."];
  if (purpose) lines.push("", "## Purpose", "", purpose.narrative ?? purpose.title);
  if (decisions.length) lines.push("", "## Recent decisions", "", ...decisions);
  if (gotchas.length) lines.push("", "## Gotchas", "", ...gotchas);
  return `${lines.join("\n")}\n`;
}

/** Replace the managed folder-context block in `text` (or append one), leaving the rest untouched. */
export function applyFolderBlock(text, markdown) {
  const block = `${FOLDER_BEGIN}\n${markdown.trimEnd()}\n${FOLDER_END}`;
  const start = text.indexOf(FOLDER_BEGIN);
  const end = text.indexOf(FOLDER_END);
  if (start !== -1 && end > start) return `${text.slice(0, start)}${block}${text.slice(end + FOLDER_END.length)}`;
  const lead = text === "" ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${lead}${block}\n`;
}

/** The observation rows that touched a file, joined with their path. */
export function folderContextEntries(store, { project }) {
  return store.db
    .prepare(`SELECT m.project, m.type, m.title, m.narrative, m.created_at_epoch, f.path
              FROM memory_files f JOIN memories m ON m.id = f.memory_id
              WHERE m.project = ? ORDER BY m.created_at_epoch DESC`)
    .all(project)
    .map((row) => ({ path: row.path, type: row.type, title: row.title, narrative: row.narrative, atEpoch: row.created_at_epoch }));
}

/** Compute one {folder, markdown, count} per folder that has memories. Folders with no memories are absent. */
export function generateFolderContexts(store, { project }) {
  const folders = groupByFolder(folderContextEntries(store, { project }));
  return [...folders.entries()].map(([folder, entries]) => ({
    folder,
    markdown: renderFolderContextBlock(entries),
    count: entries.length,
  }));
}

/**
 * Write/update one folder-context file per folder with memories, for an opted-in project. A folder with no
 * memories is never written (an existing user file in such a folder is also left alone).
 */
export function writeFolderContexts(store, { project, baseDir = process.cwd(), fileName = "CLAUDE.md", dryRun = false } = {}) {
  if (!folderContextEnabled(store, project)) return { skipped: true, reason: "project has not opted in", files: [] };
  const files = [];
  for (const context of generateFolderContexts(store, { project })) {
    const path = join(baseDir, context.folder, fileName);
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    const after = applyFolderBlock(before, context.markdown);
    const changed = before !== after;
    if (!dryRun && changed) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, after);
    }
    files.push({ folder: context.folder, path, changed, written: !dryRun && changed, count: context.count });
  }
  return { skipped: false, files };
}
