// /healthz detail: database, FTS, vectors and model; a closed database is an error with a reason; never a key.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthReport } from "../src/hub/health.mjs";
import { doctor } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";

const dirs = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "aletheia-health-"));
  dirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("health detail", () => {
  test("a healthy store reports ok and counts", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "note", type: "note", title: "A note", narrative: "Some text" });
      const memory = store.get(1);
      store.setVector(memory.id, "fake", [1, 0]);
      const report = healthReport(store, { model: "Xenova/bge-small-en-v1.5" });
      expect(report.status).toBe("ok");
      expect(report.db.ok).toBe(true);
      expect(report.fts.ok).toBe(true);
      expect(report.vectors).toEqual({ memories: 1, facts: 0 });
      expect(report.model).toBe("Xenova/bge-small-en-v1.5");
    } finally {
      store.close();
    }
  });

  test("a closed database is an error with a reason", () => {
    const store = new HubStore(":memory:");
    store.close();
    const report = healthReport(store);
    expect(report.status).toBe("error");
    expect(report.db.ok).toBe(false);
    expect(report.db.detail).toMatch(/unavailable|closed/i);
    expect(report.fts.ok).toBe(false);
  });

  test("the response never contains an API key", () => {
    const before = process.env.ALETHEIA_OPENAI_API_KEY;
    process.env.ALETHEIA_OPENAI_API_KEY = "sk-supersecret0123456789";
    const store = new HubStore(":memory:");
    try {
      const report = healthReport(store, { model: "sk-supersecret0123456789" });
      const text = JSON.stringify(report);
      expect(text).not.toContain("sk-supersecret0123456789");
      expect(report.model).toBe("[redacted]");
      expect(text).not.toContain("ALETHEIA_OPENAI_API_KEY");
    } finally {
      store.close();
      if (before === undefined) delete process.env.ALETHEIA_OPENAI_API_KEY;
      else process.env.ALETHEIA_OPENAI_API_KEY = before;
    }
  });

  test("doctor does not fail for a tool that is not installed and shows database, FTS, vectors and model", async () => {
    const root = tmp();
    const home = join(root, "home");
    const dataDir = join(root, "data");
    mkdirSync(home, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, "hub.db");
    const store = new HubStore(dbPath);
    store.add({ project: "shop", kind: "note", type: "note", title: "A note", narrative: "Some text" });
    store.close();
    const checks = await doctor({
      home, dataDir, dbPath, port: 1, provider: "none", mode: "code", rules: [],
      bun: process.execPath, hookScript: join(root, "aletheia.mjs"), hookRunner: join(root, "runner.mjs"), mcpScript: join(root, "mcp.mjs"),
    });
    const hooks = checks.filter((check) => check.name.startsWith("hooks "));
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((check) => check.ok)).toBe(true);
    expect(hooks.some((check) => check.detail.startsWith("not installed"))).toBe(true);
    for (const name of ["database", "fts", "vectors", "model"]) {
      expect(checks.find((check) => check.name === name)).toBeTruthy();
    }
    expect(checks.find((check) => check.name === "database").ok).toBe(true);
    expect(checks.find((check) => check.name === "fts").ok).toBe(true);
  });
});
