// Shared paging rules for every list route (T-151). One place decides the default page size, the hard maximum and
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

/** The fields every paged response carries beside its items. */
export const pageInfo = ({ total, limit, offset, count }) => ({ total, limit, offset, hasMore: offset + count < total });

export const slicePage = (items, { limit, offset }) => items.slice(offset, offset + limit);
