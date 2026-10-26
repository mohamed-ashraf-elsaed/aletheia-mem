// My Rules: how the owner wants agents to work. A rule is either learned (suggested by the build story),
// or set by the owner. Saved state lives in the "my-rules" work-state list, one task per rule ("Rule: <id>").
import { createHash } from "node:crypto";
import { MY_RULES_LIST, isMyRulesList } from "./work-state.mjs";

export const RULE_TASK_PREFIX = "Rule: ";
export const SCOPE_TIERS = ["everywhere", "project", "situation"];
const SET_BY = ["owner", "approved", "learned"];
const STATUSES = ["on", "off", "replaced", "dismissed", "suggested"];
const MAX_QUOTES = 3;
const MAX_QUOTE_CHARS = 200;
const DAY_MS = 864e5;
const SET_BY_ORDER = { owner: 0, approved: 1 };

const trimmed = (v) => (typeof v === "string" ? v.trim() : "");
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clipQuote = (t) => (t.length > MAX_QUOTE_CHARS ? `${t.slice(0, MAX_QUOTE_CHARS - 1)}…` : t);
export const ruleIdFor = (text) => `pref_${createHash("sha256").update(String(text)).digest("hex").slice(0, 12)}`;
export const scopeId = (tier, name) => (tier === "everywhere" ? "everywhere" : `${tier}:${name}`);
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/** quotes -> "YYYY-MM-DD HH:MM | quote" lines (first 3). */
function quotesToText(quotes) {
  return quotes
    .slice(0, MAX_QUOTES)
    .map((q) => `${q.at && Number.isFinite(Date.parse(q.at)) ? new Date(q.at).toISOString().slice(0, 16).replace("T", " ") : ""} | ${clipQuote(String(q.quote).replace(/\s+/g, " ").trim())}`)
    .join("\n");
}

function quotesFromText(text, kind) {
  if (typeof text !== "string") return [];
  return text.split("\n").flatMap((line) => {
    const m = /^(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)?\s*\|\s*(.+)$/.exec(line.trim());
    return m ? [{ at: m[1] ? `${m[1].replace(" ", "T")}${m[1].length > 10 ? ":00Z" : ""}` : null, quote: m[2], kind }] : [];
  });
}

/** Suggested rules learned from the build story's preferences. */
function learnedRules(story) {
  return (Array.isArray(story?.preferences) ? story.preferences : [])
    .filter((p) => trimmed(p?.preference))
    .map((p) => {
      const hosted = story.source === "hosted-intent";
      const usable = (p.quotes ?? []).filter((q) => trimmed(q?.quote));
      const quotes = (hosted ? usable : usable.slice(0, MAX_QUOTES)).map((q) => ({ at: q.at ?? null, quote: hosted ? String(q.quote) : clipQuote(trimmed(q.quote)), kind: p.kind }));
      const times = quotes.map((q) => Date.parse(q.at ?? "")).filter(Number.isFinite);
      return {
        ruleId: ruleIdFor(p.preference),
        scopeTier: "everywhere", scopeName: "Everywhere", when: "",
        then: hosted ? String(p.preference) : trimmed(p.preference),
        setBy: "learned", status: "suggested", kind: p.kind ?? "directive", source: "request-progress",
        timesSeen: Number.isInteger(p.supportCount) && p.supportCount > 0 ? p.supportCount : 1,
        latestAt: times.length ? new Date(Math.max(...times)).toISOString() : (story.writtenAt ?? null),
        quotes, replacedBy: null, replacedAt: null, savedAt: null,
      };
    });
}

