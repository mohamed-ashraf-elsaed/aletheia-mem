#!/usr/bin/env bun
// Differential check: fetch /api/work-view from the ORIGINAL claude-mem worker and from this clone, and
// deep-diff them. Both must read the same database and the same ledger directory.
//   bun scripts/diff-against-live.mjs [originalUrl] [cloneUrl]
//   CLONE: ALETHEIA_LEDGER_DIR=~/.claude-mem/work-view ALETHEIA_PORT=37791 bun bin/aletheia-server.mjs
const original = process.argv[2] ?? "http://localhost:37700";
const clone = process.argv[3] ?? "http://localhost:37791";

// Volatile by nature: wall-clock stamps, background refresh state, onboarding state, revision counters.
const IGNORE = [/^generatedAt$/, /^source\.lastCheckedAt$/, /^refresh(\.|$)/, /^setup(\.|$)/, /^revision$/, /^story\.reviews\.\d+\.(checkedAt|changedAt)$/];
const ignored = (path) => IGNORE.some((re) => re.test(path));

function diff(a, b, path = "", out = []) {
  if (ignored(path)) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    out.push({ path, original: a, clone: b });
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path, original: "array/object mismatch", clone: "" });
    return out;
  }
  if (Array.isArray(a) && a.length !== b.length) out.push({ path: `${path}.length`, original: a.length, clone: b.length });
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in a)) out.push({ path: next, original: "(missing)", clone: summarize(b[key]) });
    else if (!(key in b)) out.push({ path: next, original: summarize(a[key]), clone: "(missing)" });
    else diff(a[key], b[key], next, out);
  }
  return out;
}
const summarize = (v) => (typeof v === "string" ? (v.length > 90 ? `${v.slice(0, 90)}…` : v) : JSON.stringify(v)?.slice(0, 90));

const get = async (url) => (await fetch(`${url}/api/work-view`)).json();
const [a, b] = await Promise.all([get(original), get(clone)]);
const diffs = diff(a, b);
console.log(`top-level keys  original: ${Object.keys(a).join(",")}`);
console.log(`top-level keys  clone   : ${Object.keys(b).join(",")}`);
console.log(`humanRequests   original ${a.humanRequests.length} / clone ${b.humanRequests.length}`);
console.log(`agents          original ${a.agents.length} / clone ${b.agents.length}`);
console.log(`rules           original ${a.rules.length} / clone ${b.rules.length}`);
console.log(`DIFFERENCES: ${diffs.length}`);
for (const d of diffs.slice(0, 40)) console.log(` - ${d.path}\n     original: ${summarize(d.original)}\n     clone   : ${summarize(d.clone)}`);
process.exit(diffs.length ? 1 : 0);
