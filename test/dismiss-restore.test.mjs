// T-123: dismiss hides a memory, observation or fact from search and context, keeps the row, and restore
// brings it back. The CLI, the REST route and the MCP tool all use the same store write. Nothing is deleted
// until `prune --apply`, which is the only path that purges a dismissed row.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { callTool } from "../src/hub/mcp.mjs";
import { prune } from "../src/hub/retention.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-dismiss-"));
const dbPath = join(temp, "hub.db");
const dataDir = join(temp, "data");
const fx = makeFixture();
let app;
let base;

const cli = async (args) => {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root,
    env: { ...process.env, HOME: temp, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath },
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
};

const send = (path, body, method = "POST") => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(() => {
  const store = new HubStore(dbPath);
  store.add({ project: "shop", kind: "note", type: "decision", title: "Retry policy", narrative: "Payment retries use exponential backoff and jitter", tool: "claude-code" });
  store.add({ project: "shop", kind: "note", type: "gotcha", title: "Webhook key", narrative: "Webhook retries use the event id as the idempotency key", tool: "claude-code" });
  const episode = store.addEpisode({ project: "shop", tool: "claude-code", text: "The checkout service uses Postgres 16", sourceRef: "memory:test" });
  store.addFact({ project: "shop", episodeId: episode.id, subject: "checkout", predicate: "uses", object: "Postgres 16", text: "The checkout service uses Postgres 16", extractorMode: "rules" });
  store.close();
  const cfg = loadConfig({
    port: 0, sourceDb: fx.dbPath, dataDir, hubDb: dbPath,
    overlayDb: join(temp, "overlay.db"), reviewDb: join(temp, "review.db"), ledgerDir: join(temp, "ledger"),
    humanCopyCache: join(temp, "hc.json"), rulesFile: join(temp, "RULES.md"), claudeInstructionsFile: join(temp, "CLAUDE.md"),
    provider: "none", extra: { home: temp },
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
});

afterAll(() => {
  app.stop();
  rmSync(temp, { recursive: true, force: true });
});

describe("T-123: reversible dismiss and restore", () => {
  test("dismiss hides a memory from search and context without deleting the row", async () => {
    const store = new HubStore(dbPath);
    const memory = store.list({ project: "shop" }).items.find((row) => row.title === "Retry policy");

    expect(store.dismiss("memory", memory.id, { actor: "test", reason: "wrong project" })).toMatchObject({ dismissed: true, changed: true });
    expect(store.get(memory.id)).not.toBeNull();
    expect(store.isDismissed("memory", memory.id)).toBe(true);
    expect(store.search({ query: "backoff" })).toEqual([]);
    expect(store.list({ project: "shop" }).items.some((row) => row.id === memory.id)).toBe(false);
    expect(store.list({ project: "shop", includeDismissed: true }).items.some((row) => row.id === memory.id)).toBe(true);
    expect(store.context({ project: "shop" })).not.toContain("Retry policy");

    expect(store.restore("memory", memory.id, { actor: "test" })).toMatchObject({ restored: true });
    expect(store.search({ query: "backoff" }).map((row) => row.id)).toContain(memory.id);
    store.close();
  });

  test("a fact can be dismissed and comes back on restore", async () => {
    const store = new HubStore(dbPath);
    const fact = store.factsCurrent({ project: "shop" })[0];
    expect(fact).toBeTruthy();
    store.dismiss("fact", fact.id, { actor: "test" });
    expect(store.searchFacts({ query: "checkout", project: "shop" })).toEqual([]);
    expect(store.context({ project: "shop" })).not.toContain("Postgres 16");
    store.restore("fact", fact.id, { actor: "test" });
    expect(store.searchFacts({ query: "checkout", project: "shop" }).map((row) => row.id)).toContain(fact.id);
    store.close();
  });

  test("the CLI dismiss, dismissed and restore commands agree with the store", async () => {
    const created = await cli(["save", "The CLI dismissal note", "--project", "shop"]);
    expect(created.exitCode).toBe(0);
    const store = new HubStore(dbPath);
    const row = store.list({ project: "shop" }).items.find((item) => item.narrative.includes("CLI dismissal note"));
    store.close();

    const dismissed = await cli(["dismiss", String(row.id), "--reason", "noise"]);
    expect(dismissed.exitCode).toBe(0);
    expect(dismissed.stdout).toContain(`Dismissed memory #${row.id}`);
    expect((await cli(["dismissed"])).stdout).toContain(`memory:${row.id}`);

    const listed = new HubStore(dbPath);
    expect(listed.search({ query: "CLI dismissal" })).toEqual([]);
    listed.close();

    const restored = await cli(["restore", `memory:${row.id}`]);
    expect(restored.exitCode).toBe(0);
    expect(restored.stdout).toContain("Restored");
    const again = new HubStore(dbPath);
    expect(again.search({ query: "CLI dismissal" }).length).toBe(1);
    again.close();
  });

  test("the REST routes dismiss, list and restore", async () => {
    const created = await (await send("/api/hub/memories", { title: "Route dismissal", text: "a row hidden through the API", project: "shop" })).json();
    const id = created.id;
    expect((await (await send("/api/hub/dismiss", { type: "memory", id, reason: "api test" })).json())).toMatchObject({ dismissed: true });
    expect((await (await fetch(`${base}/api/hub/dismissed`)).json()).items.some((row) => row.item_type === "memory" && row.item_id === id)).toBe(true);
    expect((await (await fetch(`${base}/api/hub/memories?project=shop&q=Route%20dismissal`)).json()).total).toBe(0);
    expect((await (await send("/api/hub/restore", { type: "memory", id })).json())).toMatchObject({ restored: true });
    expect((await (await fetch(`${base}/api/hub/memories?project=shop&q=Route%20dismissal`)).json()).total).toBe(1);
    expect((await send("/api/hub/dismiss", {})).status).toBe(400);
  });

  test("the MCP tool dismisses and restores the same rows", async () => {
    const store = new HubStore(dbPath);
    const memory = store.list({ project: "shop" }).items.find((row) => row.title === "Webhook key");
    const ctx = { store, tool: "test-tool" };
    const hidden = callTool("dismiss_memory", { id: memory.id, reason: "mcp" }, ctx);
    expect(hidden.content[0].text).toContain("Dismissed memory");
    expect(store.search({ query: "idempotency" })).toEqual([]);
    expect(callTool("dismiss_memory", { id: memory.id }, ctx).content[0].text).toContain("already dismissed");
    expect(callTool("restore_memory", { id: memory.id }, ctx).content[0].text).toContain("Restored");
    expect(store.search({ query: "idempotency" }).length).toBe(1);
    expect(callTool("dismiss_memory", {}, ctx).isError).toBe(true);
    store.close();
  });

  test("a dismissal survives a restart and only prune --apply deletes the row", async () => {
    const store = new HubStore(dbPath);
    const memory = store.list({ project: "shop" }).items.find((row) => row.title === "Route dismissal");
    store.dismiss("memory", memory.id, { actor: "test" });
    store.close();

    const reopened = new HubStore(dbPath);
    expect(reopened.isDismissed("memory", memory.id)).toBe(true);
    const report = prune(reopened, { apply: false });
    expect(report.dismissed).toBeGreaterThan(0);
    expect(reopened.get(memory.id)).not.toBeNull();
    const applied = prune(reopened, { apply: true });
    expect(applied.applied.dismissedPurged).toBeGreaterThan(0);
    expect(reopened.get(memory.id)).toBeNull();
    expect(reopened.isDismissed("memory", memory.id)).toBe(false);
    reopened.close();
  });
});
