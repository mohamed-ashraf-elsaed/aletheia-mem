// `aletheia folder-context <dir>` is an explicit command: a dry run by default that writes nothing, and --write that
// changes only the managed block. The whole run uses a temp HOME and a temp data dir, so no real user state is touched.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const home = tempDir("folder-ctx-cli-home-");
const dataDir = tempDir("folder-ctx-cli-data-");
const project = tempDir("folder-ctx-cli-project-");
const dbPath = join(dataDir, "hub.db");
const BEGIN = "<!-- aletheia:folder-context:begin -->";
const END = "<!-- aletheia:folder-context:end -->";

afterAll(() => cleanupTempDirs());

function env() {
  return { ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath, ALETHEIA_PORT: "0" };
}

async function run(args) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: project, env: env() });
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

/** Every file under the project, with its content, so a change or a new file both show up. */
function snapshot() {
  const out = {};
  const walk = (dir, prefix = "") => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        out[`${rel}/`] = null;
        walk(full, rel);
      } else {
        out[rel] = readFileSync(full, "utf8");
      }
    }
  };
  walk(project);
  return out;
}

beforeAll(() => {
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, "docs"), { recursive: true });
  writeFileSync(join(project, "src", "auth.ts"), "export const login = () => true;\n");
  writeFileSync(join(project, "README.md"), "# Shop\n");
  const store = new HubStore(dbPath);
  store.add({ project: "shop", type: "decision", title: "use bcrypt for passwords", files: ["src/auth.ts"] }, { actor: "test" });
  store.add({ project: "shop", type: "gotcha", title: "never log tokens", files: ["src/auth.ts"] }, { actor: "test" });
  store.close();
});

describe("aletheia folder-context", () => {
  test("dry run prints the files and block it would write, and writes nothing", async () => {
    const before = snapshot();
    const result = await run(["folder-context", project, "--project", "shop"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("src/CLAUDE.md");
    expect(result.stdout).toContain("use bcrypt for passwords");
    expect(result.stdout).toContain("never log tokens");
    expect(result.stdout).toContain("Dry run");
    expect(result.stdout).toContain("--write");
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(project, "src", "CLAUDE.md"))).toBe(false);
  });

  test("--write creates the file only for a folder with memories", async () => {
    const result = await run(["folder-context", project, "--project", "shop", "--write"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Wrote");
    const text = readFileSync(join(project, "src", "CLAUDE.md"), "utf8");
    expect(text).toContain(BEGIN);
    expect(text).toContain("use bcrypt for passwords");
    expect(text).toContain(END);
    expect(existsSync(join(project, "docs", "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(project, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
  });

  test("--write keeps user text outside the managed block and replaces only the block", async () => {
    const path = join(project, "src", "CLAUDE.md");
    const userTop = "# Auth notes\n\nHand-written: call the bcrypt helper, not the raw hash.\n";
    const userBottom = "\nTrailing user text that must survive.\n";
    writeFileSync(path, `${userTop}\n${BEGIN}\nstale generated line\n${END}\n${userBottom}`);

    const result = await run(["folder-context", project, "--project", "shop", "--write"]);
    expect(result.exitCode).toBe(0);
    const text = readFileSync(path, "utf8");
    expect(text.startsWith(userTop)).toBe(true);
    expect(text).toContain(userBottom.trim());
    expect(text).not.toContain("stale generated line");
    expect(text).toContain("use bcrypt for passwords");
    expect(text.split(BEGIN).length - 1).toBe(1);
  });

  test("a dry run over an existing file leaves it byte-identical", async () => {
    const path = join(project, "src", "CLAUDE.md");
    writeFileSync(path, `# Mine\n\n${BEGIN}\nold\n${END}\n`);
    const original = readFileSync(path, "utf8");
    const result = await run(["folder-context", project, "--project", "shop"]);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  test("a project with no memories reports that and writes nothing", async () => {
    const empty = tempDir("folder-ctx-cli-empty-");
    const result = await run(["folder-context", empty, "--project", "nobody-has-memories", "--write"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No memories");
    expect(readdirSync(empty)).toEqual([]);
  });
});
