import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyInstall, applyUninstall, doctor, installerFor, planUninstall } from "../src/hub/install.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const configPath = (home) => join(home, ".config/opencode/opencode.json");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  return {
    fx, home, dataDir,
    env: {
      home,
      bun: process.execPath,
      hookScript: join(root, "bin/aletheia.mjs"),
      hookRunner: join(dataDir, "aletheia.bundle.mjs"),
      mcpScript: join(root, "bin/mcp.mjs"),
      dataDir,
      dbPath: join(dataDir, "hub.db"),
      port: 1,
      rules: [],
    },
  };
}

describe("T-068: OpenCode installer (mcp+rules)", () => {
  test("a dry run plans the documented mcp key and global rules, and writes nothing", () => {
    const ctx = setup();
    const plan = installerFor("opencode").plan(ctx.env);
    expect(plan.capabilities).toBe("mcp+rules");
    expect(plan.verification).toBe("from-docs-only");
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "rules"]);
    expect(plan.notes.join(" ")).toContain("event payload");
    expect(existsSync(configPath(ctx.home))).toBe(false);
    expect(existsSync(join(ctx.home, ".config/opencode/AGENTS.md"))).toBe(false);
  });

  test("the config uses type local with an argv command, and a second install is a no-op", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".config/opencode"), { recursive: true });
    writeFileSync(configPath(ctx.home), JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      autoupdate: true,
      mcp: { other: { type: "remote", url: "https://example.com/mcp", enabled: true } },
    }, null, 2));

    const result = await applyInstall(installerFor("opencode").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(result.wrote.length).toBe(2);
    const doc = JSON.parse(readFileSync(configPath(ctx.home), "utf8"));
    expect(doc.$schema).toBe("https://opencode.ai/config.json");
    expect(doc.autoupdate).toBe(true);
    expect(doc.mcp.other.type).toBe("remote");
    expect(doc.mcp.aletheia).toEqual({ type: "local", command: [process.execPath, join(root, "bin/mcp.mjs")], enabled: true });
    expect(readFileSync(join(ctx.home, ".config/opencode/AGENTS.md"), "utf8")).toContain("aletheia:rules:begin");

    const second = await applyInstall(installerFor("opencode").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(second.changed).toBe(false);
    expect(second.wrote).toEqual([]);
  });

  test("doctor reports opencode as mcp+rules without a hook check", async () => {
    const ctx = setup();
    await applyInstall(installerFor("opencode").plan(ctx.env), { dataDir: ctx.dataDir });
    const checks = await doctor(ctx.env);
    const tool = checks.find((check) => check.name === "tool opencode");
    expect(tool.ok).toBe(true);
    expect(tool.detail).toContain("mcp+rules");
    expect(checks.some((check) => check.name === "hooks opencode")).toBe(false);
  });

  test("uninstall removes the mcp entry and the managed rules block", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".config/opencode"), { recursive: true });
    writeFileSync(configPath(ctx.home), JSON.stringify({
      autoupdate: true,
      mcp: { other: { type: "remote", url: "https://example.com/mcp" } },
    }, null, 2));

    await applyInstall(installerFor("opencode").plan(ctx.env), { dataDir: ctx.dataDir });
    const result = applyUninstall(planUninstall("opencode", ctx.env, { dataDir: ctx.dataDir }), { dataDir: ctx.dataDir });
    expect(result.removed).toBe(true);
    const doc = JSON.parse(readFileSync(configPath(ctx.home), "utf8"));
    expect(doc.autoupdate).toBe(true);
    expect(doc.mcp).toEqual({ other: { type: "remote", url: "https://example.com/mcp" } });
    expect(JSON.stringify(doc)).not.toContain("aletheia");
  });

  test("a JSONC-only config is refused instead of parsed as JSON", () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".config/opencode"), { recursive: true });
    writeFileSync(join(ctx.home, ".config/opencode/opencode.jsonc"), "{ // comment\n}\n");
    expect(() => installerFor("opencode").plan(ctx.env)).toThrow(/JSONC/);
  });
});
