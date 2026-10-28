// Quality gate for candidate facts and the reversible `facts clean` command. The fixture is hand-made from the
// junk categories observed in real rules-extracted rows; the reported rates are fixture numbers, not precision on
// real data.
import { describe, expect, test } from "bun:test";
import { cleanFacts, factGateReason, extractFactsByRules, storeFacts } from "../src/hub/facts.mjs";
import { executeJob, enqueueJob, JOB_TYPE } from "../src/hub/queue.mjs";
import { HubStore } from "../src/hub/store.mjs";

const goodTexts = [
  "A lead with no available agent keeps waiting and is retried",
  "The API rate limit is 100 requests per minute",
  "The checkout service uses Postgres 15 for storage",
  "The retry worker requires idempotency keys",
  "The cache stores responses for one hour",
  "The deployment runs on Node 20",
  "The payment webhook retries the event id",
  "The search index rebuilds after a large import",
  "The worker adds jitter to retries",
  "The session summary follows the facts",
  "The database uses a single write transaction",
  "The alert rule sends a webhook",
  "The exporter writes JSON Lines",
  "The importer reads claude-mem data",
  "The service keeps a queue per project",
];

const good = goodTexts.map((text) => {
  const [first, ...rest] = text.split(" ");
  // A rough subject/predicate/object split is enough for the gate; the gate checks text length and the pieces.
  const predicate = rest.find((word) => ["is", "uses", "keeps", "runs", "requires", "stores", "retries", "rebuilds", "adds", "follows", "sends", "writes", "reads"].includes(word)) ?? "uses";
  const subject = rest.slice(0, rest.indexOf(predicate)).join(" ") || first;
  const object = rest.slice(rest.indexOf(predicate) + 1).join(" ") || first;
  return { subject, predicate, object, text, confidence: 0.9 };
});

const junk = [
  { reason: "unbalanced_quotes", fact: { subject: "checkout", predicate: "uses", object: "Postgres", text: 'The checkout uses "Postgres 15', confidence: 0.9 } },
  { reason: "unbalanced_quotes", fact: { subject: "worker", predicate: "uses", object: "key", text: "The worker uses a 'idempotency key", confidence: 0.9 } },
  { reason: "unbalanced_brackets", fact: { subject: "worker", predicate: "uses", object: "Postgres", text: "The worker uses (Postgres 15 for storage", confidence: 0.9 } },
  { reason: "unbalanced_brackets", fact: { subject: "worker", predicate: "uses", object: "Postgres", text: "The worker uses [Postgres 15 for storage", confidence: 0.9 } },
  { reason: "escaped_whitespace", fact: { subject: "worker", predicate: "uses", object: "Postgres", text: "The worker uses Postgres\\nand keeps retrying", confidence: 0.9 } },
  { reason: "escaped_whitespace", fact: { subject: "worker", predicate: "uses", object: "Postgres", text: "The worker uses Postgres\\tfor storage", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "uses", object: "DB raw", text: "The worker uses DB::raw for storage", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "uses", object: "mapping", text: "The worker uses => for mapping", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "uses", object: "rows", text: "The worker uses $limit for rows", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "returns", object: "ok", text: "The worker returns { ok: true }", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "runs", object: "users", text: "The worker runs SELECT * FROM users", confidence: 0.9 } },
  { reason: "code_token", fact: { subject: "worker", predicate: "returns", object: "ok", text: "The worker returns <div>ok</div>", confidence: 0.9 } },
  { reason: "word_count", fact: { subject: "checkout", predicate: "uses", object: "Postgres", text: "checkout uses", confidence: 0.9 } },
  { reason: "word_count", fact: { subject: "a", predicate: "b", object: "c", text: Array(41).fill("a").join(" "), confidence: 0.9 } },
  { reason: "char_count", fact: { subject: "The worker", predicate: "uses", object: "x".repeat(210), text: `The worker uses ${"x".repeat(210)}`, confidence: 0.9 } },
  { reason: "subject_words", fact: { subject: "one two three four five six seven eight nine", predicate: "uses", object: "Postgres", text: "one two three four five six seven eight nine uses Postgres", confidence: 0.9 } },
  { reason: "subject_words", fact: { subject: "", predicate: "uses", object: "Postgres 15 for storage", text: "uses Postgres 15 for storage", confidence: 0.9 } },
  { reason: "subject_continuation", fact: { subject: "how", predicate: "is", object: "done", text: "how is done", confidence: 0.9 } },
  { reason: "subject_continuation", fact: { subject: "to", predicate: "run", object: "tests", text: "to run tests", confidence: 0.9 } },
  { reason: "subject_pronoun", fact: { subject: "There", predicate: "is", object: "no reply header", text: "There is no reply header", confidence: 0.9 } },
  { reason: "subject_pronoun", fact: { subject: "Everything below", predicate: "is", object: "relative to it", text: "Everything below is relative to it", confidence: 0.9 } },
  { reason: "subject_pronoun", fact: { subject: "It", predicate: "is", object: "available", text: "It is available", confidence: 0.9 } },
  { reason: "object_mid_clause", fact: { subject: "The worker", predicate: "depends", object: "on", text: "The worker depends on", confidence: 0.9 } },
  { reason: "object_mid_clause", fact: { subject: "The fix", predicate: "depends", object: "on the queue and", text: "The fix depends on the queue and", confidence: 0.9 } },
  { reason: "object_mid_clause", fact: { subject: "The worker", predicate: "runs", object: "for", text: "The worker runs for", confidence: 0.9 } },
];

