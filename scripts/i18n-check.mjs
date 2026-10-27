#!/usr/bin/env bun
// Keep README translations honest: each file records the hash of the English text it was translated from.
//   bun scripts/i18n-check.mjs [--warn] [--update]
//   --warn    report stale languages but exit 0
//   --update  record the current English hash in each translation and in .translation-state.json
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_ROOT = join(import.meta.dir, "..");
const STATE = "docs/i18n/.translation-state.json";

/** Remove structural lines a translation does not carry: code, badges, the switcher and the file header. */
export function translatable(text) {
  // The generated test-count block is a metric, not prose; a number changing must not mark translations stale.
  let fence = false;
  const kept = [];
  const source = String(text).replace(/<!-- claims:begin -->[\s\S]*?<!-- claims:end -->/g, "");
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^\s*<!--/.test(line)) continue;
    if (/img\.shields\.io|actions\/workflows\/.*\/badge\.svg/.test(line)) continue;
    if (/^\[English\]|^Translations:/.test(line)) continue;
    if (/^>\s*Machine-translated/.test(line)) continue;
    if (/^>\s*Source: .*source-sha256:/.test(line)) continue;
    if (/^<p align="center"><img/.test(line)) continue;
    kept.push(line.replace(/[ \t]+$/g, ""));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function hashSource(text) {
  return createHash("sha256").update(translatable(text), "utf8").digest("hex");
}

export function parseHash(text) {
  const match = /source-sha256:\s*([0-9a-f]{64})/.exec(String(text));
  return match ? match[1] : null;
}

export function translationFiles(root) {
  const dir = join(root, "docs", "i18n");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^README\.[A-Za-z-]+\.md$/.test(name) && name !== "TEMPLATE.md")
    .sort();
}

export function codeOf(file) {
  return /^README\.(.+)\.md$/.exec(file)[1];
}

function readState(root) {
  const path = join(root, STATE);
  if (!existsSync(path)) return { version: 1, source: "README.md", languages: {} };
  try {
    const doc = JSON.parse(readFileSync(path, "utf8"));
    return { version: 1, source: "README.md", ...doc, languages: doc.languages ?? {} };
  } catch {
    throw new Error(`${STATE} is not valid JSON`);
  }
}

function writeState(root, state) {
  const path = join(root, STATE);
  mkdirSync(join(root, "docs", "i18n"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function check({ root = DEFAULT_ROOT, warn = false, update = false, date = new Date().toISOString().slice(0, 10) } = {}) {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const current = hashSource(readme);
  const state = readState(root);
  const files = translationFiles(root);
  const stale = [];
  const problems = [];

  for (const file of files) {
    const code = codeOf(file);
    const path = join(root, "docs", "i18n", file);
    let text = readFileSync(path, "utf8");
    const recorded = parseHash(text);
    if (!recorded) {
      problems.push(`${file}: no source-sha256 line`);
      continue;
    }
    const entry = state.languages[code];
    if (!entry && !update) {
      problems.push(`${file}: not in ${STATE}`);
      continue;
    }
    if (entry && entry.sourceHash !== recorded && !update) problems.push(`${file}: header hash ${recorded.slice(0, 12)} does not match state ${String(entry.sourceHash).slice(0, 12)}`);
    if (recorded !== current) {
      stale.push(code);
      if (update) {
        text = text.replace(/source-sha256:\s*[0-9a-f]{64}/, `source-sha256: ${current}`);
        writeFileSync(path, text);
        state.languages[code] = { sourceHash: current, translatedAt: date };
      }
    } else if (update && (!entry || entry.sourceHash !== current)) {
      state.languages[code] = { sourceHash: current, translatedAt: date };
    }
  }

  for (const code of Object.keys(state.languages)) {
    if (!files.includes(`README.${code}.md`)) problems.push(`${STATE}: ${code} has no docs/i18n/README.${code}.md`);
  }

  if (problems.length) return { ok: false, problems, stale, current, count: files.length };
  if (update) writeState(root, state);
  const updatedStale = update ? [] : stale;
  if (updatedStale.length && !warn) return { ok: false, problems: [], stale: updatedStale, current, count: files.length };
  return { ok: true, problems: [], stale: updatedStale, current, count: files.length };
}

if (import.meta.main) {
  const root = process.env.I18N_ROOT ? resolve(process.env.I18N_ROOT) : DEFAULT_ROOT;
  const warn = process.argv.includes("--warn");
  const update = process.argv.includes("--update");
  const result = check({ root, warn, update, date: process.env.I18N_DATE });
  if (!result.ok) {
    for (const problem of result.problems) console.error(`i18n: ${problem}`);
    if (result.stale.length) console.error(`i18n: stale: ${result.stale.join(", ")}; run bun scripts/i18n-check.mjs --update after reviewing the translation`);
    process.exit(1);
  }
  if (result.stale.length) console.warn(`i18n warn: stale: ${result.stale.join(", ")}`);
  console.log(`i18n ok: ${result.count} languages current`);
}
