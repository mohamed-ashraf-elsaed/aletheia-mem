// T-216: the demo seed script writes clearly fake data, only where it is told to, and never over a real store.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { economics } from "../src/hub/economics.mjs";
import { proposeGoalsRollup } from "../src/hub/goals-rollup.mjs";
import { proposeRequests } from "../src/hub/requests.mjs";
import { buildStory } from "../src/hub/story.mjs";
import { DEMO_PROJECTS, seed } from "../scripts/seed-demo.mjs";

const SCRIPT = join(import.meta.dir, "..", "scripts", "seed-demo.mjs");
const temp = () => mkdtempSync(join(tmpdir(), "aletheia-seed-"));
const run = async (args, env = {}) => {
  const proc = Bun.spawn([process.execPath, SCRIPT, ...args], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
};

describe("T-216: seed-demo", () => {
  test("fills a folder with the requested number of fake memories, facts, review items and suggestions", () => {
    const dir = temp();
    try {
      const stats = seed(dir, { rows: 90 });
      expect(stats.memories).toBe(90);
      expect(stats.facts).toBeGreaterThanOrEqual(25);
      expect(stats.review).toBeGreaterThan(0);
      const hub = new HubStore(join(dir, "hub.db"));
      expect(hub.setting("demo.seeded", false)).toBe(true);
      expect(hub.db.prepare("SELECT COUNT(*) AS n FROM rule_suggestions").get().n).toBeGreaterThan(5);
      expect(hub.db.prepare("SELECT COUNT(*) AS n FROM dismissals").get().n).toBeGreaterThan(0);
      hub.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("the seed fills the request, goal, story and economics panels", () => {
    const dir = temp();
    try {
      seed(dir, { rows: 60 });
      const hub = new HubStore(join(dir, "hub.db"));
      const now = Date.now();
      const requests = proposeRequests(hub, { now, limit: 100 });
      const shipped = requests.requests.find((request) => request.status === "Shipped");
      expect(shipped).toBeTruthy();
      expect(shipped.cameOutOfIt.some((artifact) => artifact.kind === "commit")).toBe(true);
      expect(shipped.cameOutOfIt.some((artifact) => artifact.kind === "pull")).toBe(true);
      expect(shipped.cameOutOfIt.some((artifact) => artifact.kind === "branch")).toBe(true);
      expect(requests.requests.some((request) => request.status === "Waiting on you")).toBe(true);
      const goals = proposeGoalsRollup(hub, { now });
      expect(goals.goals.length).toBeGreaterThan(0);
      expect(goals.goals.some((goal) => goal.requestCount > 0)).toBe(true);
      const story = buildStory(hub, { now });
      expect(story.learned.length).toBeGreaterThan(0);
      expect(story.counts.shipped).toBeGreaterThan(0);
      const econ = economics(hub, { now });
      expect(econ.observations.length).toBeGreaterThan(0);
      expect(econ.totals.workTokens).toBeGreaterThan(0);
      expect(econ.observations.every((row) => row.workTokens === null)).toBe(true);
      expect(hub.db.prepare("SELECT COUNT(*) AS n FROM rule_suggestions WHERE times_seen >= 5").get().n).toBeGreaterThan(0);
      expect(hub.db.prepare("SELECT COUNT(*) AS n FROM rule_suggestion_quotes").get().n).toBeGreaterThan(5);
      hub.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("every row is labelled as demo: projects are demo-*, the tool is demo-seed", () => {
    const dir = temp();
    try {
      seed(dir, { rows: 60 });
      const hub = new HubStore(join(dir, "hub.db"));
      expect(hub.db.prepare("SELECT DISTINCT project FROM memories ORDER BY project").all().map((r) => r.project)).toEqual([...DEMO_PROJECTS].sort());
      expect(hub.db.prepare("SELECT DISTINCT tool FROM memories").all().map((r) => r.tool)).toEqual(["demo-seed"]);
      expect(hub.db.prepare("SELECT DISTINCT tool FROM episodes").all().map((r) => r.tool)).toEqual(["demo-seed"]);
      hub.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("the data covers what the UI must survive: Arabic, a 200-character token, Markdown, pinned rows", () => {
    const dir = temp();
    try {
      seed(dir, { rows: 120 });
      const hub = new HubStore(join(dir, "hub.db"));
      const rows = hub.db.prepare("SELECT title, narrative, pinned FROM memories").all();
      expect(rows.some((r) => /[؀-ۿ]/.test(r.narrative))).toBe(true);
      expect(rows.some((r) => r.narrative.includes("x".repeat(200)))).toBe(true);
      expect(rows.some((r) => r.narrative.includes("```sh"))).toBe(true);
      expect(rows.some((r) => r.narrative.includes("| step | owner |"))).toBe(true);
      expect(rows.some((r) => r.pinned === 1)).toBe(true);
      hub.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("the same seed gives the same text, so screenshots and numbers repeat", () => {
    const a = temp();
    const b = temp();
    try {
      seed(a, { rows: 40 });
      seed(b, { rows: 40 });
      const titles = (dir) => { const hub = new HubStore(join(dir, "hub.db")); const out = hub.db.prepare("SELECT title FROM memories ORDER BY id").all().map((r) => r.title); hub.close(); return out; };
      expect(titles(a)).toEqual(titles(b));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
  test("it refuses a database that holds real rows, and accepts one it seeded itself", () => {
    const dir = temp();
    try {
      mkdirSync(dir, { recursive: true });
      const real = new HubStore(join(dir, "hub.db"));
      real.add({ title: "A real note", narrative: "mine", project: "work" });
      real.close();
      expect(() => seed(dir, { rows: 10 })).toThrow("was not seeded by this script");
      expect(() => seed(dir, { rows: 10, force: true })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("--empty marks the store as demo and adds nothing", () => {
    const dir = temp();
    try {
      expect(seed(dir, { empty: true })).toEqual({ memories: 0 });
      const hub = new HubStore(join(dir, "hub.db"));
      expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n).toBe(0);
      hub.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("the command line needs --data and never guesses a folder", async () => {
    const result = await run([]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("never guesses a folder");
  });
  test("the command line refuses the real data folders under HOME", async () => {
    const home = temp();
    try {
      for (const name of [".aletheia", ".work-view-local", ".claude-mem", ".claude"]) {
        const result = await run(["--data", join(home, name)], { HOME: home });
        expect({ name, code: result.code }).toEqual({ name, code: 2 });
        expect(result.err).toContain("looks like a real data folder");
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  test("the command line seeds a temporary folder and says what it wrote", async () => {
    const dir = temp();
    try {
      const result = await run(["--data", dir, "--rows", "30"]);
      expect(result.code).toBe(0);
      expect(result.out).toContain(`seeded ${dir}/hub.db`);
      expect(result.out).toContain('"memories":30');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
