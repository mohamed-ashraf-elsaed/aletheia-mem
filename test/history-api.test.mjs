// T-026: history and as-of over REST and MCP. Current facts are the default, superseded rows are opt-in,
// as_of time-travels back to the fact that was valid then, and an empty subject gets a reason.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { callTool } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

function seed(store) {
  const episode = store.addEpisode({ project: "p", text: "The API backend uses a database", createdAtEpoch: 1000 });
  const older = store.addFact({ project: "p", subject: "API", predicate: "uses", object: "Postgres 15", text: "The API uses Postgres 15", episodeId: episode.id, validFromEpoch: 1000, recordedAtEpoch: 1000 });
  const newer = store.addFact({ project: "p", subject: "API", predicate: "uses", object: "Postgres 16", text: "The API uses Postgres 16", episodeId: episode.id, validFromEpoch: 3000, recordedAtEpoch: 3000 });
  store.closeFact(older.id, { validToEpoch: 3000 });
  return { older: store.getFact(older.id), newer: store.getFact(newer.id) };
}

describe("history and as-of", () => {
  test("current facts exclude superseded rows; history includes them; as-of returns the fact valid then", () => {
    const store = new HubStore(":memory:");
    const { older, newer } = seed(store);

    expect(store.factsCurrent({ project: "p", subject: "API", now: 4000 }).map((fact) => fact.id)).toEqual([newer.id]);
    expect(store.factsHistory({ project: "p", subject: "API" }).map((fact) => fact.id)).toEqual([older.id, newer.id]);
    expect(store.factsAsOf(2000, { project: "p", subject: "API" }).map((fact) => fact.id)).toEqual([older.id]);
    expect(store.factsAsOf(4000, { project: "p", subject: "API" }).map((fact) => fact.id)).toEqual([newer.id]);
    store.close();
  });

  test("the MCP fact_history tool hides superseded rows by default and time-travels with as_of", () => {
    const store = new HubStore(":memory:");
    const { older, newer } = seed(store);
    const ctx = { store, tool: "test", cwd: process.cwd() };

    const current = callTool("fact_history", { subject: "API", project: "p" }, ctx);
    expect(current.content[0].text).toContain(`#${newer.id}`);
    expect(current.content[0].text).not.toContain(`#${older.id}`);

    const history = callTool("fact_history", { subject: "API", project: "p", include_superseded: true }, ctx);
    expect(history.content[0].text).toContain(`#${older.id}`);
    expect(history.content[0].text).toContain(`#${newer.id}`);

    const asOf = callTool("fact_history", { subject: "API", project: "p", as_of: new Date(2000).toISOString() }, ctx);
    expect(asOf.content[0].text).toContain(`#${older.id}`);
    expect(asOf.content[0].text).not.toContain(`#${newer.id}`);

    const asOfMs = callTool("fact_history", { subject: "API", project: "p", as_of: 2000 }, ctx);
    expect(asOfMs.content[0].text).toContain(`#${older.id}`);
    expect(asOfMs.content[0].text).not.toContain(`#${newer.id}`);

    const asOfMsString = callTool("fact_history", { subject: "API", project: "p", as_of: "2000" }, ctx);
    expect(asOfMsString.content[0].text).toContain(`#${older.id}`);
    expect(asOfMsString.content[0].text).not.toContain(`#${newer.id}`);

    const asOfNowMs = callTool("fact_history", { subject: "API", project: "p", as_of: "1700000000000" }, ctx);
    expect(asOfNowMs.content[0].text).toContain(`#${newer.id}`);
    expect(asOfNowMs.content[0].text).not.toContain(`#${older.id}`);

    const missing = callTool("fact_history", { subject: "ghost", project: "p" }, ctx);
    expect(missing.content[0].text).toContain("No facts found");

    const bad = callTool("fact_history", { project: "p" }, ctx);
    expect(bad.isError).toBe(true);
    store.close();
  });

  describe("REST /v1/facts", () => {
    const dir = tempDir("history-api-");
    const dbPath = join(dir, "hub.db");
    let app;
    let base;
    let older;
    let newer;

    beforeAll(() => {
      app = startServer(loadConfig({
        port: 0,
        dataDir: dir,
        hubDb: dbPath,
        sourceDb: join(dir, "source.db"),
        overlayDb: join(dir, "overlay.db"),
        reviewDb: join(dir, "reviews.db"),
        ledgerDir: join(dir, "ledger"),
        humanCopyCache: join(dir, "human-copy.json"),
        rulesFile: join(dir, "MY-RULES.md"),
        claudeInstructionsFile: join(dir, "CLAUDE.md"),
        provider: "none",
        autoRefresh: false,
      }));
      base = `http://127.0.0.1:${app.server.port}`;
      ({ older, newer } = seed(app.hub));
    });

    afterAll(() => {
      app.stop();
      cleanupTempDirs();
    });

    test("current is the default, superseded is opt-in via history", async () => {
      const current = await (await fetch(`${base}/v1/facts?subject=API&project=p`)).json();
      expect(current.total).toBe(1);
      expect(current.items.map((item) => item.id)).toEqual([newer.id]);
      expect(current.reason).toBeNull();

      const history = await (await fetch(`${base}/v1/facts?subject=API&project=p&history=true`)).json();
      expect(history.total).toBe(2);
      expect(history.items.map((item) => item.id)).toEqual([older.id, newer.id]);
    });

    test("as_of returns the fact valid then", async () => {
      const before = await (await fetch(`${base}/v1/facts?subject=API&project=p&as_of=${encodeURIComponent(new Date(2000).toISOString())}`)).json();
      expect(before.items.map((item) => item.id)).toEqual([older.id]);
    });

    test("as_of accepts a plain integer epoch in milliseconds", async () => {
      const ms = await (await fetch(`${base}/v1/facts?subject=API&project=p&as_of=2000`)).json();
      expect(ms.items.map((item) => item.id)).toEqual([older.id]);

      const nowMs = await (await fetch(`${base}/v1/facts?subject=API&project=p&as_of=1700000000000`)).json();
      expect(nowMs.items.map((item) => item.id)).toEqual([newer.id]);
    });

    test("an unknown subject returns an empty list with a reason", async () => {
      const res = await fetch(`${base}/v1/facts?subject=ghost&project=p`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.reason).toMatch(/No active facts/);
    });

    test("a missing subject is a 400", async () => {
      const res = await fetch(`${base}/v1/facts?project=p`);
      expect(res.status).toBe(400);
    });
  });
});
