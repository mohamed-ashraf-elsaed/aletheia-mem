// T-113: erase, export first, sign a receipt. Erased text must be gone from the hub tables, the FTS tables, the
// vectors, the sync log (server) and the device replica/outbox, and absent from every export made afterwards.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyErase, erasePlan, formatEraseReport, loadEraseKey, readReceipt, signReceipt, verifyReceipt, writePreEraseExport, writeReceipt,
} from "../src/hub/erasure.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-erase-"));
const TEXT = "ERASE-ME-UNIQUE-LOGIN-TOKEN";
const KEEP = "KEEP-ME-SECOND-PROJECT";
let hub;
let sync;
let client;
let account;

function seed(label, project, at = Date.now()) {
  const memory = hub.add({ project, kind: "note", type: "note", title: label, narrative: label, tool: "test", createdAtEpoch: at });
  const episode = hub.ensureEpisodeForMemory(hub.get(memory.id));
  const observation = hub.addObservation({ project, type: "note", title: label, narrative: label, episodeId: episode.id, createdAtEpoch: at });
  const fact = hub.addFact({ project, subject: `subject-${label}`, predicate: "mentions", object: label, text: `fact ${label}`, episodeId: episode.id, observationId: observation.id, recordedAtEpoch: at });
  hub.setVector(memory.id, "test-model", [1, 0, 0]);
  hub.setFactVector(fact.id, "test-model", [0, 1, 0]);
  hub.addKey({ ownerType: "fact", ownerId: fact.id, keyType: "token", text: label });
  hub.link({ fromType: "fact", fromId: fact.id, toType: "episode", toId: episode.id, relation: "mentions" });
  hub.db.prepare("INSERT INTO summaries (project, scope, period_start_epoch, period_end_epoch, text, source_ids, token_count, created_at_epoch) VALUES (?,?,?,?,?,?,?,?)")
    .run(project, "project", at, at, `summary ${label}`, JSON.stringify([fact.id]), null, at);
  hub.addReview({ itemType: "fact", itemId: fact.id, reason: "test" });
  hub.dismiss("fact", fact.id);
  return { memory, episode, observation, fact };
}

beforeAll(() => {
  hub = new HubStore(join(temp, "hub.db"));
  sync = new SyncStore(join(temp, "sync.db"));
  account = sync.ensureAccount("default");
  client = new SyncClient(join(temp, "client.db"), { deviceId: "device-erase", name: "erase" });
});

afterAll(() => {
  client.close();
  sync.close();
  hub.close();
  rmSync(temp, { recursive: true, force: true });
});

