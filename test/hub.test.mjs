import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { normalizeHook, redact } from "../src/hub/capture.mjs";
import { compressRecent, validateObservations } from "../src/hub/compress.mjs";
import { importClaudeMem } from "../src/hub/importers.mjs";
import { callTool, handleMessage } from "../src/hub/mcp.mjs";
import { applyBlock, parseRulesFromText, removeBlock, renderRules, syncTool } from "../src/hub/rules-sync.mjs";
import { HubStore, ftsQuery } from "../src/hub/store.mjs";
import { MARK_BEGIN, MARK_END, TOOLS, applyMcp, detectTools, mcpPlan, toolById } from "../src/hub/tools.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const mem = (extra = {}) => ({ project: "shop", title: "Retry uses exponential backoff", narrative: "Chose exponential backoff with jitter for payment retries", type: "decision", tool: "claude-code", ...extra });

describe("store: memories and search", () => {
  test("add, get, dedupe by content, update, delete", () => {
    const s = new HubStore(":memory:");
    const a = s.add(mem());
    expect(a.created).toBe(true);
    expect(s.add(mem()).created).toBe(false);
    expect(s.add(mem()).id).toBe(a.id);
    expect(s.get(a.id)).toMatchObject({ project: "shop", type: "decision", pinned: false, facts: [] });
    expect(s.update(a.id, { title: "Backoff", pinned: true }).pinned).toBe(true);
    expect(s.remove(a.id)).toBe(true);
    expect(s.get(a.id)).toBeNull();
  });
  test("a memory needs a title or text", () => {
    expect(() => new HubStore(":memory:").add({ project: "x" })).toThrow(/title or text/);
  });
  test("full-text search ranks, prefix-matches, filters, and follows edits and deletes", () => {
    const s = new HubStore(":memory:");
    s.add(mem());
    s.add(mem({ title: "Postgres pool size", narrative: "Pool of 20 connections is enough", project: "api", tool: "codex" }));
    expect(s.search({ query: "backoff" }).map((r) => r.title)).toEqual(["Retry uses exponential backoff"]);
    expect(s.list({ q: "expon" }).total).toBe(1); // the UI box matches prefixes as you type
    expect(s.search({ query: "retrying payments" }).length).toBe(1); // stemming: retrying ~ retries
    expect(s.search({ query: "how should the payment retries back off?" }).length).toBe(1); // a natural question, any word may match
    expect(s.search({ query: "pool", project: "shop" })).toEqual([]);
    expect(s.search({ query: "pool", tool: "codex" }).length).toBe(1);
    const id = s.search({ query: "backoff" })[0].id;
    s.update(id, { title: "Linear retry", narrative: "changed our mind" });
    expect(s.search({ query: "backoff" })).toEqual([]);
    expect(s.search({ query: "linear" }).length).toBe(1);
    s.remove(id);
    expect(s.search({ query: "linear" })).toEqual([]);
  });
  test("hostile search text cannot break the query", () => {
    const s = new HubStore(":memory:");
    s.add(mem());
    expect(ftsQuery('"; DROP TABLE memories; --')).toBe('"drop"* "table"* "memories"*');
    expect(() => s.search({ query: 'a" OR NEAR(' })).not.toThrow();
    expect(s.search({ query: "***" })).toEqual([]);
  });
  test("timeline returns neighbours in time order around an anchor, skipping raw events", () => {
    const s = new HubStore(":memory:");
    const ids = [1, 2, 3, 4, 5].map((i) => s.add(mem({ title: `m${i}`, narrative: `n${i}`, createdAtEpoch: 1000 + i })).id);
    s.add(mem({ title: "noise", kind: "event", createdAtEpoch: 1003 }));
    const t = s.timeline({ anchor: ids[2], before: 1, after: 1, project: "shop" });
    expect(t.items.map((m) => m.title)).toEqual(["m2", "m3", "m4"]);
    expect(s.timeline({ query: "m5" }).anchor).toBe(ids[4]);
    expect(s.timeline({ anchor: 9999 }).anchor).toBeNull();
  });
  test("list filters, pins sort first, pagination counts", () => {
    const s = new HubStore(":memory:");
    for (let i = 0; i < 5; i++) s.add(mem({ title: `t${i}`, narrative: `x${i}`, createdAtEpoch: 100 + i }));
    const pin = s.add(mem({ title: "pinned", narrative: "p", pinned: true, createdAtEpoch: 1 }));
    const page = s.list({ limit: 2 });
    expect(page.total).toBe(6);
    expect(page.items[0].id).toBe(pin.id);
    expect(s.list({ limit: 2, offset: 2 }).items.length).toBe(2);
    expect(s.list({ pinned: true }).total).toBe(1);
  });
  test("merging projects keeps one copy of identical memories", () => {
    const s = new HubStore(":memory:");
    s.add(mem({ project: "a" }));
    s.add(mem({ project: "b" }));
    s.add(mem({ project: "b", title: "only in b", narrative: "z" }));
    expect(s.mergeProjects("b", "a")).toEqual({ moved: 1, dropped: 1 });
    expect(s.projects().map((p) => [p.name, p.memories])).toEqual([["a", 2]]);
    expect(() => s.mergeProjects("a", "a")).toThrow();
  });
  test("context gives pinned, recent and rules, and honours the tool filter and size cap", () => {
    const s = new HubStore(":memory:");
    s.add(mem({ pinned: true }));
    s.add(mem({ title: "recent one", narrative: "r" }));
    s.rules.add({ then: "Always run tests" });
    s.rules.add({ then: "Cursor only rule", tools: ["cursor"] });
    const ctx = s.context({ project: "shop", tool: "claude-code" });
    expect(ctx).toContain("## Pinned");
    expect(ctx).toContain("## Recent");
    expect(ctx).toContain("- Always run tests");
    expect(ctx).not.toContain("Cursor only rule");
    expect(s.context({ project: "shop", tool: "cursor" })).toContain("Cursor only rule");
    expect(s.context({ project: "shop", maxChars: 40 }).length).toBeLessThanOrEqual(40);
  });
});

