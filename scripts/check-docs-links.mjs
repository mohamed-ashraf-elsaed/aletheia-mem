#!/usr/bin/env bun
// Check every relative link and heading anchor in README and docs/**. External URLs are counted, never fetched.
//   bun scripts/check-docs-links.mjs
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const DEFAULT_ROOT = join(import.meta.dir, "..");
const MD_EXT = new Set([".md", ".markdown"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (MD_EXT.has(extname(name))) out.push(path);
  }
  return out;
}

export function slug(heading) {
  return String(heading)
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function headings(text) {
  const seen = new Map();
  const out = new Set();
  for (const line of text.split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const explicit = /\s*\{#([^}]+)\}\s*$/.exec(match[1]);
    if (explicit) out.add(explicit[1]);
    const base = slug(match[1].replace(/\s*\{#[^}]+\}\s*$/, ""));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.add(count ? `${base}-${count}` : base);
  }
  return out;
}

export function stripFences(text) {
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fence = !fence;
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
}

function linksIn(line) {
  const links = [];
  for (const match of line.replace(/`[^`]*`/g, "").matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    links.push(match[1]);
  }
  return links;
}

export function checkFiles(root = DEFAULT_ROOT) {
  const files = [join(root, "README.md"), join(root, "CONTRIBUTING.md"), join(root, "SECURITY.md"), join(root, "NOTICE.md"), ...walk(join(root, "docs"))];
  const problems = [];
  let local = 0;
  let external = 0;
  const anchorCache = new Map();
  const anchorsFor = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, headings(stripFences(readFileSync(file, "utf8"))));
    return anchorCache.get(file);
  };

  for (const file of files) {
    if (!existsSync(file)) continue;
    const lines = stripFences(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const raw of linksIn(line)) {
        const target = raw.replace(/^<|>$/g, "");
        if (/^(https?:|mailto:|tel:|data:|\/\/)/i.test(target)) {
          external += 1;
          continue;
        }
        local += 1;
        const [pathPart, anchor] = target.split("#");
        const location = `${relative(root, file)}:${index + 1}`;
        if (!pathPart) {
          if (anchor && !anchorsFor(file).has(decodeURIComponent(anchor))) problems.push(`${location}: missing anchor #${anchor}`);
          continue;
        }
        if (pathPart.startsWith("/")) continue;
        let decoded = pathPart;
        try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
        const resolved = resolve(dirname(file), decoded);
        if (!resolved.startsWith(root)) {
          problems.push(`${location}: link leaves the repository: ${target}`);
          continue;
        }
        if (!existsSync(resolved)) {
          problems.push(`${location}: missing file: ${target}`);
          continue;
        }
        if (anchor && statSync(resolved).isFile() && MD_EXT.has(extname(resolved))) {
          if (!anchorsFor(resolved).has(decodeURIComponent(anchor))) problems.push(`${location}: missing anchor #${anchor} in ${decoded}`);
        }
      }
    });
  }
  return { problems, local, external };
}

if (import.meta.main) {
  const root = process.env.DOCS_LINKS_ROOT ? resolve(process.env.DOCS_LINKS_ROOT) : DEFAULT_ROOT;
  const result = checkFiles(root);
  if (result.problems.length) {
    for (const problem of result.problems) console.error(`links: ${problem}`);
    console.error(`links: ${result.problems.length} broken link(s)`);
    process.exit(1);
  }
  console.log(`links ok: ${result.local} local, ${result.external} external`);
}
