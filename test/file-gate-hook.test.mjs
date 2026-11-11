// The Claude Code PreToolUse hook for the Read tool asks the file-read gate. Off by default, fails open.
import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { runHook } from "../src/hub/hooks/run.mjs";
import { callTool, TOOL_DEFS } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { readSettings, validateSetting, writeSettings } from "../src/hub/settings.mjs";
import { makeFixture } from "./fixture.mjs";

const SETTING = "readGate.enabled";

function setup({ enabled = true, history = true, bytes = 40 * 1024 } = {}) {
  const fx = makeFixture();
  const dataDir = fx.makeDir("data");
  const proj = fx.makeDir("shop");
  mkdirSync(join(proj, "src"), { recursive: true });
  const file = join(proj, "src", "big.mjs");
  const body = ["# Notes", "export function alpha() {", "  return 1;", "}", "export class Beta {}", ""].join("\n").padEnd(bytes, "// filler line\n");
  writeFileSync(file, body);
  const config = { hubDb: join(dataDir, "hub.db"), dataDir };
  const store = new HubStore(config.hubDb);
  if (enabled) writeSettings(store, { [SETTING]: true });
  if (history) store.add({ project: basename(proj), kind: "note", type: "gotcha", title: "big.mjs gotcha", narrative: "careful", files: [file] }, { actor: "import" });
  store.close();
  return { fx, dataDir, proj, file, config };
}

const pre = (config, payload) => runHook({ tool: "claude-code", event: "PreToolUse", stdin: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s1", ...payload }), config });
const read = (proj, file, input = {}) => ({ cwd: proj, tool_name: "Read", tool_input: { file_path: file, ...input }, tool_use_id: "toolu_1" });

describe("file-read gate hook", () => {
  test("the setting is a boolean that defaults to off", () => {
    const store = new HubStore(":memory:");
    expect(readSettings(store).find((s) => s.key === SETTING)).toMatchObject({ kind: "boolean", value: false });
    expect(validateSetting(SETTING, "yes").ok).toBe(false);
    store.close();
  });

  test("on: a whole read of a large file with history is denied with the outline and line-range guidance", async () => {
    const { proj, file, config } = setup();
    const result = await pre(config, read(proj, file));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout).hookSpecificOutput;
    expect(out.hookEventName).toBe("PreToolUse");
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain("alpha");
    expect(out.permissionDecisionReason).toContain("Beta");
    expect(out.permissionDecisionReason).toMatch(/offset/);
    expect(out.permissionDecisionReason).toMatch(/limit/);
    expect(out.permissionDecisionReason).toContain("<aletheia-memory>");
    expect(out.permissionDecisionReason).toContain("big.mjs gotcha");
  });

  test("a targeted read with offset or limit passes", async () => {
    const { proj, file, config } = setup();
    expect((await pre(config, read(proj, file, { offset: 10, limit: 50 }))).stdout).toBe("");
    expect((await pre(config, read(proj, file, { limit: 50 }))).stdout).toBe("");
  });

  test("off by default: the read is allowed", async () => {
    const { proj, file, config } = setup({ enabled: false });
    const result = await pre(config, read(proj, file));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  test("no history, a small file, another tool, or a missing file are allowed", async () => {
    const noHistory = setup({ history: false });
    expect((await pre(noHistory.config, read(noHistory.proj, noHistory.file))).stdout).toBe("");
    const small = setup({ bytes: 2000 });
    expect((await pre(small.config, read(small.proj, small.file))).stdout).toBe("");
    const other = setup();
    expect((await pre(other.config, { ...read(other.proj, other.file), tool_name: "Bash" })).stdout).toBe("");
    expect((await pre(other.config, read(other.proj, join(other.proj, "gone.mjs")))).stdout).toBe("");
  });

  test("fails open: no database, a corrupt database, or a junk payload all allow", async () => {
    const { fx, proj, file } = setup();
    const missing = { hubDb: join(fx.makeDir("none"), "hub.db"), dataDir: fx.makeDir("d2") };
    expect((await pre(missing, read(proj, file))).stdout).toBe("");
    const corrupt = fx.makeDir("bad");
    writeFileSync(join(corrupt, "hub.db"), "not a database");
    const bad = await pre({ hubDb: join(corrupt, "hub.db"), dataDir: corrupt }, read(proj, file));
    expect(bad.exitCode).toBe(0);
    expect(bad.stdout).toBe("");
    const junk = await runHook({ tool: "claude-code", event: "PreToolUse", stdin: "{{{", config: missing });
    expect(junk.exitCode).toBe(0);
    expect(junk.stdout).toBe("");
  });

  test("stays inside the hook time budget", async () => {
    const { proj, file, config } = setup();
    const started = performance.now();
    await pre(config, read(proj, file));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("file_outline MCP tool", () => {
  const ctxFor = (store, proj) => ({ store, tool: "test", cwd: proj });
  test("is listed read-only with annotations", () => {
    const def = TOOL_DEFS.find((tool) => tool.name === "file_outline");
    expect(def.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    expect(def.inputSchema.required).toEqual(["file"]);
  });

  test("returns the outline and history wrapped as untrusted", () => {
    const { proj, file, config } = setup();
    const store = new HubStore(config.hubDb);
    const text = callTool("file_outline", { file }, ctxFor(store, proj)).content[0].text;
    expect(text).toContain("<aletheia-memory>");
    expect(text).toContain("alpha");
    expect(text).toContain("big.mjs gotcha");
    store.close();
  });

  test("finds the history recorded under a symlinked path (macOS /var is /private/var)", () => {
    if (process.platform === "win32") return;
    const { fx, proj, file, config } = setup({ history: false });
    const link = join(fx.dir, "shop-link");
    symlinkSync(proj, link);
    const viaLink = join(link, "src", "big.mjs");
    const store = new HubStore(config.hubDb);
    store.add({ project: basename(proj), kind: "note", type: "gotcha", title: "linked gotcha", narrative: "via the link", files: [viaLink] }, { actor: "import" });
    const text = callTool("file_outline", { file: viaLink }, ctxFor(store, proj)).content[0].text;
    expect(text).toContain("linked gotcha");
    expect(text).toContain(realpathSync(file));
    store.close();
  });

  test("refuses a file outside the project and any call without a working directory", () => {
    const { proj, config } = setup();
    const store = new HubStore(config.hubDb);
    expect(callTool("file_outline", { file: "/etc/passwd" }, ctxFor(store, proj)).isError).toBe(true);
    expect(callTool("file_outline", { file: join(proj, "src/big.mjs") }, { store, tool: "t", cwd: null }).isError).toBe(true);
    expect(callTool("file_outline", {}, ctxFor(store, proj)).isError).toBe(true);
    store.close();
  });
});
