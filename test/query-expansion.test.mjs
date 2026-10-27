// T-038: the rule-based path reports the parsed range and the "time" path for a 30-expression fixture; expressions
// the parser does not understand report "none" rather than a guessed range. The model rewrite/HyDE step is out of
// scope (no model) and is left UNVERIFIED.
import { describe, expect, test } from "bun:test";
import { expandQuery, timeFilter } from "../src/hub/query.mjs";

const BASE = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (y, m, d) => Date.UTC(y, m - 1, d);

// 30 expressions -> expected [from, to] against the 2026-10-26 base (Monday). `since` keeps toEpoch null.
const FIXTURE = [
  ["today", [at(2026, 10, 26), at(2026, 10, 27)]],
  ["yesterday", [at(2026, 10, 25), at(2026, 10, 26)]],
  ["tomorrow", [at(2026, 10, 27), at(2026, 10, 28)]],
  ["3 days ago", [at(2026, 10, 23), at(2026, 10, 24)]],
  ["2 weeks ago", [at(2026, 10, 12), at(2026, 10, 19)]],
  ["2 months ago", [at(2026, 8, 1), at(2026, 9, 1)]],
  ["2 quarters ago", [at(2026, 4, 1), at(2026, 7, 1)]],
  ["2 years ago", [at(2024, 1, 1), at(2025, 1, 1)]],
  ["last week", [at(2026, 10, 19), at(2026, 10, 26)]],
  ["this week", [at(2026, 10, 26), at(2026, 11, 2)]],
  ["next week", [at(2026, 11, 2), at(2026, 11, 9)]],
  ["last month", [at(2026, 9, 1), at(2026, 10, 1)]],
  ["this month", [at(2026, 10, 1), at(2026, 11, 1)]],
  ["next month", [at(2026, 11, 1), at(2026, 12, 1)]],
  ["last quarter", [at(2026, 7, 1), at(2026, 10, 1)]],
  ["this quarter", [at(2026, 10, 1), at(2027, 1, 1)]],
  ["next quarter", [at(2027, 1, 1), at(2027, 4, 1)]],
  ["last year", [at(2025, 1, 1), at(2026, 1, 1)]],
  ["this year", [at(2026, 1, 1), at(2027, 1, 1)]],
  ["next year", [at(2027, 1, 1), at(2028, 1, 1)]],
  ["Q1 2026", [at(2026, 1, 1), at(2026, 4, 1)]],
  ["Q3 2025", [at(2025, 7, 1), at(2025, 10, 1)]],
  ["first quarter 2025", [at(2025, 1, 1), at(2025, 4, 1)]],
  ["in March", [at(2026, 3, 1), at(2026, 4, 1)]],
  ["March 2025", [at(2025, 3, 1), at(2025, 4, 1)]],
  ["last March", [at(2025, 3, 1), at(2025, 4, 1)]],
  ["last Monday", [at(2026, 10, 19), at(2026, 10, 20)]],
  ["2026-05-01", [at(2026, 5, 1), at(2026, 5, 2)]],
  ["2026-05-01 to 2026-05-03", [at(2026, 5, 1), at(2026, 5, 4)]],
  ["we used it since last week", [at(2026, 10, 19), null]],
];

describe("query expansion (rule-based)", () => {
  test("the 30-expression fixture is parsed and reported as the time path", () => {
    for (const [expression, [from, to]] of FIXTURE) {
      const expanded = expandQuery(expression, { baseEpoch: BASE });
      expect(expanded.path, expression).toBe("time");
      expect(expanded.time.fromEpoch, expression).toBe(from);
      expect(expanded.time.toEpoch, expression).toBe(to);
    }
  });

  test("an expression the parser cannot understand reports the none path, not a guess", () => {
    expect(expandQuery("recently", { baseEpoch: BASE }).path).toBe("none");
    expect(expandQuery("a while ago", { baseEpoch: BASE }).path).toBe("none");
    expect(timeFilter(expandQuery("the service may use a queue", { baseEpoch: BASE }))).toBeNull();
  });

  test("timeFilter maps a parsed range into since/until", () => {
    const expanded = expandQuery("last week", { baseEpoch: BASE });
    expect(timeFilter(expanded)).toEqual({ since: at(2026, 10, 19), until: at(2026, 10, 26) });
    expect(timeFilter(expandQuery("since last week", { baseEpoch: BASE }))).toEqual({ since: at(2026, 10, 19), until: null });
  });
});
