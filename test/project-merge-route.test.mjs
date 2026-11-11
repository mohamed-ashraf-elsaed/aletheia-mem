// The project merge routes: a read-only plan with per-table counts, then the merge that moves exactly those rows.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { tempDir } from "./temp-dirs.mjs";

const fx = makeFixture();
const dir = tempDir("project-merge-route-");
let app;
let base;

const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeAll(() => {
  app = startServer(loadConfig({
    port: 0, dataDir: dir, hubDb: join(dir, "hub.db"), sourceDb: fx.dbPath, overlayDb: join(dir, "overlay.db"), reviewDb: join(dir, "reviews.db"),
    ledgerDir: join(dir, "ledger"), humanCopyCache: join(dir, "human-copy.json"), rulesFile: join(dir, "MY-RULES.md"), claudeInstructionsFile: join(dir, "CLAUDE.md"),
    publicDir: join(import.meta.dir, "..", "public"), provider: "none", autoRefresh: false,
  }));
  base = `http://127.0.0.1:${app.server.port}`;
  for (const [project, title] of [["shop/feature-x", "Only in the branch"], ["shop/feature-x", "Branch two"], ["shop", "Main note"]]) {
    app.hub.add({ project, kind: "note", title, narrative: `${title} body`, tool: "test", createdAtEpoch: Date.UTC(2026, 10, 1) });
  }
});
afterAll(() => app.stop());

describe("GET /api/hub/projects/merge-plan", () => {
  test("returns the per-table counts and writes nothing", async () => {
    const auditBefore = app.hub.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'project.merge'").get().n;
    const res = await fetch(`${base}/api/hub/projects/merge-plan?from=${encodeURIComponent("shop/feature-x")}&into=shop`);
    expect(res.status).toBe(200);
    const plan = await res.json();
    expect(plan).toMatchObject({ from: "shop/feature-x", into: "shop", moved: expect.any(Number), dropped: expect.any(Number) });
    expect(plan.tables.memories).toEqual({ moved: 2, dropped: 0 });
    expect(app.hub.projects().find((row) => row.name === "shop/feature-x").memories).toBe(2);
    expect(app.hub.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'project.merge'").get().n).toBe(auditBefore);
  });
  test("two equal or missing names answer 400, not 500", async () => {
    expect((await fetch(`${base}/api/hub/projects/merge-plan?from=a&into=a`)).status).toBe(400);
    expect((await fetch(`${base}/api/hub/projects/merge-plan`)).status).toBe(400);
  });
  test("only GET is allowed", async () => {
    expect((await post("/api/hub/projects/merge-plan", { from: "a", into: "b" })).status).toBe(404);
  });
});

describe("POST /api/hub/projects/merge", () => {
  test("applies the plan: the counts match and the source project is gone", async () => {
    const plan = await (await fetch(`${base}/api/hub/projects/merge-plan?from=${encodeURIComponent("shop/feature-x")}&into=shop`)).json();
    const res = await post("/api/hub/projects/merge", { from: "shop/feature-x", into: "shop" });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.tables).toEqual(plan.tables);
    const names = app.hub.projects().map((row) => row.name);
    expect(names).not.toContain("shop/feature-x");
    expect(app.hub.projects().find((row) => row.name === "shop").memories).toBe(3);
    expect(app.hub.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'project.merge'").get().n).toBe(1);
  });
  test("the same name twice answers 400", async () => {
    expect((await post("/api/hub/projects/merge", { from: "shop", into: "shop" })).status).toBe(400);
  });
});
