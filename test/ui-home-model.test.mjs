// The Home page's pure helpers: readable titles, which projects to show, plain words for types and tool states.
import { describe, expect, test } from "bun:test";
import { EXAMPLE_RULES, plainTitle, realProjects, ruleScopeText, rulesFor, toolState, typeWord, whenText } from "../public/ui-home-model.js";

describe("plainTitle", () => {
  test("strips pasted-content tags and keeps the first sentence", () => {
    expect(plainTitle('<pasted_content id="5b0a"> The request-layer work is complete, validated and pushed. Here is the report.')).toBe("The request-layer work is complete, validated and pushed.");
  });
  test("reads the human field out of a JSON tool input", () => {
    expect(plainTitle('input: {"questions":[{"question":"How should the bot execute trades?","header":"Trading mode"}]}')).toBe("How should the bot execute trades?");
  });
  test("returns null for a pile of numbers, empty text and JSON with no readable field", () => {
    expect(plainTitle("samer samer 1090003447 3924 34 21605.86 61 41 43.09 0 7.31 9.09 1229062614 591 33 50080.09")).toBeNull();
    expect(plainTitle("")).toBeNull();
    expect(plainTitle(null)).toBeNull();
    expect(plainTitle('{"a":1,"b":[2,3]}')).toBeNull();
  });
  test("drops a leading 'Session summary:' and shortens a long title with an ellipsis", () => {
    expect(plainTitle("Session summary: Deploy needs Node 20.19.6 on the staging box.")).toBe("Deploy needs Node 20.19.6 on the staging box.");
    const long = plainTitle(`${"word ".repeat(60)}end`);
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith("…")).toBe(true);
  });
  test("cleans the leaks seen on a real page: list dashes, escaped quotes, bold markers and summary prefixes", () => {
    expect(plainTitle('- operator was offered \\"raise the cap\\" or \\"split\\" and chose to split.')).toBe('Operator was offered "raise the cap" or "split" and chose to split.');
    expect(plainTitle("**Request.** Plan and scope a campaign creation flow redesign: replace the choose-type page.")).toBe("Plan and scope a campaign creation flow redesign: replace the choose-type page.");
    expect(plainTitle('Session summary for ConvertedIn (4 fact(s)) - operator was offered "raise the cap" and chose to split.')).toBe('Operator was offered "raise the cap" and chose to split.');
  });
  test("turns a link into plain words", () => {
    expect(plainTitle("Check https://example.com/a/very/long/path?x=1 before you deploy")).toBe("Check a link before you deploy");
  });
});

describe("realProjects", () => {
  const list = [
    { name: "ConvertedIn", memories: 4328, lastAtEpoch: 5 },
    { name: "aletheia-mem", memories: 2413, lastAtEpoch: 9 },
    { name: "aletheia-mem/round13-facts-quality", memories: 84, lastAtEpoch: 8 },
    { name: "aletheia-mem/agent-a271898f3d3ebe088", memories: 78, lastAtEpoch: 7 },
    { name: "tmp.GZG9FxZMwC", memories: 1, lastAtEpoch: 6 },
    { name: "hookprobe", memories: 18, lastAtEpoch: 4 },
    { name: "c", memories: 2, lastAtEpoch: 3 },
    { name: "solana-memecoin-bot", memories: 149, lastAtEpoch: 10 },
  ];
  test("keeps real projects newest first and moves worktree, temp and tiny folders to 'other'", () => {
    const { main, other } = realProjects(list);
    expect(main.map((p) => p.name)).toEqual(["solana-memecoin-bot", "aletheia-mem", "ConvertedIn"]);
    expect(other.map((p) => p.name).sort()).toEqual(["aletheia-mem/agent-a271898f3d3ebe088", "aletheia-mem/round13-facts-quality", "c", "hookprobe", "tmp.GZG9FxZMwC"].sort());
  });
  test("the selected project always stays in the main list", () => {
    const { main } = realProjects(list, { selected: "hookprobe" });
    expect(main.map((p) => p.name)).toContain("hookprobe");
  });
  test("a nested folder whose parent is not listed is kept", () => {
    const { main } = realProjects([{ name: "Orders/guard-change", memories: 13, lastAtEpoch: 1 }]);
    expect(main).toHaveLength(1);
  });
  test("tolerates a missing list", () => {
    expect(realProjects(undefined)).toEqual({ main: [], other: [] });
  });
});

describe("plain words", () => {
  test("type words", () => {
    expect(typeWord("decision")).toBe("Decision");
    expect(typeWord("bugfix")).toBe("Fix");
    expect(typeWord("weird", "summary")).toBe("Session summary");
    expect(typeWord(undefined, "note")).toBe("Note");
  });
  test("when text", () => {
    const now = new Date(2026, 9, 29, 15, 0, 0).getTime();
    expect(whenText(new Date(2026, 9, 29, 9, 5, 0).getTime(), now)).toBe("today 09:05");
    expect(whenText(new Date(2026, 9, 28, 20, 0, 0).getTime(), now)).toBe("yesterday 20:00");
    expect(whenText(new Date(2026, 9, 25, 12, 0, 0).getTime(), now)).toBe("4 days ago");
    expect(whenText(null, now)).toBe("");
  });
  test("tool states", () => {
    expect(toolState({ installed: false }).state).toBe("missing");
    expect(toolState({ installed: true, hooks: { present: 5, expected: 5 } })).toMatchObject({ state: "on", ready: true });
    expect(toolState({ installed: true, hooks: { present: 2, expected: 5 } })).toMatchObject({ state: "partial", ready: false });
    expect(toolState({ installed: true, hooks: { present: 0, expected: 5 } }).state).toBe("off");
    expect(toolState({ installed: true, hooks: { present: 0, expected: 0 } }).state).toBe("info");
  });
});

describe("rules", () => {
  const rules = [
    { id: "1", scopeTier: "everywhere", scopeName: "Everywhere" },
    { id: "2", scopeTier: "project", scopeName: "ConvertedIn" },
    { id: "3", scopeTier: "project", scopeName: "Other" },
  ];
  test("a project sees the rules for everywhere and its own", () => {
    expect(rulesFor(rules, "ConvertedIn").map((r) => r.id)).toEqual(["1", "2"]);
    expect(rulesFor(rules, "").map((r) => r.id)).toEqual(["1"]);
  });
  test("scope sentence and examples", () => {
    expect(ruleScopeText(rules[0])).toBe("Applies in every project");
    expect(ruleScopeText(rules[1])).toBe("Only in ConvertedIn");
    expect(EXAMPLE_RULES.length).toBeGreaterThanOrEqual(3);
  });
});
