// Shared hook plumbing: normalise one payload into a redacted memory, spool it when the store is unavailable,
// flush the spool later, and wrap recalled text as untrusted data.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { redact } from "../redact.mjs";
import { wrapUntrusted } from "../untrusted.mjs";

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
 * It walks up to the checkout, reads a worktree's `.git` file by hand, and falls back to the folder name.
 */
export function projectKeyForHook(cwd) {
  if (!cwd || !cwd.trim()) return "unknown-project";
  const expanded = cwd.startsWith("~/") ? join(homedir(), cwd.slice(2)) : cwd;
  const root = repoRootOf(expanded) ?? resolve(expanded);
  const name = basename(root) || "unknown-project";
  try {
    if (!statSync(join(root, ".git")).isFile()) return name;
    const match = readFileSync(join(root, ".git"), "utf8").trim().match(/^gitdir:\s*(.+)$/);
    if (!match) return name;
    const gitdir = resolve(dirname(join(root, ".git")), match[1]);
    const worktree = gitdir.match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);
    if (worktree) {
      const parentName = basename(worktree[1]);
      return parentName === name ? parentName : `${parentName}/${name}`;
    }
    const submodule = gitdir.match(/^(.+)[/\\]\.git[/\\]modules[/\\](.+)$/);
    if (submodule) {
      const parentName = basename(submodule[1]);
      const rel = relative(submodule[1], root);
      return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `${parentName}/${rel.split(sep).join("/")}` : name;
    }
  } catch {
    // no .git, or an unreadable one: the folder name is the safe answer
  }
  return name;
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
  appendFileSync(file, `${JSON.stringify(item)}\n`);
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

export function enqueueCompression(store, { project, sessionId, at = Date.now() }) {
  const key = "compress.queue";
  const queue = store.setting(key, []);
  if (!Array.isArray(queue)) return false;
  const existing = sessionId ? queue.find((item) => item.project === project && item.sessionId === sessionId) : null;
  if (existing) {
    // A session-end after a stop must not create a second job, but the job should cover the newer summary.
    existing.at = at;
    store.setSetting(key, queue.slice(-200));
    return false;
  }
  queue.push({ project, sessionId: sessionId ?? null, at });
  store.setSetting(key, queue.slice(-200));
  return true;
}

export function compressionQueue(store) {
  const queue = store.setting("compress.queue", []);
  return Array.isArray(queue) ? queue : [];
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
