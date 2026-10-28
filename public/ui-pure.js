// DOM-free helpers for the component system. Nothing here touches document, window or fetch, so each
// function is covered by a plain unit test. Components import from here; nothing here imports a component.

export const PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function clampLimit(value, fallback = DEFAULT_PAGE_SIZE) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Everything a pager needs from (total, limit, offset). `pages` lists page numbers with "…" where a run is
 * skipped; it always shows the first, the last and the current page with one neighbour on each side.
 */
export function pagerModel({ total = 0, limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const count = Math.max(0, Math.trunc(Number(total)) || 0);
  const size = clampLimit(limit);
  const pageCount = Math.max(1, Math.ceil(count / size));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Math.max(0, Number(offset) || 0) / size) + 1));
  const from = count === 0 ? 0 : (page - 1) * size + 1;
  const to = count === 0 ? 0 : Math.min(count, page * size);
  const wanted = new Set([1, pageCount, page, page - 1, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const pages = [];
  let last = 0;
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (n - last === 2) pages.push(last + 1);
    else if (n - last > 2) pages.push("…");
    pages.push(n);
    last = n;
  }
  return {
    total: count, limit: size, page, pageCount, from, to,
    offset: (page - 1) * size,
    hasPrev: page > 1, hasNext: page < pageCount,
    pages,
    label: count === 0 ? "No results" : `Showing ${from} to ${to} of ${count}`,
  };
}

/** Offset for a 1-based page number, clamped to the last page. */
export function offsetForPage(page, { total, limit }) {
  const model = pagerModel({ total, limit, offset: (Math.max(1, Math.trunc(Number(page)) || 1) - 1) * clampLimit(limit) });
  return model.offset;
}

// ---- time and numbers ------------------------------------------------------------------------------------

const toMs = (value) => {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  const n = Date.parse(value);
  return n;
};

const UNITS = [
  ["year", 365 * 86_400_000, "y"],
  ["month", 30 * 86_400_000, "mo"],
  ["week", 7 * 86_400_000, "w"],
  ["day", 86_400_000, "d"],
  ["hour", 3_600_000, "h"],
  ["minute", 60_000, "min"],
];

/** "just now", "3 min ago", "2 h ago", "in 5 min". Other locales use Intl.RelativeTimeFormat. */
export function relativeTime(value, now = Date.now(), locale = "en") {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "unknown";
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 45_000) return locale.startsWith("en") ? "just now" : new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  const [unit, size, short] = UNITS.find(([, span]) => abs >= span) ?? UNITS[UNITS.length - 1];
  const count = Math.round(abs / size);
  if (locale.startsWith("en")) return diff < 0 ? `${count} ${short} ago` : `in ${count} ${short}`;
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" }).format(Math.sign(diff) * count, unit);
}

export function formatDateTime(value, locale = "en", timeZone) {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "unknown";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(ms);
}

export const formatNumber = (value, locale = "en") => (Number.isFinite(Number(value)) ? new Intl.NumberFormat(locale).format(Number(value)) : "—");

/** 1536 -> "1.5 KB". */
export function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// ---- search highlighting ---------------------------------------------------------------------------------

