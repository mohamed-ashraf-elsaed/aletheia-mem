#!/usr/bin/env bun
// Release helper. Never publishes, tags or pushes; those are owner steps (docs/releasing.md).
//   bun scripts/release.mjs                      pack check only (required files are in the tarball)
//   bun scripts/release.mjs --prepare <version>  bump package.json, server.json and CHANGELOG, move Unreleased into a dated section
//   bun scripts/release.mjs --sync-server-json <version>  bump server.json to the version when it is older
//   bun scripts/release.mjs --notes <tag> <file>  write the CHANGELOG section for the tag to the file; exit 1 when missing
//   bun scripts/release.mjs --verify [--tag vX.Y.Z]  checks to run before publishing, and in CI on a tag
// RELEASE_ROOT overrides the repository root (tests use a temp fixture).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const REQUIRED = ["bin/aletheia.mjs", "src/hub/store.mjs", "docs/dependencies.md", "NOTICE.md"];
export const MAX_UNPACKED_MB = 12;
export const README_TOP_LINES = 60;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => SEMVER.exec(v).slice(1).map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function topChangelogRelease(changelog) {
  return /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1] ?? null;
}

export function unreleasedBody(changelog) {
  const match = /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[)/m.exec(changelog);
  return match ? match[1].trim() : "";
}

export function changelogSection(changelog, version) {
  const v = String(version).replace(/^v/, "");
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${v}]`));
  if (start < 0) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## ["));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim() || null;
}

export function moveUnreleased(changelog, version, date) {
  const body = unreleasedBody(changelog);
  const pattern = /^## \[Unreleased\][^\n]*\n[\s\S]*?(?=^## \[)/m;
  // A function replacer keeps "$`", "$&" and "$'" in the notes literal; a replacement string would expand them.
  return changelog.replace(pattern, () => `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n`);
}

/**
 * Bump every "version" field in a server.json manifest text to `version`, keeping the original formatting.
 * Returns { text } when bumped, or { unchanged: true } when the manifest already has that version or a newer one.
 * Throws when the text is not valid JSON.
 */
export function syncServerJson(manifestText, version) {
  const manifest = JSON.parse(manifestText);
  const current = manifest.version;
  if (current && SEMVER.test(current) && compareVersions(current, version) >= 0) return { unchanged: true, current };
  const text = manifestText.replace(/("version"\s*:\s*)"[^"]+"/g, `$1"${version}"`);
  return { text, current };
}

/** Image URLs in README markdown and HTML, with their line numbers. */
export function imageRefs(readme) {
  const refs = [];
  readme.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) refs.push({ line: i + 1, url: m[1] });
    for (const m of line.matchAll(/<(?:img|source)\b[^>]*?\bsrc(?:set)?\s*=\s*["']([^"']+)["']/gi)) refs.push({ line: i + 1, url: m[1] });
  });
  return refs;
}

/** Links (markdown and HTML) in the first `n` lines that are not absolute https or mailto. */
export function relativeLinks(readme, n = README_TOP_LINES) {
  const hits = [];
  readme.split("\n").slice(0, n).forEach((line, i) => {
    const urls = [
      ...[...line.matchAll(/\]\(\s*<?([^)\s>]+)/g)].map((m) => m[1]),
      ...[...line.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
    ];
    for (const url of urls) if (!/^(https:\/\/|mailto:)/.test(url) && !url.startsWith("#")) hits.push({ line: i + 1, url });
  });
  return hits;
}

async function run(cmd, cwd) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out, err, code };
}

export async function packCheck(root) {
  const { out, err, code } = await run([process.execPath, "pm", "pack", "--dry-run"], root);
  if (code !== 0) return { problems: [`pack failed (exit ${code})${err.trim() ? `: ${err.trim()}` : ""}`], out: "" };
  const problems = [];
  const missing = REQUIRED.filter((path) => !out.includes(path));
  if (missing.length) problems.push(`pack missing required paths: ${missing.join(", ")}`);
  return { problems, out };
}

export function unpackedMb(packOutput) {
  const m = /Unpacked size:\s*([\d.]+)\s*(B|KB|MB|GB)/i.exec(packOutput);
  if (!m) return null;
  return Number(m[1]) * { B: 1e-6, KB: 1e-3, MB: 1, GB: 1e3 }[m[2].toUpperCase()];
}