describe("store: rules", () => {
  test("add validates, dedupes, updates, removes", () => {
    const s = new HubStore(":memory:");
    expect(() => s.rules.add({ then: "  " })).toThrow(/Write the rule/);
    expect(() => s.rules.add({ then: "x", scopeTier: "project", scopeName: " " })).toThrow(/Name the project/);
    const r = s.rules.add({ then: "Use pnpm", scopeTier: "project", scopeName: "shop" });
    expect(s.rules.add({ then: "use PNPM", scopeTier: "project", scopeName: "shop" })).toEqual({ id: r.id, created: false });
    expect(s.rules.update(r.id, { enabled: false }).enabled).toBe(false);
    expect(s.rules.remove(r.id)).toBe(true);
    expect(s.rules.get(r.id)).toBeNull();
  });
});

describe("bundles: export and import", () => {
  test("a bundle round-trips into an empty store, twice without duplicates", () => {
    const a = new HubStore(":memory:");
    a.add(mem({ pinned: true, facts: ["f1"], files: ["a.ts"] }));
    a.add(mem({ title: "Second", narrative: "two", project: "api", tool: "codex" }));
    a.add(mem({ title: "raw", kind: "event", narrative: "noise" }));
    a.rules.add({ then: "Be terse", tools: ["claude-code"] });
    const text = a.exportBundle();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: "manifest", format: "aletheia-bundle", version: 1, counts: { memories: 2, rules: 1 } });
    expect(lines.some((l) => l.title === "raw")).toBe(false);
    const b = new HubStore(":memory:");
    expect(b.importBundle(text)).toMatchObject({ memories: { added: 2, skipped: 0 }, rules: { added: 1, skipped: 0 }, errors: [] });
    expect(b.importBundle(text)).toMatchObject({ memories: { added: 0, skipped: 2 }, rules: { added: 0, skipped: 1 } });
    const copy = b.list({ project: "shop" }).items[0];
    expect(copy).toMatchObject({ pinned: true, facts: ["f1"], files: ["a.ts"], tool: "claude-code" });
    expect(b.rules.list()[0].tools).toEqual(["claude-code"]);
  });
  test("raw events are included only when asked", () => {
    const a = new HubStore(":memory:");
    a.add(mem({ kind: "event", title: "ev", narrative: "x" }));
    expect(a.exportBundle().includes('"ev"')).toBe(false);
    expect(a.exportBundle({ includeEvents: true }).includes('"ev"')).toBe(true);
  });
  test("a non-bundle, a newer version and bad lines are handled", () => {
    const s = new HubStore(":memory:");
    expect(() => s.importBundle("hello")).toThrow(/Not an aletheia bundle/);
    expect(() => s.importBundle('{"type":"manifest","format":"other"}')).toThrow(/missing manifest/);
    expect(() => s.importBundle('{"type":"manifest","format":"aletheia-bundle","version":99}')).toThrow(/newer/);
    const r = s.importBundle('{"type":"manifest","format":"aletheia-bundle","version":1}\nnot json\n{"type":"memory"}\n');
    expect(r.errors.length).toBe(2);
  });
  test("markdown export is readable and leaves out prompts and events", () => {
    const s = new HubStore(":memory:");
    s.add(mem());
    s.add(mem({ kind: "prompt", title: "a prompt", narrative: "hidden" }));
    s.rules.add({ then: "Be terse" });
    const md = s.exportMarkdown();
    expect(md).toContain("## Rules");
    expect(md).toContain("### Retry uses exponential backoff");
    expect(md).not.toContain("a prompt");
  });
});

