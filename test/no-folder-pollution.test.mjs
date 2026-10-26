// T-122: prove that install and every capture path leave the project folder byte-identical.
// The whole run uses a temp HOME, a temp data dir and a temp project, so no real user state is touched.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-pollution-"));
const home = join(temp, "home");
const dataDir = join(temp, "data");
const project = join(temp, "shop");
mkdirSync(home, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(join(project, "src"), { recursive: true });
writeFileSync(join(project, "README.md"), "# Shop\n\nHand-written, must not change.\n");
writeFileSync(join(project, "src", "pay.mjs"), "export const retry = () => 3;\n");

afterAll(() => rmSync(temp, { recursive: true, force: true }));

const env = () => ({ ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: join(dataDir, "hub.db"), ALETHEIA_PORT: "0" });

async function run(args, stdin, cwd = root) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd, env: env() });
  if (stdin != null) proc.stdin.write(stdin);
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

/** Every path under the project with its type and a content hash, so a byte change or a new file both show up. */
function snapshot(dir) {
  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const rel = relative(dir, full);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(`${rel}/`);
        walk(full);
      } else {
        out.push(`${rel} ${stat.size} ${createHash("sha256").update(readFileSync(full)).digest("hex")}`);
      }
    }
  };
  walk(dir);
  return out;
}

describe("T-122: no writes into a project folder", () => {
  test("install writes under HOME only, and a full simulated session leaves the project byte-identical", async () => {
    const original = snapshot(project);
    expect(original.length).toBe(3); // README.md, src/, src/pay.mjs

    for (const tool of ["claude-code", "command-code"]) {
      const installed = await run(["install", tool, "--write"], null, project);
      expect(installed.exitCode).toBe(0);
      expect(installed.stdout).toContain("Wrote");
    }

    // The installed hook commands are the real ones, with the real project as their working directory.
    const event = (name, extra = {}) => JSON.stringify({ hook_event_name: name, cwd: project, session_id: "pollution-session", ...extra });
    const prompts = [
      ["UserPromptSubmit", event("UserPromptSubmit", { prompt: "Add a retry button and keep secrets out of it sk-ant-api03-abcdefghijklmnopqrstuvwx" })],
      ["PostToolUse", event("PostToolUse", { tool_name: "Bash", tool_input: { command: "npm test" }, tool_response: "ok" })],
      ["Stop", event("Stop", { last_assistant_message: "Finished." })],
      ["SessionEnd", event("SessionEnd")],
    ];
    for (const tool of ["claude-code", "command-code"]) {
      const settings = JSON.parse(readFileSync(join(home, tool === "claude-code" ? ".claude/settings.json" : ".commandcode/settings.json"), "utf8"));
      const commands = Object.values(settings.hooks ?? {}).flatMap((definitions) => definitions.flatMap((d) => d.hooks ?? []).map((h) => h.command));
      expect(commands.some((command) => command.includes("aletheia-managed"))).toBe(true);
      // Execute the exact command the installer wrote, not a stand-in.
      for (const command of commands) {
        const payload = command.includes("SessionStart")
          ? event("SessionStart")
          : command.includes("UserPromptSubmit")
            ? prompts[0][1]
            : command.includes("PostToolUse")
              ? prompts[1][1]
              : command.includes("Stop")
                ? prompts[2][1]
                : prompts[3][1];
        const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: project, env: env() });
        proc.stdin.write(payload);
        proc.stdin.end();
        const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        expect(exitCode).toBe(0);
        void stdout; void stderr;
      }
    }

    // The CLI capture and save paths also run with the project as cwd.
    expect((await run(["capture", "--tool", "claude-code"], event("UserPromptSubmit", { prompt: "capture this without touching the folder" }), project)).exitCode).toBe(0);
    expect((await run(["save", "a note that must stay out of the project"], null, project)).exitCode).toBe(0);
    expect((await run(["context", "--project", "shop"], null, project)).exitCode).toBe(0);

    // Rules export is a read path too.
    const exported = await run(["export"], null, project);
    expect(exported.exitCode).toBe(0);

    expect(snapshot(project)).toEqual(original);

    // And specifically: none of the files a naive memory tool creates.
    for (const forbidden of ["CLAUDE.md", "AGENTS.md", "GEMINI.md", "CONVENTIONS.md", ".claude", ".aletheia", ".commandcode", ".cursor"]) {
      expect(original.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))).toBe(false);
      expect(() => statSync(join(project, forbidden))).toThrow();
    }

    // The writes did land somewhere: the store has the captured rows under the data dir.
    const { HubStore } = await import("../src/hub/store.mjs");
    const store = new HubStore(join(dataDir, "hub.db"));
    expect(store.list({ project: "shop", kind: "prompt" }).total).toBeGreaterThan(0);
    store.close();
  });
});
