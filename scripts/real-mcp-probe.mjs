#!/usr/bin/env bun
// Real MCP probe (maintainer-only, run by hand: bun scripts/real-mcp-probe.mjs).
// No model request, no real-home write. For every installed host CLI, it installs the
// aletheia config into a temp HOME, asks the real tool to list its MCP servers, uninstalls,
// and proves the real HOME was untouched before and after.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const ALE_THEIA = join(ROOT, "bin", "aletheia.mjs");
const REAL_HOME = homedir();

const PROBES = [
  { id: "claude-code", name: "Claude Code", bin: "claude", list: ["mcp", "list"] },
  { id: "command-code", name: "Command Code", bin: "command-code", list: ["mcp", "list"] },
  { id: "codex", name: "Codex CLI", bin: "codex", list: ["mcp", "list"] },
  { id: "gemini-cli", name: "Gemini CLI", bin: "gemini", list: ["mcp", "list"] },
  { id: "opencode", name: "OpenCode", bin: "opencode", list: ["mcp", "list"] },
];

const REAL_FILES = [
  ".claude.json",
  ".claude/settings.json",
  ".claude/CLAUDE.md",
  ".commandcode/mcp.json",
  ".commandcode/settings.json",
  ".commandcode/AGENTS.md",
  ".codex/config.toml",
  ".codex/hooks.json",
  ".codex/AGENTS.md",
  ".gemini/settings.json",
  ".gemini/GEMINI.md",
  ".config/opencode/opencode.json",
  ".config/opencode/AGENTS.md",
].map((p) => join(REAL_HOME, p));

function fileFingerprint(path) {
  if (!existsSync(path)) return "absent";
  try {
    const hash = createHash("sha256");
    hash.update(readFileSync(path));
    return hash.digest("hex");
  } catch {
    return "unreadable";
  }
}

const snapshot = () => Object.fromEntries(REAL_FILES.map((p) => [p, fileFingerprint(p)]));

function run(cmd, args, { env, cwd = ROOT } = {}) {
  const proc = Bun.spawnSync([cmd, ...args], {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const decode = (bytes) => new TextDecoder().decode(bytes ?? new Uint8Array());
  return { cmd: [cmd, ...args].join(" "), stdout: decode(proc.stdout), stderr: decode(proc.stderr), exitCode: proc.exitCode };
}

function which(bin) {
  return Bun.which(bin) || null;
}

async function probe(probe) {
  const work = mkdtempSync(join(tmpdir(), "mcp-probe-"));
  const home = join(work, "home");
  const dataDir = join(work, "data");
  const env = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: join(work, "runtime"),
    ALETHEIA_DATA_DIR: dataDir,
    ALETHEIA_PROVIDER: "none",
    ALETHEIA_AUTO_REFRESH: "false",
  };
  const result = {
    tool: probe.id,
    name: probe.name,
    bin: probe.bin,
    path: which(probe.bin),
    version: null,
    installCommand: null,
    listCommand: null,
    sawAletheia: false,
    listOutput: "",
    listError: "",
    uninstallCommand: null,
    forceNeeded: false,
    forceCommand: null,
    restored: null,
    realHomeUntouched: null,
    note: null,
  };

  if (!result.path) {
    result.note = "CLI not on PATH; skipped";
    rmSync(work, { recursive: true, force: true });
    return result;
  }

  const before = snapshot();
  try {
    const version = await run(probe.bin, ["--version"], { env });
    result.version = (version.stdout || version.stderr).trim().split("\n")[0] || null;

    const installed = await run(process.execPath, [ALE_THEIA, "install", probe.id, "--write"], { env });
    result.installCommand = installed.cmd;

    const listed = await run(probe.bin, probe.list, { env });
    result.listCommand = listed.cmd;
    result.listOutput = listed.stdout.trim();
    result.listError = listed.stderr.trim();
    result.sawAletheia = /\baletheia\b/i.test(`${listed.stdout}\n${listed.stderr}`);

    const uninstalled = await run(process.execPath, [ALE_THEIA, "uninstall", probe.id, "--write"], { env });
    result.uninstallCommand = uninstalled.cmd;
    result.forceNeeded = uninstalled.exitCode !== 0;
    if (result.forceNeeded) {
      const forced = await run(process.execPath, [ALE_THEIA, "uninstall", probe.id, "--write", "--force"], { env });
      result.forceCommand = forced.cmd;
    }

    const manifest = join(dataDir, "install-manifest.json");
    if (existsSync(manifest)) {
      const doc = JSON.parse(readFileSync(manifest, "utf8"));
      result.restored = !doc.tools?.[probe.id];
    } else {
      result.restored = true;
    }
  } finally {
    const after = snapshot();
    result.realHomeUntouched = JSON.stringify(before) === JSON.stringify(after);
    rmSync(work, { recursive: true, force: true });
  }
  return result;
}

async function main() {
  const report = { date: new Date().toISOString().slice(0, 10), realHome: REAL_HOME, results: [] };
  for (const p of PROBES) report.results.push(await probe(p));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`probe failed: ${error.message}`);
  process.exit(1);
});