describe("rules sync", () => {
  const rules = [
    { id: "1", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "Run the tests first", tools: null },
    { id: "2", enabled: true, scopeTier: "project", scopeName: "shop", when: "editing checkout", then: "Keep PRs small", tools: null },
    { id: "3", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "Cursor only", tools: ["cursor"] },
    { id: "4", enabled: false, scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "Disabled", tools: null },
  ];
  test("render groups by scope, filters by tool, drops disabled", () => {
    const md = renderRules(rules, "claude-code").markdown;
    expect(md).toContain("## Everywhere\n\n- Run the tests first");
    expect(md).toContain("## In shop\n\n- When editing checkout: keep PRs small");
    expect(md).not.toContain("Cursor only");
    expect(md).not.toContain("Disabled");
    expect(renderRules(rules, "cursor").markdown).toContain("Cursor only");
  });
  test("a managed block is appended, replaced in place, and never touches the user's text", () => {
    const user = "# My project\n\nHand-written notes.\n";
    const once = applyBlock(user, "# Rules\n\n- A\n");
    expect(once.startsWith(user)).toBe(true);
    expect(once).toContain(MARK_BEGIN);
    const twice = applyBlock(once, "# Rules\n\n- B\n");
    expect(twice).toContain("- B");
    expect(twice).not.toContain("- A");
    expect(twice.startsWith(user)).toBe(true);
    expect(applyBlock(twice, "# Rules\n\n- B\n")).toBe(twice); // idempotent
    expect(removeBlock(twice).trim()).toBe(user.trim());
    expect(applyBlock("", "x").startsWith(MARK_BEGIN)).toBe(true);
  });
  test("syncTool previews without writing, then writes with a backup and is idempotent", () => {
    const dir = makeFixture().makeDir("proj");
    const home = makeFixture().makeDir("home");
    writeFileSync(join(dir, "AGENTS.md"), "# Mine\n");
    const preview = syncTool(rules, "codex", { scope: "project", projectDir: dir, home, dryRun: true });
    expect(preview).toMatchObject({ changed: true, written: false, rules: 2 });
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("# Mine\n");
    const wrote = syncTool(rules, "codex", { scope: "project", projectDir: dir, home, dryRun: false });
    expect(wrote.written).toBe(true);
    expect(wrote.backup).toMatch(/AGENTS\.md\.aletheia-.*\.bak$/);
    expect(readFileSync(wrote.backup, "utf8")).toBe("# Mine\n");
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("Run the tests first");
    expect(syncTool(rules, "codex", { scope: "project", projectDir: dir, home, dryRun: false })).toMatchObject({ changed: false, written: false });
  });
  test("each tool gets its own file; Cursor's is a whole .mdc with frontmatter; a tool with no global file is skipped", () => {
    const dir = makeFixture().makeDir("proj2");
    const home = makeFixture().makeDir("home2");
    const names = {};
    for (const t of TOOLS) {
      const r = syncTool(rules, t.id, { scope: "project", projectDir: dir, home, dryRun: false });
      names[t.id] = r.path.replace(dir, "");
    }
    expect(names).toMatchObject({ "claude-code": "/CLAUDE.md", codex: "/AGENTS.md", "gemini-cli": "/GEMINI.md", cursor: "/.cursor/rules/aletheia.mdc", windsurf: "/.windsurf/rules/aletheia.md", copilot: "/.github/copilot-instructions.md", aider: "/CONVENTIONS.md" });
    expect(readFileSync(join(dir, ".windsurf/rules/aletheia.md"), "utf8")).toMatch(/^---\ntrigger: always_on\n---\n\n<!-- aletheia:rules:begin -->/);
    expect(readFileSync(join(dir, ".cursor/rules/aletheia.mdc"), "utf8")).toMatch(/^---\ndescription:.*\nalwaysApply: true\n---\n/);
    expect(syncTool(rules, "cursor", { scope: "global", home, dryRun: true }).skipped).toMatch(/no global rules file/);
    expect(() => syncTool(rules, "nope", { scope: "project", projectDir: dir, home })).toThrow(/Unknown tool/);
    expect(() => syncTool(rules, "codex", { scope: "project", home })).toThrow(/project folder/);
  });
  test("global scope writes under HOME", () => {
    const home = makeFixture().makeDir("home3");
    const r = syncTool(rules, "claude-code", { scope: "global", home, dryRun: false });
    expect(r.path).toBe(join(home, ".claude/CLAUDE.md"));
    expect(existsSync(r.path)).toBe(true);
  });
  test("rules are parsed back out of a managed block, or a plain file, with scopes", () => {
    const text = applyBlock("- outside, ignored\n", renderRules(rules, "claude-code").markdown);
    const found = parseRulesFromText(text);
    expect(found.map((r) => r.then)).toEqual(["Run the tests first", "keep PRs small"]);
    expect(found[1]).toMatchObject({ when: "editing checkout", scopeTier: "project", scopeName: "shop" });
    expect(parseRulesFromText("# Notes\n- Prefer small functions\n* Name things well\n").map((r) => r.then)).toEqual(["Prefer small functions", "Name things well"]);
  });
});