describe("fact quality gate", () => {
  test("rejects each junk fixture with its stated reason and keeps every good one", () => {
    let rejected = 0;
    for (const { reason, fact } of junk) {
      expect(factGateReason(fact)).toBe(reason);
      rejected++;
    }
    let kept = 0;
    for (const fact of good) {
      expect(factGateReason(fact)).toBeNull();
      kept++;
    }
    console.log(`fixture: junk rejected ${rejected}/${junk.length} (${((rejected / junk.length) * 100).toFixed(0)}%), good kept ${kept}/${good.length} (${((kept / good.length) * 100).toFixed(0)}%). Fixture numbers, not precision on real data.`);
  });

  test("the confidence floor is a gate reason below facts.minConfidence", () => {
    const goodFact = good[1];
    expect(factGateReason({ ...goodFact, confidence: 0.45 }, { minConfidence: 0.5 })).toBe("confidence_floor");
    expect(factGateReason({ ...goodFact, confidence: 0.5 }, { minConfidence: 0.5 })).toBeNull();
  });

  test("the rule extractor skips prompts and tool output and gates junk in eligible summaries", () => {
    const result = extractFactsByRules([
      { episodeId: 1, kind: "prompt", text: "The checkout service uses Postgres 15." },
      { episodeId: 2, kind: "event", text: "input: npm test\\noutput: 12 passed" },
      { episodeId: 3, kind: "summary", text: "The checkout service uses Postgres 15." },
      { episodeId: 4, kind: "summary", text: "The worker uses DB::raw for storage." },
    ]);
    expect(result.facts.map((fact) => fact.text)).toEqual(["checkout service uses Postgres 15"]);
    expect(result.qualityRejected).toMatchObject({ code_token: 1 });
  });

  test("the capture path extracts facts only from summaries and notes", async () => {
    const store = new HubStore(":memory:");
    store.add({ project: "p", kind: "prompt", title: "prompt", narrative: "The checkout service uses Postgres.", sessionId: "s1" });
    store.add({ project: "p", kind: "event", title: "tool", narrative: "input: npm test output: 12 passed", sessionId: "s1" });
    store.add({ project: "p", kind: "summary", title: "summary", narrative: "The checkout service uses Postgres.", sessionId: "s1" });
    const { id } = enqueueJob(store, JOB_TYPE, { project: "p", sessionId: "s1" });
    const job = store.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    const ask = async (prompt) => {
      const episodeId = Number(/EPISODE_IDS: \[(\d+)\]/.exec(prompt)?.[1]);
      return JSON.stringify({ facts: [{ subject: "checkout service", predicate: "uses", object: "Postgres", text: "The checkout service uses Postgres", confidence: 0.9, episode_ids: [episodeId] }] });
    };
    const result = await executeJob(store, job, { ask, config: { mode: "code", factBudget: { maxEpisodes: 5, maxChars: 2000 } } });
    expect(result.memories).toBe(1);
    expect(result.facts).toBe(1);
    store.close();
  });
});

describe("facts clean", () => {
  test("dry-run counts and shows examples without dismissing; apply dismisses and restore brings rows back", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", kind: "summary", text: "The checkout service uses Postgres." });
    store.addFact({ project: "p", episodeId: episode.id, subject: "checkout", predicate: "uses", object: 'Postgres "15', text: 'The checkout uses "Postgres 15', extractorMode: "rules" });
    store.addFact({ project: "p", episodeId: episode.id, subject: "worker", predicate: "uses", object: "DB raw", text: "The worker uses DB::raw for storage", extractorMode: "rules" });
    store.addFact({ project: "p", episodeId: episode.id, subject: "checkout service", predicate: "uses", object: "Postgres 15", text: "The checkout service uses Postgres 15", extractorMode: "rules" });

    const dry = cleanFacts(store, { apply: false });
    expect(dry.dryRun).toBe(true);
    expect(dry.failed).toBe(2);
    expect(dry.counts.unbalanced_quotes).toBe(1);
    expect(dry.counts.code_token).toBe(1);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM dismissals").get().n).toBe(0);

    const applied = cleanFacts(store, { apply: true });
    expect(applied.dryRun).toBe(false);
    expect(applied.dismissed).toBe(2);
    expect(applied.alreadyDismissed).toBe(0);
    const dismissed = store.dismissedList({ limit: 10 }).filter((row) => row.item_type === "fact");
    expect(dismissed).toHaveLength(2);
    for (const row of dismissed) expect(row.reason).toMatch(/^quality:(unbalanced_quotes|code_token)$/);

    const restored = store.restore("fact", dismissed[0].item_id, { actor: "test" });
    expect(restored.restored).toBe(true);
    expect(store.isDismissed("fact", dismissed[0].item_id)).toBe(false);
    store.close();
  });

  test("storeFacts applies the floor and reports the reason", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "The API rate limit is 100 requests per minute." });
    const result = storeFacts(store, {
      facts: [{ subject: "API rate limit", predicate: "is", object: "100 requests per minute", text: "The API rate limit is 100 requests per minute", confidence: 0.4, episodeIds: [episode.id] }],
      project: "p", mode: "provider", now: 1000,
    });
    expect(result.added).toBe(0);
    expect(result.qualityRejected).toMatchObject({ confidence_floor: 1 });
    store.close();
  });
});
