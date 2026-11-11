// `aletheia connect` for hosts that only get an MCP entry: GitHub Copilot CLI, Goose and Roo Code. Every format
// comes from the host's own docs (see MCP_ONLY_HOSTS in src/hub/tools.mjs); none was run against a real install.
// Warp is not covered: its docs name the file but not its JSON shape, so it stays UNVERIFIED.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MCP_ONLY_HOSTS, applyMcpOnly, mcpOnlyHost, mcpOnlyPlan, removeMcpOnly } from "../src/hub/tools.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const repo = join(import.meta.dir, "..");
const argv = ["/usr/bin/bun", "/opt/aletheia/bin/mcp.mjs"];

function ctx() {
  const home = tempDir("aletheia-mcp-only-");
  const project = join(home, "shop");
  mkdirSync(project, { recursive: true });
  return { home, project, argv, env: {} };
}
const backups = (file) => readdirSync(dirname(file)).filter((name) => name.startsWith(`${file.split("/").pop()}.aletheia-`) && name.endsWith(".bak"));
const seed = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };

describe("registry", () => {
  test("lists exactly the verified hosts and no Warp", () => {
    expect(MCP_ONLY_HOSTS.map((h) => h.id)).toEqual(["copilot-cli", "goose", "roo-code"]);
    for (const host of MCP_ONLY_HOSTS) {
      expect(host.source).toMatch(/^https:\/\//);
      expect(host.fetchedOn).toBe("2026-11-11");
      expect(host.status).toBe("config written from docs, not tested on a real install");
    }
    expect(mcpOnlyHost("warp")).toBeUndefined();
  });
});

describe("GitHub Copilot CLI (~/.copilot/mcp-config.json)", () => {
  test("dry run reports the file and writes nothing", () => {
    const c = ctx();
    const plan = mcpOnlyPlan(mcpOnlyHost("copilot-cli"), c);
    expect(plan.path).toBe(join(c.home, ".copilot", "mcp-config.json"));
    expect(plan.connected).toBe(false);
    expect(JSON.parse(plan.snippet).mcpServers.aletheia).toEqual({ type: "local", command: argv[0], args: [argv[1]], env: {}, tools: ["*"] });
    expect(existsSync(join(c.home, ".copilot"))).toBe(false);
  });
  test("COPILOT_HOME moves the file", () => {
    const c = ctx();
    c.env = { COPILOT_HOME: join(c.home, "alt") };
    expect(mcpOnlyPlan(mcpOnlyHost("copilot-cli"), c).path).toBe(join(c.home, "alt", "mcp-config.json"));
  });
  test("write merges next to other servers and keeps a backup; uninstall removes only ours", () => {
    const c = ctx();
    const host = mcpOnlyHost("copilot-cli");
    const file = join(c.home, ".copilot", "mcp-config.json");
    const other = { type: "http", url: "https://example.test/mcp", tools: ["*"] };
    seed(file, JSON.stringify({ theme: "dark", mcpServers: { other } }, null, 2));
    const res = applyMcpOnly(host, c);
    expect(res.written).toBe(true);
    expect(backups(file).length).toBe(1);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    expect(doc.theme).toBe("dark");
    expect(doc.mcpServers.other).toEqual(other);
    expect(doc.mcpServers.aletheia.command).toBe(argv[0]);
    expect(applyMcpOnly(host, c).written).toBe(false);
    const rm = removeMcpOnly(host, c);
    expect(rm.removed).toBe(true);
    const after = JSON.parse(readFileSync(file, "utf8"));
    expect(after).toEqual({ theme: "dark", mcpServers: { other } });
    expect(backups(file).length).toBe(2);
  });
  test("a foreign aletheia entry is left alone on write and on remove", () => {
    const c = ctx();
    const host = mcpOnlyHost("copilot-cli");
    const file = join(c.home, ".copilot", "mcp-config.json");
    const foreign = { type: "local", command: "node", args: ["mine.js"] };
    seed(file, JSON.stringify({ mcpServers: { aletheia: foreign } }));
    expect(() => applyMcpOnly(host, c)).toThrow(/not ours/);
    expect(removeMcpOnly(host, c).removed).toBe(false);
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.aletheia).toEqual(foreign);
  });
  test("invalid JSON is refused and left untouched", () => {
    const c = ctx();
    const file = join(c.home, ".copilot", "mcp-config.json");
    seed(file, "{ not json");
    expect(() => applyMcpOnly(mcpOnlyHost("copilot-cli"), c)).toThrow(/not valid JSON/);
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });
});

