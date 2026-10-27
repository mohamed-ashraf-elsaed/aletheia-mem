// T-008: date range (since/until), order (relevance|date_desc|date_asc) and offset pagination on search, for the
// MCP `search` tool and the paged `POST /v1/search` route. The old non-paged shape is untouched and still tested by
// the existing search suites.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { callTool } from "../src/hub/mcp.mjs";
import { searchPage } from "../src/hub/lists.mjs";
import { startServer } from "../src/server.mjs";
import { tempDir } from "./temp-dirs.mjs";

const BASE = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

let hub;
let ids;
let factId;

beforeAll(() => {
  hub = new HubStore(join(tempDir("search-filters-"), "hub.db"));
  ids = [];
  for (let i = 1; i <= 4; i++) {
    ids.push(hub.add({ project: "p", kind: "note", title: `needle ${i}`, narrative: "needle", createdAtEpoch: BASE + i * DAY }).id);
  }
  const episode = hub.addEpisode({ project: "p", tool: "t", text: "needle episode", sourceRef: "sr:1", createdAtEpoch: BASE + 2.5 * DAY });
  factId = hub.addFact({ project: "p", episodeId: episode.id, subject: "x", predicate: "has", object: "y", text: "needle fact", recordedAtEpoch: BASE + 2.5 * DAY }).id;
});

afterAll(() => hub.close());

const page = (extra = {}) => searchPage(hub, { query: "needle", project: "p", limit: 50, offset: 0, ...extra });
const idsOf = (rows) => rows.map((row) => row.id);

describe("searchPage date range and ordering", () => {
  test("default relevance keeps the old shape: facts first, then memories, with totals", () => {
    const out = page();
    expect(out.total).toBe(5);
    expect(out.totals).toEqual({ facts: 1, memories: 4 });
    expect(out.facts.map((fact) => fact.id)).toEqual([factId]);
    expect(idsOf(out.results).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
  });

  test("date_asc orders every memory hit oldest first", () => {
    expect(idsOf(page({ order: "date_asc" }).results)).toEqual([ids[0], ids[1], ids[2], ids[3]]);
  });

  test("date_desc orders every memory hit newest first", () => {
    expect(idsOf(page({ order: "date_desc" }).results)).toEqual([ids[3], ids[2], ids[1], ids[0]]);
  });

  test("since and until are inclusive epoch bounds", () => {
    const out = page({ since: BASE + 2 * DAY, until: BASE + 4 * DAY - 1, order: "date_asc" });
    expect(idsOf(out.results)).toEqual([ids[1], ids[2]]);
    expect(out.facts.map((fact) => fact.id)).toEqual([factId]);
    expect(out.total).toBe(3);
  });

  test("a date range that excludes everything answers an empty window", () => {
    const out = page({ since: BASE + 10 * DAY, until: BASE + 11 * DAY });
    expect(out.total).toBe(0);
    expect(out.facts).toEqual([]);
    expect(out.results).toEqual([]);
  });

  test("offset pagination neither repeats nor skips a memory row", () => {
    const order = "date_asc";
    const limit = 2;
    const total = page({ order, limit }).total;
    const collected = [];
    for (let offset = 0; offset < total; offset += limit) collected.push(...page({ order, limit, offset }).results);
    expect(idsOf(collected)).toEqual([ids[0], ids[1], ids[2], ids[3]]);
  });
});

describe("MCP search accepts the same parameters", () => {
  const run = (args) => callTool("search", { query: "needle", project: "p", ...args }, { store: hub, tool: "test", projects: null }).content[0].text;

  test("order date_desc and offset page the index", () => {
    const out = run({ order: "date_desc", offset: 1, limit: 2 });
    expect(out).toContain("needle 3");
    expect(out).toContain("needle fact");
    expect(out).not.toContain("needle 4");
    expect(out).not.toContain("needle 2");
  });

  test("since and until filter the index", () => {
    const out = run({ since: BASE + 2 * DAY, until: BASE + 4 * DAY - 1, order: "date_asc" });
    expect(out).toContain("needle 2");
    expect(out).toContain("needle 3");
    expect(out).toContain("needle fact");
    expect(out).not.toContain("needle 1");
    expect(out).not.toContain("needle 4");
  });
});

describe("POST /v1/search paged route", () => {
  const dir = tempDir("search-filters-http-");
  const dbPath = join(dir, "hub.db");
  let server;
  let base;

  beforeAll(() => {
    const seed = new HubStore(dbPath);
    for (let i = 1; i <= 4; i++) seed.add({ project: "p", kind: "note", title: `needle ${i}`, narrative: "needle", createdAtEpoch: BASE + i * DAY });
    seed.close();
    server = startServer(loadConfig({ port: 0, dataDir: dir, hubDb: dbPath, sourceDb: join(dir, "no-source.db"), publicDir: join(import.meta.dir, "..", "public"), provider: "none", autoRefresh: false }));
    base = `http://127.0.0.1:${server.server.port}`;
  });

  afterAll(() => server.stop());

  test("returns order, total and the requested page", async () => {
    const res = await fetch(`${base}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "needle", project: "p", order: "date_desc", limit: 2, offset: 1, paged: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order).toBe("date_desc");
    expect(body.total).toBe(4);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
    expect(body.results).toHaveLength(2);
    expect(body.results.map((row) => row.title)).toEqual(["needle 3", "needle 2"]);
  });
});
