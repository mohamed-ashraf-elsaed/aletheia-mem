#!/usr/bin/env bun
// Keep README translations honest: each file records the hash of the English text it was translated from.
//   bun scripts/i18n-check.mjs [--warn] [--update]
//   --warn    report stale languages but exit 0
//   --update  record the current English hash in each translation and in .translation-state.json
//   --ui      check only the dashboard catalogue (public/i18n/*.json) and the dashboard modules
// The README check also runs the dashboard check: every language file must have every English key, and no
// dashboard module may hold a visible English literal outside the catalogue.
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
    // A line that is only a linked badge image is structure, not prose (Markdown or HTML).
    if (/^\s*<a [^>]*><img [^>]*><\/a>\s*$/.test(line)) continue;
    if (/^\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/.test(line)) continue;
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

// ---- the dashboard catalogue ---------------------------------------------------------------------------------

export const UI_CODES = ["ar", "de", "es", "fr", "hi", "ja", "ko", "pt-br", "ru", "zh"];

/** Dashboard modules that must keep their visible text in the catalogue. */
const UI_GLOBS = ["public/tabs", "public"];

/**
 * Literals that are text on purpose but not words a person reads: protocol names, keyboard keys, file names.
 * Each entry is [file suffix or "*", exact literal, why]. Keep this list short.
 */
export const UI_EXCEPTIONS = [
  ["*", "Authorization", "HTTP header name"],
  ["*", "Content-Type", "HTTP header name"],
  ["*", "Bearer", "HTTP auth scheme"],
  ["*", "Aletheia", "product name"],
  ["*", "Escape", "keyboard key name compared in code"],
  ["*", "Enter", "keyboard key name compared in code"],
  ["*", "ArrowDown", "keyboard key name compared in code"],
  ["*", "ArrowUp", "keyboard key name compared in code"],
  ["*", "ArrowLeft", "keyboard key name compared in code"],
  ["*", "ArrowRight", "keyboard key name compared in code"],
  ["*", "Home", "keyboard key name compared in code"],
  ["*", "End", "keyboard key name compared in code"],
  ["*", "Tab", "keyboard key name compared in code"],
  ["*", "Shift", "keyboard key name compared in code"],
  ["*", "GET", "HTTP method"],
  ["*", "POST", "HTTP method"],
  ["*", "PUT", "HTTP method"],
  ["*", "DELETE", "HTTP method"],
  ["*", "Claude Code", "product name"],
  ["*", "MCP", "protocol name"],
  ["home.js", "hidden from Home", "a dismiss reason stored by the API, not shown as UI text"],
  ["home.js", "Everywhere", "scope name sent to the API"],
  ["rules-views.js", "Everywhere", "scope name sent to the API"],
  ["rules-views.js", "Light", "fallback for a strength value from the server"],
  ["work-goals.js", "Nothing on it", "key of a label map keyed by a server value"],
  ["work-requests.js", "Waiting on you", "key of a label map keyed by a server value"],
  ["ui-keys.js", "Ctrl", "keyboard key name"],
  ["ui-keys.js", "Esc", "keyboard key name"],
  ["ui-i18n.js", "*", "the language list holds each language's own name"],
  ["ui-brand.js", "*", "SVG path data"],
  ["ui-icons.js", "*", "SVG path data"],
  ["ui-markdown.js", "*", "markdown syntax, no UI text"],
  ["ui-theme-init.js", "*", "runs before the page paints"],
];