describe("Goose (~/.config/goose/config.yaml)", () => {
  const host = () => mcpOnlyHost("goose");
  test("dry run shows the YAML and writes nothing", () => {
    const c = ctx();
    const plan = mcpOnlyPlan(host(), c);
    expect(plan.path).toBe(join(c.home, ".config", "goose", "config.yaml"));
    expect(plan.snippet).toContain("extensions:");
    expect(plan.snippet).toContain("  aletheia:");
    expect(plan.snippet).toContain("    type: stdio");
    expect(plan.snippet).toContain(`    cmd: ${JSON.stringify(argv[0])}`);
    expect(plan.snippet).toContain(`    args: [${JSON.stringify(argv[1])}]`);
    expect(existsSync(join(c.home, ".config"))).toBe(false);
  });
  test("write creates the file when missing; remove deletes only our block", () => {
    const c = ctx();
    const file = join(c.home, ".config", "goose", "config.yaml");
    expect(applyMcpOnly(host(), c).written).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("  aletheia:");
    expect(removeMcpOnly(host(), c).removed).toBe(true);
    expect(readFileSync(file, "utf8")).not.toContain("aletheia");
  });
  test("write merges into an existing extensions map with a backup; other keys and extensions survive", () => {
    const c = ctx();
    const file = join(c.home, ".config", "goose", "config.yaml");
    const original = "GOOSE_PROVIDER: openai\nextensions:\n  github:\n    name: GitHub\n    cmd: npx\n    args: [-y, \"@modelcontextprotocol/server-github\"]\n    enabled: true\n    type: stdio\n    timeout: 300\nGOOSE_MODEL: gpt-4o\n";
    seed(file, original);
    expect(applyMcpOnly(host(), c).written).toBe(true);
    expect(backups(file).length).toBe(1);
    const text = readFileSync(file, "utf8");
    expect(text).toContain("GOOSE_PROVIDER: openai");
    expect(text).toContain("GOOSE_MODEL: gpt-4o");
    expect(text).toContain("  github:\n    name: GitHub");
    expect(text.match(/^extensions:/gm).length).toBe(1);
    expect(text).toContain("  aletheia:");
    expect(applyMcpOnly(host(), c).written).toBe(false);
    expect(removeMcpOnly(host(), c).removed).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(backups(file).length).toBe(2);
  });
  test("appends an extensions map when the file has none", () => {
    const c = ctx();
    const file = join(c.home, ".config", "goose", "config.yaml");
    seed(file, "GOOSE_MODEL: gpt-4o\n");
    applyMcpOnly(host(), c);
    const text = readFileSync(file, "utf8");
    expect(text.startsWith("GOOSE_MODEL: gpt-4o\n")).toBe(true);
    expect(text).toContain("extensions:\n  aletheia:");
  });
  test("a foreign aletheia extension is left alone; flow-style extensions are refused", () => {
    const c = ctx();
    const file = join(c.home, ".config", "goose", "config.yaml");
    const foreign = "extensions:\n  aletheia:\n    name: mine\n    cmd: node\n    args: [x.js]\n    type: stdio\n";
    seed(file, foreign);
    expect(() => applyMcpOnly(host(), c)).toThrow(/not ours/);
    expect(removeMcpOnly(host(), c).removed).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(foreign);
    seed(file, "extensions: {}\n");
    expect(() => applyMcpOnly(host(), c)).toThrow(/block style/);
  });
});

describe("Roo Code (<project>/.roo/mcp.json)", () => {
  const host = () => mcpOnlyHost("roo-code");
  test("dry run targets the project file and writes nothing", () => {
    const c = ctx();
    const plan = mcpOnlyPlan(host(), c);
    expect(plan.path).toBe(join(c.project, ".roo", "mcp.json"));
    expect(JSON.parse(plan.snippet).mcpServers.aletheia).toEqual({ command: argv[0], args: [argv[1]] });
    expect(existsSync(join(c.project, ".roo"))).toBe(false);
  });
  test("write merges with a backup; uninstall removes only ours", () => {
    const c = ctx();
    const file = join(c.project, ".roo", "mcp.json");
    const other = { command: "python", args: ["s.py"], alwaysAllow: ["t"], disabled: false };
    seed(file, JSON.stringify({ mcpServers: { server1: other } }));
    expect(applyMcpOnly(host(), c).written).toBe(true);
    expect(backups(file).length).toBe(1);
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.server1).toEqual(other);
    expect(removeMcpOnly(host(), c).removed).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ mcpServers: { server1: other } });
  });
});

describe("aletheia connect CLI", () => {
  function run(args, home, cwd) {
    const proc = Bun.spawnSync([process.execPath, join(repo, "bin/aletheia.mjs"), ...args], {
      cwd,
      env: { ...process.env, HOME: home, USERPROFILE: home, COPILOT_HOME: "", ALETHEIA_DATA_DIR: join(home, "data"), ALETHEIA_HUB_DB: join(home, "data", "hub.db") },
      timeout: 20000,
    });
    return { code: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
  }
  test("dry run prints the file, --write writes it, --remove undoes it", () => {
    const c = ctx();
    const file = join(c.home, ".copilot", "mcp-config.json");
    const dry = run(["connect", "copilot-cli"], c.home, c.project);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain(file);
    expect(dry.out).toContain("config written from docs, not tested on a real install");
    expect(existsSync(file)).toBe(false);
    expect(run(["connect", "copilot-cli", "--write"], c.home, c.project).code).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.aletheia.type).toBe("local");
    const rmDry = run(["connect", "copilot-cli", "--remove"], c.home, c.project);
    expect(rmDry.out).toContain(file);
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.aletheia).toBeDefined();
    expect(run(["connect", "copilot-cli", "--remove", "--write"], c.home, c.project).code).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.aletheia).toBeUndefined();
  });
  test("roo-code writes into the current project, not HOME", () => {
    const c = ctx();
    expect(run(["connect", "roo-code", "--write"], c.home, c.project).code).toBe(0);
    expect(existsSync(join(c.project, ".roo", "mcp.json"))).toBe(true);
    expect(existsSync(join(c.home, ".roo"))).toBe(false);
  });
  test("goose dry run names its file", () => {
    const c = ctx();
    const dry = run(["connect", "goose"], c.home, c.project);
    expect(dry.out).toContain(join(c.home, ".config", "goose", "config.yaml"));
    expect(existsSync(join(c.home, ".config", "goose"))).toBe(false);
  });
});
