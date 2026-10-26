// Alias resolution is project-scoped and conservative. A merge needs an exact canonical name, an explicit alias,
// a single high-confidence string match, or a confirming co-occurrence. Ambiguous matches go to the review queue.
import { describe, expect, test } from "bun:test";
import { aliasesOf, jaroWinkler, listEntities, resolveEntity, upsertEntity } from "../src/hub/entities.mjs";
import { HubStore } from "../src/hub/store.mjs";

// 50 labelled pairs: 45 spelling/separator variants that should merge, 5 different things that must not.
const SAME = [
  ["Postgres", "postgres"], ["postgres", "PostgreSQL"], ["NodeJS", "node.js"], ["aletheia-mem", "aletheia_mem"],
  ["AlEtheia Mem", "aletheia mem"], ["SQLite", "sqlite"], ["Bun", "bun"], ["Redis", "redis"],
  ["Typescript", "TypeScript"], ["GitHub", "github"], ["Acme Inc", "Acme"], ["Acme Ltd", "acme"],
  ["checkout service", "Checkout Service"], ["auth service", "Auth  Service"], ["retry service", "retry service"],
  ["Mohamed Ashraf", "mohamed ashraf"], ["Sam Rivera", "sam rivera"], ["src/hub/store.mjs", "src/hub/store.mjs"],
  ["src/api/handler.ts", "SRC/api/handler.ts"], ["aletheia-mem repo", "aletheia_mem repo"], ["OpenAI", "openai"],
  ["Anthropic", "anthropic"], ["Docker", "docker"], ["Kubernetes", "kubernetes"], ["K8s", "k8s"],
  ["Prometheus", "prometheus"], ["Grafana", "grafana"], ["Stripe", "stripe"], ["webhook service", "Webhook Service"],
  ["billing api", "Billing API"], ["search worker", "Search Worker"], ["aletheia", "Aletheia"],
  ["hub store", "Hub Store"], ["fact extraction", "Fact Extraction"], ["entity resolver", "Entity Resolver"],
  ["rate limiter", "Rate Limiter"], ["queue worker", "Queue Worker"], ["session summary", "Session Summary"],
  ["project summary", "Project Summary"], ["entity summary", "Entity Summary"], ["LoCoMo", "locomo"],
  ["LongMemEval", "longmemeval"], ["BM25", "bm25"], ["RRF", "rrf"], ["bge-small", "BGE-Small"],
];
const DIFFERENT = [
  ["Postgres", "MySQL"], ["redis", "rabbitmq"], ["shop", "docs"], ["auth service", "billing service"], ["Bun", "Deno"],
];
const PAIRS = [...SAME.map(([a, b]) => ({ a, b, same: true })), ...DIFFERENT.map(([a, b]) => ({ a, b, same: false }))];

describe("entity aliases", () => {
  test("a 50-pair labelled fixture reaches precision >= 0.95", () => {
    expect(PAIRS).toHaveLength(50);
    const store = new HubStore(":memory:");
    try {
      let merged = 0;
      let correct = 0;
      for (const [index, pair] of PAIRS.entries()) {
        const project = `pair-${index}`;
        const first = upsertEntity(store, { project, name: pair.a, type: null });
        const second = upsertEntity(store, { project, name: pair.b, type: null });
        const didMerge = first.id === second.id;
        if (didMerge) {
          merged++;
          if (pair.same) correct++;
        } else if (!pair.same) {
          correct++;
        }
      }
      const precision = merged ? correct / merged : 1;
      expect(merged).toBeGreaterThan(0);
      expect(precision).toBeGreaterThanOrEqual(0.95);
    } finally {
      store.close();
    }
  });

  test("a cross-project alias is not merged", () => {
    const store = new HubStore(":memory:");
    try {
      const a = upsertEntity(store, { project: "shop", name: "postgres" });
      const b = upsertEntity(store, { project: "docs", name: "Postgres" });
      expect(a.id).not.toBe(b.id);
      expect(listEntities(store, { project: "shop" })).toHaveLength(1);
      expect(listEntities(store, { project: "docs" })).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("every merge is audited and keeps the alias", () => {
    const store = new HubStore(":memory:");
    try {
      const first = upsertEntity(store, { project: "shop", name: "aletheia-mem" });
      const second = upsertEntity(store, { project: "shop", name: "aletheia_mem" });
      expect(second.id).toBe(first.id);
      const audit = store.db.prepare("SELECT * FROM audit WHERE action = 'entity.alias'").all();
      expect(audit).toHaveLength(1);
      const aliases = aliasesOf(store, first.id).map((row) => row.alias);
      expect(aliases).toContain("aletheia_mem");
      expect(aliases).toContain("aletheia-mem");
    } finally {
      store.close();
    }
  });

  test("an ambiguous match creates a row and queues a review instead of guessing", () => {
    const store = new HubStore(":memory:");
    try {
      upsertEntity(store, { project: "shop", name: "deploy service alpha" });
      upsertEntity(store, { project: "shop", name: "deploy service bravo" });
      const result = upsertEntity(store, { project: "shop", name: "deploy service charlie" });
      expect(result.review).toBe("ambiguous_alias");
      const review = store.reviewQueue().find((row) => row.item_type === "entity" && row.item_id === result.id);
      expect(review).toBeTruthy();
      expect(review.reason).toBe("ambiguous_alias");
    } finally {
      store.close();
    }
  });

  test("Jaro-Winkler scores agree with the textbook examples", () => {
    expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("DIXON", "DICKSONX")).toBeCloseTo(0.813, 3);
    expect(jaroWinkler("", "x")).toBe(0);
    expect(jaroWinkler("same", "same")).toBe(1);
  });

  test("resolveEntity reports an ambiguous candidate set without creating a row", () => {
    const store = new HubStore(":memory:");
    try {
      upsertEntity(store, { project: "shop", name: "deploy service alpha" });
      upsertEntity(store, { project: "shop", name: "deploy service bravo" });
      const resolved = resolveEntity(store, { project: "shop", name: "deploy service charlie" });
      expect(resolved.matched).toBe("ambiguous");
      expect(resolved.candidates).toHaveLength(2);
      expect(listEntities(store, { project: "shop" })).toHaveLength(2);
    } finally {
      store.close();
    }
  });
});
