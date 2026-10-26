import { describe, expect, test } from "bun:test";
import {
  REGION_INITIAL, matchScore, rankCommands, buildHash, chordStep, isTypingTarget, rovingIndex, trapTarget, clampLimit, countUpValue, errorDetails, formatBytes, formatNumber, highlightParts, nextPollDelay,
  offsetForPage, pagerModel, parseHash, queryTerms, regionReduce, relativeTime, updatedAgo,
} from "../public/ui-pure.js";

describe("T-201: pager maths", () => {
  test("first page of 312 rows at 25 per page", () => {
    const m = pagerModel({ total: 312, limit: 25, offset: 0 });
    expect(m).toMatchObject({ page: 1, pageCount: 13, from: 1, to: 25, hasPrev: false, hasNext: true, label: "Showing 1 to 25 of 312" });
    expect(m.pages).toEqual([1, 2, "…", 13]);
  });
  test("the middle shows neighbours and gaps", () => {
    expect(pagerModel({ total: 312, limit: 25, offset: 150 }).pages).toEqual([1, "…", 6, 7, 8, "…", 13]);
  });
  test("a one-page gap is filled, not elided", () => {
    expect(pagerModel({ total: 100, limit: 10, offset: 30 }).pages).toEqual([1, 2, 3, 4, 5, "…", 10]);
  });
  test("last page is partial and says so", () => {
    const m = pagerModel({ total: 312, limit: 25, offset: 300 });
    expect(m).toMatchObject({ page: 13, from: 301, to: 312, hasNext: false, label: "Showing 301 to 312 of 312" });
  });
  test("empty and out-of-range inputs are clamped", () => {
    expect(pagerModel({ total: 0 })).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, label: "No results" });
    expect(pagerModel({ total: 30, limit: 10, offset: 9999 }).page).toBe(3);
    expect(pagerModel({ total: -5, limit: "x", offset: -4 })).toMatchObject({ total: 0, limit: 25, offset: 0 });
  });
  test("limit is capped at 100", () => {
    expect(clampLimit(5000)).toBe(100);
    expect(clampLimit(0)).toBe(25);
    expect(clampLimit("50")).toBe(50);
  });
  test("offsetForPage clamps to the last page", () => {
    expect(offsetForPage(3, { total: 100, limit: 10 })).toBe(20);
    expect(offsetForPage(99, { total: 100, limit: 10 })).toBe(90);
    expect(offsetForPage(0, { total: 100, limit: 10 })).toBe(0);
  });
});

describe("T-201: relative time and numbers", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  test("english short forms", () => {
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe("2 h ago");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 d ago");
    expect(relativeTime(now + 5 * 60_000, now)).toBe("in 5 min");
  });
  test("iso strings work and bad input says unknown", () => {
    expect(relativeTime("2026-10-27T11:57:00Z", now)).toBe("3 min ago");
    expect(relativeTime("nope", now)).toBe("unknown");
    expect(relativeTime(null, now)).toBe("unknown");
  });
  test("other locales go through Intl", () => {
    expect(relativeTime(now - 3 * 3_600_000, now, "ar")).not.toContain("ago");
  });
  test("numbers and bytes", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber("x")).toBe("—");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(-1)).toBe("—");
  });
  test("updatedAgo", () => {
    expect(updatedAgo(1000, 4000)).toBe("updated 3 s ago");
    expect(updatedAgo(null)).toBe("not yet updated");
    expect(updatedAgo(0, 5 * 60_000)).toBe("updated 5 min ago");
  });
  test("count-up is monotone and lands on the target", () => {
    expect(countUpValue(0, 100, 0)).toBe(0);
    expect(countUpValue(0, 100, 1)).toBe(100);
    expect(countUpValue(0, 100, 0.5)).toBeGreaterThan(50);
    expect(countUpValue(10, 20, 2)).toBe(20);
  });
});

