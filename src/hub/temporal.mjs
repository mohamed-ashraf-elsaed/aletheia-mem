// Temporal normalisation. Relative expressions are resolved against the episode's own timestamp, never the
// extraction time, and become half-open absolute ranges [fromEpoch, toEpoch). Day, week, month, quarter and year
// boundaries are UTC so a replay on another machine gives the same answer. An expression this parser does not
// understand returns null: a guessed date is worse than no date.
const DAY = 86_400_000;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_INDEX = new Map(MONTHS.flatMap((name, i) => [[name, i], [name.slice(0, 3), i]]));
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const dayStart = (epoch) => Math.floor(epoch / DAY) * DAY;
const monthStart = (year, month) => Date.UTC(year, month, 1);
const addMonths = (epoch, months) => {
  const d = new Date(epoch);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
};
const weekStart = (epoch) => {
  const day = dayStart(epoch);
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY; // Monday
};
const quarterStart = (year, quarter) => Date.UTC(year, quarter * 3, 1);
const yearOf = (epoch) => new Date(epoch).getUTCFullYear();
const monthOf = (epoch) => new Date(epoch).getUTCMonth();

const range = (fromEpoch, toEpoch, expression, inferred, kind) => ({ fromEpoch, toEpoch, expression, inferred, kind });
const dayRange = (epoch, expression, inferred = true) => range(dayStart(epoch), dayStart(epoch) + DAY, expression, inferred, "day");
const monthRange = (year, month, expression, inferred = true) => range(monthStart(year, month), monthStart(year, month + 1), expression, inferred, "month");

/** The most recent occurrence of a month name at or before the base timestamp. */
function recentMonth(month, baseEpoch, offsetYears = 0) {
  let year = yearOf(baseEpoch) + offsetYears;
  if (offsetYears === 0 && monthStart(year, month) > baseEpoch) year -= 1;
  return year;
}

function parseIso(text) {
  const m = /\b(\d{4})-(\d{2})-(\d{2})(?:[T ][0-9:.+-]+)?(?:\s*(?:to|until|through|–|-)\s*(\d{4})-(\d{2})-(\d{2}))?\b/.exec(text);
  if (!m) return null;
  const from = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(from)) return null;
  if (m[4]) {
    const last = Date.UTC(Number(m[4]), Number(m[5]) - 1, Number(m[6]));
    if (!Number.isFinite(last) || last < from) return null;
    return range(from, last + DAY, m[0], false, "day");
  }
  return range(from, from + DAY, m[0], false, "day");
}