/** Literals that are code: query strings, CSS functions and selectors, header values, shell commands, JSON samples. */
const CODE_LIKE = [
  /^[?&]?project=/, /^[?&]project=\$\{/, /^(?:translateX|translateY|scale|scaleX|scaleY|cubic-bezier)\(/, /^\(prefers-/, /^--ui-/, /^time\[/,
  /^Bearer\b/, /^aletheia (?:doctor|install|sync|compress)\b/, /X-CSRF-Token|aletheia_csrf=/, /^memory:\d+, fact:\d+$/, /^\{/,
  /^\$\{.*\} · Aletheia$/s,
  /^label\[/, /^(?:bun |ALETHEIA_\w+=)/, /^aletheia (?:optimize|embed|serve)\b/, /^image\/[\w+.-]+$/, /^:[a-z-]+$/,
  /^\$\{.*(?:"wss"|"&")/s, /^\$\{[^}]*\}project=/,
];

const REGEX_PREV = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const KEYWORD_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|delete|throw|new|yield|await)$/;

/** Every string and template literal in a JavaScript source, with its line and the code just before it. */
function literals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  const prevSignificant = (upto) => {
    let j = upto - 1;
    while (j >= 0 && /\s/.test(source[j])) j--;
    return j;
  };
  function scan(stopAtBrace) {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === "\n") { line++; i++; continue; }
      if (c === "/" && source[i + 1] === "/") { while (i < n && source[i] !== "\n") i++; continue; }
      if (c === "/" && source[i + 1] === "*") {
        i += 2;
        while (i < n && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") line++; i++; }
        i += 2;
        continue;
      }
      if (c === "{") { depth++; i++; continue; }
      if (c === "}") {
        if (stopAtBrace && depth === 0) { i++; return; }
        depth--; i++;
        continue;
      }
      if (c === '"' || c === "'") {
        const start = i;
        const startLine = line;
        i++;
        let text = "";
        while (i < n && source[i] !== c && source[i] !== "\n") {
          if (source[i] === "\\") { text += /[ntr]/.test(source[i + 1] ?? "") ? " " : source[i + 1] ?? ""; i += 2; continue; }
          text += source[i++];
        }
        i++;
        out.push({ line: startLine, text, raw: text, before: source.slice(Math.max(0, start - 80), start), template: false });
        continue;
      }
      if (c === "`") {
        const start = i;
        const startLine = line;
        i++;
        let text = "";
        let raw = "";
        while (i < n && source[i] !== "`") {
          if (source[i] === "\\") { text += /[ntr]/.test(source[i + 1] ?? "") ? " " : source[i + 1] ?? ""; raw += source[i] + (source[i + 1] ?? ""); i += 2; continue; }
          if (source[i] === "$" && source[i + 1] === "{") {
            i += 2;
            const from = i;
            scan(true);
            text += "\u0000";
            raw += `\${${source.slice(from, i - 1)}}`;
            continue;
          }
          if (source[i] === "\n") line++;
          text += source[i];
          raw += source[i];
          i++;
        }
        i++;
        out.push({ line: startLine, text, raw, before: source.slice(Math.max(0, start - 80), start), template: true });
        continue;
      }
      if (c === "/") {
        const j = prevSignificant(i);
        const prev = j < 0 ? "" : source[j];
        const word = source.slice(Math.max(0, j - 12), j + 1);
        if (REGEX_PREV.has(prev) || KEYWORD_BEFORE_REGEX.test(word)) {
          i++;
          let cls = false;
          while (i < n && source[i] !== "\n") {
            if (source[i] === "\\") { i += 2; continue; }
            if (source[i] === "[") cls = true;
            else if (source[i] === "]") cls = false;
            else if (source[i] === "/" && !cls) break;
            i++;
          }
          i++;
          continue;
        }
      }
      i++;
    }
  }
  scan(false);
  return out;
}

const DATA_ATTR = /(?:class|className|id|type|role|for|href|src|name|rel|target|method|tabindex|autocomplete|inputmode|pattern|min|max|step|rows|cols|width|height|viewBox|fill|stroke|d|key|tone|variant|kind|icon|state|mode|size|align|sort|view|scope|accept|enctype|style|dir|lang|hidden|loading|decoding|wrap|spellcheck|aria-(?!label\b|description\b|roledescription\b|placeholder\b|valuetext\b)[\w-]*|data-[\w-]*)["']?\s*[:=]\s*$/;
const COMPARE_BEFORE = /(?:===|!==|==|!=|\bcase)\s*$/;
const CODE_CALLEE = /(?:\b(?:api|byId|fetch|querySelector|querySelectorAll|closest|matches|getAttribute|removeAttribute|setAttribute|hasAttribute|add|remove|toggle|contains|addEventListener|removeEventListener|getItem|setItem|removeItem|import|require|RegExp|URL|URLSearchParams|has|get|set|delete|includes|startsWith|endsWith|split|join|replace|replaceAll|test|padStart|padEnd|createElement|createElementNS|h|icon|dispatchEvent|Event|CustomEvent|navigate|getPropertyValue|setProperty|removeProperty|matchMedia|on|emit|resolve|from|key|hasOwn|indexOf|lastIndexOf|trim|charAt|localeCompare|Symbol|parse|stringify|JSON|Number|String|Boolean|Array|of|assign|freeze|keys|entries|values|mark|measure|log|warn|error|info|debug)|\bnew \w+|\bimport)\s*\(\s*$/;

/**
 * The literals in `source` that look like text a person reads: more than a token, and not a selector, a path, a
 * class list, a tag name or a value compared in code. t("...") keys are literals too, and are skipped.
 */
export function scanLiterals(source, { exceptions = [] } = {}) {
  const hits = [];
  const lines = String(source).split("\n");
  for (const lit of literals(String(source))) {
    const text = lit.text.replace(/\u0000/g, "${}");
    const flat = text.replace(/\$\{\}/g, " ").trim();
    if (flat.length < 2 || !/[A-Za-z]{2,}/.test(flat)) continue;
    const lineText = lines[lit.line - 1] ?? "";
    if (/^\s*(?:import\b|export\b.*\bfrom\b|\}\s*from\b)/.test(lineText)) continue;
    if (/^\s*\/\//.test(lineText)) continue;
    if (DATA_ATTR.test(lit.before) || COMPARE_BEFORE.test(lit.before) || CODE_CALLEE.test(lit.before)) continue;
    if (/\bt\(\s*$/.test(lit.before)) continue;
    if (CODE_LIKE.some((re) => re.test(lit.raw))) continue;
    if (/^[#/.]/.test(flat) || /^https?:/.test(flat) || /^[\w.-]+\.(?:js|json|css|svg|png|mjs|md|html|txt)$/.test(flat)) continue;
    if (/^[A-Z0-9_]+$/.test(flat)) continue;
    if (/^[a-z][\w.:#/-]*$/.test(flat) || /^[a-z][\w-]*(?: [a-z][\w-]*)*$/.test(flat) && /[-_:]/.test(flat) ) continue;
    if (/^[a-z]+[A-Z]\w*$/.test(flat)) continue;
    if (/^[^A-Za-z]*[A-Za-z]{1,2}[^A-Za-z]*$/.test(flat)) continue;
    if (exceptions.some((rule) => rule === "*" || rule === text)) continue;
    hits.push({ line: lit.line, text: lit.raw });
  }
  return hits;
}

function uiFiles(root) {
  const files = [];
  const tabs = join(root, "public", "tabs");
  if (existsSync(tabs)) for (const name of readdirSync(tabs).sort()) if (name.endsWith(".js")) files.push(`public/tabs/${name}`);
  const top = join(root, "public");
  if (existsSync(top)) for (const name of readdirSync(top).sort()) if (name.endsWith(".js")) files.push(`public/${name}`);
  return files;
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const catalogueKeys = (doc) => Object.keys(doc).filter((key) => !key.startsWith("_"));

/** Problems with the dashboard catalogue: missing, extra or mismatched keys, and English text left in the modules. */
export function checkUi({ root = DEFAULT_ROOT, codes = UI_CODES } = {}) {
  const problems = [];
  const dir = join(root, "public", "i18n");
  let en;
  try {
    en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
  } catch (error) {
    return { ok: false, problems: [`public/i18n/en.json: ${error.message}`] };
  }
  const enKeys = catalogueKeys(en);
  for (const key of enKeys) if (typeof en[key] !== "string" || !en[key].trim()) problems.push(`en.json: empty value for ${key}`);
  for (const code of codes) {
    const path = join(dir, `${code}.json`);
    if (!existsSync(path)) { problems.push(`${code}.json: file is missing`); continue; }
    let doc;
    try { doc = JSON.parse(readFileSync(path, "utf8")); } catch (error) { problems.push(`${code}.json: ${error.message}`); continue; }
    if (doc._meta?.machineTranslated !== true) problems.push(`${code}.json: _meta.machineTranslated is not true`);
    for (const key of enKeys) {
      if (!(key in doc)) problems.push(`${code}.json: missing key ${key}`);
      else if (!/\.one$/.test(key) && placeholders(en[key]) !== placeholders(doc[key])) problems.push(`${code}.json: placeholders of ${key} differ from English`);
    }
    // A language with more plural forms than English (Arabic, Russian) may add .zero .two .few .many beside .other.
    const extraPlural = (key) => /\.(?:zero|two|few|many)$/.test(key) && `${key.replace(/\.[a-z]+$/, "")}.other` in en;
    for (const key of catalogueKeys(doc)) if (!(key in en) && !extraPlural(key)) problems.push(`${code}.json: key ${key} is not in en.json`);
  }
  const keySet = new Set(enKeys);
  for (const file of uiFiles(root)) {
    const source = readFileSync(join(root, file), "utf8");
    const base = file.replace(/^public\//, "");
    const rules = UI_EXCEPTIONS.filter(([scope, , ]) => scope === "*" || base.endsWith(scope)).map(([, literal]) => literal);
    if (UI_EXCEPTIONS.some(([scope, literal]) => scope !== "*" && literal === "*" && base.endsWith(scope))) continue;
    for (const hit of scanLiterals(source, { exceptions: rules })) problems.push(`${file}:${hit.line}: English text outside the catalogue: ${JSON.stringify(hit.text.slice(0, 70))}`);
    for (const match of source.matchAll(/\bt\(\s*"([\w.-]+)"/g)) {
      const key = match[1];
      if (!keySet.has(key) && !keySet.has(`${key}.other`)) problems.push(`${file}: t("${key}") is not in en.json`);
    }
  }
  return { ok: problems.length === 0, problems };
}

if (import.meta.main) {
  const root = process.env.I18N_ROOT ? resolve(process.env.I18N_ROOT) : DEFAULT_ROOT;
  const warn = process.argv.includes("--warn");
  const update = process.argv.includes("--update");
  const uiOnly = process.argv.includes("--ui");
  if (existsSync(join(root, "public", "i18n"))) {
    const ui = checkUi({ root });
    if (!ui.ok) {
      for (const problem of ui.problems.slice(0, 200)) console.error(`i18n ui: ${problem}`);
      if (ui.problems.length > 200) console.error(`i18n ui: ... and ${ui.problems.length - 200} more`);
      process.exit(1);
    }
    console.log("i18n ui ok: catalogue complete in 10 languages, no English literals left in the dashboard modules");
  }
  if (uiOnly) process.exit(0);
  const result = check({ root, warn, update, date: process.env.I18N_DATE });
  if (!result.ok) {
    for (const problem of result.problems) console.error(`i18n: ${problem}`);
    if (result.stale.length) console.error(`i18n: stale: ${result.stale.join(", ")}; run bun scripts/i18n-check.mjs --update after reviewing the translation`);
    process.exit(1);
  }
  if (result.stale.length) console.warn(`i18n warn: stale: ${result.stale.join(", ")}`);
  console.log(`i18n ok: ${result.count} languages current`);
}
