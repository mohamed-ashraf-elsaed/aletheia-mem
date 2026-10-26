// Corrections in captured prompts become review-queue suggestions. Nothing is written to the rules table.
import { describe, expect, test } from "bun:test";
import { correctionsIn, listSuggestions, matchCorrection, suggestRules } from "../src/hub/rule-suggest.mjs";
import { HubStore } from "../src/hub/store.mjs";

const CORRECTIONS = [
  "No, use pnpm instead of npm.",
  "Always run the tests before committing.",
  "Never commit to main.",
  "Don't use var.",
  "Do not add dependencies.",
  "Use TypeScript, not JavaScript.",
  "Please always write a test first.",
  "No, never force push.",
  "Use tabs, not spaces.",
  "Don't mock the database.",
  "Always use --frozen-lockfile.",
  "No, do not disable the linter.",
  "Never use any in TypeScript.",
  "Use the logger, not console.log.",
  "Always name files in kebab-case.",
  "Don't edit generated files.",
  "Do not skip the pre-commit hook.",
  "Never log secrets.",
  "Use const instead of let.",
  "From now on, run bun test.",
];

const NON_CORRECTIONS = [
  "The build passed.",
  "I looked at the logs.",
  "What time is it?",
  "Maybe we should consider the cache.",
  "This is a test.",
];

function seed(store, project = "shop") {
  for (const text of [...CORRECTIONS, ...NON_CORRECTIONS]) {
    store.add({ project, kind: "prompt", type: "note", title: text.slice(0, 100), narrative: text });
  }
}

describe("rule suggestions", () => {
  test("a 20-correction fixture proposes at least 10 rules with at most one false positive", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const result = suggestRules(store, { project: "shop" });
      expect(result.proposed).toBeGreaterThanOrEqual(10);
      const suggestions = listSuggestions(store, { project: "shop" });
      expect(suggestions).toHaveLength(result.proposed);
      const text = suggestions.map((row) => row.text.toLowerCase()).join("\n");
      for (const negative of NON_CORRECTIONS) expect(text).not.toContain(negative.toLowerCase().replace(/[.?]/g, ""));
      expect(suggestions.some((row) => row.text === "Use pnpm, not npm")).toBe(true);
      expect(suggestions.some((row) => row.text === "Never force push")).toBe(true);
      expect(suggestions.some((row) => row.text === "Do not mock the database")).toBe(true);
      expect(suggestions.some((row) => row.text === "Run bun test")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("nothing is auto-enabled and every suggestion is in the review queue and audited", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const result = suggestRules(store, { project: "shop" });
      expect(store.rules.list()).toHaveLength(0);
      const review = store.reviewQueue();
      expect(review.filter((row) => row.item_type === "rule")).toHaveLength(result.proposed);
      expect(review.every((row) => row.status === "pending" && row.reason === "rule_suggestion")).toBe(true);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'rule.suggest'").get().n).toBe(result.proposed);
    } finally {
      store.close();
    }
  });

  test("a second run proposes nothing new", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const first = suggestRules(store, { project: "shop" });
      const second = suggestRules(store, { project: "shop" });
      expect(first.proposed).toBeGreaterThan(0);
      expect(second.proposed).toBe(0);
      expect(second.skipped).toBeGreaterThan(0);
      expect(listSuggestions(store, { project: "shop" })).toHaveLength(first.proposed);
    } finally {
      store.close();
    }
  });

  test("suggestions do not cross projects", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store, "shop");
      store.add({ project: "docs", kind: "prompt", type: "note", title: "Never publish drafts", narrative: "Never publish drafts." });
      suggestRules(store, { project: "shop" });
      expect(listSuggestions(store, { project: "docs" })).toHaveLength(0);
      suggestRules(store, { project: "docs" });
      expect(listSuggestions(store, { project: "docs" }).map((row) => row.text)).toEqual(["Never publish drafts"]);
    } finally {
      store.close();
    }
  });

  test("the matcher handles each sentence shape and rejects ordinary prose", () => {
    expect(matchCorrection("Always run the tests")).toMatchObject({ text: "Always run the tests", pattern: "always" });
    expect(matchCorrection("Never commit to main")).toMatchObject({ text: "Never commit to main", pattern: "never" });
    expect(matchCorrection("Use const instead of let")).toMatchObject({ text: "Use const, not let", pattern: "use_not" });
    expect(matchCorrection("The build passed")).toBe(null);
    expect(correctionsIn("Never log secrets. Always rotate keys.")).toHaveLength(2);
  });
});