function parseRelative(text, baseEpoch) {
  const lower = text.toLowerCase();
  const baseDay = dayStart(baseEpoch);

  if (/\btoday\b/.test(lower)) return dayRange(baseDay, "today");
  if (/\byesterday\b/.test(lower)) return dayRange(baseDay - DAY, "yesterday");
  if (/\btomorrow\b/.test(lower)) return dayRange(baseDay + DAY, "tomorrow");

  let m = /\b(\d{1,3})\s+(day|week|month|quarter|year)s?\s+ago\b/.exec(lower);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === "day") return dayRange(baseDay - n * DAY, m[0]);
    if (unit === "week") {
      const from = weekStart(baseEpoch) - n * 7 * DAY;
      return range(from, from + 7 * DAY, m[0], true, "week");
    }
    if (unit === "month") {
      const anchor = addMonths(monthStart(yearOf(baseEpoch), monthOf(baseEpoch)), -n);
      return monthRange(yearOf(anchor), monthOf(anchor), m[0]);
    }
    if (unit === "quarter") {
      const currentQuarter = Math.floor(monthOf(baseEpoch) / 3);
      const anchor = quarterStart(yearOf(baseEpoch), currentQuarter - n);
      return range(anchor, quarterStart(yearOf(anchor), Math.floor(monthOf(anchor) / 3) + 1), m[0], true, "quarter");
    }
    const year = yearOf(baseEpoch) - n;
    return range(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1), m[0], true, "year");
  }

  m = /\b(last|this|next)\s+(day|week|month|quarter|year)\b/.exec(lower);
  if (m) {
    const which = m[1];
    const unit = m[2];
    const delta = which === "last" ? -1 : which === "next" ? 1 : 0;
    if (unit === "day") return dayRange(baseDay + delta * DAY, m[0]);
    if (unit === "week") {
      const from = weekStart(baseEpoch) + delta * 7 * DAY;
      return range(from, from + 7 * DAY, m[0], true, "week");
    }
    if (unit === "month") {
      const anchor = addMonths(monthStart(yearOf(baseEpoch), monthOf(baseEpoch)), delta);
      return monthRange(yearOf(anchor), monthOf(anchor), m[0]);
    }
    if (unit === "quarter") {
      const current = quarterStart(yearOf(baseEpoch), Math.floor(monthOf(baseEpoch) / 3));
      const shifted = addMonths(current, delta * 3);
      const from = quarterStart(yearOf(shifted), Math.floor(monthOf(shifted) / 3));
      return range(from, quarterStart(yearOf(from), Math.floor(monthOf(from) / 3) + 1), m[0], true, "quarter");
    }
    const year = yearOf(baseEpoch) + delta;
    return range(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1), m[0], true, "year");
  }

  m = /\bq([1-4])(?:\s+(\d{4}))?\b/.exec(lower);
  if (m) {
    const quarter = Number(m[1]) - 1;
    const year = m[2] ? Number(m[2]) : yearOf(baseEpoch);
    return range(quarterStart(year, quarter), quarterStart(year, quarter + 1), m[0], !m[2], "quarter");
  }

  m = /\b(first|second|third|fourth|last)\s+quarter(?:\s+(\d{4}))?\b/.exec(lower);
  if (m) {
    const named = { first: 0, second: 1, third: 2, fourth: 3 };
    let quarter = m[1] === "last" ? Math.floor(monthOf(baseEpoch) / 3) - 1 : named[m[1]];
    let year = m[2] ? Number(m[2]) : yearOf(baseEpoch);
    if (quarter < 0) { quarter += 4; year -= 1; }
    return range(quarterStart(year, quarter), quarterStart(year, quarter + 1), m[0], !m[2], "quarter");
  }

  // A bare month word is ambiguous ("may" is also a verb), so a month needs a prefix or a year: "in March",
  // "last March", "March 2025".
  m = /\b(?:(in|during|last|next)\s+(january|february|march|april|may|june|july|august|september|october|november|december)|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4}))\b/i.exec(lower);
  if (m) {
    const name = (m[2] ?? m[3]).toLowerCase();
    const month = MONTH_INDEX.get(name);
    let year;
    if (m[4]) year = Number(m[4]);
    else if (m[1]?.toLowerCase() === "last") year = yearOf(baseEpoch) - 1;
    else if (m[1]?.toLowerCase() === "next") year = yearOf(baseEpoch) + 1;
    else year = recentMonth(month, baseEpoch);
    return monthRange(year, month, m[0].trim(), !m[4], "month");
  }

  m = /\b(?:last|this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(lower);
  if (m) {
    const target = DAY_NAMES.indexOf(m[1]);
    const today = new Date(baseDay).getUTCDay();
    const delta = (target - today + 7) % 7;
    const shift = m[0].startsWith("last") ? delta - 7 : m[0].startsWith("next") ? delta + 7 : delta;
    return dayRange(baseDay + shift * DAY, m[0]);
  }

  return null;
}

/**
 * Parse one expression against the episode timestamp. Returns {fromEpoch, toEpoch, expression, inferred, kind} or
 * null. `inferred` is true when the range came from a relative expression rather than an explicit date.
 */
export function parseTemporal(text, { baseEpoch = Date.now() } = {}) {
  const base = Number(baseEpoch);
  if (!Number.isFinite(base)) return null;
  const source = String(text ?? "");
  if (!source.trim()) return null;
  const parsed = parseIso(source) ?? parseRelative(source, base);
  if (!parsed) return null;
  // "since last week" is still true now: keep the start, drop the closing edge.
  if (/\bsince\b/i.test(source)) return { ...parsed, toEpoch: null, kind: "since" };
  return parsed;
}

/** True when the text contains any expression this parser understands. */
export const hasTemporal = (text, opts) => parseTemporal(text, opts) != null;
