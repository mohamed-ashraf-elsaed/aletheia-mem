// File-read gate and smart outline (T-060). A large file that already has observations is gated: a whole-file read
// is refused and the caller gets a symbol outline plus an observation timeline, then reads only the offsets it wants.
// The gate is off by default until it has been measured; a file with no history is never gated.
import { readFileSync } from "node:fs";

export const DEFAULT_GATE_BYTES = 32 * 1024;

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