describe("tools: detection and MCP connection", () => {
  const argv = ["/usr/bin/bun", "/opt/wv/bin/mcp.mjs"];
  test("detection follows what exists in HOME", () => {
    const home = makeFixture().makeDir("h");
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".gemini"));
    const d = Object.fromEntries(detectTools(home).map((t) => [t.id, t.installed]));
    expect(d).toMatchObject({ cursor: true, "gemini-cli": true, "claude-code": false, codex: false });
  });
  test("JSON tools: plan, connect (backup + merge keeping other servers), and idempotence", () => {
    const home = makeFixture().makeDir("h2");
    mkdirSync(join(home, ".cursor"));
    writeFileSync(join(home, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const cursor = toolById("cursor");
    expect(mcpPlan(cursor, home, argv)).toMatchObject({ connected: false, key: "mcpServers" });
    const r = applyMcp(cursor, home, argv);
    expect(r.written).toBe(true);
    expect(existsSync(r.backup)).toBe(true);
    const doc = JSON.parse(readFileSync(join(home, ".cursor/mcp.json"), "utf8"));
    expect(doc.mcpServers.other).toEqual({ command: "x" });
    expect(doc.mcpServers["aletheia"]).toEqual({ command: "/usr/bin/bun", args: ["/opt/wv/bin/mcp.mjs"] });
    expect(applyMcp(cursor, home, argv).written).toBe(false);
    expect(mcpPlan(cursor, home, argv).connected).toBe(true);
  });
  test("a config file that is not valid JSON is refused, not overwritten", () => {
    const home = makeFixture().makeDir("h3");
    mkdirSync(join(home, ".gemini"));
    writeFileSync(join(home, ".gemini/settings.json"), "{ not json");
    expect(() => applyMcp(toolById("gemini-cli"), home, argv)).toThrow(/not valid JSON/);
    expect(readFileSync(join(home, ".gemini/settings.json"), "utf8")).toBe("{ not json");
  });
  test("Windsurf: uses whichever of its two documented config files exists", () => {
    const old = makeFixture().makeDir("w1");
    mkdirSync(join(old, ".codeium/windsurf"), { recursive: true });
    expect(mcpPlan(toolById("windsurf"), old, argv).path).toBe(join(old, ".codeium/windsurf/mcp_config.json"));
    const neu = makeFixture().makeDir("w2");
    mkdirSync(join(neu, ".config/devin"), { recursive: true });
    writeFileSync(join(neu, ".config/devin/mcp_config.json"), "{}");
    expect(mcpPlan(toolById("windsurf"), neu, argv).path).toBe(join(neu, ".config/devin/mcp_config.json"));
    applyMcp(toolById("windsurf"), neu, argv);
    expect(JSON.parse(readFileSync(join(neu, ".config/devin/mcp_config.json"), "utf8")).mcpServers["aletheia"]).toBeTruthy();
    expect(existsSync(join(neu, ".codeium"))).toBe(false); // nothing created in the other location
  });
  test("Codex gets a TOML block appended; OpenCode its own shape; Claude Code a command", () => {
    const home = makeFixture().makeDir("h4");
    mkdirSync(join(home, ".codex"));
    writeFileSync(join(home, ".codex/config.toml"), 'model = "x"\n');
    applyMcp(toolById("codex"), home, argv);
    const toml = readFileSync(join(home, ".codex/config.toml"), "utf8");
    expect(toml).toContain('model = "x"');
    expect(toml).toContain("[mcp_servers.aletheia]");
    expect(toml).toContain('args = ["/opt/wv/bin/mcp.mjs"]');
    applyMcp(toolById("opencode"), home, argv);
    expect(JSON.parse(readFileSync(join(home, ".config/opencode/opencode.json"), "utf8")).mcp["aletheia"]).toEqual({ type: "local", command: argv, enabled: true });
    expect(mcpPlan(toolById("claude-code"), home, argv).command).toContain("claude mcp add");
    expect(() => applyMcp(toolById("claude-code"), home, argv)).toThrow(/command/);
    expect(mcpPlan(toolById("aider"), home, argv).supported).toBe(false);
  });
});

