// one contract test per documented route (docs/03-http-api.md and the docs/06-frontend.md paging table).
// The manifest in route-manifest.mjs is the single source of truth; it also drives scripts/check-openapi.mjs.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { loadEraseKey } from "../src/hub/erasure.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { ROUTES } from "./route-manifest.mjs";
import { tempDir } from "./temp-dirs.mjs";

const fx = makeFixture();
const dir = tempDir("routes-contract-");
const dbPath = join(dir, "hub.db");
let app;
let base;

beforeAll(() => {
  app = startServer(loadConfig({
    port: 0,
    dataDir: dir,
    hubDb: dbPath,
    sourceDb: fx.dbPath,
    overlayDb: join(dir, "overlay.db"),
    reviewDb: join(dir, "reviews.db"),
    ledgerDir: join(dir, "ledger"),
    humanCopyCache: join(dir, "human-copy.json"),
    rulesFile: join(dir, "MY-RULES.md"),
    claudeInstructionsFile: join(dir, "CLAUDE.md"),
    publicDir: join(import.meta.dir, "..", "public"),
    provider: "none",
    autoRefresh: false,
  }));
  base = `http://127.0.0.1:${app.server.port}`;
  app.hub.add({ project: "p", kind: "note", title: "needle", narrative: "needle", session_id: "s1", createdAtEpoch: Date.UTC(2026, 0, 1) });
  app.hub.addEpisode({ project: "p", tool: "t", role: "user", text: "build the thing", sessionId: "s1", sourceRef: "s1", createdAtEpoch: Date.UTC(2026, 0, 1) });
  loadEraseKey(join(dir, "erasure.key"));
});

afterAll(() => app.stop());

const substitute = (value) => {
  if (typeof value === "string") return value.replaceAll("@FIXTURE_DIR", fx.dir);
  if (Array.isArray(value)) return value.map(substitute);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, substitute(v)]));
  return value;
};

const call = (route) => fetch(`${base}${route.path}`, {
  method: route.method,
  headers: { "Content-Type": "application/json" },
  body: route.body ? JSON.stringify(substitute(route.body)) : undefined,
});

const CONTENT = { json: "application/json", html: "text/html", text: "text/plain", sse: "text/event-stream" };

describe("documented routes match their contract", () => {
  for (const route of ROUTES) {
    test(`${route.method} ${route.template}`, async () => {
      const res = await call(route);
      expect(res.status).toBe(route.status);
      const type = res.headers.get("content-type") ?? "";
      expect(type).toContain(CONTENT[route.type]);
      if (route.type === "sse") {
        await res.body?.cancel?.();
        return;
      }
      if (route.type === "json" && route.keys.length) {
        const body = await res.json();
        for (const key of route.keys) expect(body).toHaveProperty(key);
      } else {
        await res.body?.cancel?.();
      }
    });
  }
});

describe("wrong methods and unknown paths never answer 200", () => {
  const refused = async (method, path) => {
    const res = await fetch(`${base}${path}`, { method });
    expect(res.status).not.toBe(200);
  };
  test("DELETE /health", () => refused("DELETE", "/health"));
  test("POST /health", () => refused("POST", "/health"));
  test("GET /api/hub/memories/abc", () => refused("GET", "/api/hub/memories/abc"));
  test("DELETE /v1/work", () => refused("DELETE", "/v1/work"));
  test("PATCH /health", () => refused("PATCH", "/health"));
});

describe("the optional bearer key is enforced on /v1", () => {
  const guardDir = tempDir("routes-contract-key-");
  const guardDb = join(guardDir, "hub.db");
  let guarded;
  let guardedBase;

  beforeAll(() => {
    guarded = startServer(loadConfig({
      port: 0,
      dataDir: guardDir,
      hubDb: guardDb,
      sourceDb: join(guardDir, "no-source.db"),
      publicDir: join(import.meta.dir, "..", "public"),
      provider: "none",
      autoRefresh: false,
      apiKey: "secret",
    }));
    guardedBase = `http://127.0.0.1:${guarded.server.port}`;
  });

  afterAll(() => guarded.stop());

  test("a /v1 read without the key is 401, with it 200", async () => {
    expect((await fetch(`${guardedBase}/v1/info`)).status).toBe(401);
    expect((await fetch(`${guardedBase}/v1/info`, { headers: { Authorization: "Bearer secret" } })).status).toBe(200);
  });
});