/** Rules, scopes and learning stats for the snapshot: learned suggestions overlaid by saved rule tasks. */
export function readRules(workState, ledger) {
  const rules = new Map(learnedRules(ledger?.story).map((r) => [r.ruleId, r]));
  const saved = workState.lists
    .filter((l) => isMyRulesList(l.name))
    .flatMap((l) => l.tasks)
    .filter((t) => t.name.startsWith(RULE_TASK_PREFIX))
    .sort((a, b) => (a.updatedAtEpoch ?? 0) - (b.updatedAtEpoch ?? 0) || (a.latestEntryId ?? 0) - (b.latestEntryId ?? 0));
  for (const task of saved) {
    const f = task.fields;
    const id = trimmed(f.rule_id) || task.name.slice(RULE_TASK_PREFIX.length);
    const base = rules.get(id) ?? {
      ruleId: id, scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "", setBy: "owner", status: "on", kind: "directive",
      source: "you", timesSeen: 1, latestAt: null, quotes: [], replacedBy: null, replacedAt: null, savedAt: null,
    };
    const tier = SCOPE_TIERS.includes(f.scope_tier) ? f.scope_tier : base.scopeTier;
    const quotes = quotesFromText(f.quotes, base.kind);
    rules.set(id, {
      ...base,
      scopeTier: tier,
      scopeName: tier === "everywhere" ? "Everywhere" : trimmed(f.scope_name) || base.scopeName,
      when: typeof f.when === "string" ? f.when.trim() : base.when,
      then: trimmed(f.then) || base.then,
      setBy: SET_BY.includes(f.set_by) ? f.set_by : base.setBy,
      status: STATUSES.includes(f.status) ? f.status : base.status,
      source: trimmed(f.source) || base.source,
      timesSeen: finite(f.times_seen) ?? base.timesSeen,
      latestAt: trimmed(f.latest_at) || base.latestAt,
      quotes: quotes.length ? quotes : base.quotes,
      replacedBy: trimmed(f.replaced_by) || null,
      replacedAt: trimmed(f.replaced_at) || null,
      savedAt: task.updatedAt,
    });
  }
  const visible = [...rules.values()].filter((r) => r.then && !(r.setBy === "owner" && r.status === "dismissed"));
  const scopes = new Map([["everywhere", { id: "everywhere", tier: "everywhere", name: "Everywhere" }]]);
  for (const r of visible) {
    const id = scopeId(r.scopeTier, r.scopeName);
    if (!scopes.has(id)) scopes.set(id, { id, tier: r.scopeTier, name: r.scopeName });
  }
  const story = ledger?.story ?? null;
  return {
    rules: visible.map((r) => ({ ...r, scopeId: scopeId(r.scopeTier, r.scopeName) })),
    ruleScopes: [...scopes.values()].sort((a, b) => SCOPE_TIERS.indexOf(a.tier) - SCOPE_TIERS.indexOf(b.tier) || a.name.localeCompare(b.name)),
    rulesLearning: story
      ? {
          preferencesFound: Array.isArray(story.preferences) ? story.preferences.length : 0,
          newSuggestions: visible.filter((r) => r.status === "suggested").length,
          reviewsRead: Object.keys(ledger.progress ?? {}).length,
          writtenAt: story.writtenAt ?? null,
        }
      : null,
  };
}

/** The work-state fields that persist one rule. Throws when it cannot fit in 2000 JSON characters. */
export function ruleEntryFields(rule) {
  const fields = {
    task: `${RULE_TASK_PREFIX}${rule.ruleId}`,
    rule_id: rule.ruleId,
    scope_tier: rule.scopeTier,
    scope_name: rule.scopeTier === "everywhere" ? "Everywhere" : rule.scopeName,
    when: rule.when ?? "",
    then: rule.then,
    set_by: rule.setBy,
    status: rule.status,
    source: rule.source,
    replaced_by: rule.replacedBy ?? null,
    replaced_at: rule.replacedAt ?? null,
    quotes: quotesToText(rule.quotes ?? []),
    times_seen: rule.timesSeen ?? 1,
    latest_at: rule.latestAt ?? null,
  };
  let quotes = (rule.quotes ?? []).slice(0, MAX_QUOTES);
  while (JSON.stringify(fields).length > 2000 && quotes.length) {
    quotes = quotes.slice(0, -1);
    fields.quotes = quotesToText(quotes);
  }
  if (JSON.stringify(fields).length > 2000) throw new RangeError("This rule is too long to save. Shorten it.");
  return fields;
}

/** A rule's sort weight in MY-RULES.md: how often seen, discounted by weeks since last seen. */
function weight(rule, now) {
  const at = Date.parse(rule.latestAt ?? "");
  const days = Number.isFinite(at) ? Math.max(0, (now - at) / DAY_MS) : 365;
  return rule.timesSeen / (1 + days / 7);
}

/** MY-RULES.md: only rules that are on and set or approved by the owner. */
export function rulesMarkdown(rules, now = Date.now(), { viewerUrl = "" } = {}) {
  const active = rules.filter((r) => r.status === "on" && (r.setBy === "owner" || r.setBy === "approved"));
  const groups = new Map();
  for (const r of active) {
    const id = scopeId(r.scopeTier, r.scopeName);
    if (!groups.has(id)) groups.set(id, { tier: r.scopeTier, name: r.scopeName, rules: [] });
    groups.get(id).rules.push(r);
  }
  const sorted = [...groups.values()].sort((a, b) => SCOPE_TIERS.indexOf(a.tier) - SCOPE_TIERS.indexOf(b.tier) || a.name.localeCompare(b.name));
  const lines = ["# My Rules", "", `How I want agents to work. Written by aletheia-mem from the rules I set or approved in My Rules${viewerUrl ? ` (${viewerUrl})` : ""}.`];
  for (const g of sorted) {
    lines.push("", `## ${g.tier === "project" ? `In ${g.name}` : g.tier === "situation" ? g.name : "Everywhere"}`, "");
    g.rules.sort((a, b) => SET_BY_ORDER[a.setBy] - SET_BY_ORDER[b.setBy] || weight(b, now) - weight(a, now));
    for (const r of g.rules) lines.push(r.when ? `- When ${r.when}: ${lowerFirst(r.then)}` : `- ${r.then}`);
  }
  return { markdown: `${lines.join("\n")}\n`, approvedCount: active.length };
}

export { MY_RULES_LIST };
