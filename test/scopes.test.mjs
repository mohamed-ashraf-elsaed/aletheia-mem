// Project and global scopes: a project read never returns another project's rows, cross-project needs scope=all,
// promotion is explicit and audited, and a global rule is visible everywhere.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";

function twoProjects(store) {
  const a = store.add({ project: "alpha", kind: "note", type: "note", title: "Alpha deployment alphaword", narrative: "Alpha deployment uses alphaword" });
  const b = store.add({ project: "beta", kind: "note", type: "note", title: "Beta deployment betaword", narrative: "Beta deployment uses betaword" });
  const ea = store.addEpisode({ project: "alpha", text: "The alphaword service runs here.", sourceRef: "alpha:1", createdAtEpoch: 1_000 });
  const eb = store.addEpisode({ project: "beta", text: "The betaword service runs here.", sourceRef: "beta:1", createdAtEpoch: 1_000 });
  const fa = store.addFact({ project: "alpha", subject: "alphaword service", predicate: "runs", object: "here", text: "The alphaword service runs here", episodeId: ea.id, confidence: 0.9, recordedAtEpoch: 1_000 });
  const fb = store.addFact({ project: "beta", subject: "betaword service", predicate: "runs", object: "here", text: "The betaword service runs here", episodeId: eb.id, confidence: 0.9, recordedAtEpoch: 1_000 });
  return { a, b, fa: fa.fact, fb: fb.fact };
}

describe("scopes", () => {
  test("a project search never returns another project's rows", () => {
    const store = new HubStore(":memory:");
    try {
      twoProjects(store);
      const memories = store.ranked({ query: "deployment", project: "alpha" });
      expect(memories.length).toBeGreaterThan(0);
      expect(memories.every((memory) => memory.project === "alpha")).toBe(true);
      const facts = store.searchFacts({ query: "service", project: "alpha" });
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((fact) => fact.project === "alpha")).toBe(true);
      expect(store.searchFacts({ query: "betaword", project: "alpha" })).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("scope=all is the explicit cross-project read", () => {
    const store = new HubStore(":memory:");
    try {
      twoProjects(store);
      expect(store.searchFacts({ query: "service", project: "alpha", scope: "all" })).toHaveLength(2);
      expect(store.searchAll({ query: "deployment", project: "alpha", scope: "all" }).filter((row) => row.kind === "memory")).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  test("a promoted fact is visible from another project and promotion is audited", () => {
    const store = new HubStore(":memory:");
    try {
      const { fa } = twoProjects(store);
      expect(store.searchFacts({ query: "alphaword", project: "beta" })).toHaveLength(0);
      const promoted = store.promote("fact", fa.id, { actor: "cli" });
      expect(promoted).toMatchObject({ type: "fact", id: fa.id, scope: "global" });
      expect(store.getFact(fa.id).scope).toBe("global");
      const hits = store.searchFacts({ query: "alphaword", project: "beta" });
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe(fa.id);
      expect(store.db.prepare("SELECT 1 FROM audit WHERE action = 'scope.promote' AND detail LIKE ?").get(`%"id":${fa.id}%`)).toBeTruthy();
    } finally {
      store.close();
    }
  });

  test("a global rule is visible everywhere and the scope column exists", () => {
    const store = new HubStore(":memory:");
    try {
      store.rules.add({ then: "Always run the tests before a commit", scopeTier: "everywhere" });
      expect(store.context({ project: "alpha" })).toContain("Always run the tests before a commit");
      expect(store.context({ project: "beta", scope: "all" })).toContain("Always run the tests before a commit");
      const columns = store.db.prepare("PRAGMA table_info(memories)").all().map((column) => column.name);
      expect(columns).toContain("scope");
      expect(store.db.prepare("SELECT scope FROM memories LIMIT 1").get()?.scope ?? "project").toBe("project");
    } finally {
      store.close();
    }
  });
});
