// Back-fill from existing session transcripts (T-121). Read-only on the source files: this module only opens
// them with readFileSync, never writes, renames or deletes. Text is redacted before it reaches the store, an
// episode keeps its transcript turn as source_ref, and one extraction job is queued per session.
//
// Verified layouts on this machine, 2026-10-26:
//   Claude Code:    ~/.claude/projects/<slug>/<session>.jsonl        (subagents/agent-*.jsonl skipped)
//   Command Code:   ~/.commandcode/projects/<slug>/<session>.jsonl   (*.meta.json, *.checkpoints.jsonl skipped)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { projectKeyForHook } from "./hooks/shared.mjs";
import { redact } from "./redact.mjs";
import { enqueueJob, JOB_TYPE } from "./queue.mjs";

export const TRANSCRIPT_TOOLS = ["claude-code", "command-code"];
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

const ROOT = {
  "claude-code": [".claude", "projects"],
  "command-code": [".commandcode", "projects"],
};

export function transcriptRoot(tool, home) {
  const parts = ROOT[tool];
  if (!parts) throw new RangeError(`Unknown transcript tool "${tool}". Use one of: ${TRANSCRIPT_TOOLS.join(", ")}.`);
  return join(home, ...parts);
}

function walk(dir, out = [], depth = 0) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "subagents") continue; // a sidechain repeats the parent's work as tool noise
      walk(full, out, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl") && !entry.name.endsWith(".checkpoints.jsonl")) {
      out.push(full);
    }
  }
  return out;
}

/** Session files under the tool's project root, newest first. `since` uses the file mtime as a cheap prefilter. */
export function findTranscripts(tool, { home, since = null } = {}) {
  const root = transcriptRoot(tool, home);
  const files = walk(root);
  const filtered = files
    .map((file) => {
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(file).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { file, mtimeMs };
    })
    .filter((row) => !since || row.mtimeMs >= since);
  return filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part && part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
};

const atOf = (line) => {
  const ms = Date.parse(line?.timestamp ?? line?.message?.timestamp ?? "");
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Parse one session file into episodes. Returns malformed line counts instead of throwing: one bad line in a
 * 5,000-line transcript must not lose the rest. Only user and assistant text is imported; tool payloads are noise.
 */
export function parseTranscript(text, tool, { file = "session.jsonl", fallbackAt = Date.now() } = {}) {
  const out = { sessionId: basename(file, ".jsonl"), project: null, cwd: null, episodes: [], malformed: 0 };
  let turn = 0;
  for (const raw of String(text ?? "").split("\n")) {
    if (!raw.trim()) continue;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      out.malformed++;
      continue;
    }
    if (line?.type === "session") {
      out.sessionId = line.id ?? out.sessionId;
      out.cwd = line.cwd ?? out.cwd;
      continue;
    }
    if (tool === "claude-code" && line?.isSidechain) continue;
    const cwd = line?.cwd ?? line?.message?.cwd;
    if (cwd) out.cwd = cwd;
    const role = line?.message?.role ?? (line?.type === "assistant" ? "assistant" : line?.type === "user" ? "user" : null);
    if (!role) continue;
    if (tool === "claude-code" && line.type !== "user" && line.type !== "assistant") continue;
    if (tool === "command-code" && line.type !== "message") continue;
    const body = redact(textOf(line.message?.content ?? line.content)).trim();
    if (body.length < 3) continue;
    out.episodes.push({ role, kind: "message", text: body, createdAtEpoch: atOf(line) ?? fallbackAt, turnIndex: turn++ });
  }
  const first = out.episodes[0]?.createdAtEpoch;
  out.project = out.cwd ? projectKeyForHook(out.cwd) : null;
  out.startedAtEpoch = first ?? fallbackAt;
  return out;
}

function episodeHash(project, text) {
  return sha256(`transcript\n${project}\n${String(text).slice(0, 20_000)}`);
}

function wouldExist(store, hash) {
  return !!store.db.prepare("SELECT 1 FROM episodes WHERE content_hash = ?").get(hash);
}

function queueSession(store, project, sessionId, now) {
  const payload = { project, sessionId, source: "backfill" };
  const result = enqueueJob(store, JOB_TYPE, payload, { now });
  if (!result.created && result.job && result.job.status === "done") {
    store.db.prepare("UPDATE jobs SET status = 'pending', attempts = 0, next_attempt_epoch = 0, last_error = NULL, updated_at_epoch = ? WHERE id = ?").run(now, result.job.id);
    return true;
  }
  return result.created;
}

/**
 * Import every transcript for one tool. Returns counts; `dryRun` parses and counts without a write.
 * `limit` caps episodes per file so a huge transcript cannot stall a run; the rest is left for the next call
 * (source_ref makes a re-run resume where it stopped only for files that fit; a later limit raises the cap).
 */
export function importTranscripts(store, { tool, home, since = null, dryRun = false, limit = 20_000, now = Date.now() } = {}) {
  if (!TRANSCRIPT_TOOLS.includes(tool)) throw new RangeError(`Unknown transcript tool "${tool}". Use one of: ${TRANSCRIPT_TOOLS.join(", ")}.`);
  const files = findTranscripts(tool, { home, since });
  const counts = { tool, files: files.length, added: 0, skipped: 0, malformed: 0, sessions: 0, queued: 0, dryRun };
  const queued = new Set();
  const seenInRun = new Set();
  for (const { file } of files) {
    let text;
    let fallbackAt = now;
    try {
      if (statSync(file).size > MAX_TRANSCRIPT_BYTES) {
        counts.skipped++;
        continue;
      }
      text = readFileSync(file, "utf8");
      fallbackAt = statSync(file).mtimeMs || now;
    } catch {
      counts.malformed++;
      continue;
    }
    const parsed = parseTranscript(text, tool, { file, fallbackAt });
    counts.malformed += parsed.malformed;
    if (!parsed.episodes.length) continue;
    const project = parsed.project ?? basename(dirname(file)) ?? "default";
    let wrote = 0;
    for (const episode of parsed.episodes.slice(0, Math.max(1, Number(limit) || 20_000))) {
      if (since && episode.createdAtEpoch < since) {
        counts.skipped++;
        continue;
      }
      const sourceRef = `transcript:${tool}:${parsed.sessionId}:${episode.turnIndex}`;
      const contentHash = episodeHash(project, episode.text);
      if (dryRun) {
        if (wouldExist(store, contentHash) || seenInRun.has(contentHash)) {
          counts.skipped++;
        } else {
          seenInRun.add(contentHash);
          counts.added++;
          wrote++;
        }
        continue;
      }
      const result = store.addEpisode({ project, tool, sessionId: parsed.sessionId, turnIndex: episode.turnIndex, role: episode.role, kind: episode.kind, text: episode.text, sourceRef, contentHash, createdAtEpoch: episode.createdAtEpoch });
      if (result.created) {
        counts.added++;
        wrote++;
      } else {
        counts.skipped++;
      }
    }
    if (wrote) {
      counts.sessions++;
      const key = `${project}\n${parsed.sessionId}`;
      if (!queued.has(key)) {
        queued.add(key);
        if (!dryRun) {
          if (queueSession(store, project, parsed.sessionId, now)) counts.queued++;
        } else {
          counts.queued++;
        }
      }
    }
  }
  if (!dryRun) store.audit("import", "transcripts.import", { tool, files: counts.files, added: counts.added, skipped: counts.skipped, queued: counts.queued });
  return counts;
}
