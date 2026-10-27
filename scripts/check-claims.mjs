#!/usr/bin/env bun
// Check the README's claims without trusting a hand-typed number.
//   bun scripts/check-claims.mjs
// Runs the suite, parses its real counts, rejects hand-typed test/star/download counts, and checks that
// every badge URL is a real endpoint that exists in this repository.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_ROOT = join(import.meta.dir, "..");

export const ALLOWED_SHIELDS = [
  /^https:\/\/img\.shields\.io\/github\/license\/[^/]+\/[^/]+$/,
  /^https:\/\/img\.shields\.io\/github\/last-commit\/[^/]+\/[^/]+$/,
  /^https:\/\/img\.shields\.io\/github\/stars\/[^/]+\/[^/]+$/,
  /^https:\/\/img\.shields\.io\/github\/issues\/[^/]+\/[^/]+$/,
  /^https:\/\/img\.shields\.io\/npm\/v\/aletheia-mem$/,
  /^https:\/\/img\.shields\.io\/badge\/status-alpha-orange$/,
  /^https:\/\/img\.shields\.io\/badge\/bun-%3E%3D1\.1-black$/,
  /^https:\/\/img\.shields\.io\/badge\/platform-linux%20%28tested%29-lightgrey$/,
];

// The npm version badge reads the registry's latest version, so it states a real value, not a typed one.
const NPM_VERSION_BADGE = /^https:\/\/img\.shields\.io\/npm\/v\/aletheia-mem$/;
const FORBIDDEN_BADGE = /(npm|coverage|downloads?|release|scorecard|docker|discord|sponsor)/i;

export function withoutComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export function findTypedCounts(text) {
  const body = withoutComments(text);
  const patterns = [
    /\b\d[\d,]*\s+(tests?|stars?|downloads?)\b/gi,
    /\b(tests?|stars?|downloads?)\s*[:=]\s*\d[\d,]*/gi,
  ];
  const hits = [];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) hits.push(match[0]);
  }
  return [...new Set(hits)];
}

export function repoSlug(root = DEFAULT_ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const url = pkg.repository?.url ?? "";
  const match = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/.exec(url);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export function checkBadges(text, root = DEFAULT_ROOT) {
  const slug = repoSlug(root);
  const problems = [];
  const badges = [...text.matchAll(/!?\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
  for (const url of badges) {
    if (!/shields\.io|badge\.svg/.test(url)) continue;
    if (FORBIDDEN_BADGE.test(url) && !NPM_VERSION_BADGE.test(url)) {
      problems.push(`forbidden badge: ${url}`);
      continue;
    }
    const workflow = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/workflows\/([^/]+)\/badge\.svg$/.exec(url);
    if (workflow) {
      if (slug && workflow[1] !== slug) problems.push(`workflow badge points at ${workflow[1]}, not ${slug}`);
      if (!existsSync(join(root, ".github", "workflows", workflow[2]))) problems.push(`workflow badge points at a missing workflow: ${workflow[2]}`);
      continue;
    }
    if (/shields\.io/.test(url) && !ALLOWED_SHIELDS.some((pattern) => pattern.test(url))) {
      problems.push(`badge endpoint is not in the allowed list: ${url}`);
    }
  }
  return { badges: badges.filter((url) => /shields\.io|badge\.svg/.test(url)), problems };
}

export function parseTestCounts(output) {
  const passed = Number((output.match(/^\s*(\d+)\s+pass\s*$/m) || [])[1] ?? NaN);
  const failed = Number((output.match(/^\s*(\d+)\s+fail\s*$/m) || [])[1] ?? NaN);
  const ran = Number((output.match(/Ran\s+(\d+)\s+tests?/m) || [])[1] ?? NaN);
  return { passed, failed, ran };
}

async function main() {
  const root = process.env.CLAIMS_ROOT ? resolve(process.env.CLAIMS_ROOT) : DEFAULT_ROOT;
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const typed = findTypedCounts(readme);
  if (typed.length) {
    console.error(`claims: README contains a hand-typed count: ${typed.join(", ")}`);
    process.exit(1);
  }
  const badgeCheck = checkBadges(readme, root);
  if (badgeCheck.problems.length) {
    for (const problem of badgeCheck.problems) console.error(`claims: ${problem}`);
    process.exit(1);
  }

  const proc = Bun.spawn([process.execPath, "test"], { cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env, FORCE_COLOR: "0" } });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const counts = parseTestCounts(`${stdout}\n${stderr}`);
  if (code !== 0 || !Number.isFinite(counts.passed) || counts.failed !== 0) {
    console.error(`claims: the test suite did not pass (exit ${code})`);
    console.error(`${stdout}\n${stderr}`.trim().split("\n").slice(-20).join("\n"));
    process.exit(1);
  }
  console.log(`claims ok: tests=${Number.isFinite(counts.ran) ? counts.ran : counts.passed} passed=${counts.passed} failed=0; badges=${badgeCheck.badges.length} real; typed counts=0`);
}

if (import.meta.main) main();
