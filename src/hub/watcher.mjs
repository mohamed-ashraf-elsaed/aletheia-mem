// Transcript watcher: poll the verified transcript folders and import new turns incrementally.
// Offsets, session id/project and the turn counter live in one SQLite file, so a restart resumes exactly where it
// stopped. Sources are opened read-only. An unknown line is stored as a raw episode, not dropped. The interval is
// at least one second and the batch size caps how many lines one pass may consume; the CLI also sets nice 10.
import { Database } from "bun:sqlite";
import { closeSync, fstatSync, mkdirSync, openSync, readSync } from "node:fs";
import { basename, dirname } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { projectKeyForHook } from "./hooks/shared.mjs";
import { redact } from "./redact.mjs";
import { episodeHash, findTranscripts, parseTranscriptLine, TRANSCRIPT_TOOLS } from "./transcripts.mjs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watch_state (
  path TEXT PRIMARY KEY,
  offset INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  project TEXT,
  cwd TEXT,
  mtime_ms INTEGER,
  updated_at INTEGER NOT NULL
);
`;

const MAX_BYTES_PER_READ = 4 * 1024 * 1024;

export class TranscriptWatcher {
  constructor({ store, home, dbPath, tools = TRANSCRIPT_TOOLS, batchSize = 200, intervalMs = 1000, maxFiles = 50, now = () => Date.now() } = {}) {
    if (!store) throw new RangeError("A watcher needs a store.");
    if (!home) throw new RangeError("A watcher needs a home directory.");
    if (!dbPath) throw new RangeError("A watcher needs a state database path.");
    this.store = store;
    this.home = home;
    this.tools = [...new Set(tools)].filter((tool) => TRANSCRIPT_TOOLS.includes(tool));
    if (!this.tools.length) throw new RangeError(`Pick at least one of: ${TRANSCRIPT_TOOLS.join(", ")}.`);
    this.batchSize = Math.max(1, Number(batchSize) || 200);
    this.intervalMs = Math.max(1000, Number(intervalMs) || 1000);
    this.maxFiles = Math.max(1, Number(maxFiles) || 50);
    this.now = now;
    this.dbPath = dbPath;
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec(SCHEMA);
    this.timer = null;
    this.running = false;
  }

  close() {
    this.stop();
    this.db.close();
  }

  stateFor(path) {
    return this.db.prepare("SELECT * FROM watch_state WHERE path = ?").get(path) ?? null;
  }

  saveState(path, { offset, turns, sessionId, project, cwd, mtimeMs, updatedAt }) {
    this.db.prepare(`INSERT INTO watch_state (path, offset, turns, session_id, project, cwd, mtime_ms, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(path) DO UPDATE SET offset=excluded.offset, turns=excluded.turns, session_id=excluded.session_id,
        project=excluded.project, cwd=excluded.cwd, mtime_ms=excluded.mtime_ms, updated_at=excluded.updated_at`)
      .run(path, Number(offset) || 0, Number(turns) || 0, sessionId ?? null, project ?? null, cwd ?? null, Number(mtimeMs) || 0, Number(updatedAt) || this.now());
  }

  addRaw(tool, { sessionId, project, cwd, lineOffset, rawLine, turn, now }) {
    const body = redact(rawLine).trim();
    if (!body) return false;
    const currentProject = cwd ? projectKeyForHook(cwd) : project ?? "default";
    const sourceRef = `transcript:${tool}:${sessionId}:raw:${lineOffset}`;
    const contentHash = sha256(`transcript-raw\n${tool}\n${sessionId}\n${lineOffset}\n${body.slice(0, 20_000)}`);
    const result = this.store.addEpisode({
      project: currentProject, tool, sessionId, turnIndex: turn, role: "tool", kind: "raw", text: body,
      sourceRef, contentHash, createdAtEpoch: now,
    });
    return !!result?.created;
  }

  /** Read from the stored byte offset to the last complete newline, then consume at most `batchSize` lines. */
  processFile(tool, file, { now = this.now() } = {}) {
    const fd = openSync(file, "r");
    try {
      const stat = fstatSync(fd);
      const state = this.stateFor(file);
      let offset = Number(state?.offset) || 0;
      let turns = Number(state?.turns) || 0;
      let sessionId = state?.session_id ?? basename(file, ".jsonl");
      let project = state?.project ?? null;
      let cwd = state?.cwd ?? null;
      if (stat.size < offset) {
        offset = 0;
        turns = 0;
        sessionId = basename(file, ".jsonl");
        project = null;
        cwd = null;
      }
      const result = { file, lines: 0, added: 0, skipped: 0, malformed: 0, raw: 0, partial: false };
      if (stat.size <= offset) return result;

      const length = Math.min(stat.size - offset, MAX_BYTES_PER_READ);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, offset);
      const lastNewline = buffer.lastIndexOf(0x0a);
      if (lastNewline < 0) {
        result.partial = true;
        return result;
      }
      const complete = buffer.subarray(0, lastNewline + 1);
      let start = 0;
      let consumed = 0;
      for (let index = 0; index < complete.length && result.lines < this.batchSize; index++) {
        if (complete[index] !== 0x0a) continue;
        const rawLine = complete.subarray(start, index).toString("utf8");
        const lineOffset = offset + start;
        start = index + 1;
        consumed = index + 1;
        result.lines++;
        if (!rawLine.trim()) continue;
        let line;
        try {
          line = JSON.parse(rawLine);
        } catch {
          result.malformed++;
          if (this.addRaw(tool, { sessionId, project, cwd, lineOffset, rawLine, turn: turns, now })) result.added++;
          else result.skipped++;
          turns++;
          continue;
        }
        const parsed = parseTranscriptLine(line, tool);
        if (parsed.sessionId) sessionId = parsed.sessionId;
        if (parsed.cwd) cwd = parsed.cwd;
        if (parsed.role && parsed.text) {
          const body = redact(parsed.text).trim();
          if (body.length < 3) {
            result.skipped++;
            continue;
          }
          const currentProject = cwd ? projectKeyForHook(cwd) : project ?? "default";
          const sourceRef = `transcript:${tool}:${sessionId}:${turns}`;
          const added = this.store.addEpisode({
            project: currentProject, tool, sessionId, turnIndex: turns, role: parsed.role, kind: "message", text: body,
            sourceRef, contentHash: episodeHash(currentProject, body), createdAtEpoch: parsed.atEpoch ?? now,
          });
          if (added?.created) result.added++;
          else result.skipped++;
          project = currentProject;
          turns++;
          continue;
        }
        if (!parsed.known) {
          result.raw++;
          if (this.addRaw(tool, { sessionId, project, cwd, lineOffset, rawLine, turn: turns, now })) result.added++;
          else result.skipped++;
          turns++;
        } else {
          result.skipped++;
        }
      }
      if (consumed > 0) {
        this.saveState(file, { offset: offset + consumed, turns, sessionId, project, cwd, mtimeMs: stat.mtimeMs, updatedAt: now });
      }
      return result;
    } finally {
      closeSync(fd);
    }
  }

  /** One polling pass. Reads files newest first, at most `maxFiles`, and at most `batchSize` lines per file. */
  watchOnce({ now = this.now() } = {}) {
    const totals = { tools: this.tools, files: 0, lines: 0, added: 0, skipped: 0, malformed: 0, raw: 0, partial: 0, errors: 0 };
    for (const tool of this.tools) {
      let files;
      try {
        files = findTranscripts(tool, { home: this.home });
      } catch {
        totals.errors++;
        continue;
      }
      for (const { file } of files.slice(0, this.maxFiles)) {
        totals.files++;
        try {
          const one = this.processFile(tool, file, { now });
          totals.lines += one.lines;
          totals.added += one.added;
          totals.skipped += one.skipped;
          totals.malformed += one.malformed;
          totals.raw += one.raw;
          if (one.partial) totals.partial++;
        } catch {
          totals.errors++;
        }
      }
    }
    return totals;
  }

  /** Polling fallback. `intervalMs` is clamped to at least 1000; a running pass is never overlapped. */
  start({ onTick = null } = {}) {
    if (this.timer) return this;
    const tick = () => {
      if (this.running) return;
      this.running = true;
      try {
        onTick?.(this.watchOnce());
      } catch {
        // a watcher tick never takes the process down
      } finally {
        this.running = false;
      }
    };
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref?.();
    tick();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
