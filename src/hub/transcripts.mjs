// Back-fill from existing session transcripts (T-121). Read-only on the source files: this module only opens
// them with readFileSync, never writes, renames or deletes. Text is redacted before it reaches the store, an
// episode keeps its transcript turn as source_ref, and one extraction job is queued per session.
//
// Verified layouts on this machine, 2026-10-26:
//   Claude Code:    ~/.claude/projects/<slug>/<session>.jsonl        (subagents/agent-*.jsonl skipped)
//   Command Code:   ~/.commandcode/projects/<slug>/<session>.jsonl   (*.meta.json, *.checkpoints.jsonl skipped)
//   Codex CLI:      ~/.codex/sessions/<year>/<month>/<day>/rollout-<time>-<uuid>.jsonl
//                   (read from two real rollouts; session_meta carries the id and cwd, response_item/message
//                    carries user and assistant text)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { projectKeyForHook } from "./hooks/shared.mjs";
import { redact } from "./redact.mjs";
import { enqueueJob, JOB_TYPE } from "./queue.mjs";

export const TRANSCRIPT_TOOLS = ["claude-code", "command-code", "codex"];
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;

const ROOT = {
  "claude-code": [".claude", "projects"],
  "command-code": [".commandcode", "projects"],
  codex: [".codex", "sessions"],
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
  return filtered.sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file));
}

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && (part.type === "text" || part.type === "input_text" || part.type === "output_text") && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
};

const atOf = (line) => {
  const ms = Date.parse(line?.timestamp ?? line?.message?.timestamp ?? "");
  return Number.isFinite(ms) ? ms : null;
};

const CLAUDE_KNOWN = new Set(["session", "user", "assistant", "summary", "system", "tool_use", "tool_result", "progress", "result", "rate_limit_event", "file-history-snapshot", "queue-operation", "attachment"]);
const COMMAND_KNOWN = new Set(["session", "message", "meta", "checkpoint", "tool", "tool_use", "tool_result", "summary", "system"]);

/**
 * One line of a transcript, independent of storage and offsets. `known: false` means the line is a format this
 * parser does not recognise; the watcher stores it as a raw message instead of dropping it.
 */
export function parseTranscriptLine(line, tool) {
  const out = { sessionId: null, cwd: null, role: null, text: "", known: false, atEpoch: null };
  if (!line || typeof line !== "object") return out;
  out.atEpoch = atOf(line);

  if (tool === "codex") {
    if (line.type === "session_meta") {
      out.known = true;
      out.sessionId = line.payload?.id ?? null;
      out.cwd = line.payload?.cwd ?? null;
      return out;
    }
    if (line.type === "turn_context") {
      out.known = true;
      out.cwd = line.payload?.cwd ?? null;
      return out;
    }
    if (line.type === "event_msg") {
      out.known = true;
      return out;
    }
    if (line.type === "response_item") {
      out.known = true;
      const payload = line.payload ?? {};
      if (payload.type !== "message") return out;
      if (payload.role !== "user" && payload.role !== "assistant") return out;
      out.role = payload.role;
      out.text = textOf(payload.content);
      return out;
    }
    return out;
  }

  if (line.type === "session") {
    out.known = true;
    out.sessionId = line.id ?? null;
    out.cwd = line.cwd ?? null;
    return out;
  }
  if (tool === "claude-code" && line.isSidechain) {
    out.known = true;
    return out;
  }
  const cwd = line.cwd ?? line.message?.cwd;
  if (cwd) out.cwd = cwd;
  const role = line.message?.role ?? (line.type === "assistant" ? "assistant" : line.type === "user" ? "user" : null);
  if (role) {
    out.role = role;
    out.text = textOf(line.message?.content ?? line.content);
    out.known = true;
    return out;
  }
  out.known = tool === "claude-code" ? CLAUDE_KNOWN.has(line.type) : COMMAND_KNOWN.has(line.type);
  return out;
}

/**
 * Parse one session file into episodes. Returns malformed line counts instead of throwing: one bad line in a
 * 5,000-line transcript must not lose the rest. Only user and assistant text is imported; tool payloads are noise.
 */
export function parseTranscript(text, tool, { file = "session.jsonl", fallbackAt = Date.now(), sessionId = null, project = null, cwd = null, startTurn = 0 } = {}) {
  const out = { sessionId: sessionId ?? basename(file, ".jsonl"), project, cwd, episodes: [], malformed: 0 };
  let turn = Number(startTurn) || 0;
  for (const raw of String(text ?? "").split("\n")) {
    if (!raw.trim()) continue;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      out.malformed++;
      continue;
    }
    const parsed = parseTranscriptLine(line, tool);
    if (parsed.sessionId) out.sessionId = parsed.sessionId;
    if (parsed.cwd) out.cwd = parsed.cwd;
    if (!parsed.role || !parsed.text) continue;
    const body = redact(parsed.text).trim();
    if (body.length < 3) continue;
    out.episodes.push({ role: parsed.role, kind: "message", text: body, createdAtEpoch: parsed.atEpoch ?? fallbackAt, turnIndex: turn++ });
  }
  const first = out.episodes[0]?.createdAtEpoch;
  out.project = out.cwd ? projectKeyForHook(out.cwd) : project ?? null;
  out.startedAtEpoch = first ?? fallbackAt;
  return out;
}

export function episodeHash(project, text) {
  return sha256(`transcript\n${project ?? "default"}\n${String(text).slice(0, 20_000)}`);
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
    let inScope = false;
    for (const episode of parsed.episodes.slice(0, Math.max(1, Number(limit) || 20_000))) {
      if (since && episode.createdAtEpoch < since) {
        counts.skipped++;
        continue;
      }
      inScope = true;
      const sourceRef = `transcript:${tool}:${parsed.sessionId}:${episode.turnIndex}`;
      const contentHash = episodeHash(project, episode.text);
      if (dryRun) {
        if (wouldExist(store, contentHash) || seenInRun.has(contentHash)) {
          counts.skipped++;
        } else {
          seenInRun.add(contentHash);
          counts.added++;
        }
        continue;
      }
      const result = store.addEpisode({ project, tool, sessionId: parsed.sessionId, turnIndex: episode.turnIndex, role: episode.role, kind: episode.kind, text: episode.text, sourceRef, contentHash, createdAtEpoch: episode.createdAtEpoch });
      if (result.created) {
        counts.added++;
      } else {
        counts.skipped++;
      }
    }
    if (inScope) {
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
