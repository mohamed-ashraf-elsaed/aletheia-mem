import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = join(import.meta.dir, "..");

// Modules that may have no production importer, with the reason. Keep this list short.
const ALLOWED = {
  "src/hub/segmenter.mjs": "kept for the open retrieval benchmark work; only tests and bench import it",
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".mjs") || name.endsWith(".js")) out.push(p);
  }
  return out;
}

function importsOf(file) {
  const text = readFileSync(file, "utf8");
  const specs = new Set();
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
  for (const m of text.matchAll(re)) specs.add(m[1]);
  return [...specs].map((s) => resolve(dirname(file), s)).filter((p) => existsSync(p) && statSync(p).isFile());
}

// Production graph: start at bin/, follow relative imports, never read test/ or bench/.
function reachable() {
  const seen = new Set();
  const stack = walk(join(root, "bin"));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...importsOf(f));
  }
  return seen;
}

describe("dead module check", () => {
  test("every src module has a production importer or an allow-list reason", () => {
    const seen = reachable();
    const dead = walk(join(root, "src"))
      .map((f) => relative(root, f))
      .filter((rel) => !seen.has(join(root, rel)) && !(rel in ALLOWED))
      .sort();
    expect(dead).toEqual([]);
  });

  test("allow-list entries exist and are still dead", () => {
    const seen = reachable();
    for (const rel of Object.keys(ALLOWED)) {
      expect(existsSync(join(root, rel))).toBe(true);
      expect(seen.has(join(root, rel))).toBe(false);
      expect(ALLOWED[rel].length).toBeGreaterThan(10);
    }
  });
});