describe("T-113: erase, export and receipt", () => {
  test("the report counts rows and lists ids without printing content", () => {
    seed(TEXT, "shop");
    seed(KEEP, "keep");
    const plan = erasePlan(hub, { project: "shop" });
    expect(plan.counts.memories).toBe(1);
    expect(plan.counts.observations).toBe(1);
    expect(plan.counts.episodes).toBe(1);
    expect(plan.counts.facts).toBe(1);
    expect(plan.counts.summaries).toBe(1);
    expect(plan.ids.memories.length).toBe(1);
    const report = formatEraseReport(plan);
    expect(report).toContain("Erasure report");
    expect(report).toContain("memories");
    expect(report).not.toContain(TEXT);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE project = 'shop'").get().n).toBe(1);
  });

  test("apply removes the content from tables, FTS, vectors, sync log and the outbox; exports after it are clean", () => {
    // One pushed op and one unacked outbox op for the erased project.
    const pushed = client.put("memory", { project: "shop", id: 1, title: TEXT, narrative: TEXT });
    sync.pushOps(account.id, [pushed]);
    client.markAcked(pushed.seq);
    const outboxOnly = client.put("fact", { project: "shop", id: 2, text: TEXT });
    expect(client.outbox().length).toBeGreaterThan(0);
    expect(sync.findEntities({ project: "shop" }).length).toBeGreaterThan(0);

    const plan = erasePlan(hub, { project: "shop" });
    const memoryId = plan.ids.memories[0];
    const factId = plan.ids.facts[0];
    const exportPath = join(temp, "erasure-exports", "before.jsonl");
    writePreEraseExport(hub, { path: exportPath, project: "shop" });
    expect(readFileSync(exportPath, "utf8")).toContain(TEXT); // export first

    const result = applyErase(hub, plan, { syncStore: sync, syncClient: client, accountId: account.id, project: "shop" });
    expect(result.counts.memories).toBe(1);
    expect(result.sync.entities).toBeGreaterThan(0);

    // Hub tables and every derived index.
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE project = 'shop'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM observations WHERE project = 'shop'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM episodes WHERE project = 'shop'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE project = 'shop'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM summaries WHERE project = 'shop'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memory_vectors WHERE memory_id = ?").get(memoryId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM fact_vectors WHERE fact_id = ?").get(factId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memory_keys WHERE owner_type = 'fact' AND owner_id = ?").get(factId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memory_links WHERE from_id = ? OR to_id = ?").get(factId, factId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM dismissals WHERE item_type = 'fact' AND item_id = ?").get(factId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM review_queue WHERE item_type = 'fact' AND item_id = ?").get(factId).n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memories_fts WHERE memories_fts MATCH 'erase'").get().n).toBe(0);
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM facts_fts WHERE facts_fts MATCH 'erase'").get().n).toBe(0);
    expect(hub.searchAll({ query: TEXT }).length).toBe(0);
    expect(hub.searchFacts({ query: TEXT }).length).toBe(0);

    // The server log keeps only a content-free tombstone.
    expect(sync.db.prepare("SELECT COUNT(*) AS n FROM sync_head WHERE payload LIKE ?").get(`%${TEXT}%`).n).toBe(0);
    expect(sync.db.prepare("SELECT COUNT(*) AS n FROM sync_op WHERE body LIKE ?").get(`%${TEXT}%`).n).toBe(0);
    const tombstone = sync.db.prepare("SELECT kind, deleted, payload FROM sync_head WHERE entity_id = ?").get(pushed.entity_id);
    expect(tombstone.kind).toBe("delete");
    expect(tombstone.deleted).toBe(1);
    expect(tombstone.payload).toBeNull();

    // The device replica and outbox.
    expect(client.outbox().length).toBe(0);
    expect(client.db.prepare("SELECT COUNT(*) AS n FROM sync_op WHERE payload LIKE ?").get(`%${TEXT}%`).n).toBe(0);
    expect(client.db.prepare("SELECT COUNT(*) AS n FROM sync_op").get().n).toBe(0);

    // The untouched project is still there, and new exports do not contain the erased text.
    expect(hub.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE project = 'keep'").get().n).toBe(1);
    expect(hub.exportBundle()).not.toContain(TEXT);
    expect(hub.exportMarkdown()).not.toContain(TEXT);
    expect(hub.exportBundle()).toContain(KEEP);
  });

  test("a signed receipt verifies, and a changed receipt does not", () => {
    const plan = erasePlan(hub, { project: "keep" });
    const keyPath = join(temp, "erasure.key");
    const key = loadEraseKey(keyPath);
    expect(existsSync(keyPath)).toBe(true);
    const receipt = signReceipt(plan, { key, exports: ["before.jsonl"] });
    const receiptPath = join(temp, "erasure-receipts", `${receipt.id}.json`);
    writeReceipt(receipt, receiptPath);
    expect(verifyReceipt(readReceipt(receiptPath), key).ok).toBe(true);
    expect(verifyReceipt({ ...receipt, counts: { ...receipt.counts, memories: receipt.counts.memories + 1 } }, key).ok).toBe(false);
    expect(verifyReceipt(receipt, loadEraseKey(join(temp, "other.key"))).ok).toBe(false);
    expect(readFileSync(receiptPath, "utf8")).not.toContain(KEEP);
    expect(readFileSync(receiptPath, "utf8")).not.toContain(TEXT);
    // The key file is not world-readable.
    expect((statSync(keyPath).mode & 0o077)).toBe(0);
  });

  test("erase by id removes only the named memory and its provenance chain", () => {
    const target = seed("ID-ONLY-ME", "one");
    const other = seed("STAY-HERE", "one");
    const plan = erasePlan(hub, { ids: [`memory:${target.memory.id}`] });
    expect(plan.counts.memories).toBe(1);
    applyErase(hub, plan, { project: null });
    expect(hub.get(target.memory.id)).toBeNull();
    expect(hub.get(other.memory.id)).not.toBeNull();
    expect(hub.getFact(target.fact.id)).toBeNull();
    expect(hub.getFact(other.fact.id)).not.toBeNull();
    expect(hub.getEpisode(target.episode.id)).toBeNull();
  });

  test("erase --before removes old rows and leaves newer ones", () => {
    const day = 24 * 60 * 60_000;
    const old = seed("OLD-ROW-BEFORE", "time", Date.now() - 2 * day);
    const recent = seed("NEW-ROW-BEFORE", "time", Date.now());
    const plan = erasePlan(hub, { project: "time", before: Date.now() - day });
    expect(plan.counts.memories).toBe(1);
    applyErase(hub, plan, { project: "time" });
    expect(hub.get(old.memory.id)).toBeNull();
    expect(hub.get(recent.memory.id)).not.toBeNull();
  });

  test("an unknown id selector is refused before anything changes", () => {
    expect(() => erasePlan(hub, { ids: ["not-an-id"] })).toThrow(/Unknown id/);
    expect(() => erasePlan(hub, {})).toThrow(/Choose/);
  });
});
