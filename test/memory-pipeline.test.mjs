// End to end: install into a temp HOME, drive a recorded session through the installed hooks, run the extraction
// worker with a fake provider, then prove facts carry sources and time, a later fact supersedes the earlier one,
// history still returns it, and `aletheia search` finds a fact by a word only the extracted key contains.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { runWorker } from "../src/hub/queue.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const fx = makeFixture();
const home = fx.makeDir("home");
const dataDir = fx.makeDir("data");
const proj = fx.makeDir("checkout");
const project = basename(proj);
const dbPath = join(dataDir, "hub.db");
let app;
let config;

const envFor = (extra = {}) => ({ ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath, ...extra });

async function runShell(command, stdin, extra = {}) {
  const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor(extra) });
  if (stdin) proc.stdin.write(stdin);
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

async function runCli(args, extra = {}) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor(extra) });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

const event = (name, extra = {}) => JSON.stringify({ hook_event_name: name, cwd: proj, session_id: extra.session_id ?? "pipeline-session", ...extra });

function installedCommands() {
  const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  return Object.fromEntries(Object.entries(settings.hooks).map(([name, definitions]) => [name, definitions.flatMap((definition) => definition.hooks).find((hook) => hook.command.includes("aletheia-managed"))?.command ?? null]));
}

const episodeIds = (prompt) => (/EPISODE_IDS: \[([0-9, ]+)\]/.exec(prompt)?.[1] ?? "").split(",").map((value) => Number(value.trim())).filter(Number.isInteger);

function fakeAsk(prompt) {
  const ids = episodeIds(prompt);
  const first = ids[0];
  if (!first) return JSON.stringify({ facts: [] });
  if (/linear backoff/i.test(prompt)) {
    return JSON.stringify({ facts: [{
      subject: "checkout retry service", predicate: "uses", object: "linear backoff", text: "The checkout retry service uses linear backoff",
      valid_from: "2026-05-01", valid_to: null, confidence: 0.9, episode_ids: [first],
    }] });
  }
  if (/exponential backoff/i.test(prompt)) {
    return JSON.stringify({ facts: [{
      subject: "checkout retry service", predicate: "uses", object: "fibonacci jitter", text: "The checkout retry service uses fibonacci jitter",
      valid_from: "2026-01-01", valid_to: null, confidence: 0.9, episode_ids: [first],
    }] });
  }
  return JSON.stringify({ facts: [] });
}

