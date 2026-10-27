#!/usr/bin/env bun
// Prepare-only release check: verify the npm tarball contents without publishing.
//   bun scripts/release.mjs
// Publishing itself is an owner step; see docs/tasks/T-080.md.
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const REQUIRED = ["bin/aletheia.mjs", "src/hub/store.mjs", "docs/dependencies.md", "NOTICE.md"];

const proc = Bun.spawn([process.execPath, "pm", "pack", "--dry-run"], { cwd: root, stdout: "pipe", stderr: "pipe" });
const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);

if (exitCode !== 0) {
  console.error(`pack failed (exit ${exitCode})`);
  if (stderr.trim()) console.error(stderr.trim());
  process.exit(1);
}

const missing = REQUIRED.filter((path) => !stdout.includes(path));
if (missing.length) {
  console.error(`pack missing required paths: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`pack ok: ${REQUIRED.length} required paths present`);
