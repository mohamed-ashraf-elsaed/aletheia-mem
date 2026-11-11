// Chinese, Japanese and Korean words inside stored text. The keyword index keeps a run of CJK characters as one
// token, so a word inside a sentence was never found. A bigram channel fixes that; these tests pin it down, along
// with the additive migration that indexes rows written before the channel existed.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { callTool } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { formatChannels, searchMemory } from "../src/hub/search.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { makeV2Store } from "./v2-fixture.mjs";

afterAll(cleanupTempDirs);

const root = join(import.meta.dir, "..");
const ZH = "我们在项目里使用数据库迁移工具";
const JA = "本番環境ではデータベースの移行ツールを使います";
const KO = "배포 전에 서버를 재시작합니다";

const fresh = () => {
  const store = new HubStore(":memory:");
  const add = (text, project = "shop") => store.add({ project, kind: "note", title: text, narrative: text, tool: "cli" }).id;
  return { store, add };
};

const memoryIds = async (store, query, project = "shop") =>
  (await searchMemory({ store, query, project })).results.filter((row) => row.kind === "memory").map((row) => row.id);

describe("CJK words inside stored sentences", () => {
  test("a two-character Chinese word is found inside a sentence", async () => {
    const { store, add } = fresh();
    const hit = add(ZH);
    const miss = add("我们今天部署了新版本");
    add("We use a database migration tool in this project");
    expect(await memoryIds(store, "迁移")).toEqual([hit]);
    expect(await memoryIds(store, "数据库")).toEqual([hit]);
    expect(await memoryIds(store, "我们")).toEqual(expect.arrayContaining([hit, miss]));
    store.close();
  });

  test("a two-character Japanese word is found inside a sentence", async () => {
    const { store, add } = fresh();
    const hit = add(JA);
    add("本番環境では毎週バックアップを取ります");
    expect(await memoryIds(store, "移行")).toEqual([hit]);
    expect(await memoryIds(store, "ツール")).toEqual([hit]);
    store.close();
  });

  test("a two-character Korean word is found inside a word with a particle", async () => {
    const { store, add } = fresh();
    const hit = add(KO);
    add("배포 전에 테스트를 실행합니다");
    expect(await memoryIds(store, "서버")).toEqual([hit]);
    expect(await memoryIds(store, "재시작")).toEqual([hit]);
    store.close();
  });

  test("a single character at the end of a run is found", async () => {
    const { store, add } = fresh();
    const hit = add(ZH);
    expect(await memoryIds(store, "具")).toEqual([hit]);
    store.close();
  });

  test("a CJK question ranks the row that shares the most words first", async () => {
    const { store, add } = fresh();
    const hit = add(ZH);
    add("数据分析报告已经完成");
    const ids = await memoryIds(store, "怎么做数据库迁移");
    expect(ids[0]).toBe(hit);
    store.close();
  });

  test("a mixed query fuses the CJK channel with the English channel", async () => {
    const { store, add } = fresh();
    const zh = add(ZH);
    const en = add("Postgres connection pool settings");
    expect(await memoryIds(store, "迁移 postgres")).toEqual(expect.arrayContaining([zh, en]));
    store.close();
  });

  test("the project filter applies to the CJK channel", async () => {
    const { store, add } = fresh();
    const mine = add(ZH, "shop");
    add(ZH.replace("我们", "他们"), "other");
    expect(await memoryIds(store, "迁移", "shop")).toEqual([mine]);
    store.close();
  });

  test("an edit or a delete takes the old words out of the CJK channel", async () => {
    const { store, add } = fresh();
    const id = add(ZH);
    expect(await memoryIds(store, "迁移")).toEqual([id]);
    store.update(id, { title: "我们在项目里使用缓存", narrative: "我们在项目里使用缓存" });
    expect(await memoryIds(store, "迁移")).toEqual([]);
    expect(await memoryIds(store, "缓存")).toEqual([id]);
    store.remove(id);
    expect(await memoryIds(store, "缓存")).toEqual([]);
    store.close();
  });

  test("facts written in CJK are found by a word inside them", async () => {
    const { store } = fresh();
    const episode = store.addEpisode({ project: "shop", text: ZH, createdAtEpoch: 1000 });
    const fact = store.addFact({ project: "shop", episodeId: episode.id, subject: "项目", predicate: "使用", object: "数据库迁移工具", text: ZH, validFromEpoch: 1000 });
    const facts = store.searchFacts({ query: "迁移", project: "shop" });
    expect(facts.map((row) => row.id)).toEqual([fact.id]);
    const { results } = await searchMemory({ store, query: "迁移", project: "shop" });
    expect(results.some((row) => row.kind === "fact" && row.id === fact.id)).toBe(true);
    store.close();
  });

  test("--explain names the CJK channel only when the query has CJK text", async () => {
    const { store, add } = fresh();
    add(ZH);
    add("webhook retry");
    const cjk = await searchMemory({ store, query: "迁移", project: "shop" });
    expect(formatChannels(cjk.channels)).toContain("cjk=on");
    const english = await searchMemory({ store, query: "webhook retry", project: "shop" });
    expect(formatChannels(english.channels)).toBe("channels: facts lexical=on keys=on vectors=off; episodes lexical=on vectors=off; fusion=rrf");
    store.close();
  });

  test("an English query returns the same rows as before", () => {
    const { store, add } = fresh();
    const a = add("Webhook retries use exponential backoff");
    add(ZH);
    const b = add("Retry the webhook sender");
    expect(store.ranked({ query: "webhook retry", project: "shop" }).map((row) => row.id).sort()).toEqual([a, b].sort());
    store.close();
  });

  test("the MCP search tool finds a word inside a Japanese sentence", async () => {
    const { store, add } = fresh();
    add(JA);
    const reply = await callTool("search", { query: "移行", project: "shop" }, { store, tool: "test", cwd: process.cwd() });
    expect(reply.isError).toBeFalsy();
    expect(reply.content[0].text).toContain(JA);
    store.close();
  });

  test("POST /v1/search finds a word inside a Korean sentence", async () => {
    const fx = makeFixture();
    const cfg = loadConfig({ port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "o.db"), reviewDb: join(fx.dir, "r.db"), hubDb: join(fx.dir, "hub.db"), ledgerDir: fx.makeDir("ledger"), humanCopyCache: join(fx.dir, "hc.json"), rulesFile: join(fx.dir, "R.md"), claudeInstructionsFile: join(fx.dir, "C.md"), provider: "none", extra: { home: fx.makeDir("home") } });
    const app = startServer(cfg);
    try {
      const base = `http://127.0.0.1:${app.server.port}`;
      const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((res) => res.json());
      const saved = await post("/v1/memories", { project: "shop", title: KO, text: KO });
      const plain = await post("/v1/search", { query: "서버", project: "shop" });
      expect(plain.results.map((row) => row.id)).toEqual([saved.id]);
      const paged = await post("/v1/search", { query: "서버", project: "shop", paged: true });
      expect(paged.results.map((row) => row.id)).toEqual([saved.id]);
    } finally {
      app.stop();
    }
  });

  test("the CLI finds a word inside a saved Chinese sentence", async () => {
    const home = tempDir("aletheia-cjk-");
    const env = { ...process.env, HOME: home, ALETHEIA_DATA_DIR: join(home, "data"), ALETHEIA_HUB_DB: join(home, "data", "hub.db") };
    const run = (args) => Bun.spawnSync([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { cwd: root, env, stdin: "ignore" });
    expect(run(["save", ZH, "--project", "shop"]).exitCode).toBe(0);
    const out = run(["search", "数据库", "--project", "shop", "--explain"]);
    const text = out.stdout.toString();
    expect(out.exitCode).toBe(0);
    expect(text).toContain(ZH);
    expect(text).not.toContain("No matches.");
    expect(text).toContain("cjk=on");
  }, 30_000);
});

