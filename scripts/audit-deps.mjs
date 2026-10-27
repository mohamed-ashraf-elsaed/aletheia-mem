#!/usr/bin/env bun
// Dependency and licence audit. The pass condition is zero required runtime dependencies; a new required
// dependency fails unless it is in the allowlist below with a reason. devDependencies and vendored code are
// listed with their licence, and a copyleft licence is flagged.
//   bun scripts/audit-deps.mjs
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.env.DEPS_ROOT ? resolve(process.env.DEPS_ROOT) : join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// Required runtime dependencies are allowed only with a written reason. Today the policy is zero.
const REQUIRED_ALLOWLIST = new Map();

// Copyleft licences that conflict with Apache-2.0 distribution.
const COPYLEFT = /(^|[ -])(GPL|AGPL|LGPL)([ -]|v|$)/i;

const VENDORED = [
  { paths: ["public/work.html", "public/assets/"], origin: "claude-mem 15.2.0", license: "Apache-2.0" },
  { paths: ["prompts/request-progress/SKILL.md", "prompts/owner-goals/SKILL.md"], origin: "claude-mem 15.2.0", license: "Apache-2.0" },
  { paths: ["vendor/owner-goals/"], origin: "claude-mem 15.2.0", license: "Apache-2.0" },
  { paths: ["src/ledger/commands.mjs"], origin: "claude-mem 15.2.0 (derived)", license: "Apache-2.0" },
];

const required = Object.keys(pkg.dependencies ?? {}).sort();
const dev = Object.keys(pkg.devDependencies ?? {}).sort();

const problems = [];
for (const name of required) {
  if (!REQUIRED_ALLOWLIST.has(name)) {
    problems.push(`required dependency "${name}" is not allowlisted (see docs/dependencies.md)`);
  }
}

const lockfiles = ["bun.lockb", "bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].filter((file) => existsSync(join(root, file)));

// The project keeps no lockfile because there are no dependencies. When one appears, the audit refuses to
// guess a licence: it reports "not recorded in lockfile" and the owner adds the licence to docs/dependencies.md.
const devRows = dev.map((name) => {
  const license = lockfiles.length ? "not recorded in lockfile" : "not recorded (no lockfile)";
  if (COPYLEFT.test(license)) problems.push(`devDependency ${name} has a copyleft licence: ${license}`);
  return { name, version: pkg.devDependencies?.[name] ?? "?", license };
});

for (const entry of VENDORED) {
  if (COPYLEFT.test(entry.license)) problems.push(`vendored ${entry.paths.join(", ")} has a copyleft licence: ${entry.license}`);
}

if (problems.length) {
  console.error("audit-deps: fail");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`deps ok: ${required.length} required, ${dev.length} dev${lockfiles.length ? ` (lockfile ${lockfiles.join(", ")})` : " (no lockfile)"}`);
for (const row of devRows) console.log(`  dev ${row.name}@${row.version} — ${row.license}`);
for (const entry of VENDORED) console.log(`  vendored ${entry.paths.join(", ")} — ${entry.license} (${entry.origin})`);
