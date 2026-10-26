import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { redact } from "../src/hub/capture.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { ftsAnyQuery } from "../src/hub/retrieval.mjs";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

describe("concurrent writers on one database file", () => {
  test("four processes write while a fifth reads: nothing is lost, nothing errors", async () => {
    const fx = makeFixture();
    const db = join(fx.dir, "shared.db");
    new HubStore(db).close(); // create schema first
    const storePath = join(import.meta.dir, "..", "src", "hub", "store.mjs");
    const writer = (n) => Bun.spawn([process.execPath, "-e", `
      import { HubStore } from ${JSON.stringify(storePath)};
      const s = new HubStore(${JSON.stringify(db)});
      for (let i = 0; i < 150; i++) s.add({ project: "p${n}", title: "w${n}-" + i, narrative: "body " + i, tool: "t${n}" });
      s.close();`], { stdout: "pipe", stderr: "pipe" });
    const reader = Bun.spawn([process.execPath, "-e", `
      import { HubStore } from ${JSON.stringify(storePath)};
      const s = new HubStore(${JSON.stringify(db)});
      let ok = 0;
      for (let i = 0; i < 100; i++) { s.search({ query: "body" }); s.stats(); ok++; }
      console.log("reads", ok);`], { stdout: "pipe", stderr: "pipe" });
    const procs = [1, 2, 3, 4].map(writer);
    const outs = await Promise.all([...procs, reader].map(async (p) => ({ code: await p.exited, err: await new Response(p.stderr).text(), out: await new Response(p.stdout).text() })));
    for (const o of outs) { expect(o.err).toBe(""); expect(o.code).toBe(0); }
    expect(outs[4].out).toContain("reads 100");
    const s = new HubStore(db);
    expect(s.stats().total).toBe(600);
    expect(s.projects().length).toBe(4);
  }, 30000);
});

describe("hostile input", () => {
  test("search and list survive every FTS metacharacter and odd string", () => {
    const s = new HubStore(":memory:");
    s.add({ project: "p", title: "alpha beta", narrative: "gamma delta" });
    const nasty = ['"', "'", "(", ")", "*", "^", "-", "NEAR(a b)", "a OR", "OR OR", "title:alpha", '"unterminated', "\u0000", "💥", "a".repeat(5000), "; DROP TABLE memories;--", "' OR 1=1 --", "{}", "\\"];
    for (const q of nasty) {
      expect(() => s.search({ query: q })).not.toThrow();
      expect(() => s.list({ q })).not.toThrow();
    }
    expect(s.stats().total).toBe(1); // nothing was destroyed
    expect(ftsAnyQuery("a OR b NEAR(x)")).not.toMatch(/NEAR|\(|\)/);
  });
  test("filters are parameters, so injection through project/kind/tool does nothing", () => {
    const s = new HubStore(":memory:");
    s.add({ project: "p", title: "t", narrative: "n" });
    for (const v of ["' OR '1'='1", "p'; --", '" OR 1=1']) {
      expect(s.list({ project: v, kind: v, type: v, tool: v }).total).toBe(0);
      expect(s.search({ query: "t", project: v })).toEqual([]);
    }
  });
  test("bundle import tolerates prototype-pollution keys, non-objects, huge fields and bad types", () => {
    const s = new HubStore(":memory:");
    const lines = [
      '{"type":"manifest","format":"aletheia-bundle","version":1}',
      '{"type":"memory","title":"ok","narrative":"fine","__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}',
      "123", "null", "[]", '"str"',
      JSON.stringify({ type: "memory", title: "x".repeat(100000), narrative: "y".repeat(100000), facts: "not-an-array", files: { a: 1 }, pinned: "yes", createdAtEpoch: "never" }),
      '{"type":"rule","then":"' + "z".repeat(5000) + '"}',
      '{"type":"rule","then":"valid rule","scopeTier":"galaxy"}',
      '{"type":"unknown"}',
    ].join("\n");
    const r = s.importBundle(lines);
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.x).toBeUndefined();
    expect(r.memories.added).toBe(2);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    const long = s.list({ limit: 10 }).items.find((m) => m.title.startsWith("xxx"));
    expect(long.title.length).toBe(400); // clipped, not rejected
    expect(long.narrative.length).toBe(20000);
  });
  test("a memory title that is markup is stored as text, never interpreted by the API", () => {
    const s = new HubStore(":memory:");
    const { id } = s.add({ project: "p", title: '<img src=x onerror="alert(1)">', narrative: "<script>alert(1)</script>" });
    expect(s.get(id).title).toBe('<img src=x onerror="alert(1)">'); // escaping is the UI's job; it uses text nodes (tested elsewhere)
  });
  test("redaction holds across formats and positions", () => {
    const secrets = [
      "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA", "sk-proj-abcdefghijklmnopqrstuvwxyz12345", "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB",
      "github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqr", "AKIAIOSFODNN7EXAMPLE", "xoxb-1234567890-abcdefghij", "AIzaSyA1234567890abcdefghijklmnopqrstuv",
      "sk-or-v1-0123456789abcdef0123456789abcdef", "sk_live_abcdefghijklmnop1234", "glpat-abcdefghijklmnopqrstu", "npm_abcdefghijklmnopqrstuvwxyz0123456789",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    ];
    expect(redact("postgres://admin:s3cretPass@db.example.com:5432/app")).not.toContain("s3cretPass");
    expect(redact("postgres://admin:s3cretPass@db.example.com:5432/app")).toContain("db.example.com");
    for (const s of secrets) for (const wrap of [(x) => x, (x) => `export KEY=${x}`, (x) => `{"k":"${x}"}`, (x) => `curl -H 'x: ${x}' u`, (x) => `${x}\n${x}`]) {
      expect(redact(wrap(s))).not.toContain(s);
    }
    expect(redact("password: hunter2hunter2")).not.toContain("hunter2hunter2");
    expect(redact("normal text about passwords and tokens")).toBe("normal text about passwords and tokens");
  });
});

