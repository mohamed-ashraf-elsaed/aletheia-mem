// Rule-based query expansion (T-038). The time range is extracted by parseTemporal (temporal.mjs); the model rewrite
// and HyDE variants are behind flags and need a provider, so they are out of scope here (no model). The returned
// `path` tells the caller which expansion ran, and timeFilter maps a parsed range into store search filters.

import { parseTemporal } from "./temporal.mjs";

export function expandQuery(text, { baseEpoch = Date.now() } = {}) {
  const source = String(text ?? "");
  const time = parseTemporal(source, { baseEpoch });
  return {
    text: source,
    time, // { fromEpoch, toEpoch, expression, inferred, kind } | null
    path: time ? "time" : "none",
  };
}

/** { since, until } from a parsed range, or null when the query had no time expression. */
export function timeFilter(expanded) {
  if (!expanded?.time) return null;
  const { fromEpoch, toEpoch } = expanded.time;
  return { since: fromEpoch, until: toEpoch ?? null };
}
