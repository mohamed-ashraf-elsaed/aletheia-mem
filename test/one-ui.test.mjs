// the one UI contract. A real server on a random port with temp data, the four tab containers and both
// scripts, /hub redirecting to the Memory tab, every /v1 route the UI calls, and DOM-free unit tests of the
// router and view helpers. No browser is launched.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { channelLines, classicViewerAvailable, duplicateView, factView, healthView, parseRoute, reviewView, routeHash, searchReasonText, TABS } from "../public/ui-core.js";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const fx = makeFixture();
let app;
let base;
let factId;
let reviewId;
let suggestionId;

const get = (path, init) => fetch(`${base}${path}`, init);
const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(() => {
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("data"),
    overlayDb: join(fx.dir, "overlay.db"),
    reviewDb: join(fx.dir, "reviews.db"),
    ledgerDir: fx.makeDir("ledger"),
    humanCopyCache: join(fx.dir, "human-copy.json"),
    rulesFile: join(fx.dir, "RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"),
    hubDb: join(fx.dir, "ui.db"),
    provider: "none",
    extra: { home: fx.makeDir("home") },
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
  const episode = app.hub.addEpisode({ project: "shop", tool: "claude-code", text: "The checkout uses Postgres 16", sourceRef: "ui-test:1" });
  factId = app.hub.addFact({ project: "shop", episodeId: episode.id, subject: "checkout", predicate: "uses", object: "Postgres 16", text: "The checkout uses Postgres 16", extractorMode: "provider" }).id;
  reviewId = app.hub.addReview({ itemType: "fact", itemId: factId, reason: "contradiction" });
  suggestionId = Number(app.hub.db.prepare("INSERT INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch) VALUES (?,?,?,?,?,?, 'pending', ?)")
    .run("shop", "Use pnpm, not npm", "editing checkout", 0.8, "prompt", 1, Date.now()).lastInsertRowid);
  app.hub.addReview({ itemType: "rule", itemId: suggestionId, reason: "rule_suggestion" });
});
afterAll(() => app.stop());

