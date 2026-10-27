import { describe, expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyInstall, formatVerify, installerFor, verifyInstall } from "../src/hub/install.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  const env = {
    home,
    bun: "/usr/local/bin/bun",
    hookScript: join(root, "bin/aletheia.mjs"),
    hookRunner: join(dataDir, "aletheia.bundle.mjs"),
    mcpScript: join(root, "bin/mcp.mjs"),
    dataDir,
    dbPath: join(dataDir, "hub.db"),
    port: 1,
    rules: [],
  };
  return { fx, home, dataDir, env };
}

describe("aletheia install --verify", () => {
  test("a fresh install verifies clean and a touched file reports drift", async () => {
    const { env, dataDir, home } = setup();
    await applyInstall(installerFor("claude-code").plan(env), { dataDir });

    let report = verifyInstall(dataDir, "claude-code");
    expect(report.tools["claude-code"].installed).toBe(true);
    expect(report.tools["claude-code"].ok).toBe(true);
    expect(formatVerify(report)).toContain("matches the recorded install");

    const file = join(home, ".claude", "settings.json");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
    report = verifyInstall(dataDir, "claude-code");
    expect(report.tools["claude-code"].ok).toBe(false);
    expect(report.tools["claude-code"].steps.some((step) => step.state === "drift")).toBe(true);
    expect(formatVerify(report)).toContain("drift");
    expect(formatVerify(report)).toContain("drifted from the recorded install");
  });

  test("a missing recorded file is reported, and an unknown tool is not installed", async () => {
    const { env, dataDir, home } = setup();
    await applyInstall(installerFor("command-code").plan(env), { dataDir });
    unlinkSync(join(home, ".commandcode", "mcp.json"));

    const report = verifyInstall(dataDir);
    const steps = report.tools["command-code"].steps;
    expect(steps.some((step) => step.state === "missing")).toBe(true);
    expect(report.tools["command-code"].ok).toBe(false);

    const unknown = verifyInstall(dataDir, "windsurf");
    expect(unknown.tools["windsurf"].installed).toBe(false);
    expect(formatVerify(unknown)).toContain("not installed");
  });

  test("the CLI prints the report and exits non-zero on drift", async () => {
    const { env, dataDir, home } = setup();
    await applyInstall(installerFor("opencode").plan(env), { dataDir });
    const file = join(home, ".config", "opencode", "opencode.json");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n`);

    const childEnv = { ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir };
    const proc = Bun.spawn([process.execPath, join(root, "bin/aletheia.mjs"), "install", "opencode", "--verify"], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: childEnv });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(stdout).toContain("drift");
    expect(stdout).toContain("opencode");
    expect(exitCode).toBe(1);
  });
});
