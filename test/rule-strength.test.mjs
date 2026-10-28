// rule strength comes from how often a suggestion was seen, and every suggestion stores its latest date and
// dated quotes. Strength thresholds are documented and tested here.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { listSuggestions, ruleStrength, suggestRules } from "../src/hub/rule-suggest.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;

function prompt(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}

describe("rule strength and evidence", () => {
  test("strength thresholds are Strong at 5+, Steady at 3-4, Light at 1-2", () => {
    expect(ruleStrength(1)).toBe("Light");
    expect(ruleStrength(2)).toBe("Light");
    expect(ruleStrength(3)).toBe("Steady");
    expect(ruleStrength(4)).toBe("Steady");
    expect(ruleStrength(5)).toBe("Strong");
    expect(ruleStrength(10)).toBe("Strong");
  });

  test("suggestRules stores times seen, latest date and dated quotes", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "s1", "Use pnpm, not npm.", 100);
      prompt(store, "s2", "No, use pnpm instead of npm.", 50);
      prompt(store, "s3", "Always run the tests.", 40);
      suggestRules(store, { project: "shop" });

      const rows = listSuggestions(store, { project: "shop" });
      const pnpm = rows.find((row) => row.text === "Use pnpm, not npm");
      expect(pnpm.timesSeen).toBe(2);
      expect(pnpm.strength).toBe("Light");
      expect(pnpm.latestAt).toContain("T");
      expect(pnpm.quotes).toHaveLength(2);
      for (const quote of pnpm.quotes) {
        expect(quote.at).toContain("T");
        expect(quote.sessionId).toBeTruthy();
      }
      expect(pnpm.moreQuotes).toBe(0);
    } finally {
      store.close();
    }
  });

  test("a second run does not duplicate quotes and keeps the same times seen", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "s1", "Use pnpm, not npm.", 100);
      prompt(store, "s2", "No, use pnpm instead of npm.", 50);
      suggestRules(store, { project: "shop" });
      const second = suggestRules(store, { project: "shop" });
      expect(second.proposed).toBe(0);
      expect(second.skipped).toBeGreaterThan(0);
      const pnpm = listSuggestions(store, { project: "shop" }).find((row) => row.text === "Use pnpm, not npm");
      expect(pnpm.quotes).toHaveLength(2);
      expect(pnpm.timesSeen).toBe(2);
    } finally {
      store.close();
    }
  });

  test("a fresh database has the strength columns and the quotes table", () => {
    const store = new HubStore(":memory:");
    try {
      const columns = store.db.prepare("PRAGMA table_info(rule_suggestions)").all().map((column) => column.name);
      expect(columns).toContain("times_seen");
      expect(columns).toContain("latest_at_epoch");
      expect(store.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'rule_suggestion_quotes'").get()).toBeTruthy();
    } finally {
      store.close();
    }
  });
});
