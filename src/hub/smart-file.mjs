// File-read gate and smart outline. A large file that already has observations is gated: a whole-file read
// is refused and the caller gets a symbol outline plus an observation timeline, then reads only the offsets it wants.
// The gate is off by default until it has been measured; a file with no history is never gated.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { wrapUntrusted } from "./untrusted.mjs";

export const DEFAULT_GATE_BYTES = 32 * 1024;
// The hub settings table stores the dashboard setting `readGate.enabled` under the editable-settings prefix.
export const READ_GATE_SETTING_KEY = "ui.settings.readGate.enabled";
const OUTLINE_READ_BYTES = 2 * 1024 * 1024;
const REASON_OUTLINE_ROWS = 60;
const REASON_HISTORY_ROWS = 10;

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SYMBOL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const TS_SYMBOL = /^(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

/** A cheap, licence-free symbol outline: markdown headings and one code symbol per line. Bounded and deterministic. */
export function outlineOf(text) {
  const out = [];
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(HEADING);
    if (heading) {
      out.push({ line: i + 1, kind: `h${heading[1].length}`, text: heading[2] });
      continue;
    }
    const symbol = line.match(SYMBOL) ?? line.match(TS_SYMBOL);
    if (symbol) out.push({ line: i + 1, kind: "symbol", text: symbol[1] });
    if (out.length >= 500) break;
  }
  return out;
}

/** Read a targeted slice of a file by line number. Passes even when the whole-file read is gated. */
export function readLines(text, { offset = 0, limit = 100 } = {}) {
  const lines = String(text ?? "").split("\n");
  const start = Math.max(0, Math.trunc(Number(offset) || 0));
  const count = Math.max(1, Math.trunc(Number(limit) || 100));
  return lines.slice(start, start + count).join("\n");
}

/** The observation timeline for one file: memories whose `files` list contains the exact path, newest first. */
export function historyOf(store, { project, file }) {
  if (!file) return [];
  return store.byFile({ file, project, suffix: false, limit: 50 }).items.map((memory) => ({
    id: memory.id,
    type: memory.type,
    title: memory.title,
    atEpoch: memory.created_at_epoch,
  }));
}

/** Decide whether a whole-file read is gated. A file with no history is never gated. */
export function gateFileRead({ size = 0, historyCount = 0, enabled = false, thresholdBytes = DEFAULT_GATE_BYTES } = {}) {
  if (!enabled) return { gated: false, reason: "gate disabled" };
  if (historyCount < 1) return { gated: false, reason: "no history" };
  if (size < thresholdBytes) return { gated: false, reason: "under threshold" };
  return { gated: true, reason: "large file with history" };
}

/**
 * The full gate: whole-file reads of a large, observed file are refused and replaced with a size, an outline and a
 * timeline; a targeted offset/limit read is always served. `enabled` is off by default.
 */
export function smartFileRead(store, { project, file, text = null, size = null, enabled = false, thresholdBytes = DEFAULT_GATE_BYTES, offset = null, limit = null } = {}) {
  const body = text ?? (file ? readFileSync(file, "utf8") : "");
  const bytes = size ?? Buffer.byteLength(body);
  const history = historyOf(store, { project, file });
  const decision = gateFileRead({ size: bytes, historyCount: history.length, enabled, thresholdBytes });
  if (offset != null || limit != null) {
    return { ...decision, outline: outlineOf(body), history, text: readLines(body, { offset, limit }) };
  }
  if (decision.gated) {
    return { ...decision, size: bytes, outline: outlineOf(body), history, text: null };
  }
  return { ...decision, size: bytes, outline: outlineOf(body), history, text: body };
}

