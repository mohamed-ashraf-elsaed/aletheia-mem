// T-172: rule decide flow — approve / edit-then-approve / reject, decided counts, on/off toggle, replacement
// history, and the last learning run record.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { listSuggestions, suggestRules } from "../src/hub/rule-suggest.mjs";
import { decideSuggestion, decidedCounts, learningRun, recordLearningRun, replaceRule, toggleRule } from "../src/hub/rules-decide.mjs";
import { makeFixture } from "./fixture.mjs";

const fx = makeFixture();
let seeded;

function seedSuggestions(store) {
  store.add({ project: "shop", kind: "prompt", type: "note", title: "Use pnpm, not npm.", narrative: "Use pnpm, not npm.", sessionId: "s1", tool: "claude-code" });
  store.add({ project: "shop", kind: "prompt", type: "note", title: "Always run the tests.", narrative: "Always run the tests.", sessionId: "s2", tool: "claude-code" });
  suggestRules(store, { project: "shop" });
}

beforeAll(() => {
  const dbPath = join(fx.dir, "rules-decide.db");
  const store = new HubStore(dbPath);
  seedSuggestions(store);
  store.close();
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("rules-decide-data"),
    overlayDb: join(fx.dir, "rules-decide-overlay.db"),
    reviewDb: join(fx.dir, "rules-decide-review.db"),
    ledgerDir: fx.makeDir("rules-decide-ledger"),
    humanCopyCache: join(fx.dir, "rules-decide-human.json"),
    rulesFile: join(fx.dir, "RULES-DECIDE.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE-DECIDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("rules-decide-home") },
  });
  seeded = { app: startServer(cfg) };
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => seeded.app.stop());

describe("T-172: rule decide flow", () => {
  test("approve creates a rule and marks the suggestion accepted", () => {
    const store = new HubStore(":memory:");
    try {
      seedSuggestions(store);
      const pnpm = listSuggestions(store, { project: "shop" }).find((row) => row.text === "Use pnpm, not npm");
      const result = decideSuggestion(store, pnpm.id, { action: "approve" });
      expect(result.ruleId).toBeTruthy();
      expect(result.status).toBe("accepted");
      expect(store.rules.list().some((rule) => rule.then === "Use pnpm, not npm")).toBe(true);
      expect(decidedCounts(store)).toMatchObject({ total: 2, decided: 1, pending: 1 });
    } finally {
      store.close();
    }
  });

  test("edit-then-approve uses the edited text; reject dismisses", () => {
    const store = new HubStore(":memory:");
    try {
      seedSuggestions(store);
      const pnpm = listSuggestions(store, { project: "shop" }).find((row) => row.text === "Use pnpm, not npm");
      const edited = decideSuggestion(store, pnpm.id, { action: "edit", text: "Use pnpm for everything" });
      expect(edited.text).toBe("Use pnpm for everything");
      expect(store.rules.list().some((rule) => rule.then === "Use pnpm for everything")).toBe(true);

      const tests = listSuggestions(store, { project: "shop" }).find((row) => row.text === "Always run the tests");
      const rejected = decideSuggestion(store, tests.id, { action: "reject" });
      expect(rejected.status).toBe("dismissed");
      expect(decidedCounts(store)).toMatchObject({ total: 2, decided: 2, pending: 0 });
    } finally {
      store.close();
    }
  });

  test("toggle turns a rule off and back on without deleting it", () => {
    const store = new HubStore(":memory:");
    try {
      const rule = store.rules.add({ then: "Never force push" });
      const off = toggleRule(store, rule.id, { enabled: false });
      expect(off.enabled).toBe(false);
      expect(store.rules.get(rule.id).enabled).toBe(false);
      const on = toggleRule(store, rule.id, { enabled: true });
      expect(on.enabled).toBe(true);
      expect(store.rules.list()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("replace records replaced by and replaced at on the old rule", () => {
    const store = new HubStore(":memory:");
    try {
      const old = store.rules.add({ then: "Use npm" });
      const result = replaceRule(store, old.id, { then: "Use pnpm", now: Date.UTC(2026, 9, 26, 12, 0, 0) });
      expect(result.replacedBy).toBeTruthy();
      const replaced = store.rules.get(old.id);
      expect(replaced.replacedBy).toBe(result.replacedBy);
      expect(replaced.replacedAtEpoch).toBeGreaterThan(0);
      expect(store.rules.get(result.replacedBy).then).toBe("Use pnpm");
    } finally {
      store.close();
    }
  });

  test("the learning run record survives and is read back", () => {
    const store = new HubStore(":memory:");
    try {
      expect(learningRun(store)).toBeNull();
      const run = recordLearningRun(store, { found: 3, proposed: 1, errors: 0, now: Date.UTC(2026, 9, 26, 12, 0, 0) });
      expect(learningRun(store)).toEqual(run);
      expect(run).toMatchObject({ found: 3, proposed: 1, errors: 0 });
    } finally {
      store.close();
    }
  });

  test("the decide routes answer", async () => {
    const post = (path, body) => fetch(`${seeded.base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const get = (path) => fetch(`${seeded.base}${path}`);

    const listed = await (await get("/api/hub/rule-suggestions?project=shop")).json();
    expect(listed.total).toBe(2);
    const pnpm = listed.items.find((row) => row.text === "Use pnpm, not npm");

    const approved = await post(`/api/hub/rule-suggestions/${pnpm.id}`, { action: "approve" });
    expect(approved.status).toBe(200);
    expect((await approved.json()).ruleId).toBeTruthy();

    const rules = await (await get("/api/hub/rules")).json();
    const rule = rules.rules.find((r) => r.then === "Use pnpm, not npm");
    const toggled = await post(`/api/hub/rules/${rule.id}/toggle`, { enabled: false });
    expect(toggled.status).toBe(200);
    expect((await toggled.json()).rule.enabled).toBe(false);

    const learned = await post("/api/hub/rules/learning-run", {});
    expect(learned.status).toBe(200);
    expect((await learned.json()).learningRun).toHaveProperty("at");

    const replaced = await post(`/api/hub/rules/${rule.id}/replace`, { then: "Use pnpm always" });
    expect(replaced.status).toBe(200);
    expect((await replaced.json()).replacedBy).toBeTruthy();
  });
});
