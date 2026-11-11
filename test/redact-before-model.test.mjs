import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { configureLedger, runCli } from "../src/ledger/commands.mjs";
import { createRefreshJob } from "../src/refresh/orchestrator.mjs";
import { guardProvider, fakeProvider, openAiProvider, createFallbackProvider } from "../src/refresh/providers.mjs";
import { HumanCopy, buildInput, openAiCompatibleProvider } from "../src/humancopy.mjs";
import { compressRecent } from "../src/hub/compress.mjs";
import { extractWindow } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { NOW, makeFixture } from "./fixture.mjs";

// Seeds built from the patterns in src/hub/redact.mjs. None of them may reach a provider.
const SECRETS = [
  "sk-ant-api03-abcdefghijklmnopqrstuvwx",
  "AKIAABCDEFGHIJKLMNOP",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "xoxb-1234567890-abcdefghij",
  "hunter2hunter2",
];
const PRIVATE = "launch codename BLUE-HERON";
const seeded = `use sk-ant-api03-abcdefghijklmnopqrstuvwx and AKIAABCDEFGHIJKLMNOP with ghp_abcdefghijklmnopqrstuvwxyz0123456789 and xoxb-1234567890-abcdefghij, password=hunter2hunter2 <private>${PRIVATE}</private>`;

function expectClean(prompts) {
  expect(prompts.length).toBeGreaterThan(0);
  const all = prompts.join("\n");
  for (const secret of [...SECRETS, PRIVATE]) expect(all).not.toContain(secret);
  expect(all).toContain("[redacted");
}

const recorder = (answer = "{}") => {
  const prompts = [];
  const ask = async (prompt) => { prompts.push(typeof prompt === "string" ? prompt : JSON.stringify(prompt)); return answer; };
  return { prompts, ask };
};

describe("redact again before every model call", () => {
  test("provider layer: guardProvider and every built provider redact the prompt", async () => {
    const seen = [];
    const guarded = guardProvider(async (prompt) => { seen.push(prompt); return "{}"; });
    await guarded(seeded, { stage: "extract" });
    const fake = fakeProvider({ response: (prompt) => { seen.push(prompt); return "{}"; } });
    await fake(seeded, { stage: "extract" });
    const bodies = [];
    const fetchImpl = async (_url, init) => { bodies.push(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await openAiProvider({ url: "http://127.0.0.1/x", model: "m", fetchImpl })(seeded, { stage: "extract" });
    const chain = createFallbackProvider({ specs: [{ name: "a", kind: "local", url: "http://127.0.0.1/x", models: { extract: "m" } }], fetchImpl });
    await chain(seeded, { stage: "extract" });
    expectClean([...seen, ...bodies]);
    expect(guarded.redacts).toBe(true);
  });

  test("refresh: grouping prompts built from raw claude-mem rows are redacted", async () => {
    const fx = makeFixture();
    const raw = new Database(fx.dbPath);
    raw.prepare("UPDATE user_prompts SET prompt_text = ? || ' ' || prompt_text").run(seeded);
    raw.prepare("UPDATE sdk_sessions SET user_prompt = ? || ' ' || user_prompt").run(seeded);
    raw.close();
    const config = loadConfig({
      port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), ledgerDir: fx.makeDir("ledger"),
      promptsDir: join(import.meta.dir, "..", "prompts"), vendorDir: join(import.meta.dir, "..", "vendor"), provider: "none",
    });
    configureLedger({ overlayDb: config.overlayDb });
    let needs;
    const db = new Database(fx.dbPath, { readonly: true, create: false });
    try { runCli(["refresh-needs"], { dir: config.ledgerDir, database: db, now: NOW, print: (v) => { needs = v; } }); } finally { db.close(); }
    const { prompts, ask } = recorder("not json");
    const job = createRefreshJob({ config, needs: { ...needs, goalsStale: false }, ask, now: () => NOW });
    await job.run().catch(() => {});
    expect(prompts.join("\n")).toContain("retry button");
    expectClean(prompts);
  });

  test("human copy: the structured input is redacted before the provider sees it", async () => {
    const request = { original: { text: seeded, source: "user-prompt", sourceId: 1 }, workstreams: [{ id: "w1", items: [{ status: "doing", title: seeded }], activity: [] }] };
    const prompts = [];
    const copy = new HumanCopy({ provider: async (input) => { prompts.push(JSON.stringify(input)); return { output: null, error: "stop" }; } });
    await copy.run({ id: "r1", fingerprint: "f", input: buildInput(request) });
    const bodies = [];
    const fetchImpl = async (_url, init) => { bodies.push(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }; };
    await openAiCompatibleProvider({ url: "http://127.0.0.1/x", apiKey: "k", model: "m", fetchImpl })(buildInput(request));
    expectClean([...prompts, ...bodies]);
  });

  test("compress: rows stored before redaction existed are redacted again", async () => {
    const store = new HubStore(":memory:");
    const { id } = store.add({ kind: "event", tool: "claude-code", title: "ran a command", narrative: "x", project: "p" });
    store.db.prepare("UPDATE memories SET title = ?, narrative = ? WHERE id = ?").run(`ran ${seeded}`, seeded, id);
    const { prompts, ask } = recorder('{"observations":[]}');
    await compressRecent(store, ask, { project: "p" });
    expectClean(prompts);
  });

  test("facts: episodes are redacted before the provider sees them", async () => {
    const window = [{ episodeId: 1, createdAtEpoch: NOW, tool: "claude-code", kind: "summary", text: seeded }];
    const { prompts, ask } = recorder('{"facts":[]}');
    await extractWindow({ window, project: "p", ask });
    expectClean(prompts);
  });
});
