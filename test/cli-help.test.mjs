// First contact with the CLI: --help must work without touching the data directory, list every command,
// and known user errors must print one line instead of a stack trace. Uses a temp HOME and a temp data dir.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const bin = (name) => join(root, "bin", name);

afterAll(() => cleanupTempDirs());

async function run(script, args, { home = tempDir("cli-help-home-"), dataDir = tempDir("cli-help-data-"), extraEnv = {} } = {}) {
  const proc = Bun.spawn([process.execPath, bin(script), ...args], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: home,
    env: { ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: join(dataDir, "hub.db"), ALETHEIA_PORT: "0", ALETHEIA_DEBUG: "", ...extraEnv },
  });
  proc.stdin.end();
  const timer = setTimeout(() => proc.kill(), 8000);
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  return { stdout, stderr, exitCode, dataDir, home };
}

/** stderr without the one-time permission notice that a fresh data directory prints. */
const errorLines = (stderr) => stderr.trim().split("\n").filter((line) => line && !line.startsWith("aletheia: file "));

/** Command names the dispatcher handles: `cmd === "x"` guards and `case "x":` arms of the main switch. */
function dispatchedCommands() {
  const source = readFileSync(bin("aletheia.mjs"), "utf8");
  const names = new Set();
  for (const match of source.matchAll(/\bcmd === "([a-z][a-z-]*)"/g)) names.add(match[1]);
  for (const match of source.matchAll(/^ {6}case "([a-z][a-z-]*)"/gm)) names.add(match[1]);
  return [...names];
}

describe("aletheia --help", () => {
  for (const arg of ["--help", "help", "-h"]) {
    test(`${arg} exits 0, prints to stdout and creates no file`, async () => {
      const result = await run("aletheia.mjs", [arg]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("aletheia");
      expect(result.stdout).toContain("capture");
      expect(result.stderr).toBe("");
      expect(readdirSync(result.dataDir)).toEqual([]);
      expect(existsSync(join(result.dataDir, "hub.db"))).toBe(false);
    });
  }

  test("an unknown command still exits 1 on stderr", async () => {
    const result = await run("aletheia.mjs", ["nosuchcommand"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("capture");
  });

  test("every dispatched command appears in the help", async () => {
    const { stdout } = await run("aletheia.mjs", ["--help"]);
    const names = dispatchedCommands();
    expect(names.length).toBeGreaterThan(30);
    const lines = stdout.split("\n").map((line) => line.trim());
    const missing = names.filter((name) => !lines.some((line) => line.startsWith(`aletheia ${name}`)));
    expect(missing).toEqual([]);
  });

  test("the commands that were missing are listed", async () => {
    const { stdout } = await run("aletheia.mjs", ["--help"]);
    for (const text of ["aletheia migrate", "aletheia version", "rules suggest", "rules suggestions", "--scope list"]) expect(stdout).toContain(text);
  });

  test("help no longer advertises a compress --project flag the code ignores", async () => {
    const { stdout } = await run("aletheia.mjs", ["--help"]);
    const line = stdout.split("\n").find((l) => l.trim().startsWith("aletheia compress"));
    expect(line).toBeDefined();
    expect(line).not.toContain("--project");
  });
});

describe("known user errors", () => {
  test("a missing team prints one line, no stack trace", async () => {
    const result = await run("aletheia.mjs", ["team", "members", "nosuch"]);
    expect(result.exitCode).toBe(1);
    expect(errorLines(result.stderr)).toHaveLength(1);
    expect(result.stderr).toContain("That team does not exist");
    expect(result.stderr).not.toMatch(/\bat .*\.mjs/);
  });

  test("a missing claude-mem database prints one line, no stack trace", async () => {
    const result = await run("aletheia.mjs", ["import", "claude-mem", "--path", "/nonexistent/claude-mem.db"]);
    expect(result.exitCode).toBe(1);
    expect(errorLines(result.stderr)).toHaveLength(1);
    expect(result.stderr).toContain("No claude-mem database at /nonexistent/claude-mem.db");
  });

  test("--debug keeps the stack trace", async () => {
    const result = await run("aletheia.mjs", ["team", "members", "nosuch", "--debug"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/\bat .*\.mjs/);
  });

  test("ALETHEIA_DEBUG=1 keeps the stack trace", async () => {
    const result = await run("aletheia.mjs", ["team", "members", "nosuch"], { extraEnv: { ALETHEIA_DEBUG: "1" } });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/\bat .*\.mjs/);
  });
});

describe("aletheia-server --help", () => {
  for (const arg of ["--help", "-h"]) {
    test(`${arg} prints usage, exits 0 and does not start the server`, async () => {
      const result = await run("aletheia-server.mjs", [arg]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("aletheia-server");
      expect(result.stdout).toContain("--behind-tls");
      expect(result.stdout).not.toContain("listening on");
      expect(readdirSync(result.dataDir)).toEqual([]);
    });
  }
});
