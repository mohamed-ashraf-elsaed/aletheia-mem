// every list route pages on the server with limit, offset and total, a hard maximum, a stable order and the
// filters the UI offers. Seeded with enough rows to span several pages.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { MAX_LIMIT, pagingOf, whenOf } from "../src/hub/paging.mjs";
import { makeFixture } from "./fixture.mjs";

const fx = makeFixture();
let app;
let base;
const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");

const get = async (path) => {
  const response = await fetch(`${base}${path}`);
  expect(response.status).toBe(200);
  return response.json();
};
const post = async (path, body) => (await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

/** Walk a list page by page and return every id, asserting the pages never overlap. */
async function walk(path, itemsKey, idOf, size = 7) {
  const seen = [];
  let total = null;
  for (let offset = 0; offset < 1000; offset += size) {
    const data = await get(`${path}${path.includes("?") ? "&" : "?"}limit=${size}&offset=${offset}`);
    total ??= data.total;
    expect(data.total).toBe(total);
    expect(data.limit).toBe(size);
    expect(data.offset).toBe(offset);
    const ids = data[itemsKey].map(idOf);
    for (const id of ids) expect(seen).not.toContain(id);
    seen.push(...ids);
    expect(data.hasMore).toBe(offset + ids.length < total);
    if (!data.hasMore) break;
  }
  expect(seen.length).toBe(total);
  return { seen, total };
}

beforeAll(() => {
  const cfg = loadConfig({
    port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), reviewDb: join(fx.dir, "reviews.db"),
    ledgerDir: fx.makeDir("ledger"), humanCopyCache: join(fx.dir, "human-copy.json"), rulesFile: join(fx.dir, "RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"), hubDb: join(fx.dir, "paging.db"), provider: "none", extra: { home: fx.makeDir("home") },
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
  const hub = app.hub;
  const memoryIds = [];
  for (let i = 0; i < 53; i += 1) {
    const project = i % 2 ? "shop" : "blog";
    const memory = hub.add({
      project, kind: i % 5 === 0 ? "note" : "observation", type: i % 3 === 0 ? "decision" : "note", title: `Checkout retry note ${i}`, narrative: `We retry the payment call ${i} times`,
      tool: i % 4 === 0 ? "cursor" : "claude-code", sessionId: `s${i % 12}`, createdAtEpoch: T0 + i * DAY / 4,
    }, { actor: "test" });
    memoryIds.push(memory.id);
  }
  // created_at_epoch is set by the store; spread it deterministically for the date filter tests.
  memoryIds.forEach((id, i) => hub.db.prepare("UPDATE memories SET created_at_epoch = ? WHERE id = ?").run(T0 + i * DAY / 4, id));
  for (let i = 0; i < 31; i += 1) {
    const episode = hub.addEpisode({ project: i % 2 ? "shop" : "blog", tool: "claude-code", text: `Episode ${i} says the cache is warm`, sourceRef: `p:${i}`, sessionId: `e${i % 4}` });
    const fact = hub.addFact({ project: i % 2 ? "shop" : "blog", episodeId: episode.id, subject: `thing${i}`, predicate: "is", object: `warm ${i}`, text: `Thing ${i} is warm`, extractorMode: "rules" });
    hub.db.prepare("UPDATE facts SET recorded_at_epoch = ? WHERE id = ?").run(T0 + i * DAY / 2, fact.id);
    if (i < 14) hub.addReview({ itemType: "fact", itemId: fact.id, reason: "contradiction" });
    if (i >= 25) hub.dismiss("fact", fact.id, { actor: "test" });
  }
  for (let i = 0; i < 9; i += 1) hub.dismiss("memory", memoryIds[i], { actor: "test", reason: "noise" });
  for (let i = 0; i < 17; i += 1) {
    hub.db.prepare("INSERT INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch) VALUES (?,?,?,?,?,?,?,?)")
      .run(i % 2 ? "shop" : "blog", `Rule suggestion ${i}`, "", 0.5 + (i % 5) / 10, "prompt", i, i < 12 ? "pending" : "dismissed", T0 + i * 1000);
  }
  for (let i = 0; i < 40; i += 1) hub.audit("test", i % 2 ? "unit.even" : "unit.odd", { i });
});
afterAll(() => app.stop());

describe("paging rules", () => {
  test("pagingOf caps the limit and clamps bad input", () => {
    expect(pagingOf({ limit: "5000", offset: "-3" })).toEqual({ limit: MAX_LIMIT, offset: 0 });
    expect(pagingOf({})).toEqual({ limit: 25, offset: 0 });
    expect(pagingOf({ limit: "abc", offset: "x" })).toEqual({ limit: 25, offset: 0 });
    expect(pagingOf({ limit: "0" }).limit).toBe(25);
    expect(pagingOf({ limit: "7", offset: "14" })).toEqual({ limit: 7, offset: 14 });
  });
  test("whenOf reads dates, instants and epochs; a bare end date covers the whole day", () => {
    expect(whenOf("2026-09-02")).toBe(Date.parse("2026-09-02T00:00:00Z"));
    expect(whenOf("2026-09-02", { end: true })).toBe(Date.parse("2026-09-03T00:00:00Z"));
    expect(whenOf("2026-09-02T10:00:00Z", { end: true })).toBe(Date.parse("2026-09-02T10:00:00Z"));
    expect(whenOf("1788000000000")).toBe(1788000000000);
    expect(whenOf("nope")).toBeNull();
    expect(whenOf("")).toBeNull();
  });
});

describe("memories", () => {
  test("pages never overlap and add up to the total (dismissed rows excluded)", async () => {
    const { total } = await walk("/api/hub/memories", "items", (m) => m.id);
    expect(total).toBe(53 - 9);
  });
  test("the limit is capped at the hard maximum", async () => {
    const data = await get("/api/hub/memories?limit=5000");
    expect(data.limit).toBe(MAX_LIMIT);
    expect(data.items.length).toBeLessThanOrEqual(MAX_LIMIT);
  });
  test("an offset past the end is empty with the same total", async () => {
    const data = await get("/api/hub/memories?limit=10&offset=9999");
    expect(data.items).toEqual([]);
    expect(data.total).toBe(44);
    expect(data.hasMore).toBe(false);
  });
  test("project, kind, type and tool filters narrow the total", async () => {
    const shop = (await get("/api/hub/memories?project=shop")).total;
    const blog = (await get("/api/hub/memories?project=blog")).total;
    expect(shop + blog).toBe(44);
    expect((await get("/api/hub/memories?kind=note")).total).toBeGreaterThan(0);
    expect((await get("/api/hub/memories?kind=note")).items.every((m) => m.kind === "note")).toBe(true);
    expect((await get("/api/hub/memories?type=decision")).items.every((m) => m.type === "decision")).toBe(true);
    expect((await get("/api/hub/memories?tool=cursor")).items.every((m) => m.tool === "cursor")).toBe(true);
  });
  test("date range filters on the creation time", async () => {
    const all = await get("/api/hub/memories?limit=100&sort=oldest");
    const day2 = await get("/api/hub/memories?limit=100&since=2026-09-03&until=2026-09-04");
    expect(day2.total).toBeGreaterThan(0);
    expect(day2.total).toBeLessThan(all.total);
    for (const m of day2.items) {
      expect(m.created_at_epoch).toBeGreaterThanOrEqual(Date.parse("2026-09-03T00:00:00Z"));
      expect(m.created_at_epoch).toBeLessThan(Date.parse("2026-09-05T00:00:00Z"));
    }
  });
  test("sorting changes the order but keeps paging stable", async () => {
    const oldest = await get("/api/hub/memories?limit=100&sort=oldest");
    const times = oldest.items.map((m) => m.created_at_epoch);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const { seen } = await walk("/api/hub/memories?sort=oldest", "items", (m) => m.id);
    expect(seen).toEqual(oldest.items.map((m) => m.id));
  });
  test("status=dismissed lists only hidden memories", async () => {
    const data = await get("/api/hub/memories?status=dismissed&limit=100");
    expect(data.total).toBe(9);
    expect(data.status).toBe("dismissed");
  });
  test("free text keeps the total honest", async () => {
    const data = await get("/api/hub/memories?q=retry&limit=10");
    expect(data.total).toBe(44);
    expect(data.items.length).toBe(10);
  });
});

describe("facts", () => {
  test("current facts page and exclude dismissed rows", async () => {
    const { total } = await walk("/api/hub/facts", "items", (f) => f.id);
    expect(total).toBe(31 - 6);
  });
  test("status filter: history and dismissed", async () => {
    expect((await get("/api/hub/facts?status=history&limit=100")).total).toBe(25);
    const dismissed = await get("/api/hub/facts?status=dismissed&limit=100");
    expect(dismissed.total).toBe(6);
    expect(dismissed.status).toBe("dismissed");
  });
  test("the old history=1 flag still works", async () => {
    expect((await get("/api/hub/facts?history=1&limit=5")).status).toBe("history");
  });
  test("scope, date range and text filters", async () => {
    expect((await get("/api/hub/facts?scope=global")).total).toBe(0);
    const ranged = await get("/api/hub/facts?since=2026-09-02&until=2026-09-05&limit=100");
    expect(ranged.total).toBeGreaterThan(0);
    expect(ranged.total).toBeLessThan(25);
    const text = await get("/api/hub/facts?q=warm&limit=100");
    expect(text.total).toBe(25);
    expect((await get("/api/hub/facts?q=zzzznothing")).total).toBe(0);
  });
  test("sorting by confidence is stable across pages", async () => {
    const { seen } = await walk("/api/hub/facts?sort=confidence", "items", (f) => f.id, 5);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("review queue", () => {
  test("pending items page with a total", async () => {
    const { total } = await walk("/api/hub/review?status=pending", "items", (r) => r.id, 4);
    expect(total).toBe(14 - 0);
  });
  test("the near-duplicate lists report their own totals", async () => {
    const data = await get("/api/hub/review?status=pending&limit=5");
    expect(typeof data.duplicatesTotal).toBe("number");
    expect(typeof data.dismissedDuplicatesTotal).toBe("number");
    expect(Array.isArray(data.duplicates)).toBe(true);
  });
  test("resolved items are a separate page set", async () => {
    const first = (await get("/api/hub/review?status=pending&limit=1")).items[0];
    await post(`/api/hub/review/${first.id}`, { action: "reject" });
    expect((await get("/api/hub/review?status=rejected")).total).toBe(1);
    expect((await get("/api/hub/review?status=pending")).total).toBe(13);
    await post(`/api/hub/review/${first.id}`, { action: "reopen" });
    expect((await get("/api/hub/review?status=pending")).total).toBe(14);
  });
  test("the project filter narrows the queue", async () => {
    const shop = (await get("/api/hub/review?project=shop")).total;
    const blog = (await get("/api/hub/review?project=blog")).total;
    expect(shop + blog).toBe(14);
  });
});

describe("rule suggestions", () => {
  test("pending and dismissed page separately", async () => {
    expect((await walk("/api/hub/rule-suggestions?status=pending", "items", (r) => r.id, 5)).total).toBe(12);
    expect((await get("/api/hub/rule-suggestions?status=dismissed&limit=100")).total).toBe(5);
  });
  test("project, text and sort filters", async () => {
    expect((await get("/api/hub/rule-suggestions?project=shop&status=pending")).items.every((r) => r.project === "shop")).toBe(true);
    expect((await get("/api/hub/rule-suggestions?q=suggestion%205")).total).toBe(1);
    const byConfidence = (await get("/api/hub/rule-suggestions?sort=confidence&limit=100")).items.map((r) => r.confidence);
    expect(byConfidence).toEqual([...byConfidence].sort((a, b) => b - a));
  });
  test("the limit is capped", async () => {
    expect((await get("/api/hub/rule-suggestions?limit=9999")).limit).toBe(MAX_LIMIT);
  });
});

describe("dismissed items", () => {
  test("pages, labels and type filter", async () => {
    const { total } = await walk("/api/hub/dismissed", "items", (d) => `${d.item_type}:${d.item_id}`, 4);
    expect(total).toBe(15);
    const memories = await get("/api/hub/dismissed?type=memory&limit=100");
    expect(memories.total).toBe(9);
    expect(memories.items[0].label).toContain("Checkout retry note");
    expect(memories.items[0].reason).toBe("noise");
  });
  test("a project filter counts only matching targets", async () => {
    const shop = await get("/api/hub/dismissed?project=shop&limit=100");
    const blog = await get("/api/hub/dismissed?project=blog&limit=100");
    expect(shop.total + blog.total).toBe(15);
    expect(shop.items.every((d) => d.project === "shop")).toBe(true);
  });
});

describe("audit", () => {
  test("pages newest first with a total", async () => {
    const { seen, total } = await walk("/api/hub/audit", "audit", (a) => a.id, 9);
    expect(total).toBeGreaterThanOrEqual(40);
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
  });
  test("actor, action and date filters", async () => {
    expect((await get("/api/hub/audit?actor=test&limit=100")).total).toBeGreaterThanOrEqual(40);
    expect((await get("/api/hub/audit?action=unit.even&limit=100")).total).toBe(20);
    expect((await get("/api/hub/audit?actor=nobody")).total).toBe(0);
    expect((await get("/api/hub/audit?since=2999-01-01")).total).toBe(0);
  });
});

describe("sessions", () => {
  test("/v1/work/sessions pages merged sessions", async () => {
    const { total } = await walk("/v1/work/sessions", "items", (s) => `${s.project}:${s.id}`, 5);
    expect(total).toBeGreaterThanOrEqual(12);
    const one = (await get("/v1/work/sessions?limit=1")).items[0];
    expect(one).toHaveProperty("href");
    expect(one).toHaveProperty("summary");
    expect(typeof one.factCount).toBe("number");
    expect(["in_progress", "finished"]).toContain(one.state);
  });
  test("state, project and date filters", async () => {
    const all = (await get("/v1/work/sessions?limit=100")).total;
    const shop = (await get("/v1/work/sessions?project=shop&limit=100")).total;
    expect(shop).toBeLessThan(all);
    expect((await get("/v1/work/sessions?since=2999-01-01")).total).toBe(0);
    const finished = await get("/v1/work/sessions?state=finished&limit=100");
    expect(finished.items.every((s) => s.state === "finished")).toBe(true);
    expect((await get("/v1/work/sessions?q=s1")).total).toBeGreaterThan(0);
  });
});

describe("goals and devices", () => {
  test("goals carry paging fields", async () => {
    const data = await get("/v1/work/goals?limit=2");
    expect(data.limit).toBe(2);
    expect(typeof data.total).toBe("number");
    expect(data.goals.length).toBeLessThanOrEqual(2);
  });
  test("sync devices carry paging fields", async () => {
    const data = await get("/api/hub/sync/status?limit=2");
    expect(data.limit).toBe(2);
    expect(typeof data.total).toBe("number");
    expect(Array.isArray(data.devices)).toBe(true);
  });
});

describe("search", () => {
  test("the unpaged call keeps its old shape", async () => {
    const data = await post("/v1/search", { query: "retry", limit: 5 });
    expect(data.results.length).toBe(5);
    expect(data.total).toBeUndefined();
  });
  test("with an offset the results page and report a total", async () => {
    const first = await post("/v1/search", { query: "retry", limit: 10, offset: 0 });
    const second = await post("/v1/search", { query: "retry", limit: 10, offset: 10 });
    expect(first.total).toBe(44);
    expect(first.results.length + first.facts.length).toBe(10);
    const ids = new Set([...first.results, ...second.results].map((r) => r.id));
    expect(ids.size).toBe(first.results.length + second.results.length);
    expect(first.hasMore).toBe(true);
    expect(first.totals.memories).toBe(44);
  });
  test("facts come first, then memories, and the limit is capped", async () => {
    const data = await post("/v1/search", { query: "warm retry", limit: 5000, offset: 0 });
    expect(data.limit).toBe(MAX_LIMIT);
    expect(data.totals.facts).toBeGreaterThan(0);
    expect(data.facts.length).toBeGreaterThan(0);
  });
  test("mix alternates facts and memories so a short window shows both", async () => {
    const data = await post("/v1/search", { query: "warm retry", limit: 4, offset: 0, mix: true });
    expect(data.facts.length).toBe(2);
    expect(data.results.length).toBe(2);
  });
  test("an empty result explains itself", async () => {
    const data = await post("/v1/search", { query: "zzzzqqqq", limit: 10, offset: 0 });
    expect(data.total).toBe(0);
    expect(data.reason).toBe("filtered");
  });
  test("a date range filters hits", async () => {
    const all = await post("/v1/search", { query: "retry", limit: 100, offset: 0 });
    const ranged = await post("/v1/search", { query: "retry", limit: 100, offset: 0, since: "2026-09-03", until: "2026-09-04" });
    expect(ranged.total).toBeGreaterThan(0);
    expect(ranged.total).toBeLessThan(all.total);
  });
});