describe("T-201: highlight escaping", () => {
  test("hits are split out and HTML stays text", () => {
    const parts = highlightParts("<b>Retry</b> the retry loop", "retry");
    expect(parts.map((p) => p.text).join("")).toBe("<b>Retry</b> the retry loop");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Retry", "retry"]);
  });
  test("regex characters in the query are literal", () => {
    expect(highlightParts("a.c abc", "a.c").filter((p) => p.hit).map((p) => p.text)).toEqual(["a.c"]);
    expect(() => highlightParts("x", "(((")).not.toThrow();
    expect(highlightParts("f(x) = 1", "f(x)").some((p) => p.hit)).toBe(true);
  });
  test("a hostile query cannot add markup because parts are plain strings", () => {
    const parts = highlightParts("hello <img src=x onerror=alert(1)>", "<img");
    expect(parts.every((p) => typeof p.text === "string")).toBe(true);
    expect(parts.find((p) => p.hit).text).toBe("<img");
  });
  test("no query or no text returns one plain part", () => {
    expect(highlightParts("abc", "")).toEqual([{ text: "abc", hit: false }]);
    expect(highlightParts("", "a")).toEqual([{ text: "", hit: false }]);
  });
  test("terms are unique, longest first and capped", () => {
    expect(queryTerms("a bb a ccc")).toEqual(["ccc", "bb", "a"]);
    expect(queryTerms("1 2 3 4 5 6 7 8 9 10").length).toBe(8);
  });
  test("Arabic text matches", () => {
    expect(highlightParts("الذاكرة المحلية", "المحلية").filter((p) => p.hit).length).toBe(1);
  });
});

describe("T-201: hash state", () => {
  test("round trip", () => {
    const hash = buildHash(["memory", "facts"], { page: 3, q: "a b", kind: "" }, { page: 1 });
    expect(hash).toBe("#/memory/facts?page=3&q=a+b");
    expect(parseHash(hash)).toEqual({ path: ["memory", "facts"], params: { page: "3", q: "a b" } });
  });
  test("defaults and empties are dropped", () => {
    expect(buildHash("rules", { page: 1, limit: 25 }, { page: 1, limit: 25 })).toBe("#/rules");
  });
  test("session ids with slashes survive", () => {
    const hash = buildHash(["work", "session", "a/b c"], { project: "p" });
    expect(parseHash(hash).path).toEqual(["work", "session", "a/b c"]);
  });
  test("garbage does not throw", () => {
    expect(parseHash("#/%E0%A4%A")).toEqual({ path: ["%E0%A4%A"], params: {} });
    expect(parseHash(undefined)).toEqual({ path: [], params: {} });
  });
});

describe("T-201: Region state machine", () => {
  test("idle -> loading -> success", () => {
    let s = regionReduce(REGION_INITIAL, { type: "load" });
    expect(s.status).toBe("loading");
    s = regionReduce(s, { type: "resolve", data: [1] }, 99);
    expect(s).toMatchObject({ status: "success", data: [1], updatedAt: 99, attempts: 0 });
  });
  test("empty is its own state", () => {
    expect(regionReduce(REGION_INITIAL, { type: "resolve", data: [], empty: true }).status).toBe("empty");
  });
  test("error then retry returns to loading and clears the message", () => {
    let s = regionReduce(regionReduce(REGION_INITIAL, { type: "load" }), { type: "fail", error: new Error("boom") });
    expect(s).toMatchObject({ status: "error", error: "boom" });
    s = regionReduce(s, { type: "load" });
    expect(s).toMatchObject({ status: "loading", error: null, attempts: 2 });
  });
  test("a reload keeps the content and a failed reload keeps it too", () => {
    let s = regionReduce(REGION_INITIAL, { type: "resolve", data: ["a"] });
    s = regionReduce(s, { type: "reload" });
    expect(s).toMatchObject({ status: "success", refreshing: true });
    s = regionReduce(s, { type: "fail", error: "offline" });
    expect(s).toMatchObject({ status: "success", refreshing: false, error: "offline", data: ["a"] });
  });
  test("reload from error behaves like a first load", () => {
    const s = regionReduce({ ...REGION_INITIAL, status: "error", error: "x" }, { type: "reload" });
    expect(s.status).toBe("loading");
  });
  test("unknown events change nothing and reset restores the start", () => {
    expect(regionReduce(REGION_INITIAL, { type: "nope" })).toBe(REGION_INITIAL);
    expect(regionReduce({ ...REGION_INITIAL, status: "success" }, { type: "reset" })).toBe(REGION_INITIAL);
  });
  test("error details carry the request and no more", () => {
    const text = errorDetails({ message: "bad", path: "/api/hub/x", status: 500, at: 0 });
    expect(text).toContain("request: /api/hub/x");
    expect(text).toContain("status: 500");
    expect(text).toContain("1970-01-01T00:00:00.000Z");
  });
});

