// T-121: back-fill from real transcript layouts (verified on this machine 2026-10-26). The source files are
// opened read-only; the test hashes them before and after and checks they are byte-identical.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { findTranscripts, importTranscripts, parseTranscript, transcriptRoot } from "../src/hub/transcripts.mjs";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-transcripts-"));
const home = join(temp, "home");
const projectDir = join(temp, "shop");
mkdirSync(projectDir, { recursive: true });

const OLD = "2026-01-10T10:00:00.000Z";
const NEW = "2026-10-20T10:00:00.000Z";

function write(file, lines) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return file;
}

const claudeDir = join(transcriptRoot("claude-code", home), "-tmp-shop");
write(join(claudeDir, "session-a.jsonl"), [
  { type: "user", sessionId: "session-a", cwd: projectDir, timestamp: OLD, message: { role: "user", content: "Add a retry button and use key sk-ant-api03-abcdefghijklmnopqrstuvwx" } },
  { type: "assistant", sessionId: "session-a", cwd: projectDir, timestamp: OLD, message: { role: "assistant", content: [{ type: "text", text: "The retry button uses exponential backoff." }] } },
  { type: "user", sessionId: "session-a", cwd: projectDir, timestamp: OLD, message: { role: "user", content: [{ type: "tool_result", content: "tool noise" }] } },
  { type: "assistant", sessionId: "session-a", cwd: projectDir, timestamp: OLD, message: { role: "assistant", content: [{ type: "text", text: "   " }] } },
  { type: "user", sessionId: "session-a", cwd: projectDir, timestamp: NEW, message: { role: "user", content: "A newer turn that must be importable on its own." } },
]);
write(join(claudeDir, "session-b.jsonl"), [
  { type: "user", sessionId: "session-b", cwd: projectDir, timestamp: NEW, message: { role: "user", content: "Add a retry button and use key sk-ant-api03-abcdefghijklmnopqrstuvwx" } },
]);
// A malformed line is skipped, not fatal.
const malformedFile = join(claudeDir, "session-c.jsonl");
writeFileSync(malformedFile, `${JSON.stringify({ type: "user", sessionId: "session-c", cwd: projectDir, timestamp: NEW, message: { role: "user", content: "one good turn" } })}\nnot json\n`);

const ccDir = join(transcriptRoot("command-code", home), "tmp-shop");
write(join(ccDir, "cc-1.jsonl"), [
  { type: "session", version: 3, id: "cc-1", timestamp: NEW, cwd: projectDir },
  { type: "message", id: "m1", timestamp: NEW, message: { role: "user", content: [{ type: "text", text: "Command Code prompt about the checkout." }] } },
  { type: "message", id: "m2", timestamp: NEW, message: { role: "assistant", content: [{ type: "text", text: "Command Code answer about Postgres." }, { type: "image", source: { data: "xx" } }] } },
]);
write(join(ccDir, "cc-1.checkpoints.jsonl"), [{ type: "checkpoint" }]);
write(join(ccDir, "cc-1.meta.json"), [{ type: "meta" }]);

const files = [join(claudeDir, "session-a.jsonl"), join(claudeDir, "session-b.jsonl"), malformedFile, join(ccDir, "cc-1.jsonl")];
const hashes = new Map(files.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));

afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe("T-121: transcript back-fill", () => {
  test("the verified layout is found and checkpoint/meta files are ignored", () => {
    expect(findTranscripts("claude-code", { home }).map((row) => row.file).sort()).toEqual([join(claudeDir, "session-a.jsonl"), join(claudeDir, "session-b.jsonl"), malformedFile].sort());
    expect(findTranscripts("command-code", { home }).map((row) => row.file)).toEqual([join(ccDir, "cc-1.jsonl")]);
    expect(() => findTranscripts("nope", { home })).toThrow(/Unknown transcript tool/);
  });

  test("a transcript parses into redacted user and assistant turns", () => {
    const parsed = parseTranscript(readFileSync(join(claudeDir, "session-a.jsonl"), "utf8"), "claude-code", { file: join(claudeDir, "session-a.jsonl") });
    expect(parsed.sessionId).toBe("session-a");
    expect(parsed.project).toBe("shop");
    expect(parsed.episodes.map((e) => e.role)).toEqual(["user", "assistant", "user"]);
    expect(parsed.episodes[0].text).not.toContain("sk-ant-api03");
    expect(parsed.episodes[0].text).toContain("[redacted");
    expect(parsed.malformed).toBe(0);
    const cc = parseTranscript(readFileSync(join(ccDir, "cc-1.jsonl"), "utf8"), "command-code", { file: join(ccDir, "cc-1.jsonl") });
    expect(cc.sessionId).toBe("cc-1");
    expect(cc.episodes.map((e) => e.text)).toEqual(["Command Code prompt about the checkout.", "Command Code answer about Postgres."]);
  });

  test("import writes episodes and one job per session, is idempotent, and never changes the source", () => {
    const db = join(temp, "hub.db");
    const store = new HubStore(db);
    const first = importTranscripts(store, { tool: "claude-code", home });
    expect(first).toMatchObject({ files: 3, added: 4, skipped: 1, malformed: 1, queued: 3 });
    expect(first.added).toBe(4); // four distinct turns across three sessions; the repeated prompt is stored once
    const episodes = store.db.prepare("SELECT * FROM episodes ORDER BY id").all();
    expect(episodes.every((row) => row.project === "shop" && row.tool === "claude-code")).toBe(true);
    expect(episodes.map((row) => row.role)).toContain("assistant");
    expect(JSON.stringify(episodes)).not.toContain("sk-ant-api03");
    const jobs = store.db.prepare("SELECT payload FROM jobs").all().map((row) => JSON.parse(row.payload));
    expect(jobs).toEqual(expect.arrayContaining([{ project: "shop", sessionId: "session-a", source: "backfill" }]));
    const second = importTranscripts(store, { tool: "claude-code", home });
    expect(second).toMatchObject({ added: 0, skipped: 5 });
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n).toBe(jobs.length);

    const commandCode = importTranscripts(store, { tool: "command-code", home });
    expect(commandCode).toMatchObject({ files: 1, added: 2, skipped: 0, queued: 1 });
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes WHERE tool = 'command-code'").get().n).toBe(2);
    store.close();

    for (const [file, hash] of hashes) expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(hash);
  });

  test("a dry run counts without writing, and --since filters by the turn timestamp", () => {
    const store = new HubStore(join(temp, "dry.db"));
    const dry = importTranscripts(store, { tool: "claude-code", home, dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, added: 4, queued: 3 });
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n).toBe(0);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n).toBe(0);

    const since = Date.parse("2026-06-01T00:00:00Z");
    const filtered = importTranscripts(store, { tool: "claude-code", home, since });
    expect(filtered.added).toBe(3); // session-a's newer turn, session-b's copy of the old prompt, session-c's turn
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n).toBe(3);
    store.close();
  });

  test("the CLI prints a dry-run summary and refuses an unknown tool", async () => {
    const db = join(temp, "cli.db");
    const env = { ...process.env, HOME: home, ALETHEIA_DATA_DIR: temp, ALETHEIA_HUB_DB: db };
    const run = async (args) => {
      const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { stdout, stderr, exitCode };
    };
    const dry = await run(["import", "transcripts", "claude-code", "--dry-run"]);
    expect(dry.exitCode).toBe(0);
    expect(dry.stdout).toContain("Would import");
    expect(dry.stdout).toContain("would be queued");
    expect((await run(["import", "transcripts", "nope"])).exitCode).toBe(1);
    expect((await run(["import", "transcripts", "claude-code", "--since", "not-a-date"])).exitCode).toBe(1);
  });
});