describe("the one page", () => {
  test("/ serves one shell with the four tab containers, the Work mount and both scripts", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const id of ["tab-work", "tab-memory", "tab-rules", "tab-tools"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('data-tab="work"');
    expect(html).toContain('data-tab="memory"');
    expect(html).toContain('data-tab="rules"');
    expect(html).toContain('data-tab="tools"');
    expect(html).toContain('id="ui-work"');
    expect(html).not.toContain("work-frame");
    expect(html).not.toContain("/work-view/work.html");
    expect(html).toContain('id="ui-project"');
    expect(html).toContain('id="ui-search"');
    expect(html).toContain('id="ui-health"');
    expect(html).toContain('src="/work-view/one-ui.js"');
    expect(html).toContain('href="/work-view/one-ui.css"');
    const workScript = /src="(\/work-view\/assets\/[^"]+\.js)"/.exec(await (await get("/work-view/work.html")).text())?.[1];
    expect(workScript).toBeTruthy();
    expect((await get(workScript)).status).toBe(200);
    expect((await get("/work-view/one-ui.js")).headers.get("content-type")).toContain("javascript");
    expect((await get("/work-view/ui-core.js")).headers.get("content-type")).toContain("javascript");
    expect((await get("/work-view/one-ui.css")).headers.get("content-type")).toContain("css");
  });

  test("the UI never builds markup from strings", () => {
    const source = readFileSync(join(root, "public", "one-ui.js"), "utf8");
    expect(source).not.toMatch(/\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(source)).not.toThrow();
  });

  test("the small-screen stylesheet rearranges the header, and controls keep a 40 px target", () => {
    const css = readFileSync(join(root, "public", "one-ui.css"), "utf8");
    const theme = readFileSync(join(root, "public", "ui-theme.css"), "utf8");
    const components = readFileSync(join(root, "public", "ui-components.css"), "utf8");
    expect(css).toContain("@media (max-width: 960px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(theme).toContain("--ui-touch: 40px");
    expect(components).toContain("min-height: var(--ui-touch)");
    expect(css).toContain("min-height: 44px");
  });

  test("/hub redirects to the Memory tab and keeps serving its assets", async () => {
    const response = await get("/hub");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain("/#/memory");
    expect(body).toContain("Memory Hub");
    expect((await get("/hub/app.js")).headers.get("content-type")).toContain("javascript");
  });

  test("every /v1 route the UI calls exists and has the shape it reads", async () => {
    const health = await get("/v1/health");
    expect([200, 503]).toContain(health.status);
    const healthBody = await health.json();
    expect(healthBody).toHaveProperty("status");
    expect(healthBody).toHaveProperty("ok");
    expect(healthBody.db).toHaveProperty("ok");
    expect(healthBody.fts).toHaveProperty("ok");
    expect(healthBody).toHaveProperty("vectors");
    expect(typeof healthBody.model).toBe("string");

    const search = await post("/v1/search", { query: "retry", limit: 5 });
    expect(search.status).toBe(200);
    const found = await search.json();
    expect(found).toHaveProperty("results");
    expect(found).toHaveProperty("facts");
    expect(found).toHaveProperty("reason");
    expect(found.channels).toHaveProperty("facts");
    expect(found.channels).toHaveProperty("episodes");
    expect(found.channels).toHaveProperty("fused");
    expect(Array.isArray(found.results)).toBe(true);
    expect(Array.isArray(found.facts)).toBe(true);

    const work = await get("/v1/work");
    expect(work.status).toBe(200);
    const workBody = await work.json();
    expect(workBody).toHaveProperty("sessions");
    expect(workBody).toHaveProperty("recentFacts");
    expect(workBody).toHaveProperty("review");
    expect(workBody).toHaveProperty("queue");
    expect(workBody).toHaveProperty("lastCapture");
    expect(workBody).toHaveProperty("empty");
    const goals = await get("/v1/work/goals");
    expect(goals.status).toBe(200);
    expect(Array.isArray((await goals.json()).goals)).toBe(true);
  });

  test("the hub routes the tabs read answer JSON", async () => {
    for (const path of ["/api/hub/overview", "/api/hub/projects", "/api/hub/memories?limit=5", "/api/hub/facts?limit=5", "/api/hub/review?status=pending", "/api/hub/dismissed", "/api/hub/rules", "/api/hub/tools", "/api/hub/rule-suggestions?status=pending", "/api/hub/audit?limit=5"]) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("json");
    }
    const doctor = await get("/api/hub/doctor");
    expect(doctor.status).toBe(200);
    const data = await doctor.json();
    expect(Array.isArray(data.tools)).toBe(true);
    expect(data.tools.length).toBe(7);
    for (const tool of data.tools) {
      expect(tool).toHaveProperty("installed");
      expect(["full", "mcp+rules", "rules-only"]).toContain(tool.capabilities);
      expect(tool.hooks).toHaveProperty("present");
      expect(tool.hooks).toHaveProperty("expected");
      expect(tool).toHaveProperty("lastCapture");
      expect(tool.spool).toHaveProperty("bytes");
      expect(tool.commands).toHaveProperty("install");
    }
    expect(data.tools.find((tool) => tool.id === "opencode").hooks.expected).toBe(0);
    expect(Array.isArray(data.checks)).toBe(true);
  });
});

describe("the facts route", () => {
  test("the facts route has the shape the Memory tab reads", async () => {
    const current = await (await get("/api/hub/facts?project=shop")).json();
    expect(current.current).toBe(true);
    const item = current.items.find((row) => row.id === factId);
    expect(item).toMatchObject({ text: "The checkout uses Postgres 16", scope: "project", extractorMode: "provider", importanceSource: "confidence", status: "active" });
    expect(item.validAt).toContain("T");
    expect(item.source.episodeId).toBeGreaterThan(0);
    expect(item.source.sourceRef).toBe("ui-test:1");
    const history = await (await get("/api/hub/facts?project=shop&history=1")).json();
    expect(history.current).toBe(false);
  });
});

describe("the review route", () => {
  test("the review queue route reads and resolves an item", async () => {
    const queue = await (await get("/api/hub/review?status=pending&project=shop")).json();
    const item = queue.items.find((row) => row.id === reviewId);
    expect(item).toMatchObject({ type: "fact", reason: "contradiction", status: "pending", text: "The checkout uses Postgres 16" });
    expect(Array.isArray(queue.duplicates)).toBe(true);
    expect(Array.isArray(queue.dismissedDuplicates)).toBe(true);
    const accepted = await (await post(`/api/hub/review/${reviewId}`, { action: "accept" })).json();
    expect(accepted.item.status).toBe("accepted");
    expect((await (await get("/api/hub/review?status=pending&project=shop")).json()).items.some((row) => row.id === reviewId)).toBe(false);
    const reopened = await (await post(`/api/hub/review/${reviewId}`, { action: "reopen" })).json();
    expect(reopened.item.status).toBe("pending");
  });
});