/** The gate switch, read straight from a hub file without opening the store. false when unset or unreadable. */
export function readGateEnabled(dbPath) {
  if (!dbPath || dbPath === ":memory:" || !existsSync(dbPath)) return false;
  let db = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(READ_GATE_SETTING_KEY);
    return row ? JSON.parse(row.value) === true : false;
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

/** The outline and history as text for a model: the outline is file text, the history is recalled memory (wrapped). */
export function outlineText({ file, bytes, outline, history }) {
  const rows = outline.slice(0, REASON_OUTLINE_ROWS).map((row) => `  line ${row.line} ${row.kind}: ${row.text}`);
  const more = outline.length > REASON_OUTLINE_ROWS ? [`  ... ${outline.length - REASON_OUTLINE_ROWS} more`] : [];
  const lines = [`${file} (${bytes} bytes)`, "Outline:", ...(rows.length ? rows : ["  (no symbols or headings found)"]), ...more];
  if (history.length) {
    lines.push("", wrapUntrusted(["Earlier memories that touched this file:", ...history.slice(0, REASON_HISTORY_ROWS).map((item) => `#${item.id} [${item.type}] ${item.title}`)].join("\n")));
  }
  return lines.join("\n");
}

/**
 * The PreToolUse answer for one Read call, as hook stdout: a deny JSON, or "" to allow. Allows whenever the gate is
 * off, the call is not a whole-file Read, the file is small or has no history, or anything at all goes wrong.
 * `open()` returns a HubStore and is only called once the cheap checks pass.
 */
export function readGateOutput(payload, { dbPath, project, open, thresholdBytes = DEFAULT_GATE_BYTES } = {}) {
  try {
    if (payload?.tool_name !== "Read") return "";
    const input = payload.tool_input ?? {};
    const file = input.file_path;
    if (typeof file !== "string" || !isAbsolute(file)) return "";
    if (input.offset != null || input.limit != null) return "";
    if (!readGateEnabled(dbPath)) return "";
    const stat = statSync(file);
    if (!stat.isFile() || stat.size < thresholdBytes) return "";
    const store = open();
    try {
      const history = historyOf(store, { project, file });
      if (!gateFileRead({ size: stat.size, historyCount: history.length, enabled: true, thresholdBytes }).gated) return "";
      const body = readFileSync(file, "utf8").slice(0, OUTLINE_READ_BYTES);
      const reason = [
        `Aletheia file-read gate: this whole-file read was skipped because the file is large and has earlier memories.`,
        outlineText({ file, bytes: stat.size, outline: outlineOf(body), history }),
        "",
        `Read the part you need instead: call Read again with offset (first line, 0-based) and limit (number of lines), using the line numbers above. A read with offset or limit is never gated.`,
      ].join("\n");
      return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
    } finally {
      try {
        store.close();
      } catch {
        // ignore
      }
    }
  } catch {
    return "";
  }
}

/** The outline of one file for the file_outline MCP tool. Refuses a path outside `root`; throws a plain Error. */
export function fileOutline(store, { file, root, project }) {
  if (typeof file !== "string" || !file.trim()) throw new Error("file is required.");
  if (!root) throw new Error("file_outline needs a local working directory and is not available over a remote connection.");
  const real = (path) => { try { return realpathSync(path); } catch { throw new Error(`Cannot read ${path}.`); } };
  const target = real(file.trim());
  const base = real(root);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("file must be inside the project working directory.");
  const stat = statSync(target);
  if (!stat.isFile()) throw new Error("file must be a regular file.");
  const body = readFileSync(target, "utf8").slice(0, OUTLINE_READ_BYTES);
  // Memories record the path the tool used, which can differ from the real path through a symlink (macOS /var is
  // /private/var), so look up both and keep each memory once.
  const given = resolve(file.trim());
  const seen = new Set();
  const history = [...historyOf(store, { project, file: given }), ...(given === target ? [] : historyOf(store, { project, file: target }))]
    .filter((item) => !seen.has(item.id) && seen.add(item.id));
  return outlineText({ file: target, bytes: stat.size, outline: outlineOf(body), history });
}
