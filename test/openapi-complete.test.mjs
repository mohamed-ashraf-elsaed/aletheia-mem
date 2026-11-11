// Every route the server answers must be documented in docs/openapi.json, or sit on the exclusion list below with a reason.
// The routes come from the router source itself, so a route added to a handler without a doc entry fails this test.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

// Routes that are answered by the server but are not part of the JSON API. Key: "METHOD /path" ("ANY" = any method).
const EXCLUDED = new Map([
  ["ANY /hub", "Memory Hub redirect page; a static HTML page, not a JSON route"],
  ["ANY /hub/", "Memory Hub static assets (HTML, JS, CSS) under the old /hub/ UI; not a JSON route"],
]);

const ROUTER_FILES = ["src/hub/routes.mjs", "src/server.mjs", "src/hub/login.mjs", "src/hub/sync/server.mjs"];
// team-api.mjs defines relative paths; the hub mounts them at /api/hub/team and the sync server at /v1/team.
const TEAM_FILE = "src/hub/team-api.mjs";
const TEAM_MOUNTS = ["/api/hub/team", "/v1/team"];

const PATH_EQ = /\bpathname\s*===\s*"([^"]+)"/g;
const REGEX = /\/(\^(?:\\.|\[[^\]]*\]|[^\/\[\\\n])*\$)\/\.exec\(pathname\)/g;
const INCLUDES = /\[((?:\s*"[^"]+",?)+)\s*\]\.includes\(pathname\)/g;
const PREFIX = /(?<!!)\bpathname\.startsWith\("([^"]+)"\)/g;
const TEAM_PREFIX = /startsWith\("\/(?:api\/hub|v1)\/team\/"\)/;
const TEAM_PATH = /\bpath === "([^"]*)"/g;
const METHOD_EQ = /\bmethod\s*===\s*"([A-Z]+)"/g;
const METHOD_NE = /\bmethod\s*!==\s*"([A-Z]+)"/g;
const BREAK = /\bpathname\s*===|\bpath\s*===|\.exec\(pathname\)|\bpathname\.startsWith/;

const indentOf = (line) => line.match(/^\s*/)[0].length;

function regexToTemplate(source) {
  const body = source.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\//g, "/").replace(/\\\./g, ".").replace(/\\-/g, "-");
  return body.replace(/\((?!\?)(?:\\.|\[[^\]]*\]|[^()\[\\])*\)/g, "{p}");
}

// Methods a path test on lines[i] answers: the same line, then the block below it, then the enclosing gate above it.
function methodsFor(lines, i, own, { ne = false } = {}) {
  const same = [...own.matchAll(METHOD_EQ)].map((m) => m[1]);
  if (same.length) return same;
  const found = new Set();
  for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
    if (j !== i && BREAK.test(lines[j])) break;
    for (const m of lines[j].matchAll(METHOD_EQ)) found.add(m[1]);
    if (ne) for (const m of lines[j].matchAll(METHOD_NE)) found.add(m[1]);
  }
  if (found.size) return [...found];
  let minIndent = indentOf(lines[i]);
  for (let j = i - 1; j >= 0 && j >= i - 12; j--) {
    if (!lines[j].trim() || indentOf(lines[j]) >= minIndent) continue;
    minIndent = indentOf(lines[j]);
    const gate = [...lines[j].matchAll(METHOD_EQ)].map((m) => m[1]);
    if (gate.length) return gate;
  }
  return [];
}

// Every route the router sources answer, as { key: "METHOD /path", where }.
function extractRoutes() {
  const routes = new Map();
  const add = (method, path, where) => {
    const key = `${method} ${path}`;
    if (!routes.has(key)) routes.set(key, where);
  };
  for (const file of ROUTER_FILES) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line) || /^\s*const /.test(line) || TEAM_PREFIX.test(line)) return;
      const paths = [];
      for (const m of line.matchAll(PATH_EQ)) paths.push(m[1]);
      for (const m of line.matchAll(REGEX)) paths.push(regexToTemplate(m[1]));
      for (const m of line.matchAll(INCLUDES)) for (const lit of m[1].matchAll(/"([^"]+)"/g)) paths.push(lit[1]);
      for (const path of paths) {
        const methods = methodsFor(lines, i, line).filter((x) => x !== "HEAD");
        if (!methods.length) add("ANY", path, `${file}:${i + 1}`);
        for (const method of methods) add(method, path, `${file}:${i + 1}`);
      }
      for (const m of line.matchAll(PREFIX)) {
        for (const method of [...line.matchAll(METHOD_EQ)].map((x) => x[1])) add(method, `${m[1]}*`, `${file}:${i + 1}`);
      }
    });
  }
  const teamLines = read(TEAM_FILE).split("\n");
  teamLines.forEach((line, i) => {
    const paths = [...line.matchAll(TEAM_PATH)].map((m) => m[1]);
    if (/path === "" \|\| path === "\/"/.test(line)) paths.push("");
    for (const raw of paths) {
      const rel = raw === "/" ? "" : raw;
      const methods = methodsFor(teamLines, i, line, { ne: true }).filter((x) => x !== "HEAD");
      for (const method of methods) for (const mount of TEAM_MOUNTS) add(method, `${mount}${rel}`, `${TEAM_FILE}:${i + 1}`);
    }
  });
  return routes;
}

// OpenAPI keys with every {parameter} name folded together, so /x/{id} and /x/{kind} compare equal.
const fold = (path) => path.replace(/\{[^}]+\}/g, "{}").replace(/\{p\}/g, "{}");

function documented() {
  const doc = JSON.parse(read("docs/openapi.json"));
  const set = new Set();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const method of Object.keys(ops)) {
      set.add(`${method.toUpperCase()} ${fold(path)}`);
      set.add(`ANY ${fold(path)}`);
    }
  }
  return set;
}

function isCovered(key, docs) {
  const [method, ...rest] = key.split(" ");
  const path = fold(rest.join(" "));
  if (path.endsWith("*")) {
    // a prefix route such as POST /api/setup/*: any documented path under the prefix with that method
    const prefix = path.slice(0, -1);
    return [...docs].some((entry) => entry.startsWith(`${method} ${prefix}`));
  }
  return docs.has(`${method} ${path}`);
}

describe("docs/openapi.json covers the implemented routes", () => {
  const routes = extractRoutes();
  const docs = documented();

  test("the router sources yield a real route set, not an empty one", () => {
    expect(routes.size).toBeGreaterThan(100);
  });

  test("every exclusion has a reason and still names a route the router answers", () => {
    for (const [key, reason] of EXCLUDED) {
      expect(reason.trim().length).toBeGreaterThan(10);
      expect(routes.has(key)).toBe(true);
    }
  });

  test("every implemented route is in docs/openapi.json or on the exclusion list", () => {
    const missing = [...routes.keys()]
      .filter((key) => !EXCLUDED.has(key))
      .filter((key) => !isCovered(key, docs))
      .map((key) => `${key}  (${routes.get(key)})`)
      .sort();
    expect(missing).toEqual([]);
  });
});
