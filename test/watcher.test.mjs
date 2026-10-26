// T-063: the transcript watcher. It reads the verified Claude Code, Command Code and Codex folders read-only,
// keeps byte offsets and turn counters in a state database, survives a restart without duplicates, stores an
// unknown line as a raw episode, waits for a complete line, and caps a pass by batch size and a 1 s interval.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { HubStore } from "../src/hub/store.mjs";
import { TranscriptWatcher } from "../src/hub/watcher.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-watch-"));
const home = join(temp, "home");
const now = Date.UTC(2026, 9, 26, 12, 0, 0);
let store;

const claudeFile = join(home, ".claude", "projects", "-home-user-shop", "session-1.jsonl");
const commandFile = join(home, ".commandcode", "projects", "-home-user-api", "session-2.jsonl");
const codexFile = join(home, ".codex", "sessions", "2026", "10", "26", "rollout-2026-10-26T10-00-00-uuid.jsonl");

function write(path, lines) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`);
}

function episodes(where = "1=1", ...params) {
  return store.db.prepare(`SELECT * FROM episodes WHERE ${where} ORDER BY id`).all(...params);
}

beforeAll(() => {
  store = new HubStore(join(temp, "hub.db"));
  write(claudeFile, [
    { type: "session", id: "sess-claude", cwd: "/home/user/shop", timestamp: "2026-10-26T10:00:00Z" },
    { type: "user", message: { role: "user", content: "Hello CLAUDE-ONE" }, timestamp: "2026-10-26T10:00:01Z" },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Answer CLAUDE-TWO" }] }, timestamp: "2026-10-26T10:00:02Z" },
  ]);
  write(commandFile, [
    { type: "session", id: "sess-command", cwd: "/home/user/api", timestamp: "2026-10-26T10:00:00Z" },
    { type: "message", message: { role: "user", content: "Hello COMMAND-ONE" }, timestamp: "2026-10-26T10:00:01Z" },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Answer COMMAND-TWO" }] }, timestamp: "2026-10-26T10:00:02Z" },
  ]);
  write(codexFile, [
    { timestamp: "2026-10-26T10:00:00Z", type: "session_meta", payload: { id: "sess-codex", cwd: "/home/user/shop" } },
    { timestamp: "2026-10-26T10:00:01Z", type: "event_msg", payload: { type: "task_started" } },
    { timestamp: "2026-10-26T10:00:02Z", type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "DEVELOPER-NOISE" }] } },
    { timestamp: "2026-10-26T10:00:03Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Hello CODEX-ONE" }] } },
    { timestamp: "2026-10-26T10:00:04Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Answer CODEX-TWO" }] } },
  ]);
});

afterAll(() => {
  store.close();
  rmSync(temp, { recursive: true, force: true });
});

describe("T-063: transcript watcher", () => {
  test("one pass imports user and assistant turns from all three verified layouts", () => {
    const before = {
      claude: readFileSync(claudeFile, "utf8"),
      command: readFileSync(commandFile, "utf8"),
      codex: readFileSync(codexFile, "utf8"),
      mtimes: [statSync(claudeFile).mtimeMs, statSync(commandFile).mtimeMs, statSync(codexFile).mtimeMs],
    };
    const watcher = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), batchSize: 100, intervalMs: 1000, now: () => now });
    try {
      const result = watcher.watchOnce({ now });
      expect(result.files).toBe(3);
      expect(result.added).toBe(6);
      expect(result.raw).toBe(0);
      expect(episodes().map((row) => row.text).sort()).toEqual([
        "Answer CLAUDE-TWO", "Answer CODEX-TWO", "Answer COMMAND-TWO", "Hello CLAUDE-ONE", "Hello CODEX-ONE", "Hello COMMAND-ONE",
      ]);
      expect(episodes("text LIKE ?", "%DEVELOPER-NOISE%")).toHaveLength(0);
      const codexUser = episodes("source_ref LIKE ?", "transcript:codex:%").find((row) => row.text === "Hello CODEX-ONE");
      const claudeUser = episodes("source_ref LIKE ?", "transcript:claude-code:%").find((row) => row.text === "Hello CLAUDE-ONE");
      expect(codexUser.project).toBe(claudeUser.project);
      expect(codexUser.session_id).toBe("sess-codex");
      expect(codexUser.tool).toBe("codex");
    } finally {
      watcher.close();
    }
    // The sources were opened read-only: bytes and mtimes are unchanged.
    expect(readFileSync(claudeFile, "utf8")).toBe(before.claude);
    expect(readFileSync(commandFile, "utf8")).toBe(before.command);
    expect(readFileSync(codexFile, "utf8")).toBe(before.codex);
    expect([statSync(claudeFile).mtimeMs, statSync(commandFile).mtimeMs, statSync(codexFile).mtimeMs]).toEqual(before.mtimes);
  });

  test("a restart resumes at the stored offset and does not duplicate", () => {
    const before = episodes().length;
    const first = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), now: () => now });
    first.close();
    const second = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), now: () => now });
    try {
      const result = second.watchOnce({ now });
      expect(result.added).toBe(0);
      expect(episodes().length).toBe(before);
      appendFileSync(claudeFile, `${JSON.stringify({ type: "user", message: { role: "user", content: "APPENDED-AFTER-RESTART" } })}\n`);
      expect(second.watchOnce({ now }).added).toBe(1);
      expect(episodes().length).toBe(before + 1);
    } finally {
      second.close();
    }
    const third = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), now: () => now });
    try {
      expect(third.watchOnce({ now }).added).toBe(0);
      expect(third.stateFor(claudeFile).offset).toBe(statSync(claudeFile).size);
    } finally {
      third.close();
    }
  });

  test("a line without a newline waits until it is complete", () => {
    const watcher = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), now: () => now });
    try {
      appendFileSync(claudeFile, '{"type":"user","message":{"role":"user","content":"PARTIAL');
      const first = watcher.watchOnce({ now });
      expect(first.partial).toBeGreaterThanOrEqual(1);
      expect(episodes("text LIKE ?", "%PARTIAL%")).toHaveLength(0);
      appendFileSync(claudeFile, ' LINE"}}\n');
      expect(watcher.watchOnce({ now }).added).toBe(1);
      expect(episodes("text LIKE ?", "%PARTIAL LINE%")).toHaveLength(1);
    } finally {
      watcher.close();
    }
  });

  test("an unknown JSON line and a bad line are stored as raw episodes, not dropped", () => {
    const before = episodes().length;
    const watcher = new TranscriptWatcher({ store, home, dbPath: join(temp, "state.db"), now: () => now });
    try {
      appendFileSync(codexFile, `${JSON.stringify({ type: "future_event", payload: { note: "FUTURE-UNKNOWN" } })}\n`);
      const first = watcher.watchOnce({ now });
      expect(first.raw).toBe(1);
      const raw = episodes("kind = 'raw'");
      expect(raw.some((row) => row.text.includes("FUTURE-UNKNOWN"))).toBe(true);
      appendFileSync(codexFile, "not-json-AT-ALL\n");
      const second = watcher.watchOnce({ now });
      expect(second.malformed).toBe(1);
      expect(episodes("kind = 'raw'").some((row) => row.text.includes("not-json-AT-ALL"))).toBe(true);
      expect(episodes().length).toBe(before + 2);
    } finally {
      watcher.close();
    }
  });

  test("batch size caps one pass and the rest is picked up next time", () => {
    const batchFile = join(home, ".claude", "projects", "-home-user-batch", "session-batch.jsonl");
    write(batchFile, Array.from({ length: 5 }, (_, index) => ({ type: "user", message: { role: "user", content: `BATCH-LINE-${index}` } })));
    const watcher = new TranscriptWatcher({ store, home, dbPath: join(temp, "state-batch.db"), batchSize: 2, now: () => now });
    try {
      const counts = [watcher.watchOnce({ now }).added, watcher.watchOnce({ now }).added, watcher.watchOnce({ now }).added, watcher.watchOnce({ now }).added];
      expect(counts).toEqual([2, 2, 1, 0]);
      expect(episodes("text LIKE ?", "BATCH-LINE-%")).toHaveLength(5);
    } finally {
      watcher.close();
    }
  });

  test("the polling interval is at least one second", () => {
    const watcher = new TranscriptWatcher({ store, home, dbPath: join(temp, "state-interval.db"), intervalMs: 50 });
    try {
      expect(watcher.intervalMs).toBe(1000);
      expect(watcher.batchSize).toBe(200);
    } finally {
      watcher.close();
    }
  });

  test("the source folders gain no files", () => {
    const count = (dir) => readdirSync(dir, { recursive: true }).filter((name) => String(name).includes(".jsonl")).length;
    expect(count(join(home, ".claude", "projects"))).toBe(2);
    expect(count(join(home, ".commandcode", "projects"))).toBe(1);
    expect(count(join(home, ".codex", "sessions"))).toBe(1);
  });
});