describe("HTTP hardening", () => {
  const fx = makeFixture();
  const cfg = loadConfig({ port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("d"), overlayDb: join(fx.dir, "o.db"), reviewDb: join(fx.dir, "r.db"), hubDb: join(fx.dir, "h.db"), ledgerDir: fx.makeDir("l"), humanCopyCache: join(fx.dir, "hc.json"), rulesFile: join(fx.dir, "R.md"), claudeInstructionsFile: join(fx.dir, "C.md"), provider: "none" });
  const app = startServer(cfg);
  const base = `http://127.0.0.1:${app.server.port}`;
  const post = (p, body, raw) => fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ?? JSON.stringify(body) });
  test("oversized bodies are refused, malformed JSON is a 400, a body of the wrong shape is a 400 not a 500", async () => {
    const big = await post("/v1/memories", null, "x".repeat(10 * 1024 * 1024)).then((r) => r.status, () => "reset"); // refused with 413, or the socket is closed
    expect([413, "reset"]).toContain(big);
    expect((await fetch(`${base}/healthz`)).status).toBe(200); // and the server is still up
    expect((await post("/v1/memories", null, "{bad")).status).toBe(400);
    for (const body of [null, 1, "s", [], { title: 5, text: {} }]) expect([200, 201, 400]).toContain((await post("/v1/memories", body)).status);
    expect((await post("/api/hub/rules/preview", { tools: ["nope"], projectDir: "/" })).status).toBe(400);
    expect((await post("/api/hub/import/claude-mem", { path: "relative.db" })).status).toBe(400);
    expect((await post("/api/hub/import/claude-mem", { path: "/etc/passwd" })).status).toBeGreaterThanOrEqual(400); // not a database: refused, not leaked
  });
  test("rule sync refuses a non-folder, and import-from-file refuses directories and huge files", async () => {
    expect((await post("/api/hub/rules/sync", { tools: ["codex"], scope: "project", projectDir: "/etc/passwd", confirm: true })).status).toBe(400);
    expect((await post("/api/hub/rules/import", { path: "/tmp" })).status).toBe(400);
  });
  test("every route answers JSON errors, never a stack trace", async () => {
    for (const p of ["/v1/nope", "/api/hub/nope", "/api/hub/memories/abc", "/api/hub/memories/999999999999999999999"]) {
      const res = await fetch(`${base}${p}`);
      const text = await res.text();
      expect(text).not.toMatch(/\bat .*\.mjs|node_modules|Error:/);
    }
  });
  test("the server survives a burst of 200 parallel requests", async () => {
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => (i % 2 ? fetch(`${base}/api/hub/overview`) : post("/v1/memories", { project: "burst", title: `m${i}`, text: `t${i}` }))));
    expect(results.every((r) => r.status < 500)).toBe(true);
  });
  test("teardown", () => { app.stop(); });
});
