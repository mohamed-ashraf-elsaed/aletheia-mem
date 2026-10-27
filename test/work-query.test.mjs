// T-173: the work list accepts filter (all / needs-you / shipped) with counts, sort (needs-you / newest /
// most-progress) and group by agent/tool. The same params work on GET /v1/work/requests.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { proposeRequests } from "../src/hub/requests.mjs";
import { makeFixture } from "./fixture.mjs";

const NOW = Date.now();
const at = (minutes) => NOW - minutes * 60_000;
const fx = makeFixture();
let seeded;

function seed(path) {
  const store = new HubStore(path);
  const prompt = (sessionId, text, minutes, tool) => store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool, createdAtEpoch: at(minutes) });
  const event = (sessionId, text, minutes, tool) => store.add({ project: "shop", kind: "event", type: "event", title: text, narrative: text, sessionId, tool, createdAtEpoch: at(minutes) });

  prompt("s1", "Build a retry button", 300, "claude-code");
  event("s1", "Released the retry button", 290, "claude-code");
  store.markSessionEnded("shop", "s1", { source: "SessionEnd", now: at(280) });

  prompt("s2", "Rewrite the onboarding guide", 200, "codex");
  prompt("s3", "Fix the login timeout", 1, "codex");
  prompt("s4", "Investigate the retry latency", 90, "claude-code");
  event("s4", "Read the latency report", 80, "claude-code");
  store.close();
}

beforeAll(() => {
  const dbPath = join(fx.dir, "work-query.db");
  seed(dbPath);
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("work-query-data"),
    overlayDb: join(fx.dir, "work-query-overlay.db"),
    reviewDb: join(fx.dir, "work-query-review.db"),
    ledgerDir: fx.makeDir("work-query-ledger"),
    humanCopyCache: join(fx.dir, "work-query-human.json"),
    rulesFile: join(fx.dir, "WORK-QUERY-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "WORK-QUERY-CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("work-query-home") },
  });
  seeded = { app: startServer(cfg) };
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => seeded.app.stop());

describe("T-173: work list query params", () => {
  test("filter all / needs-you / shipped counts come from rows", () => {
    const store = new HubStore(join(fx.dir, "work-query.db"));
    try {
      const all = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 });
      expect(all.counts).toMatchObject({ all: 4, needsYou: 1, shipped: 1, working: 1, idle: 1 });
      expect(all.requests).toHaveLength(4);

      const needsYou = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5, filter: "needs-you" });
      expect(needsYou.requests).toHaveLength(1);
      expect(needsYou.requests[0].status).toBe("Waiting on you");

      const shipped = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5, filter: "shipped" });
      expect(shipped.requests).toHaveLength(1);
      expect(shipped.requests[0].status).toBe("Shipped");
    } finally {
      store.close();
    }
  });

  test("sort puts needs-you first and most-progress first", () => {
    const store = new HubStore(join(fx.dir, "work-query.db"));
    try {
      const byNeeds = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5, sort: "needs-you" });
      expect(byNeeds.requests[0].status).toBe("Waiting on you");
      const byProgress = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5, sort: "most-progress" });
      expect(byProgress.requests[0].progress).toBe(100);
    } finally {
      store.close();
    }
  });

  test("group by agent/tool buckets requests under their tool", () => {
    const store = new HubStore(join(fx.dir, "work-query.db"));
    try {
      const grouped = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5, group: "tool" });
      expect(grouped.group).toBe("tool");
      const keys = grouped.groups.map((group) => group.key).sort();
      expect(keys).toEqual(["claude-code", "codex"]);
      const total = grouped.groups.reduce((sum, group) => sum + group.count, 0);
      expect(total).toBe(4);
      const claude = grouped.groups.find((group) => group.key === "claude-code");
      expect(claude.requests.every((request) => request.tool === "claude-code")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("the /v1/work/requests route accepts filter, sort and group", async () => {
    const get = async (path) => (await fetch(`${seeded.base}${path}`)).json();
    const filtered = await get("/v1/work/requests?project=shop&filter=needs-you");
    expect(filtered.filter).toBe("needs-you");
    expect(filtered.counts.all).toBe(4);
    expect(filtered.requests).toHaveLength(1);

    const sorted = await get("/v1/work/requests?project=shop&sort=most-progress");
    expect(sorted.sort).toBe("most-progress");
    expect(sorted.requests[0].progress).toBe(100);

    const grouped = await get("/v1/work/requests?project=shop&group=tool");
    expect(grouped.group).toBe("tool");
    expect(grouped.groups).toHaveLength(2);
  });
});