describe("memory pipeline", () => {
  beforeAll(() => {
    config = loadConfig({
      port: 0, sourceDb: fx.dbPath, dataDir,
      overlayDb: join(dataDir, "overlay.db"), reviewDb: join(dataDir, "review.db"), ledgerDir: join(dataDir, "ledger"),
      humanCopyCache: join(dataDir, "human-copy.json"), rulesFile: join(dataDir, "RULES.md"), claudeInstructionsFile: join(dataDir, "CLAUDE.md"),
      hubDb: dbPath, provider: "none", extra: { home },
    });
    app = startServer(config);
  });

  afterAll(() => app.stop());

  test("captured events become sourced facts, a contradiction supersedes, history keeps the old fact, and search finds the key", async () => {
    const install = await runCli(["install", "claude-code", "--write"]);
    expect(install.exitCode).toBe(0);
    expect((await runCli(["install", "command-code", "--write"])).exitCode).toBe(0);
    const commands = installedCommands();
    expect(Object.values(commands).every(Boolean)).toBe(true);

    // Session 1: a prompt, a tool step and a stop. The hook path stores raw memories and queues extraction.
    expect((await runShell(commands.SessionStart, event("SessionStart", { source: "startup" }))).exitCode).toBe(0);
    expect((await runShell(commands.UserPromptSubmit, event("UserPromptSubmit", { prompt: "The checkout retry service uses exponential backoff. Keep the retry policy stable." }))).exitCode).toBe(0);
    expect((await runShell(commands.PostToolUse, event("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: "12 passing" }))).exitCode).toBe(0);
    expect((await runShell(commands.Stop, event("Stop", { last_assistant_message: "Recorded the retry policy." }))).exitCode).toBe(0);

    let store = new HubStore(dbPath);
    expect(store.setting("compress.queue", []).some((item) => item.sessionId === "pipeline-session")).toBe(true);
    const firstRun = await runWorker({ store, ask: Object.assign(fakeAsk, { modelFor: () => "fake-small" }), config: { ...config, factBudget: { maxEpisodes: 10, maxChars: 12_000 } }, batchSize: 10 });
    expect(firstRun.failed).toBe(0);
    expect(firstRun.processed).toBe(1);

    const active = store.factsCurrent({ project });
    expect(active).toHaveLength(1);
    const first = active[0];
    expect(first).toMatchObject({ project, subject: "checkout retry service", predicate: "uses", object: "fibonacci jitter", status: "active", extractor_mode: "provider", prompt_version: "facts-v1", model: "fake-small" });
    expect(first.episode_id).toBeGreaterThan(0);
    expect(first.recorded_at_epoch).toBeGreaterThan(0);
    expect(first.valid_from_epoch).toBe(Date.parse("2026-01-01T00:00:00Z"));
    const provenance = store.provenance("fact", first.id);
    expect(provenance.found).toBe(true);
    expect(provenance.episode.text).toContain("exponential backoff");
    expect(store.usageSummary().calls).toBeGreaterThan(0);
    store.close();

    // The extracted key is searchable through the CLI and cites its source.
    const before = await runCli(["search", "fibonacci", "--project", project]);
    expect(before.exitCode).toBe(0);
    expect(before.stdout).toContain("fibonacci jitter");
    expect(before.stdout).toContain("source episode #");

    // Session 2: a newer fact contradicts the first.
    expect((await runShell(commands.UserPromptSubmit, event("UserPromptSubmit", { session_id: "pipeline-session-2", prompt: "The checkout retry service now uses linear backoff." }))).exitCode).toBe(0);
    expect((await runShell(commands.Stop, event("Stop", { session_id: "pipeline-session-2", last_assistant_message: "Switched the retry policy." }))).exitCode).toBe(0);

    store = new HubStore(dbPath);
    const secondRun = await runWorker({ store, ask: Object.assign(fakeAsk, { modelFor: () => "fake-small" }), config: { ...config, factBudget: { maxEpisodes: 10, maxChars: 12_000 } }, batchSize: 10 });
    expect(secondRun.failed).toBe(0);
    expect(secondRun.processed).toBe(1);

    const current = store.factsCurrent({ project });
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ object: "linear backoff", status: "active", supersedes_id: first.id });
    const old = store.getFact(first.id);
    expect(old).toMatchObject({ status: "superseded", valid_to_epoch: Date.parse("2026-05-01T00:00:00Z") });
    const history = store.factsHistory({ project, subject: "checkout retry service" });
    expect(history.map((fact) => fact.object)).toEqual(["fibonacci jitter", "linear backoff"]);
    expect(history[0].valid_to_epoch).toBe(history[1].valid_from_epoch);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(2); // nothing deleted
    store.close();

    // Default search hides the superseded fact; history finds it; the current fact is searchable.
    const hidden = await runCli(["search", "fibonacci", "--project", project]);
    expect(hidden.stdout).toBe("No matches.\n");
    const shown = await runCli(["search", "fibonacci", "--project", project, "--history"]);
    expect(shown.stdout).toContain("fibonacci jitter");
    expect(shown.stdout).toContain("superseded");
    const latest = await runCli(["search", "linear", "--project", project]);
    expect(latest.stdout).toContain("linear backoff");
    expect(latest.stdout).toContain("active");

    // Doctor reports the queue, the last extraction and the mode that ran.
    const doctor = await runCli(["doctor"], { ALETHEIA_PORT: String(app.server.port) });
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toMatch(/ok\s+queue/);
    expect(doctor.stdout).toMatch(/ok\s+extraction/);
    expect(doctor.stdout).toContain("mode provider");
    expect(doctor.stdout).toContain("0 failed");
  }, 60_000);
});
