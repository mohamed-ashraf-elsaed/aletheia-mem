// `aletheia doctor` reports host, port and permissions, exits 0 on a healthy install, exits 1 on a
// corrupt database, and never prints a secret.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { doctor } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const fx = makeFixture();
const home = fx.makeDir("home");
const dataDir = fx.makeDir("data");
const dbPath = join(dataDir, "hub.db");
let app;

beforeAll(() => {
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir,
    hubDb: dbPath,
    overlayDb: join(fx.dir, "overlay.db"),
    reviewDb: join(fx.dir, "review.db"),
    ledgerDir: fx.makeDir("ledger"),
    humanCopyCache: join(fx.dir, "human-copy.json"),
    rulesFile: join(fx.dir, "RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"),
    provider: "none",
    extra: { home },
  });
  const store = new HubStore(dbPath);
  store.add({ project: "shop", kind: "note", type: "note", title: "Healthy", narrative: "A healthy row." });
  store.close();
  app = startServer(cfg);
});

afterAll(() => {
  app.stop();
  cleanupTempDirs();
});

const envFor = (extra = {}) => ({ ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath, ...extra });

const runCli = async (args, extra = {}) => {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor(extra),
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
};

describe("aletheia doctor", () => {
  test("reports host, port and permissions", async () => {
    const checks = await doctor({
      home, dataDir, dbPath, port: 1, host: "127.0.0.1", provider: "none", mode: "code", rules: [],
      bun: process.execPath, hookScript: join(root, "bin", "aletheia.mjs"), hookRunner: join(dataDir, "runner.mjs"), mcpScript: join(root, "bin", "mcp.mjs"),
    });
    expect(checks.find((check) => check.name === "host").ok).toBe(true);
    expect(checks.find((check) => check.name === "port").ok).toBe(true);
    expect(checks.find((check) => check.name === "permissions").ok).toBe(true);
  });

  test("a healthy install exits 0", async () => {
    const result = await runCli(["doctor"], { ALETHEIA_PORT: String(app.server.port) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("permissions");
  });

  test("--json prints the same checks as JSON", async () => {
    const result = await runCli(["doctor", "--json"], { ALETHEIA_PORT: String(app.server.port) });
    expect(result.exitCode).toBe(0);
    const checks = JSON.parse(result.stdout);
    expect(checks.some((check) => check.name === "database")).toBe(true);
    expect(checks.some((check) => check.name === "host")).toBe(true);
  });

  test("a corrupt database exits 1 and names the database", async () => {
    const dir = tempDir("aletheia-doctor-corrupt-");
    const badData = join(dir, "data");
    mkdirSync(badData, { recursive: true });
    writeFileSync(join(badData, "hub.db"), "not a sqlite database");
    const result = await runCli(["doctor"], {
      HOME: dir,
      ALETHEIA_DATA_DIR: badData,
      ALETHEIA_HUB_DB: join(badData, "hub.db"),
      ALETHEIA_PORT: String(40000 + (process.pid % 20000)),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL/);
    expect(result.stdout).toMatch(/database|last capture/);
  });

  test("no secret is printed", async () => {
    const result = await runCli(["doctor"], {
      ALETHEIA_PORT: String(app.server.port),
      ALETHEIA_API_KEY: "sekret-do-not-print",
      ALETHEIA_OPENAI_API_KEY: "sk-verysecret123456",
    });
    expect(result.stdout).not.toContain("sekret-do-not-print");
    expect(result.stdout).not.toContain("sk-verysecret123456");
    expect(result.stderr).not.toContain("sk-verysecret123456");
  });
});