describe("stores written before the CJK channel", () => {
  test("a schema-v2 store migrates, keeps every row and finds its old CJK text", async () => {
    const dir = tempDir("aletheia-cjk-v2-");
    const dbPath = join(dir, "hub.db");
    const made = makeV2Store(dbPath, { notes: 20, prompts: 5, events: 5 });
    const raw = new Database(dbPath);
    const at = 1_700_000_000_000;
    const legacy = Number(raw.prepare(`INSERT INTO memories (project, kind, type, title, narrative, tool, content_hash, created_at_epoch, updated_at_epoch)
      VALUES ('legacy', 'observation', 'note', ?, ?, 'claude-code', 'hash-cjk-1', ?, ?)`).run(KO, ZH, at, at).lastInsertRowid);
    raw.close();

    const store = new HubStore(dbPath);
    expect(store.db.prepare("PRAGMA user_version").get().user_version).toBe(3);
    expect(store.migrationCounts().memories).toBe(made.total + 1);
    expect(store.get(legacy)).toMatchObject({ title: KO, narrative: ZH });
    expect(await memoryIds(store, "迁移", "legacy")).toEqual([legacy]);
    expect(await memoryIds(store, "서버", "legacy")).toEqual([legacy]);
    expect(store.search({ query: "legacy", limit: 3 }).length).toBe(3);
    store.close();
  });

  test("a v3 store from before the channel opens, keeps its rows and finds its old CJK text", async () => {
    const dir = tempDir("aletheia-cjk-v3-");
    const dbPath = join(dir, "hub.db");
    const first = new HubStore(dbPath);
    const zh = first.add({ project: "shop", kind: "note", title: ZH, narrative: ZH, tool: "cli" }).id;
    const ja = first.add({ project: "shop", kind: "note", title: JA, narrative: JA, tool: "cli" }).id;
    first.add({ project: "shop", kind: "note", title: "English only", narrative: "English only", tool: "cli" });
    const episode = first.addEpisode({ project: "shop", text: KO, createdAtEpoch: 1000 });
    const fact = first.addFact({ project: "shop", episodeId: episode.id, subject: "배포", predicate: "전에", object: "서버를 재시작", text: KO, validFromEpoch: 1000 });
    first.close();

    // Strip whatever the CJK channel added, so the file looks like one written by the previous release.
    const raw = new Database(dbPath);
    const objects = raw.prepare("SELECT type, name, sql FROM sqlite_master WHERE name LIKE '%cjk%'").all();
    for (const row of objects.filter((o) => o.type === "trigger")) raw.exec(`DROP TRIGGER IF EXISTS "${row.name}"`);
    for (const row of objects.filter((o) => o.type === "table" && /^CREATE VIRTUAL/i.test(o.sql ?? ""))) raw.exec(`DROP TABLE IF EXISTS "${row.name}"`);
    for (const row of objects.filter((o) => o.type === "table")) raw.exec(`DROP TABLE IF EXISTS "${row.name}"`);
    raw.exec("DELETE FROM settings WHERE key LIKE 'schema.cjk%'");
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%cjk%'").get().n).toBe(0);
    const before = raw.prepare("SELECT COUNT(*) AS n FROM memories").get().n;
    raw.close();

    const store = new HubStore(dbPath);
    expect(store.db.prepare("PRAGMA user_version").get().user_version).toBe(3);
    expect(store.migrationCounts().memories).toBe(before);
    expect(await memoryIds(store, "迁移")).toEqual([zh]);
    expect(await memoryIds(store, "移行")).toEqual([ja]);
    expect(store.searchFacts({ query: "서버", project: "shop" }).map((row) => row.id)).toEqual([fact.id]);
    store.close();
  });
});
