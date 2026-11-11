// The graph channel is wired into search. The dashboard setting turns it on, storing a fact writes the
// memory-to-entity edge the walk reads, and `aletheia entities` / GET /v1/entities list the entity ids.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { attachFactEntities } from "../src/hub/entities.mjs";
import { graphEnabled } from "../src/hub/graph.mjs";
import { SETTINGS_SCHEMA, validateSetting, writeSettings } from "../src/hub/settings.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const repo = join(import.meta.dir, "..");

/** A memory, its episode, and one fact that names an entity, the way the extraction queue stores them. */
function seedFact(store, { title, narrative, entity, project = "p" }) {
  const memory = store.add({ project, kind: "note", type: "note", title, narrative }, { actor: "import" });
  const episode = store.ensureEpisodeForMemory(store.get(memory.id));
  const fact = store.addFact({ project, episodeId: episode.id, subject: entity, predicate: "relates to", object: title, text: `${entity} relates to ${title}` });
  attachFactEntities(store, { factId: fact.id, project, subject: fact.fact.subject, object: fact.fact.object, text: fact.fact.text, entities: [{ name: entity, type: "service" }] });
  return { memoryId: memory.id, factId: fact.id };
}

describe("graph channel wiring", () => {
  test("storing a fact writes the memory-to-entity edge the walk reads", () => {
    const store = new HubStore(":memory:");
    const { memoryId } = seedFact(store, { title: "retry policy", narrative: "retries use backoff", entity: "billing service" });
    const edge = store.db.prepare("SELECT text FROM memory_keys WHERE owner_type = 'memory' AND owner_id = ? AND key_type = 'entity'").all(memoryId).map((row) => row.text);
    expect(edge).toContain("billing service");
    store.close();
  });

  test("the setting is on the dashboard and defaults to off", () => {
    const store = new HubStore(":memory:");
    expect(SETTINGS_SCHEMA.find((spec) => spec.key === "graph.enabled")?.kind).toBe("boolean");
    expect(validateSetting("graph.enabled", true).ok).toBe(true);
    expect(graphEnabled(store)).toBe(false);
    writeSettings(store, { "graph.enabled": true });
    expect(graphEnabled(store)).toBe(true);
    store.close();
  });

  test("with the setting on a multi-hop query ranks the linked memory; off keeps the old ranking exactly", () => {
    const store = new HubStore(":memory:");
    seedFact(store, { title: "alpha seedword", narrative: "alpha seedword checkout", entity: "billing service" });
    const answer = seedFact(store, { title: "ledger rounding", narrative: "ledger rounding fix", entity: "billing service" });
    const query = { query: "seedword", project: "p", limit: 10 };

    const before = store.ranked(query).map((m) => m.id);
    expect(before).not.toContain(answer.memoryId);

    writeSettings(store, { "graph.enabled": true });
    const on = store.ranked(query).map((m) => m.id);
    expect(on).toContain(answer.memoryId);
    expect(on).not.toEqual(before);
    expect(store.search(query).map((m) => m.id)).toContain(answer.memoryId);

    writeSettings(store, { "graph.enabled": false });
    expect(store.ranked(query).map((m) => m.id)).toEqual(before);
    expect(store.ranked({ ...query, graph: false }).map((m) => m.id)).toEqual(before);
    store.close();
  });

  test("aletheia entities lists ids, names and counts", () => {
    const home = tempDir("aletheia-entities-");
    const dbPath = join(home, "data", "hub.db");
    const store = new HubStore(dbPath);
    seedFact(store, { title: "ledger rounding", narrative: "ledger rounding fix", entity: "billing service" });
    seedFact(store, { title: "other", narrative: "other project", entity: "mail service", project: "q" });
    store.close();
    const run = (...args) => Bun.spawnSync([process.execPath, "bin/aletheia.mjs", "entities", ...args], {
      cwd: repo, env: { ...process.env, HOME: home, ALETHEIA_DATA_DIR: join(home, "data"), ALETHEIA_HUB_DB: dbPath }, timeout: 20000,
    });
    const all = run();
    expect(all.exitCode).toBe(0);
    expect(all.stdout.toString()).toContain("billing service");
    expect(all.stdout.toString()).toContain("mail service");
    const scoped = run("--project", "p", "--json");
    const rows = JSON.parse(scoped.stdout.toString());
    expect(rows.map((row) => row.name)).toContain("billing service");
    expect(rows.map((row) => row.name)).not.toContain("mail service");
    expect(rows.find((row) => row.name === "billing service")).toMatchObject({ project: "p", name: "billing service", type: "service", facts: 1, memories: 1 });
    expect(Number.isInteger(rows[0].id)).toBe(true);
    expect(JSON.parse(run("--limit", "1", "--json").stdout.toString())).toHaveLength(1);
  });
});