describe("T-201: polling backoff", () => {
  test("doubles per failure and caps", () => {
    expect([0, 1, 2, 3, 10].map((failures) => nextPollDelay({ base: 5000, max: 60_000, failures }))).toEqual([5000, 10_000, 20_000, 40_000, 60_000]);
  });
  test("returns null while hidden", () => {
    expect(nextPollDelay({ hidden: true })).toBeNull();
  });
  test("jitter scales the delay", () => {
    expect(nextPollDelay({ base: 1000, jitter: 0.1 })).toBe(1100);
  });
});

describe("T-201: keyboard helpers", () => {
  test("Tab wraps in a dialog", () => {
    expect(trapTarget(3, 2, false)).toBe(0);
    expect(trapTarget(3, 0, true)).toBe(2);
    expect(trapTarget(3, 1, false)).toBe(2);
    expect(trapTarget(3, -1, false)).toBe(0);
    expect(trapTarget(3, -1, true)).toBe(2);
    expect(trapTarget(0, -1, false)).toBe(-1);
  });
  test("arrow keys move through tabs and wrap", () => {
    expect(rovingIndex(0, 3, "ArrowRight")).toBe(1);
    expect(rovingIndex(2, 3, "ArrowRight")).toBe(0);
    expect(rovingIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(rovingIndex(1, 3, "Home")).toBe(0);
    expect(rovingIndex(1, 3, "End")).toBe(2);
    expect(rovingIndex(1, 3, "x")).toBeNull();
    expect(rovingIndex(0, 3, "ArrowDown", { vertical: true })).toBe(1);
  });
  test("shortcuts ignore typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  test("g then a letter completes within the window", () => {
    let step = chordStep(0, "g", 1000);
    expect(step).toEqual({ pending: 1000, letter: null });
    step = chordStep(step.pending, "w", 1500);
    expect(step).toEqual({ pending: 0, letter: "w" });
  });
  test("the chord expires and a stray key resets it", () => {
    expect(chordStep(1000, "w", 5000)).toEqual({ pending: 0, letter: null });
    expect(chordStep(1000, "1", 1100)).toEqual({ pending: 0, letter: null });
    expect(chordStep(1000, "g", 1100).pending).toBe(1100);
  });
});

describe("T-205: command ranking", () => {
  test("exact, prefix, word start, substring and subsequence rank in that order", () => {
    expect(matchScore("Memory", "memory")).toBe(100);
    expect(matchScore("Memory facts", "mem")).toBe(80);
    expect(matchScore("Go to Memory", "mem")).toBe(60);
    expect(matchScore("Command", "cmd")).toBe(10);
    expect(matchScore("Rules", "xyz")).toBe(0);
    expect(matchScore("anything", "")).toBe(1);
  });
  test("rankCommands filters, sorts and keeps order on ties", () => {
    const items = [{ label: "Go to Tools" }, { label: "Go to Memory" }, { label: "Memory: Facts", keywords: "facts history" }, { label: "Toggle theme" }];
    expect(rankCommands(items, "mem").map((i) => i.label)).toEqual(["Memory: Facts", "Go to Memory"]);
    expect(rankCommands(items, "").map((i) => i.label)).toEqual(items.map((i) => i.label));
    expect(rankCommands(items, "history").map((i) => i.label)).toEqual(["Memory: Facts"]);
    expect(rankCommands(items, "qqq")).toEqual([]);
  });
});
