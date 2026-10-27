// Shared paging rules for every list route (T-203). One place decides the default page size, the hard maximum and
// how a date filter is read, so no route can accept an unbounded limit.

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/** limit and offset from a query object. A bad or missing value falls back; the limit never exceeds `max`. */
export function pagingOf(query = {}, { limit = DEFAULT_LIMIT, max = MAX_LIMIT } = {}) {
  const asInt = (value) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? n : null;
  };
  const wanted = asInt(query.limit);
  const offset = asInt(query.offset);
  return {
    limit: wanted == null || wanted < 1 ? Math.min(limit, max) : Math.min(wanted, max),
    offset: offset == null || offset < 0 ? 0 : Math.min(offset, 10_000_000),
  };
}

/** A date filter: epoch milliseconds, or an ISO date or date-time. A bare date as `until` means the end of that day. */
export function whenOf(value, { end = false } = {}) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (/^\d{10,}$/.test(text)) return Number(text);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return end && /^\d{4}-\d{2}-\d{2}$/.test(text) ? ms + 86_400_000 : ms;
}

/** An as-of timestamp: a plain integer epoch in milliseconds, or an ISO date or date-time. Null when absent or invalid. */
export function epochOrIso(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/** The fields every paged response carries beside its items. */
export const pageInfo = ({ total, limit, offset, count }) => ({ total, limit, offset, hasMore: offset + count < total });

export const slicePage = (items, { limit, offset }) => items.slice(offset, offset + limit);

/**
 * "Older than N days" as an `until` bound: the epoch N whole days before `now`, or null when N is absent or not a
 * positive number. Combine with an explicit until by taking the earlier of the two (`earlierOf`).
 */
export function olderThanCutoff(days, { now = Date.now() } = {}) {
  if (days == null || days === "") return null;
  const n = Number(days);
  return Number.isFinite(n) && n > 0 ? now - Math.floor(n) * 86_400_000 : null;
}

export const earlierOf = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : Number.isFinite(a) ? a : Number.isFinite(b) ? b : null);
