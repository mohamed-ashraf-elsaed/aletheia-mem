#!/usr/bin/env bun
// Write docs/tasks/run-report.md from the real output of the two gate commands:
//   bun test
//   bun scripts/check-tasks.mjs
// A failing command refuses the write unless --allow-fail is passed, so the report never hides a red run.
// Usage: bun scripts/run-report.mjs [--allow-fail]
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const allowFail = process.argv.includes("--allow-fail");
const outPath = join(root, "docs", "tasks", "run-report.md");
const TIMEOUT_MS = 600_000;

const COMMANDS = [
  { label: "bun test", argv: [process.execPath, "test"] },
  { label: "bun scripts/check-tasks.mjs", argv: [process.execPath, "scripts/check-tasks.mjs"] },
];

async function runCommand({ label, argv }) {
  const started = Date.now();
  const proc = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, FORCE_COLOR: "0" } });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { label, stdout, stderr, exitCode, ms: Date.now() - started };
}

const results = [];
for (const command of COMMANDS) results.push(await runCommand(command));

const failed = results.some((result) => result.exitCode !== 0);
if (failed && !allowFail) {
  console.error("run-report: a command failed; not writing the report. Rerun with --allow-fail to record it.");
  for (const result of results) {
    if (result.exitCode !== 0) {
      console.error(`  ${result.label} exited ${result.exitCode}`);
      console.error(`${result.stdout}\n${result.stderr}`.trim());
    }
  }
  process.exit(1);
}

const fence = (text) => (text.trim() ? `\n\`\`\`text\n${text.replace(/\n+$/, "")}\n\`\`\`\n` : "\n_No output._\n");
const section = (result) => `## ${result.label}\n\nExit code: ${result.exitCode} · ${(result.ms / 1000).toFixed(2)}s\n${fence(result.stdout)}${result.stderr.trim() ? `stderr:\n${fence(result.stderr)}` : ""}`;

const report = `# Run report\n\nGenerated ${new Date().toISOString()} by \`bun scripts/run-report.mjs\`. This file is written from real command output; edit the script, not the report.\n\n${results.map(section).join("\n")}`;
writeFileSync(outPath, `${report}\n`);

if (failed) {
  console.log(`run-report: wrote ${outPath} with ${results.filter((result) => result.exitCode !== 0).length} failing command(s).`);
} else {
  console.log(`run-report: wrote ${outPath}`);
}
