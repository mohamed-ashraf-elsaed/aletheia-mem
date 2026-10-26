// T-216: every API route the UI calls exists. The test reads each script in public/ for "/api/hub/..." and "/v1/..."
// paths, starts a real server on a temporary store, and asks for each path. A path the server does not know answers
// with an HTML "Cannot GET" page; a real route answers JSON (even an error such as "No memory has that id").
// It also checks the app page's security header and that the served scripts match the files.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const publicDir = join(import.meta.dir, "..", "public");
const fx = makeFixture();
let app;
let base;

beforeAll(() => {
  const cfg = loadConfig({
    port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), reviewDb: join(fx.dir, "reviews.db"),
    ledgerDir: fx.makeDir("ledger"), humanCopyCache: join(fx.dir, "human-copy.json"), rulesFile: join(fx.dir, "RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"), hubDb: join(fx.dir, "contract.db"), provider: "none", extra: { home: fx.makeDir("home") },
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
});
afterAll(() => app.stop());

/** Every UI file that can call the API: the scripts in public/ and public/tabs/. */
function uiFiles() {
  return [...readdirSync(publicDir).filter((name) => name.endsWith(".js")).map((name) => join(publicDir, name)), ...readdirSync(join(publicDir, "tabs")).map((name) => join(publicDir, "tabs", name))];
}

export function apiPaths() {
  const found = new Map();
  for (const file of uiFiles()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/["'`](\/(?:api\/hub|v1)\/[A-Za-z0-9_\-/.:${}()]*)/g)) {
      let path = match[1].replace(/\$\{[^}]*\}/g, "1").split("?")[0].replace(/\/+$/, "");
      // A trailing slash left by "/api/hub/memories/${id}" becomes /1; a prefix such as "/api/hub/review/" is cut.
      if (!path || path.endsWith("/api/hub") || path === "/v1") continue;
      if (!found.has(path)) found.set(path, new Set());
      found.get(path).add(file.replace(`${publicDir}/`, ""));
    }
  }
  return found;
}

/** The UI builds ids at run time; give the probe an id of the right shape (a goal id is 16 hex digits). */
const probePath = (path) => path.replace(/^\/api\/hub\/goals\/1$/, "/api/hub/goals/0123456789abcdef");

async function exists(rawPath) {
  const path = probePath(rawPath);
  for (const method of ["GET", "POST", "PATCH"]) {
    const withBody = method !== "GET";
    const response = await fetch(`${base}${path}`, { method, headers: withBody ? { "Content-Type": "application/json" } : {}, body: withBody ? "{}" : undefined });
    const type = response.headers.get("content-type") ?? "";
    const text = await response.text().catch(() => "");
    if (response.status !== 404) return { ok: true, method, status: response.status };
    // A route that exists answers 404 with its own reason ("No memory has that id."). An unknown path answers the
    // generic {"error":"Not found."}, or an HTML "Cannot GET" page.
    if (type.includes("json") && !/^\{"error":"Not found\."\}$/.test(text.trim())) return { ok: true, method, status: 404 };
  }
  return { ok: false };
}

describe("T-216: the UI's API contract", () => {
  test("the scripts name a believable number of routes", () => {
    const paths = apiPaths();
    expect(paths.size).toBeGreaterThan(30);
    for (const expected of ["/api/hub/memories", "/api/hub/facts", "/api/hub/review", "/api/hub/review/pairs", "/api/hub/rule-suggestions", "/api/hub/dismissed", "/api/hub/dismiss", "/api/hub/restore", "/api/hub/audit", "/api/hub/doctor", "/api/hub/sync/status", "/api/hub/mcp-links", "/v1/search", "/v1/work", "/v1/work/sessions", "/v1/work/goals", "/v1/health"]) expect(paths.has(expected)).toBe(true);
  });

  test("every path the UI calls is a route the server has", async () => {
    const missing = [];
    for (const [path, files] of apiPaths()) {
      const result = await exists(path);
      if (!result.ok) missing.push(`${path} (used in ${[...files].join(", ")})`);
    }
    expect(missing).toEqual([]);
  });

  test("paths with an id are real routes too, not just a prefix", async () => {
    for (const path of ["/api/hub/memories/1", "/api/hub/review/1", "/api/hub/rules/r1", "/api/hub/rule-suggestions/1", "/api/hub/goals/0123456789abcdef", "/v1/work/session/s1"]) expect((await exists(path)).ok).toBe(true);
  });

  test("an invented path is reported missing, so the check can fail", async () => {
    expect((await exists("/api/hub/does-not-exist")).ok).toBe(false);
  });

  test("the app page has a strict security header, and every script it loads is served as JavaScript", async () => {
    const response = await fetch(`${base}/`);
    const csp = response.headers.get("content-security-policy") ?? "";
    for (const directive of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'"]) expect(csp).toContain(directive);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    const html = await response.text();
    for (const src of html.matchAll(/(?:src|href)="(\/work-view\/[^"]+)"/g)) {
      const asset = await fetch(`${base}${src[1]}`);
      expect({ src: src[1], status: asset.status }).toEqual({ src: src[1], status: 200 });
    }
  });

  test("every module the shell imports is served", async () => {
    const seen = new Set();
    const walk = async (url) => {
      if (seen.has(url)) return;
      seen.add(url);
      const response = await fetch(`${base}${url}`);
      expect({ url, status: response.status }).toEqual({ url, status: 200 });
      const source = await response.text();
      for (const match of source.matchAll(/from\s+"(\.\/[^"]+\.js|\.\.\/[^"]+\.js)"/g)) {
        const next = new URL(match[1], `http://x${url}`).pathname;
        await walk(next);
      }
    };
    await walk("/work-view/one-ui.js");
    for (const tab of ["work", "memory", "rules", "tools"]) await walk(`/work-view/tabs/${tab}.js`);
    expect(seen.size).toBeGreaterThan(25);
  });
});
