#!/usr/bin/env bun
// CI install smoke test. No model requests, loopback only.
//   npm pack the repo, install the tarball into a temp prefix, boot aletheia-server on a
//   random free port, wait for /health, and ask aletheia-mcp for its tools over stdio.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function run(cmd, args, { cwd, env } = {}) {
  const proc = Bun.spawn([cmd, ...args], {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${exitCode}\n${stdout.trim()}\n${stderr.trim()}`);
  return stdout;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, { tries = 50, delayMs = 200 } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return await response.text();
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await Bun.sleep(delayMs);
  }
  throw new Error(`/health did not return 200 after ${tries} tries (last: ${last})`);
}

async function mcpToolsList(bin, env) {
  const proc = Bun.spawn([bin], {
    env: { ...process.env, ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "aletheia-ci-smoke", version: "0.0.0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ];
  for (const message of messages) proc.stdin.write(`${JSON.stringify(message)}\n`);
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const responses = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const init = responses.find((r) => r.id === 1);
  const list = responses.find((r) => r.id === 2);
  if (!init?.result?.serverInfo || init.result.serverInfo.name !== "aletheia") {
    throw new Error(`MCP initialize failed (exit ${exitCode})\n${stdout.trim()}\n${stderr.trim()}`);
  }
  const tools = list?.result?.tools ?? [];
  const names = tools.map((tool) => tool.name);
  for (const wanted of ["search", "save_memory", "session_start_context"]) {
    if (!names.includes(wanted)) throw new Error(`MCP tools/list is missing ${wanted}; got ${names.join(", ") || "none"}`);
  }
  return { name: init.result.serverInfo.name, protocolVersion: init.result.protocolVersion, count: tools.length, names };
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "aletheia-ci-smoke-"));
  const home = join(work, "home");
  const prefix = join(work, "prefix");
  const dataDir = join(work, "data");
  let server = null;
  try {
    await run("npm", ["pack", "--silent", "--pack-destination", work], { cwd: ROOT });
    const tarball = readdirSync(work).find((name) => name.endsWith(".tgz"));
    if (!tarball) throw new Error("npm pack produced no .tgz");
    await run("npm", ["install", "--global", "--prefix", prefix, join(work, tarball)], { cwd: ROOT });

    const port = await freePort();
    const env = {
      HOME: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      ALETHEIA_DATA_DIR: dataDir,
      ALETHEIA_HOST: "127.0.0.1",
      ALETHEIA_PORT: String(port),
      ALETHEIA_PROVIDER: "none",
      ALETHEIA_AUTO_REFRESH: "false",
    };

    server = Bun.spawn([join(prefix, "bin", "aletheia-server")], {
      env: { ...process.env, ...env },
      stdout: "ignore",
      stderr: "ignore",
    });

    const health = await waitForHealth(`http://127.0.0.1:${port}/health`);
    const mcp = await mcpToolsList(join(prefix, "bin", "aletheia-mcp"), env);

    console.log(`install smoke ok: ${mcp.name} ${mcp.protocolVersion}, ${mcp.count} tools (${mcp.names.slice(0, 3).join(", ")}, …), /health -> ${health.trim()}`);
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await server.exited.catch(() => {});
    }
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`install smoke failed: ${error.message}`);
  process.exit(1);
});
