// Entities come from extractor output and from cheap rules over the fact text; they are project-scoped.
import { describe, expect, test } from "bun:test";
import { attachFactEntities, listEntities, normalizeName, ruleCandidates } from "../src/hub/entities.mjs";
import { storeFacts } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";

const factBase = {
  predicate: "uses",
  object: "Bun and src/hub/store.mjs",
  text: "The aletheia-mem repo uses Bun and src/hub/store.mjs",
  confidence: 0.9,
  validFromEpoch: null,
  validToEpoch: null,
  dated: false,
  supersedesId: null,
  entities: [
    { name: "Bun", type: "library" },
    { name: "aletheia-mem", type: "repo" },
    { name: "src/hub/store.mjs", type: "file" },
    { name: "Mohamed Ashraf", type: "person" },
  ],
};

function oneFact(store, project, at = 1_000) {
  const episode = store.addEpisode({ project, text: "The aletheia-mem repo uses Bun and src/hub/store.mjs.", sourceRef: `${project}:${at}`, createdAtEpoch: at });
  storeFacts(store, {
    project,
    facts: [{ ...factBase, subject: "The aletheia-mem repo", episodeIds: [episode.id] }],
    now: at + 100,
  });
  return store.factsCurrent({ project })[0];
}

describe("entity extraction", () => {
  test("the fixture yields the expected entities and types", () => {
    const store = new HubStore(":memory:");
    try {
      const fact = oneFact(store, "shop");
      const rows = listEntities(store, { project: "shop" });
      const byName = Object.fromEntries(rows.map((row) => [row.canonical_name, row.type]));
      expect(byName["bun"]).toBe("library");
      expect(byName["aletheia-mem"]).toBe("repo");
      expect(byName["src/hub/store.mjs"]).toBe("file");
      expect(byName["mohamed ashraf"]).toBe("person");
      const links = store.db.prepare("SELECT entity_id, role FROM fact_entities WHERE fact_id = ?").all(fact.id);
      expect(links.length).toBeGreaterThanOrEqual(4);
      expect(links.some((link) => link.role === "subject")).toBe(true);
      expect(links.some((link) => link.role === "object")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("the same entity mentioned twice creates one row", () => {
    const store = new HubStore(":memory:");
    try {
      oneFact(store, "shop", 1_000);
      oneFact(store, "shop", 2_000);
      const rows = listEntities(store, { project: "shop" });
      expect(rows.filter((row) => row.canonical_name === "bun")).toHaveLength(1);
      expect(store.factsCurrent({ project: "shop" })).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("different projects do not share rows", () => {
    const store = new HubStore(":memory:");
    try {
      oneFact(store, "shop");
      oneFact(store, "docs");
      const shop = listEntities(store, { project: "shop" }).map((row) => row.id);
      const docs = listEntities(store, { project: "docs" }).map((row) => row.id);
      expect(shop.length).toBeGreaterThan(0);
      expect(docs.length).toBe(shop.length);
      expect(shop.some((id) => docs.includes(id))).toBe(false);
    } finally {
      store.close();
    }
  });

  test("rule candidates find paths, repos and git authors", () => {
    const found = ruleCandidates("Author: Sam Rivera <sam@example.com>\nsee github.com/acme/shop and src/api/handler.ts");
    expect(found).toContainEqual({ name: "acme/shop", type: "repo" });
    expect(found).toContainEqual({ name: "src/api/handler.ts", type: "file" });
    expect(found).toContainEqual({ name: "Sam Rivera", type: "person" });
  });

  test("normalisation folds case and separators", () => {
    expect(normalizeName("  Postgres  ")).toBe("postgres");
    expect(normalizeName("aletheia_mem")).toBe("aletheia mem");
    expect(normalizeName("Acme Inc")).toBe("acme");
  });
});
