import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

let app;
let base;
let cfg;
const fx = makeFixture();

beforeAll(() => {
  cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("data"),
    overlayDb: join(fx.dir, "overlay.db"),
    reviewDb: join(fx.dir, "reviews.db"),
    ledgerDir: fx.makeDir("ledger"),
    humanCopyCache: join(fx.dir, "human-copy.json"),
    rulesFile: join(fx.dir, "MY-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"),
    publicDir: join(import.meta.dir, "..", "public"),
    provider: "none",
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
});
afterAll(() => app.stop());

const get = (path, init) => fetch(`${base}${path}`, init);
const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const snapshot = async () => (await get("/api/work-view")).json();

describe("static", () => {
  test("/ serves the SPA shell with framing blocked", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const html = await res.text();
    expect(html).toContain("ui-work");
    expect(html).not.toContain("work-frame");
  });
  test("assets are served with their types", async () => {
    const html = await (await get("/work-view/work.html")).text();
    const js = /src="(\/work-view\/assets\/[^"]+\.js)"/.exec(html)[1];
    const res = await get(js);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });
  test("path traversal is refused", async () => {
    const res = await get("/work-view/..%2f..%2fpackage.json");
    expect([403, 404]).toContain(res.status);
  });
  test("unknown API routes 404 like the original", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Cannot GET /api/nope");
  });
});