describe("capture: redaction and normalisation", () => {
  test("secrets and <private> never survive", () => {
    const text = "key sk-ant-api03-abcdefghijklmnopqrstuvwx and ghp_abcdefghijklmnopqrstuvwxyz0123456789 and AKIAABCDEFGHIJKLMNOP; password=hunter22 <private>my ssn</private> Authorization: Bearer abcdefghijklmnop12345";
    const out = redact(text);
    for (const secret of ["sk-ant-api03", "ghp_abcdef", "AKIAABCDEF", "hunter22", "my ssn", "abcdefghijklmnop12345"]) expect(out).not.toContain(secret);
    expect(out).toContain("[private]");
    expect(redact("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----")).toBe("[redacted:private-key]");
  });
  test("a Claude Code style prompt and tool event become memories; noise is dropped", () => {
    const p = normalizeHook({ hook_event_name: "UserPromptSubmit", prompt: "Add a retry button please", session_id: "s1", cwd: "/tmp" }, { tool: "claude-code", project: "shop" });
    expect(p).toMatchObject({ kind: "prompt", title: "Add a retry button please", project: "shop", tool: "claude-code", sessionId: "s1" });
    const e = normalizeHook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: "ok 12 passed", session_id: "s1" }, { tool: "codex", project: "shop" });
    expect(e).toMatchObject({ kind: "event", type: "event", title: "Bash: npm test", tool: "codex" });
    expect(normalizeHook({ tool_name: "TodoWrite", tool_input: {} }, {})).toBeNull();
    expect(normalizeHook({ prompt: "hi" }, {})).toBeNull();
    expect(normalizeHook(null, {})).toBeNull();
    expect(normalizeHook({ title: "Decision", text: "use sqlite", project: "x" }, { tool: "cursor" })).toMatchObject({ kind: "observation", title: "Decision", narrative: "use sqlite" });
  });
});

describe("MCP server", () => {
  const store = new HubStore(":memory:");
  const ctx = { store, tool: undefined, cwd: "/tmp" };
  const rpc = (method, params, id = 1) => handleMessage({ jsonrpc: "2.0", id, method, params }, ctx);
  test("initialize negotiates, lists seven tools, and notifications get no reply", () => {
    const init = rpc("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "cursor" } });
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "aletheia" }, capabilities: { tools: {} } });
    expect(ctx.tool).toBe("cursor");
    expect(rpc("initialize", { protocolVersion: "1999-01-01" }).result.protocolVersion).toBe("2025-11-25");
    expect(rpc("initialize", { protocolVersion: "2024-11-05" }).result.protocolVersion).toBe("2024-11-05");
    expect(rpc("tools/list").result.tools.map((t) => t.name)).toEqual(["search", "timeline", "get_observations", "save_memory", "session_start_context", "fact_history", "list_rules", "add_rule", "dismiss_memory", "restore_memory"]);
    expect(handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    expect(rpc("nope").error.code).toBe(-32601);
    expect(handleMessage({ id: 1 }, ctx).error.code).toBe(-32600);
  });
  test("the 3-layer flow works across tools: one saves, another finds, fetches and sees context", () => {
    const call = (name, args) => rpc("tools/call", { name, arguments: args }).result.content[0].text;
    expect(call("save_memory", { text: "Webhook retries must be idempotent; use the event id as key", title: "Idempotent webhooks", project: "shop", type: "gotcha", pinned: true })).toMatch(/Saved as #1/);
    expect(call("save_memory", { text: "Webhook retries must be idempotent; use the event id as key", title: "Idempotent webhooks", project: "shop", type: "gotcha" })).toMatch(/Already saved as #1/);
    expect(call("search", { query: "webhook" })).toMatch(/#1 .*\[gotcha\] Idempotent webhooks/);
    expect(call("get_observations", { ids: [1] })).toContain("use the event id as key");
    expect(call("timeline", { anchor: 1 })).toContain("→ #1");
    expect(call("session_start_context", { project: "shop" })).toContain("Idempotent webhooks");
    expect(call("add_rule", { then: "Never log tokens" })).toMatch(/Rule saved/);
    expect(call("list_rules", {})).toContain("Never log tokens");
  });
  test("secrets are redacted before saving, bad input is an error result, unknown tools too", () => {
    const r = callTool("save_memory", { text: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked" }, ctx);
    expect(r.content[0].text).toMatch(/Saved as/);
    const id = Number(/#(\d+)/.exec(r.content[0].text)[1]);
    expect(store.get(id).narrative).not.toContain("ghp_abcdef");
    expect(callTool("search", {}, ctx).isError).toBe(true);
    expect(callTool("get_observations", { ids: [] }, ctx).isError).toBe(true);
    expect(callTool("nope", {}, ctx).isError).toBe(true);
  });
  test("the stdio entry point speaks the protocol end to end", async () => {
    const dir = makeFixture().dir;
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "bin", "mcp.mjs")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, ALETHEIA_HUB_DB: join(dir, "mcp.db"), ALETHEIA_DATA_DIR: dir, ALETHEIA_TOOL: "e2e" } });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } })}\n`);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "save_memory", arguments: { text: "stdio works", project: "p" } } })}\n`);
    proc.stdin.end();
    const out = (await new Response(proc.stdout).text()).trim().split("\n").map((l) => JSON.parse(l));
    await proc.exited;
    expect(out.length).toBe(2); // the notification got no reply
    expect(out[0].result.serverInfo.name).toBe("aletheia");
    expect(out[1].result.content[0].text).toMatch(/Saved as #1 in p/);
    expect(new HubStore(join(dir, "mcp.db")).get(1).tool).toBe("e2e");
  });
});

