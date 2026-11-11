// Shared hook plumbing: normalise one payload into a redacted memory, spool it when the store is unavailable,
// flush the spool later, and wrap recalled text as untrusted data.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkoutKey } from "../../lib/project-key.mjs";
import { ensureDirMode, ensureFileMode } from "../permissions.mjs";
import { redact } from "../redact.mjs";
import { wrapUntrusted } from "../untrusted.mjs";

// Kept here, not imported from queue.mjs: a hook process must not load the extraction code to queue a job.
export const COMPRESS_JOB_TYPE = "extract_session";

export const SPOOL_FILE = "hook-spool.jsonl";
export const MAX_TOOL_OUTPUT = 1500;
export const MAX_PROMPT = 8000;
export const MAX_SUMMARY = 4000;

const SKIP_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate", "ToolSearch", "todo_write"]);

const cut = (text, n) => (typeof text === "string" && text.length > n ? `${text.slice(0, n - 1)}…` : text);
const asText = (value) => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value));
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

function brief(input) {
  const i = typeof input === "object" && input ? input : {};
  return cut(oneLine(i.command ?? i.file_path ?? i.absolute_path ?? i.path ?? i.pattern ?? i.query ?? i.url ?? i.description ?? asText(input)), 160);
}

function repoRootOf(start) {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The same project key as projectKeyForPath, without spawning git (a hook has ~100 ms in total).
 * It walks up to the checkout and reads a worktree's `.git` file by hand (src/lib/project-key.mjs). A worktree gets
 * its main repository's key unless the worktree mode is "separate"; a folder outside git uses its own name.
 */
export function projectKeyForHook(cwd, options = {}) {
  if (!cwd || !cwd.trim()) return "unknown-project";
  const expanded = cwd.startsWith("~/") ? join(homedir(), cwd.slice(2)) : cwd;
  return checkoutKey(repoRootOf(expanded) ?? resolve(expanded), options);
}

export const projectOf = (payload) => (payload?.cwd ? projectKeyForHook(payload.cwd) : "default");

export function promptMemory(text, base) {
  const prompt = redact(typeof text === "string" ? text : "");
  if (prompt.trim().length < 3) return null;
  return { ...base, kind: "prompt", type: "note", title: cut(oneLine(prompt), 120), narrative: cut(prompt, MAX_PROMPT) };
}

export function toolMemory({ name, display, input, response }, base) {
  if (!name || SKIP_TOOLS.has(name)) return null;
  const summary = redact(brief(input));
  const narrative = cut(`input: ${redact(asText(input))}\n\noutput: ${redact(asText(response))}`, MAX_TOOL_OUTPUT);
  return { ...base, kind: "event", type: "event", title: cut(oneLine(`${display ?? name}: ${summary}`), 160), narrative };
}

/** A tool call that started and failed. `error` is the text Claude Code reports; it is redacted like any output. */
export function toolFailureMemory({ name, display, input, error, interrupted }, base) {
  if (!name || SKIP_TOOLS.has(name)) return null;
  const summary = redact(brief(input));
  const message = redact(asText(error));
  const narrative = cut(`input: ${redact(asText(input))}\n\nerror${interrupted === true ? " (interrupted)" : ""}: ${message}`, MAX_TOOL_OUTPUT);
  return { ...base, kind: "event", type: "event", title: cut(oneLine(`${display ?? name} failed: ${summary}`), 160), narrative, concepts: ["failure"] };
}

/** The closing message of a subagent. Tagged by origin so session-start context can leave it out. */
export function subagentMemory({ agentType, agentId, text }, base) {
  const type = typeof agentType === "string" ? oneLine(redact(agentType)).slice(0, 60) : "";
  if (!type || typeof text !== "string" || text.trim().length < 3) return null;
  const clean = redact(text);
  return { ...base, kind: "observation", type: "note", title: cut(`Subagent ${type}: ${oneLine(clean)}`, 140), narrative: cut(clean, MAX_SUMMARY), concepts: ["subagent", type], origin: `subagent:${type}`, subtitle: agentId ? `agent ${oneLine(redact(String(agentId))).slice(0, 80)}` : undefined };
}

export function summaryMemory(text, base) {
  if (typeof text !== "string" || text.trim().length < 3) return null;
  const clean = redact(text);
  return { ...base, kind: "summary", type: "summary", title: cut(`Session summary: ${oneLine(clean)}`, 140), narrative: cut(clean, MAX_SUMMARY) };
}

export { wrapUntrusted };

export function sessionContext(store, { project, tool, maxChars = 6000 }) {
  return wrapUntrusted(store.context({ project, tool, limit: 20, maxChars }));
}

export function sessionStartOutput(context) {
  if (!context) return "";
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
}

export function spoolPath(dataDir) {
  return join(dataDir, "spool", SPOOL_FILE);
}

/** Append one already-redacted item. A single small write is atomic enough for parallel hooks. */
export function spoolAppend(dataDir, item) {
  const file = spoolPath(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  ensureDirMode(dataDir, 0o700);
  ensureDirMode(dirname(file), 0o700);
  appendFileSync(file, `${JSON.stringify(item)}\n`);
  ensureFileMode(file, 0o600);
}

function parseItems(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function spoolRead(dataDir) {
  const file = spoolPath(dataDir);
  if (!existsSync(file)) return [];
  return parseItems(readFileSync(file, "utf8"));
}

/**
 * Replay the spool into the store. Returns {flushed, failed}. Items that fail are appended back.
 * The live file is renamed first, so an append from a parallel hook during the flush lands in a new file and is
 * not lost. Orphaned `.flushing-*` files from a crash are picked up by the next flush.
 */
export function flushSpool(store, dataDir) {
  const file = spoolPath(dataDir);
  const dir = dirname(file);
  const claimed = [];
  try {
    if (existsSync(dir)) for (const name of readdirSync(dir)) if (name.startsWith(`${SPOOL_FILE}.flushing-`)) claimed.push(join(dir, name));
  } catch {
    // ignore an unreadable directory
  }
  if (existsSync(file)) {
    const mine = `${file}.flushing-${process.pid}-${Date.now()}`;
    try {
      renameSync(file, mine);
      claimed.push(mine);
    } catch {
      // another process is flushing
    }
  }
  if (!claimed.length) return { flushed: 0, failed: 0 };

  let flushed = 0;
  const failed = [];
  for (const path of claimed) {
    let items;
    try {
      items = parseItems(readFileSync(path, "utf8"));
    } catch {
      continue; // leave it for the next run
    }
    for (const item of items) {
      try {
        if (item.kind === "memory" && item.memory) {
          store.add(item.memory, { actor: item.memory.tool ?? "hook", audit: false });
        } else if (item.kind === "compress") {
          enqueueCompression(store, item);
        } else if (item.kind === "sessionEnd") {
          store.markSessionEnded(item.project, item.sessionId, { source: item.source ?? "hook", now: item.at ?? Date.now() });
        } else {
          continue;
        }
        flushed++;
      } catch {
        failed.push(item);
      }
    }
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
  if (failed.length) appendFileSync(file, failed.map((item) => `${JSON.stringify(item)}\n`).join(""));
  return { flushed, failed: failed.length };
}

/**
 * Queue a finished session for compression as a row in `jobs`. There is no cap: a row stays until a worker
 * completes it, so a machine with no worker running loses nothing. A second stop for a session whose job is still
 * pending refreshes that job's `at` and keeps its place in line. Returns true when a new job was queued.
 */
export function enqueueCompression(store, { project, sessionId, at = Date.now() }) {
  const sid = sessionId ?? null;
  const payload = JSON.stringify({ project, sessionId: sid, at });
  if (sid) {
    const refreshed = store.db
      .prepare(`UPDATE OR IGNORE jobs SET payload = ?, updated_at_epoch = ?
                WHERE id = (SELECT id FROM jobs WHERE type = ? AND status = 'pending'
                            AND json_extract(payload, '$.project') = ? AND json_extract(payload, '$.sessionId') = ? LIMIT 1)`)
      .run(payload, Date.now(), COMPRESS_JOB_TYPE, project, sid);
    if (refreshed.changes) return false;
  }
  const now = Date.now();
  const info = store.db
    .prepare("INSERT OR IGNORE INTO jobs (type, payload, status, attempts, max_attempts, next_attempt_epoch, created_at_epoch, updated_at_epoch) VALUES (?, ?, 'pending', 0, 5, 0, ?, ?)")
    .run(COMPRESS_JOB_TYPE, payload, now, now);
  return info.changes > 0;
}

/** Sessions waiting for compression, oldest first: any not-yet-migrated settings entries, then pending jobs. */
export function compressionQueue(store) {
  const legacy = store.setting("compress.queue", []);
  const rows = store.db.prepare("SELECT payload FROM jobs WHERE type = ? AND status = 'pending' ORDER BY id").all(COMPRESS_JOB_TYPE);
  const jobs = rows.map((row) => {
    try { return JSON.parse(row.payload); } catch { return null; }
  }).filter(Boolean);
  return [...(Array.isArray(legacy) ? legacy : []), ...jobs];
}

/** Parse stdin. Empty or broken input is an empty payload, never an error (a hook must not break the tool). */
export function readPayload(stdin) {
  if (typeof stdin !== "string" || !stdin.trim()) return {};
  try {
    const parsed = JSON.parse(stdin);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