describe("guards", () => {
  test("a spoofed Host header is refused", async () => {
    const socket = await Bun.connect({ hostname: "127.0.0.1", port: app.server.port, socket: { data(s, d) { chunks.push(d.toString()); }, open() {}, close() {}, error() {} } });
    const chunks = [];
    socket.write("GET /api/work-view HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n");
    await Bun.sleep(150);
    socket.end();
    expect(chunks.join("")).toContain("403");
  });
  test("proxy headers are refused", async () => {
    const res = await get("/api/work-view", { headers: { "X-Forwarded-For": "1.2.3.4" } });
    expect(res.status).toBe(403);
  });
  test("a POST without a JSON content type is refused", async () => {
    const res = await fetch(`${base}/api/work-view/rules`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    expect(res.status).toBe(403);
  });
  test("a POST from another origin is refused", async () => {
    const res = await post("/api/work-view/rules", { action: "add", rule: { scopeTier: "everywhere", scopeName: "", when: "", then: "x" } }, { Origin: "http://evil.example" });
    expect(res.status).toBe(403);
  });
  test("a POST from this server's own origin is accepted", async () => {
    const res = await post("/api/work-view/rules", { action: "add", rule: { scopeTier: "everywhere", scopeName: "", when: "", then: "Origin check rule" } }, { Origin: base });
    expect(res.status).toBe(200);
  });
  test("bad bodies are 400 with a reason", async () => {
    const res = await post("/api/work-view/review", { requestId: "x", expectedFingerprint: "nope", checked: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    const bad = await fetch(`${base}/api/work-view/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    expect(bad.status).toBe(400);
  });
});

describe("snapshot", () => {
  test("has the original's top-level keys in order", async () => {
    const snap = await snapshot();
    expect(Object.keys(snap)).toEqual(["version", "generatedAt", "currentProject", "currentProjectScope", "agents", "recentActivity", "goals", "goalHistory", "rules", "ruleScopes", "rulesLearning", "humanRequests", "unlinkedWork", "coverage", "revision", "teamMode", "story", "refresh", "source", "copyRevision", "rulesFile", "setup"]);
  });
  test("every card carries a fingerprint, a review and human copy state", async () => {
    const snap = await snapshot();
    for (const card of snap.humanRequests) {
      expect(card.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(card.review).toEqual({ checked: false, checkedAtEpoch: null, actor: null, available: true });
      expect(card.humanCopy).toEqual({ state: "unavailable" });
    }
  });
  test("the revision changes when something is saved", async () => {
    const before = (await snapshot()).revision;
    await post("/api/work-view/rules", { action: "add", rule: { scopeTier: "everywhere", scopeName: "", when: "", then: "Revision bump" } });
    expect((await snapshot()).revision).not.toBe(before);
  });
});

describe("review", () => {
  test("a request that is not reported complete cannot be checked", async () => {
    const card = (await snapshot()).humanRequests[0];
    const res = await post("/api/work-view/review", { requestId: card.id, expectedFingerprint: card.contentFingerprint, checked: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("not been reported complete");
  });
  test("a stale fingerprint is refused with the latest snapshot", async () => {
    const card = (await snapshot()).humanRequests[0];
    const res = await post("/api/work-view/review", { requestId: card.id, expectedFingerprint: "0".repeat(64), checked: false });
    expect(res.status).toBe(409);
    expect((await res.json()).snapshot.humanRequests.length).toBeGreaterThan(0);
  });
  test("an unknown request is 404", async () => {
    const res = await post("/api/work-view/review", { requestId: "nope", expectedFingerprint: "0".repeat(64), checked: false });
    expect(res.status).toBe(404);
  });
});

describe("rules", () => {
  const rule = (then, extra = {}) => ({ scopeTier: "everywhere", scopeName: "", when: "", then, ...extra });
  test("add -> edit -> turn off -> turn on -> replace -> dismiss, with MY-RULES.md following", async () => {
    let res = await post("/api/work-view/rules", { action: "add", rule: rule("Run the tests first") });
    expect(res.status).toBe(200);
    let snap = await res.json();
    const added = snap.rules.find((r) => r.then === "Run the tests first");
    expect(added).toMatchObject({ setBy: "owner", status: "on", scopeTier: "everywhere" });
    expect(readFileSync(cfg.rulesFile, "utf8")).toContain("- Run the tests first");

    snap = await (await post("/api/work-view/rules", { action: "edit", ruleId: added.ruleId, rule: rule("Run the tests before saying done", { when: "finishing a task" }) })).json();
    expect(readFileSync(cfg.rulesFile, "utf8")).toContain("- When finishing a task: run the tests before saying done");

    snap = await (await post("/api/work-view/rules", { action: "turn-off", ruleId: added.ruleId })).json();
    expect(snap.rules.find((r) => r.ruleId === added.ruleId).status).toBe("off");
    expect(readFileSync(cfg.rulesFile, "utf8")).not.toContain("tests before saying done");
    snap = await (await post("/api/work-view/rules", { action: "turn-on", ruleId: added.ruleId })).json();
    expect(snap.rules.find((r) => r.ruleId === added.ruleId).status).toBe("on");

    snap = await (await post("/api/work-view/rules", { action: "replace", ruleId: added.ruleId, rule: rule("Always run the tests") })).json();
    expect(snap.rules.find((r) => r.ruleId === added.ruleId)).toMatchObject({ status: "replaced" });
    const replacement = snap.rules.find((r) => r.then === "Always run the tests");
    expect(snap.rules.find((r) => r.ruleId === added.ruleId).replacedBy).toBe(replacement.ruleId);

    snap = await (await post("/api/work-view/rules", { action: "dismiss", ruleId: replacement.ruleId })).json();
    expect(snap.rules.find((r) => r.ruleId === replacement.ruleId)).toBeUndefined();
  });
  test("a project rule needs a name; a missing rule is 404; restore-suggestion needs a learned rule", async () => {
    expect((await post("/api/work-view/rules", { action: "add", rule: rule("x", { scopeTier: "project", scopeName: "  " }) })).status).toBe(400);
    expect((await post("/api/work-view/rules", { action: "turn-off", ruleId: "ghost" })).status).toBe(404);
    const snap = await (await post("/api/work-view/rules", { action: "add", rule: rule("A rule I wrote") })).json();
    const own = snap.rules.find((r) => r.then === "A rule I wrote");
    expect((await post("/api/work-view/rules", { action: "restore-suggestion", ruleId: own.ruleId })).status).toBe(409);
  });
  test("a project-scoped rule is grouped under its project in MY-RULES.md", async () => {
    await post("/api/work-view/rules", { action: "add", rule: rule("Use pnpm", { scopeTier: "project", scopeName: "shop" }) });
    expect(readFileSync(cfg.rulesFile, "utf8")).toMatch(/## In shop\n\n- Use pnpm/);
  });
  test("load-in-claude-code appends the @ line once", async () => {
    writeFileSync(cfg.claudeInstructionsFile, "# mine");
    const first = await (await post("/api/work-view/rules/load-in-claude-code", {})).json();
    expect(first.rulesFile.loadedInClaudeCode).toBe(true);
    await post("/api/work-view/rules/load-in-claude-code", {});
    const lines = readFileSync(cfg.claudeInstructionsFile, "utf8").split("\n").filter((l) => l.startsWith("@"));
    expect(lines.length).toBe(1);
    expect(readFileSync(cfg.claudeInstructionsFile, "utf8").startsWith("# mine\n@")).toBe(true);
  });
});

describe("subagents", () => {
  test("mark finished records a stop and flips the agent", async () => {
    const sub = (await snapshot()).agents.find((a) => a.isSubagent);
    expect(sub.canMarkFinished).toBe(true);
    const res = await post("/api/work-view/agents/mark-finished", { agentGroupId: sub.id });
    expect(res.status).toBe(200);
    const after = (await res.json()).agents.find((a) => a.id === sub.id);
    expect(after.presence.status).toBe("finished");
    expect(after.presence.evidence).toBe("owner-marked-finished");
    expect(after.canMarkFinished).toBe(false);
    expect((await post("/api/work-view/agents/mark-finished", { agentGroupId: sub.id })).status).toBe(409);
  });
  test("a top-level session cannot be marked finished", async () => {
    const top = (await snapshot()).agents.find((a) => !a.isSubagent && a.kind === "session");
    expect((await post("/api/work-view/agents/mark-finished", { agentGroupId: top.id })).status).toBe(409);
  });
});

describe("evidence and work-state writes", () => {
  test("evidence returns the recorded row, 404 for unknown, 400 for a bad id", async () => {
    const card = (await snapshot()).humanRequests[0];
    const res = await get(card.original.url);
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBeTruthy();
    expect((await get("/api/work-view/evidence/prompt/999999")).status).toBe(404);
    expect((await get("/api/work-view/evidence/prompt/abc")).status).toBe(400);
    expect((await get("/api/work-view/evidence/bogus/1")).status).toBe(404);
  });
  test("POST /api/work-state/entries saves under the project of cwd and the view reflects it", async () => {
    const res = await post("/api/work-state/entries", { cwd: fx.dir, list: "scratch", fields: { task: "Try it", status: "todo" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^Saved to "scratch" in /);
    expect((await snapshot()).source.connected).toBe(true);
  });
  test("my-rules cannot be written through the generic route; oversize fields are refused", async () => {
    expect((await post("/api/work-state/entries", { cwd: fx.dir, list: "my-rules", fields: { task: "x" } })).status).toBe(403);
    expect((await post("/api/work-state/entries", { cwd: fx.dir, list: "l", fields: { task: "x".repeat(2100) } })).status).toBe(400);
    expect((await post("/api/work-state/entries", { cwd: fx.dir, list: "l", fields: {} })).status).toBe(400);
  });
});

describe("events", () => {
  test("the stream opens with a retry hint and a full snapshot", async () => {
    const res = await get("/api/work-view/events");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body.getReader();
    let text = "";
    const deadline = Date.now() + 5000;
    // Read until the whole data line has arrived: the event name and its data can come in separate chunks.
    while (!/event: work-view\ndata: .*\n/.test(text) && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    await reader.cancel();
    expect(text).toContain("retry: 1000");
    expect(text).toContain("event: work-view");
    const payload = JSON.parse(/event: work-view\ndata: (.*)\n/.exec(text)[1]);
    expect(payload.humanRequests.length).toBeGreaterThan(0);
  });
});

describe("setup", () => {
  test("setup is permanently complete", async () => {
    expect((await (await get("/api/setup/state")).json()).status).toBe("complete");
    expect((await post("/api/setup/choice", { branch: "home", memoryBilling: "existing" })).status).toBe(404);
  });
  void existsSync;
});