/** Split a query into the words to highlight. Short noise words are kept: the user typed them. */
export function queryTerms(query) {
  return [...new Set(String(query ?? "").toLowerCase().split(/[\s"']+/).map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Break text into [{ text, hit }] parts. The caller renders each part as a text node (or <mark> for a hit), so the
 * text is never interpreted as markup. Matching is case-insensitive and the regex is built from escaped terms.
 */
export function highlightParts(text, query) {
  const source = String(text ?? "");
  const terms = queryTerms(query);
  if (!terms.length || !source) return [{ text: source, hit: false }];
  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "gi");
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match[0] === "") continue;
    if (match.index > last) parts.push({ text: source.slice(last, match.index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), hit: false });
  return parts.length ? parts : [{ text: source, hit: false }];
}

// ---- URL hash state --------------------------------------------------------------------------------------

/** "#/memory/review?page=2&q=x" -> { path: ["memory","review"], params: { page: "2", q: "x" } }. */
export function parseHash(hash) {
  const raw = String(hash ?? "").replace(/^#\/?/, "");
  const [pathPart, ...rest] = raw.split("?");
  const path = pathPart.split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  const params = {};
  for (const [key, value] of new URLSearchParams(rest.join("?"))) params[key] = value;
  return { path, params };
}

/** The inverse. Empty, null and default values are dropped so the URL stays short; keys are sorted. */
export function buildHash(path, params = {}, defaults = {}) {
  const segments = (Array.isArray(path) ? path : [path]).filter(Boolean).map((segment) => encodeURIComponent(segment));
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value == null || value === "" || value === false || String(value) === String(defaults[key] ?? "")) continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return `#/${segments.join("/")}${text ? `?${text}` : ""}`;
}

// ---- the Region state machine ----------------------------------------------------------------------------

/**
 * One data region is always in one of: idle, loading, success, empty, error. `refreshing` marks a reload that
 * keeps the old content on screen. Events: load, reload, resolve, fail, reset.
 */
export const REGION_INITIAL = Object.freeze({ status: "idle", data: null, error: null, refreshing: false, updatedAt: null, attempts: 0 });

export function regionReduce(state, event, now = Date.now()) {
  switch (event.type) {
    case "load":
      return { ...state, status: "loading", error: null, refreshing: false, attempts: state.attempts + 1 };
    case "reload":
      // Keep what is shown. Only the first load (or a load after an error) has no content to keep.
      return state.status === "success" || state.status === "empty"
        ? { ...state, refreshing: true, attempts: state.attempts + 1 }
        : { ...state, status: "loading", error: null, refreshing: false, attempts: state.attempts + 1 };
    case "resolve": {
      const empty = event.empty === true;
      return { status: empty ? "empty" : "success", data: event.data ?? null, error: null, refreshing: false, updatedAt: now, attempts: 0 };
    }
    case "fail": {
      const message = event.error?.message ?? String(event.error ?? "Unknown error");
      // A failed refresh keeps the old data visible and reports the error beside it.
      return state.refreshing && state.data != null
        ? { ...state, refreshing: false, error: message }
        : { ...state, status: "error", error: message, refreshing: false };
    }
    case "reset":
      return REGION_INITIAL;
    default:
      return state;
  }
}

/** What the user can copy from an error card: enough to file a bug, nothing secret. */
export function errorDetails({ message, path, status, at = Date.now(), app = "aletheia" } = {}) {
  return [`app: ${app}`, `time: ${new Date(at).toISOString()}`, path ? `request: ${path}` : null, status ? `status: ${status}` : null, `message: ${message ?? "unknown"}`].filter(Boolean).join("\n");
}

// ---- polling ---------------------------------------------------------------------------------------------

/**
 * Delay before the next poll, or null while the page is hidden. Doubles per failure up to `max`.
 * Jitter is injected so the function stays deterministic in tests.
 */
export function nextPollDelay({ base = 5000, max = 60_000, failures = 0, hidden = false, jitter = 0 } = {}) {
  if (hidden) return null;
  const delay = Math.min(max, base * 2 ** Math.max(0, failures));
  return Math.round(delay * (1 + jitter));
}

/** "updated 3 s ago" for the status bar; recomputed by a 1 s ticker. */
export function updatedAgo(at, now = Date.now()) {
  if (!Number.isFinite(at)) return "not yet updated";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `updated ${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.round(minutes / 60)} h ago`;
}

/** Cap a number for display in a tile counting up: the value shown at progress t (0 to 1), eased out. */
export function countUpValue(from, to, t) {
  const p = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - p) ** 3;
  return Math.round(from + (to - from) * eased);
}

// ---- keyboard helpers ------------------------------------------------------------------------------------

/** Where Tab goes inside a dialog: wraps at both ends. Returns an index into the focusable list, or -1 for none. */
export function trapTarget(count, current, shift = false) {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current === 0 ? count - 1 : current - 1) : (current === count - 1 ? 0 : current + 1);
}

/** Arrow-key movement in a row of tabs or radio buttons. Returns the new index, or null for a key that does nothing. */
export function rovingIndex(current, count, key, { vertical = false } = {}) {
  if (count <= 0) return null;
  const prev = vertical ? "ArrowUp" : "ArrowLeft";
  const next = vertical ? "ArrowDown" : "ArrowRight";
  if (key === next) return (current + 1) % count;
  if (key === prev) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Is the keyboard event aimed at something the user is typing into? Shortcuts must not fire there. */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
}

/**
 * The two-key sequence "g" then a letter. `pending` is the time "g" was pressed, or 0. Returns the next pending
 * time and, when the sequence completes within `windowMs`, the letter.
 */
export function chordStep(pending, key, now, windowMs = 1200) {
  if (key === "g") return { pending: now, letter: null };
  if (pending && now - pending <= windowMs && /^[a-z]$/.test(key)) return { pending: 0, letter: key };
  return { pending: 0, letter: null };
}

// ---- command palette ranking -----------------------------------------------------------------------------

/** How well `query` matches `text`: higher is better, 0 is no match. Prefix beats word start beats substring beats letters in order. */
export function matchScore(text, query) {
  const t = String(text ?? "").toLowerCase();
  const q = String(query ?? "").toLowerCase().trim();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s/:>-]+/).some((word) => word.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  let at = 0;
  for (const ch of q) {
    at = t.indexOf(ch, at);
    if (at < 0) return 0;
    at += 1;
  }
  return 10;
}

/** Items ({ label, keywords }) that match, best first; ties keep their order. With no query everything stays in order. */
export function rankCommands(items, query) {
  const scored = items.map((item, index) => ({ item, index, score: Math.max(matchScore(item.label, query), matchScore(item.keywords ?? "", query) * 0.8) }));
  return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.item);
}