describe("import from claude-mem", () => {
  test("observations, summaries and prompts arrive with their tool and are not duplicated on a second run", () => {
    const fx = makeFixture();
    const s = new HubStore(":memory:");
    const first = importClaudeMem(s, fx.dbPath);
    expect(first.observations.added).toBeGreaterThan(0);
    expect(first.summaries.added).toBe(1);
    expect(first.prompts.added).toBeGreaterThanOrEqual(4);
    const second = importClaudeMem(s, fx.dbPath);
    expect(second.observations.added + second.summaries.added + second.prompts.added).toBe(0);
    const o = s.list({ kind: "observation", q: "RetryButton" }).items[0];
    expect(o).toMatchObject({ project: "shop", tool: "claude", kind: "observation" });
    expect(o.origin).toMatch(/^claude-mem:obs:\d+$/);
    expect(s.list({ kind: "summary" }).items[0].narrative).toContain("**Completed.** RetryButton shipped behind a flag");
    expect(importClaudeMem(new HubStore(":memory:"), fx.dbPath, { includePrompts: false }).prompts.added).toBe(0);
    expect(() => importClaudeMem(s, "/nope/missing.db")).toThrow(/No claude-mem database/);
  });
});

describe("compress", () => {
  test("validates a model's observations strictly", () => {
    expect(() => validateObservations({})).toThrow(/array/);
    expect(() => validateObservations({ observations: [{ type: "bad", title: "t", narrative: "n" }] })).toThrow(/type/);
    expect(() => validateObservations({ observations: Array(6).fill({ type: "bugfix", title: "t", narrative: "n" }) })).toThrow(/At most 5/);
    expect(validateObservations({ observations: [{ type: "bugfix", title: "t", narrative: "n", facts: ["a", 3] }] })[0].facts).toEqual(["a"]);
  });
  test("raw events become observations once; the watermark prevents reprocessing; a refusal is retried", async () => {
    const s = new HubStore(":memory:");
    for (const [i, t] of ["Bash: npm test", "Edit: src/pay.ts"].entries()) s.add({ project: "shop", kind: "event", title: t, narrative: "x", tool: "codex", createdAtEpoch: 10 + i });
    let calls = 0;
    const ask = async () => (++calls === 1 ? "garbage" : JSON.stringify({ observations: [{ type: "bugfix", title: "Fixed pay retry", narrative: "Retry loop used wrong delay", files: ["src/pay.ts"] }] }));
    const r = await compressRecent(s, ask, { project: "shop" });
    expect(r).toMatchObject({ read: 2, added: 1 });
    expect(calls).toBe(2);
    expect(s.list({ kind: "observation" }).items[0]).toMatchObject({ title: "Fixed pay retry", tool: "codex", project: "shop" });
    expect(await compressRecent(s, ask, { project: "shop" })).toMatchObject({ read: 0, added: 0 });
  });
  test("two refusals fail loudly and move nothing", async () => {
    const s = new HubStore(":memory:");
    s.add({ project: "p", kind: "event", title: "x", narrative: "y", tool: "t" });
    await expect(compressRecent(s, async () => "no", { project: "p" })).rejects.toThrow(/compress:/);
    expect(s.setting("compress.watermark.p", 0)).toBe(0);
  });
});