export async function prepare(root, version, { date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!SEMVER.test(version)) return [`version must look like 1.2.3, got "${version}"`];
  const problems = [];
  const dirty = await run(["git", "status", "--porcelain"], root);
  if (dirty.code !== 0) return [`git status failed: ${dirty.err.trim()}`];
  if (dirty.out.trim()) problems.push("working tree is not clean; commit or discard changes first");
  const branch = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"], root);
  if (branch.out.trim() !== "main") problems.push(`must run on main, not "${branch.out.trim()}"`);
  const pkgText = readFileSync(join(root, "package.json"), "utf8");
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const serverJsonPath = join(root, "server.json");
  let serverJsonText = null;
  if (!existsSync(serverJsonPath)) problems.push("server.json is missing; create the registry manifest first");
  else {
    serverJsonText = readFileSync(serverJsonPath, "utf8");
    try {
      const serverVersion = JSON.parse(serverJsonText).version ?? "";
      if (serverVersion && compareVersions(version, serverVersion) <= 0) problems.push(`version ${version} is not greater than ${serverVersion} in server.json`);
    } catch {
      problems.push("server.json is not valid JSON");
    }
  }
  const current = JSON.parse(pkgText).version;
  const top = topChangelogRelease(changelog);
  for (const [name, v] of [["package.json", current], ["CHANGELOG", top]]) {
    if (v && compareVersions(version, v) <= 0) problems.push(`version ${version} is not greater than ${v} in ${name}`);
  }
  if (!unreleasedBody(changelog)) problems.push("CHANGELOG [Unreleased] is empty; write the release notes first");
  if (problems.length) return problems;
  writeFileSync(join(root, "package.json"), pkgText.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`));
  writeFileSync(join(root, "CHANGELOG.md"), moveUnreleased(changelog, version, date));
  const server = syncServerJson(serverJsonText, version);
  if (server.text) writeFileSync(serverJsonPath, server.text);
  return [];
}

export async function verify(root, { tag = null } = {}) {
  const problems = [];
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const top = topChangelogRelease(changelog);
  if (top !== pkg.version) problems.push(`package.json version ${pkg.version} does not equal the top CHANGELOG release ${top}`);
  const serverJsonPath = join(root, "server.json");
  if (!existsSync(serverJsonPath)) problems.push("server.json is missing");
  else {
    try {
      const manifest = JSON.parse(readFileSync(serverJsonPath, "utf8"));
      if (manifest.version !== pkg.version) problems.push(`server.json version ${manifest.version} does not match package.json version ${pkg.version}`);
      (manifest.packages ?? []).forEach((entry, i) => {
        if (entry.version !== pkg.version) problems.push(`server.json package ${i} version ${entry.version} does not match package.json version ${pkg.version}`);
      });
    } catch {
      problems.push("server.json is not valid JSON");
    }
  }
  if (tag) {
    if (tag !== `v${pkg.version}`) problems.push(`tag ${tag} does not match package.json version v${pkg.version}`);
  } else {
    const exists = await run(["git", "rev-parse", "-q", "--verify", `refs/tags/v${pkg.version}`], root);
    if (exists.code === 0) problems.push(`tag v${pkg.version} already exists`);
  }
  const pack = await packCheck(root);
  problems.push(...pack.problems);
  if (pack.out) {
    const mb = unpackedMb(pack.out);
    if (mb === null) problems.push("could not read the unpacked size from the pack output");
    else if (mb > MAX_UNPACKED_MB) problems.push(`unpacked size ${mb.toFixed(2)} MB is over the ${MAX_UNPACKED_MB} MB limit`);
  }
  const readmePath = join(root, "README.md");
  if (!existsSync(readmePath)) problems.push("README.md is missing");
  else {
    const readme = readFileSync(readmePath, "utf8");
    for (const ref of imageRefs(readme)) {
      if (!/^https:\/\//.test(ref.url)) problems.push(`README line ${ref.line}: image URL is not absolute https (npm renders the README from the tarball): ${ref.url}`);
    }
    for (const link of relativeLinks(readme)) problems.push(`README line ${link.line}: relative link in the first ${README_TOP_LINES} lines: ${link.url}`);
  }
  return problems;
}

async function main() {
  const root = process.env.RELEASE_ROOT ? resolve(process.env.RELEASE_ROOT) : join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const fail = (problems) => {
    for (const p of problems) console.error(`release: ${p}`);
    process.exit(1);
  };
  if (args[0] === "--prepare") {
    const problems = await prepare(root, args[1] ?? "", args[2] === "--date" ? { date: args[3] } : {});
    if (problems.length) fail(problems);
    console.log(`prepared ${args[1]}: package.json, server.json and CHANGELOG updated, nothing committed. Next: review the diff, run the checks, commit.`);
    return;
  }
  if (args[0] === "--sync-server-json") {
    // The workflow passes GITHUB_REF_NAME, which carries the leading v of the tag.
    const version = (args[1] ?? "").replace(/^v/, "");
    if (!SEMVER.test(version)) fail([`version must look like 1.2.3, got "${args[1] ?? ""}"`]);
    const path = join(root, "server.json");
    if (!existsSync(path)) fail(["server.json is missing"]);
    const text = readFileSync(path, "utf8");
    let synced;
    try {
      synced = syncServerJson(text, version);
    } catch {
      fail(["server.json is not valid JSON"]);
    }
    if (synced.unchanged) {
      if (synced.current && compareVersions(synced.current, version) > 0) console.log(`server.json ${synced.current} is already newer than ${version}; left as is`);
      else console.log(`server.json already matches ${version}`);
      return;
    }
    if (synced.text === text) fail([`server.json has no version field to bump to ${version}`]);
    writeFileSync(path, synced.text);
    console.log(`server.json bumped from ${synced.current} to ${version}`);
    return;
  }
  if (args[0] === "--notes") {
    const body = changelogSection(readFileSync(join(root, "CHANGELOG.md"), "utf8"), args[1] ?? "");
    if (!body) {
      console.error(`release: no CHANGELOG.md section for ${args[1]}`);
      process.exit(1);
    }
    writeFileSync(args[2], `${body}\n`);
    console.log(`wrote the ${args[1]} notes to ${args[2]}`);
    return;
  }
  if (args[0] === "--verify") {
    const i = args.indexOf("--tag");
    const problems = await verify(root, { tag: i >= 0 ? args[i + 1] : null });
    if (problems.length) fail(problems);
    console.log("verify ok: version, changelog, server.json, tag, pack contents, size and README links");
    return;
  }
  const pack = await packCheck(root);
  if (pack.problems.length) fail(pack.problems);
  console.log(`pack ok: ${REQUIRED.length} required paths present`);
}

if (import.meta.main) await main();