describe("the rule suggestions route", () => {
  test("the rule suggestions route accepts, restores and dismisses", async () => {
    const pending = await (await get("/api/hub/rule-suggestions?status=pending&project=shop")).json();
    expect(pending.items.find((row) => row.id === suggestionId)).toMatchObject({ text: "Use pnpm, not npm", when: "editing checkout" });
    const accepted = await (await post(`/api/hub/rule-suggestions/${suggestionId}`, { action: "accept" })).json();
    expect(accepted.status).toBe("accepted");
    expect(accepted.ruleId).toBeTruthy();
    const rules = await (await get("/api/hub/rules")).json();
    expect(rules.rules.some((rule) => rule.then === "Use pnpm, not npm")).toBe(true);
    expect((await (await post(`/api/hub/rule-suggestions/${suggestionId}`, { action: "restore" })).json()).status).toBe("pending");
    expect((await (await post(`/api/hub/rule-suggestions/${suggestionId}`, { action: "dismiss" })).json()).status).toBe("dismissed");
    const dismissed = await (await get("/api/hub/rule-suggestions?status=dismissed&project=shop")).json();
    expect(dismissed.items.some((row) => row.id === suggestionId)).toBe(true);
  });
});

describe("tab modules", () => {
  test("memory, review, rules and tools load without a DOM and export their renderer", async () => {
    const modules = { work: "renderWork", memory: "renderMemory", rules: "renderRules", tools: "renderTools" };
    for (const [name, exported] of Object.entries(modules)) {
      const module = await import(`../public/tabs/${name}.js`);
      expect(typeof module[exported]).toBe("function");
    }
    const review = await import("../public/tabs/review.js");
    expect(typeof review.reviewPanel).toBe("function");
    expect(typeof (await import("../public/ui-dom.js")).h).toBe("function");
  });
});

describe("DOM-free router and view helpers", () => {
  test("the four routes parse and anything else falls back to Work", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["work", "memory", "rules", "tools"]);
    expect(parseRoute("#/work")).toBe("work");
    expect(parseRoute("#/memory")).toBe("memory");
    expect(parseRoute("#/rules?x=1")).toBe("rules");
    expect(parseRoute("#/tools")).toBe("tools");
    expect(parseRoute("#/work/session/s1?project=shop")).toBe("work");
    expect(parseRoute("#/nope")).toBe("work");
    expect(parseRoute("")).toBe("work");
    expect(parseRoute(null)).toBe("work");
    expect(routeHash("memory")).toBe("#/memory");
    expect(routeHash("nope")).toBe("#/work");
  });

  test("health, facts, channels and review rows are shaped for the DOM", () => {
    expect(healthView("ok")).toMatchObject({ state: "ok", dot: "●" });
    expect(healthView("down").state).toBe("down");
    expect(healthView(undefined).state).toBe("checking");

    const fact = factView({ id: 3, text: "The checkout uses Postgres", importance: 0.42, importanceSource: "observation", scope: "project", extractorMode: "provider", status: "active", validAt: "2026-10-01T00:00:00.000Z", source: { episodeId: 9, sourceRef: "memory:4", episodeText: "raw turn" } });
    expect(fact).toMatchObject({ id: 3, importance: 0.42, scope: "project", extractorMode: "provider", sourceEpisode: 9, sourceRef: "memory:4" });
    expect(fact.importanceLabel).toBe("0.42 (observation)");
    expect(fact.validAt).toContain("2026-10-01");
    expect(factView({ id: 4, text: "x", confidence: 0.7 }).importanceLabel).toBe("0.70 (confidence)");

    expect(channelLines({ facts: { lexical: true, keys: true, vector: false }, episodes: { lexical: true }, fused: "none" })).toEqual(["facts: lexical + keys", "episodes: lexical", "fused: none"]);
    expect(searchReasonText("no_terms")).toContain("no searchable words");
    expect(searchReasonText(null)).toBe("");

    expect(reviewView({ id: 1, type: "fact", reason: "contradiction", text: "A", project: "shop" })).toMatchObject({ reason: "Two facts disagree", title: "A", mergeable: true });
    expect(reviewView({ id: 2, type: "entity", reason: "ambiguous_alias", name: "Sam" })).toMatchObject({ reason: "An alias may belong to two entities", mergeable: false });
    expect(duplicateView({ key: "1:2", a: 1, b: 2, aText: "A", bText: "B", score: 0.876 }).scoreLabel).toBe("0.88");
  });

  test("the classic viewer is offered only when the old database exists", () => {
    expect(classicViewerAvailable({ claudeMem: { exists: true } })).toBe(true);
    expect(classicViewerAvailable({ claudeMem: { exists: false } })).toBe(false);
    expect(classicViewerAvailable({})).toBe(false);
    expect(classicViewerAvailable(null)).toBe(false);
  });
});