describe("HTTP: hub routes, /v1 and the UI", () => {
  let app, base, cfg, home, rulesDir;
  const fx = makeFixture();
  beforeAll(() => {
    home = fx.makeDir("home");
    rulesDir = fx.makeDir("proj");
    mkdirSync(join(home, ".cursor"));
    cfg = loadConfig({ port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "o.db"), reviewDb: join(fx.dir, "r.db"), hubDb: join(fx.dir, "hub.db"), ledgerDir: fx.makeDir("ledger"), humanCopyCache: join(fx.dir, "hc.json"), rulesFile: join(fx.dir, "R.md"), claudeInstructionsFile: join(fx.dir, "C.md"), provider: "none", extra: { home } });
    app = startServer(cfg);
    base = `http://127.0.0.1:${app.server.port}`;
  });
  afterAll(() => app.stop());
  const get = (p, init) => fetch(`${base}${p}`, init);
  const send = (p, body, method = "POST", headers = {}) => fetch(`${base}${p}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

  test("the Hub UI is served, and never uses innerHTML", async () => {
    const res = await get("/hub");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Memory Hub");
    expect((await get("/hub/app.js")).headers.get("content-type")).toContain("javascript");
    expect((await get("/hub/..%2fpackage.json")).status).toBe(404);
    const source = readFileSync(join(import.meta.dir, "..", "public-hub", "app.js"), "utf8");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    // Regression: the null-safe helper must call the DOM method, not itself (it once recursed forever).
    expect(/const swap = \(el, \.\.\.kids\) => el\.replaceChildren\(/.test(source)).toBe(true);
    // The module must at least parse.
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(source)).not.toThrow();
  });
  test("/api/hub is local-only and /v1 needs the key when one is set", async () => {
    expect((await get("/api/hub/overview", { headers: { "X-Forwarded-For": "1.2.3.4" } })).status).toBe(403);
    expect((await send("/api/hub/memories", { text: "x" }, "POST", { Origin: "http://evil.example" })).status).toBe(403);
    expect((await fetch(`${base}/api/hub/memories`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status).toBe(403);
    const keyed = startServer({ ...cfg, port: 0, apiKey: "sekret", hubDb: join(fx.dir, "hub-keyed.db"), overlayDb: join(fx.dir, "o2.db"), reviewDb: join(fx.dir, "r2.db") });
    const kb = `http://127.0.0.1:${keyed.server.port}`;
    expect((await fetch(`${kb}/v1/info`)).status).toBe(401);
    expect((await fetch(`${kb}/v1/info`, { headers: { Authorization: "Bearer sekret" } })).status).toBe(200);
    keyed.stop();
  });
  test("/v1: save from one tool, search from another, context, events with redaction", async () => {
    const saved = await send("/v1/memories", { project: "shop", title: "Use idempotency keys", text: "All payment POSTs carry an idempotency key", type: "decision" }, "POST", { "X-Tool": "cursor" });
    expect(saved.status).toBe(201);
    const { id } = await saved.json();
    expect((await send("/v1/memories", { project: "shop", title: "Use idempotency keys", text: "All payment POSTs carry an idempotency key", type: "decision" })).status).toBe(200);
    const found = await (await send("/v1/search", { query: "idempotency" })).json();
    expect(found.results[0]).toMatchObject({ id, tool: "cursor", type: "decision" });
    expect((await (await get(`/v1/memories/${id}`)).json()).narrative).toContain("idempotency key");
    expect((await (await send("/v1/context", { project: "shop" })).json()).context).toContain("Use idempotency keys");
    const ev = await (await send("/v1/events", { tool: "codex", project: "shop", payload: { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x" }, tool_response: "ok" } })).json();
    expect(ev.stored).toBe(true);
    const stored = await (await get(`/v1/memories/${ev.id}`)).json();
    expect(JSON.stringify(stored)).not.toContain("abcdefghijklmnop12345");
    expect((await send("/v1/search", {})).status).toBe(400);
    expect((await send("/v1/events", { payload: { tool_name: "TodoWrite" } })).json()).resolves.toMatchObject({ stored: false });
  });
  test("/api/hub/context is the unwrapped read API, /v1/context is wrapped", async () => {
    const hubContext = await (await get("/api/hub/context?project=shop")).json();
    expect(hubContext.context).toContain("Use idempotency keys");
    expect(hubContext.context).not.toContain("<aletheia-memory>");
    const v1Context = await (await send("/v1/context", { project: "shop" })).json();
    expect(v1Context.context).toContain("<aletheia-memory>");
  });
  test("memory CRUD, filters and projects", async () => {
    const created = await (await send("/api/hub/memories", { title: "Note A", text: "hello world", project: "docs" })).json();
    expect(created.created).toBe(true);
    const id = created.id;
    expect((await (await send(`/api/hub/memories/${id}`, { pinned: true, title: "Note A2" }, "PATCH")).json())).toMatchObject({ pinned: true, title: "Note A2" });
    const list = await (await get("/api/hub/memories?project=docs&q=hello")).json();
    expect(list.total).toBe(1);
    expect((await (await get("/api/hub/projects")).json()).projects.map((p) => p.name)).toContain("docs");
    expect((await send(`/api/hub/memories/${id}`, undefined, "DELETE")).status).toBe(200);
    expect((await get(`/api/hub/memories/${id}`)).status).toBe(404);
  });
  test("rules API, preview then write, and importing back from the written file", async () => {
    await send("/api/hub/rules", { then: "Run the tests first" });
    await send("/api/hub/rules", { then: "Use pnpm", scopeTier: "project", scopeName: "shop" });
    expect((await send("/api/hub/rules", { then: " " })).status).toBe(400);
    const preview = await (await send("/api/hub/rules/preview", { tools: ["codex", "cursor"], scope: "project", projectDir: rulesDir })).json();
    expect(preview.results.map((r) => [r.tool, r.changed, r.written])).toEqual([["codex", true, false], ["cursor", true, false]]);
    expect(existsSync(join(rulesDir, "AGENTS.md"))).toBe(false);
    expect((await send("/api/hub/rules/sync", { tools: ["codex"], scope: "project", projectDir: rulesDir })).status).toBe(400); // no confirm
    expect((await send("/api/hub/rules/sync", { tools: ["codex"], scope: "project", projectDir: "relative/path", confirm: true })).status).toBe(400);
    const wrote = await (await send("/api/hub/rules/sync", { tools: ["codex", "cursor"], scope: "project", projectDir: rulesDir, confirm: true })).json();
    expect(wrote.results.every((r) => r.written)).toBe(true);
    expect(readFileSync(join(rulesDir, "AGENTS.md"), "utf8")).toContain("Run the tests first");
    const imp = await (await send("/api/hub/rules/import", { tool: "codex", scope: "project", projectDir: rulesDir })).json();
    expect(imp).toMatchObject({ found: 2, added: 0, skipped: 2 }); // already known
    expect((await send("/api/hub/rules/import", { path: "/etc/does-not-exist" })).status).toBe(400);
    const rules = (await (await get("/api/hub/rules")).json()).rules;
    expect((await send(`/api/hub/rules/${rules[0].id}`, { enabled: false }, "PATCH")).status).toBe(200);
    expect((await send(`/api/hub/rules/${rules[0].id}`, undefined, "DELETE")).status).toBe(200);
    expect((await send("/api/hub/rules/nope", { enabled: false }, "PATCH")).status).toBe(404);
  });
  test("tools API: list, preview, connect needs confirm, then writes the config", async () => {
    const tools = (await (await get("/api/hub/tools")).json()).tools;
    const cursor = tools.find((t) => t.id === "cursor");
    expect(cursor).toMatchObject({ installed: true });
    expect(cursor.mcp).toMatchObject({ connected: false, kind: "file" });
    expect((await send("/api/hub/tools/cursor/connect", { apply: true })).status).toBe(400);
    expect((await (await send("/api/hub/tools/cursor/connect", {})).json()).plan.snippet).toContain("aletheia");
    const done = await (await send("/api/hub/tools/cursor/connect", { apply: true, confirm: true })).json();
    expect(done.written).toBe(true);
    expect(JSON.parse(readFileSync(join(home, ".cursor/mcp.json"), "utf8")).mcpServers["aletheia"].args[0]).toContain("mcp.mjs");
    expect((await send("/api/hub/tools/nope/connect", {})).status).toBe(404);
  });
  test("export and import through HTTP, claude-mem import, overview and audit", async () => {
    await send("/api/hub/import/claude-mem", { path: fx.dbPath });
    const bundle = await (await get("/api/hub/export?format=jsonl")).text();
    expect(JSON.parse(bundle.split("\n")[0]).counts.memories).toBeGreaterThan(0);
    expect((await get("/api/hub/export?format=markdown")).headers.get("content-disposition")).toMatch(/\.md"$/);
    const again = await (await send("/api/hub/import/bundle", { bundle })).json();
    expect(again.memories.added).toBe(0);
    expect((await send("/api/hub/import/bundle", { bundle: "junk" })).status).toBe(400);
    const o = await (await get("/api/hub/overview")).json();
    expect(o.stats.total).toBeGreaterThan(5);
    expect(o.stats.byTool.claude).toBeGreaterThan(0);
    expect((await (await get("/api/hub/audit")).json()).audit.map((a) => a.action)).toEqual(expect.arrayContaining(["rules.sync", "tool.connect", "claude-mem.import"]));
    expect((await send("/api/hub/compress", {})).status).toBe(409); // no provider configured
  });
});
void readdirSync; void MARK_END;
