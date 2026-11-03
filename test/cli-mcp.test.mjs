// `aletheia mcp` is what an MCP Registry client runs (`npx aletheia-mem mcp`). It must serve the same MCP server as
// bin/mcp.mjs and keep stdout to JSON-RPC lines only.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const repo = join(import.meta.dir, "..");
const REQUESTS = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cli-mcp-test", version: "0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
];

function serve(args) {
  const home = tempDir("aletheia-cli-mcp-");
  const proc = Bun.spawnSync([process.execPath, ...args], {
    cwd: repo,
    stdin: new TextEncoder().encode(REQUESTS.map((r) => JSON.stringify(r)).join("\n") + "\n"),
    env: { ...process.env, HOME: home, ALETHEIA_DATA_DIR: join(home, "data"), ALETHEIA_HUB_DB: join(home, "data", "hub.db") },
    timeout: 20000,
  });
  const stdout = proc.stdout.toString();
  return { code: proc.exitCode, stdout, lines: stdout.split("\n").filter(Boolean) };
}

describe("aletheia mcp", () => {
  test("answers initialize and tools/list over stdio with JSON-RPC lines only", () => {
    const run = serve(["bin/aletheia.mjs", "mcp"]);
    expect(run.code).toBe(0);
    const messages = run.lines.map((line) => JSON.parse(line));
    expect(messages.every((m) => m.jsonrpc === "2.0")).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0].result.serverInfo.name).toBe("aletheia");
    expect(messages[1].result.tools.map((t) => t.name)).toContain("search");
  });

  test("serves the same tools as bin/mcp.mjs", () => {
    const names = (run) => JSON.parse(run.lines[1]).result.tools.map((t) => t.name);
    expect(names(serve(["bin/aletheia.mjs", "mcp"]))).toEqual(names(serve(["bin/mcp.mjs"])));
  });

  test("the usage text lists the command", () => {
    const home = tempDir("aletheia-cli-mcp-");
    const env = { ...process.env, HOME: home, ALETHEIA_DATA_DIR: join(home, "data"), ALETHEIA_HUB_DB: join(home, "data", "hub.db") };
    const usage = Bun.spawnSync([process.execPath, "bin/aletheia.mjs", "no-such-command"], { cwd: repo, env });
    expect(usage.stderr.toString()).toContain("aletheia mcp ");
  });
});
