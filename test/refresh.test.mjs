import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { configureLedger, runCli } from "../src/ledger/commands.mjs";
import { readLedger } from "../src/ledger/read.mjs";
import { AutoRefresh } from "../src/refresh/auto-refresh.mjs";
import { createRefreshJob, extractJson, validateGroupingDecisions } from "../src/refresh/orchestrator.mjs";
import { SourceReader } from "../src/source.mjs";
import { OverlayStore } from "../src/store/overlay.mjs";
import { Database } from "bun:sqlite";
import { makeFixture } from "./fixture.mjs";

function setup() {
  const fx = makeFixture();
  const config = loadConfig({
    port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), ledgerDir: fx.makeDir("ledger"),
    promptsDir: join(import.meta.dir, "..", "prompts"), vendorDir: join(import.meta.dir, "..", "vendor"), provider: "none",
  });
  configureLedger({ overlayDb: config.overlayDb });
  return { fx, config };
}
const openDb = (fx) => new Database(fx.dbPath, { readonly: true, create: false });
const cli = (config, fx, argv) => {
  let out;
  const db = openDb(fx);
  try { runCli(argv, { dir: config.ledgerDir, database: db, print: (v) => { out = v; } }); } finally { db.close(); }
  return out;
};
const lastJsonBlock = (prompt) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(prompt)[1]);
const inlineFile = (prompt) => JSON.parse(prompt.slice(prompt.lastIndexOf("---") + 3).replace(/^[^\n]*\n/, "").trim().replace(/^[^\[{]*/, ""));

/** A deterministic stand-in for the model. Answers each stage from the structured input in the prompt. */
function fakeModel(log = []) {
  return async (prompt, { stage }) => {
    log.push(stage);
    if (stage === "grouping") {
      const input = lastJsonBlock(prompt);
      const keys = input.conversations.map((c) => c.conversationKey);
      const [first, ...rest] = input.conversations;
      const continuing = rest.find((c) => /^continue/i.test(c.openingAsk));
      const groups = [{ title: `Request: ${first.openingAsk.slice(0, 40)}`, conversations: [first.conversationKey], links: [] }];
      if (continuing) {
        groups[0].conversations.push(continuing.conversationKey);
        groups[0].links.push({ kind: "agent-judgment", conversations: [first.conversationKey, continuing.conversationKey], evidence: 'Second ask says "continue the retry button work"' });
      }
      for (const c of rest) if (c !== continuing) groups.push({ title: `Request: ${c.openingAsk.slice(0, 40)}`, conversations: [c.conversationKey], links: [] });
      void keys;
      return JSON.stringify({ groups, ignored: [] });
    }
    if (stage === "review") {
      const shows = inlineFile(prompt);
      return JSON.stringify({
        reviews: shows.map((s) => ({
          groupId: s.groupId, state: "in-progress", percent: 60, startedAt: new Date().toISOString(), shippedAt: null, lastActivityAt: new Date().toISOString(),
          summary: `Working on ${s.title}`, narrative: "", milestones: [], preferences: [{ kind: "directive", preference: "Run the tests first", quote: "run the tests first", at: new Date().toISOString() }],
          evidence: [], reviewBasis: s.reviewBasis,
        })),
      });
    }
    if (stage === "alignment") {
      const input = lastJsonBlock(prompt);
      const goal = input.goals.goals[0];
      const [shop, ...others] = input.groups;
      return JSON.stringify({ links: [{ groupId: shop.groupId, goal: goal.goal, evidence: `${shop.title} advances ${goal.title}` }], unaligned: others.map((g) => g.groupId) });
    }
    if (stage === "story") {
      return JSON.stringify({ narrative: "Shipping velocity is steady.\n\n## Chapter\nThings happened.", preferences: [{ preference: "Run the tests first", kind: "directive", supportCount: 2, quotes: [{ quote: "run the tests first", at: "2026-10-25T10:00:00.000Z" }] }] });
    }
    throw new Error(`unexpected stage ${stage}`);
  };
}

describe("ledger commands", () => {
  test("grouping-input returns one project root at a time with the opening asks", () => {
    const { fx, config } = setup();
    const input = cli(config, fx, ["grouping-input", "--days", "14"]);
    expect(input.root).toBeTruthy();
    expect(input.conversations.length).toBeGreaterThan(0);
    expect(new Set(input.conversations.map((c) => c.project.split("/")[0])).size).toBe(1);
    expect(input.conversations[0].openingAsk).toBeTruthy();
  });
  test("refresh-needs reports ungrouped conversations before any grouping", () => {
    const { fx, config } = setup();
    expect(cli(config, fx, ["refresh-needs"])).toMatchObject({ ungrouped: 3, due: 0, needed: true });
  });
  test("apply refuses to join conversations without a link or across projects", () => {
    const { fx, config } = setup();
    const all = cli(config, fx, ["candidates"]).candidates.map((c) => c.conversationKey);
    const file = join(fx.dir, "bad.json");
    Bun.write(file, JSON.stringify({ groups: [{ title: "x", conversations: all.slice(0, 2) }] }));
    expect(() => cli(config, fx, ["apply", file])).toThrow(/without a recorded link/);
  });
  test("record-progress refuses a shipped request without 100% and a ship date", () => {
    const { fx, config } = setup();
    const all = cli(config, fx, ["candidates"]).candidates;
    const one = all[0].conversationKey;
    const file = join(fx.dir, "g.json");
    Bun.write(file, JSON.stringify({ groups: [{ title: "Solo", conversations: [one] }] }));
    cli(config, fx, ["apply", file]);
    const groupId = Object.keys(readLedger(config.ledgerDir).groups.groups)[0];
    const show = cli(config, fx, ["show", groupId]);
    const bad = join(fx.dir, "p.json");
    Bun.write(bad, JSON.stringify({ groupId, state: "shipped", percent: 90, summary: "s", reviewBasis: show.reviewBasis }));
    expect(() => cli(config, fx, ["record-progress", bad])).toThrow(/shipped request needs percent 100/);
  });
});

describe("grouping validation", () => {
  const input = { conversations: [{ conversationKey: "a" }, { conversationKey: "b" }], openRequests: [{ anchor: "anchor" }] };
  test("every conversation must be decided", () => {
    expect(() => validateGroupingDecisions({ groups: [{ conversations: ["a"] }] }, input)).toThrow(/missing b/);
  });
  test("a conversation that was not asked about is refused, except an open request's anchor first", () => {
    expect(() => validateGroupingDecisions({ groups: [{ conversations: ["a", "zzz"] }], ignored: [{ conversation: "b" }] }, input)).toThrow(/not asked about/);
    expect(validateGroupingDecisions({ groups: [{ conversations: ["anchor", "a"] }], ignored: [{ conversation: "b" }] }, input)).toBeTruthy();
  });
  test("extractJson takes the outermost object", () => {
    expect(extractJson('Sure! {"a":{"b":1}} thanks')).toEqual({ a: { b: 1 } });
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("the full refresh with a fake model", () => {
  test("groups, reviews, aligns and writes the story; the view then shows all of it", async () => {
    const { fx, config } = setup();
    const stages = [];
    const needs = cli(config, fx, ["refresh-needs"]);
    const job = createRefreshJob({ config, needs: { ...needs, goalsStale: false }, ask: fakeModel(stages) });
    const result = await job.run();
    expect(result).toMatch(/new conversations grouped/);
    expect(result).toMatch(/requests reviewed/);
    expect(result).toMatch(/linked to goals/);
    expect(result).toMatch(/story written/);
    expect(stages).toContain("grouping");
    expect(stages).toContain("story");
    expect(job.steps.map((s) => s.step)).toEqual(expect.arrayContaining(["grouping", "review", "alignment", "story"]));

    const ledger = readLedger(config.ledgerDir);
    expect(Object.keys(ledger.groups.groups).length).toBe(2);
    expect(Object.keys(ledger.groups.conversations).length).toBe(3);
    expect(Object.keys(ledger.progress).length).toBe(2);
    expect(ledger.story.preferences.length).toBe(1);
    expect(existsSync(join(config.ledgerDir, "alignment.json"))).toBe(true);
    expect(readdirSync(join(config.ledgerDir, "progress")).every((f) => /^g_[0-9a-f]{12}\.json$/.test(f))).toBe(true);
    expect(existsSync(join(config.ledgerDir, "agent-runs"))).toBe(true);
    expect(readdirSync(join(config.ledgerDir, "agent-runs"))).toEqual([]); // scratch removed

    const view = new SourceReader({ databasePath: fx.dbPath, ledgerDir: config.ledgerDir, overlay: new OverlayStore(":memory:") }).read();
    const cards = view.agentView.humanRequests;
    const merged = cards.find((c) => c.conversationKeys.length === 2);
    expect(merged).toBeTruthy();
    expect(merged.groupId).toMatch(/^g_/);
    expect(merged.titleSource).toBe("request-group");
    expect(merged.progress.percent).toBe(60);
    expect(merged.goals.map((g) => g.title)).toEqual(["Reliable checkout"]);
    expect(cards.find((c) => c.conversationKeys.length === 1).goals).toEqual([]);
    expect(view.agentView.rules.find((r) => r.then === "Run the tests first")).toMatchObject({ setBy: "learned", status: "suggested", timesSeen: 2 });
    expect(view.agentView.story.groups).toBe(2);
    const second = await job.run().catch((e) => e);
    void second;
  });

  test("a refused answer is retried once with the refusal quoted; a second refusal fails and keeps the raw answer", async () => {
    const { fx, config } = setup();
    const needs = { ...cli(config, fx, ["refresh-needs"]), goalsStale: false };
    const prompts = [];
    const stubborn = async (prompt, { stage }) => { prompts.push(prompt); return stage === "grouping" ? JSON.stringify({ groups: [], ignored: [] }) : "{}"; };
    const job = createRefreshJob({ config, needs, ask: stubborn });
    await expect(job.run()).rejects.toThrow(/grouping \(raw answer: .*\): Decide every conversation/);
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain("Your previous answer was refused: Decide every conversation");
    expect(readdirSync(join(config.ledgerDir, "failed-answers")).length).toBe(1);
  });
});

describe("auto refresh scheduling", () => {
  test("runs when something is due, records the outcome, and goes idle when nothing is", async () => {
    const { fx, config } = setup();
    const logs = [];
    const auto = new AutoRefresh({
      dir: config.ledgerDir,
      openDatabase: () => openDb(fx),
      checkMs: 3_600_000,
      log: (level, message) => logs.push([level, message]),
      runJob: async ({ needs }) => {
        const job = createRefreshJob({ config, needs: { ...needs, goalsStale: false }, ask: fakeModel() });
        return { state: "ok", agent: "fake", result: await job.run(), error: null, steps: job.steps };
      },
    });
    expect(await auto.check()).toBe("ok");
    const status = JSON.parse(readFileSync(join(config.ledgerDir, "refresh.json"), "utf8"));
    expect(status).toMatchObject({ state: "ok", agent: "fake", reason: "scheduled" });
    expect(status.steps.length).toBeGreaterThan(0);
    expect(status.needs.needed).toBe(true);
    expect(await auto.runNow({ reason: "manual" })).not.toBe("closed");
  });
  test("a failing job is recorded as failed with its error", async () => {
    const { fx, config } = setup();
    const auto = new AutoRefresh({ dir: config.ledgerDir, openDatabase: () => openDb(fx), runJob: async () => { throw new Error("model unreachable"); } });
    expect(await auto.check()).toBe("failed");
    expect(JSON.parse(readFileSync(join(config.ledgerDir, "refresh.json"), "utf8"))).toMatchObject({ state: "failed", error: "model unreachable" });
  });
  test("disabled does nothing", async () => {
    const { fx, config } = setup();
    const auto = new AutoRefresh({ dir: config.ledgerDir, openDatabase: () => openDb(fx), enabled: () => false, runJob: async () => ({ state: "ok" }) });
    expect(await auto.check()).toBe("disabled");
  });
});
