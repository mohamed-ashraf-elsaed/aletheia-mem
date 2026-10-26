// DOM-free helpers for the one UI (T-134, T-139). Everything here is a plain function so it can be imported in
// a test with no browser. The router, the tab list and the view models live here; one-ui.js only touches the DOM.

import { parseHash } from "./ui-pure.js";

export const TABS = [
  { id: "work", label: "Work", hash: "#/work", key: "w", icon: "home", hint: "What your tools are doing now" },
  { id: "memory", label: "Memory", hash: "#/memory", key: "m", icon: "layers", hint: "Memories, facts and the review queue" },
  { id: "rules", label: "Rules", hash: "#/rules", key: "r", icon: "rules", hint: "How you want every tool to work" },
  { id: "tools", label: "Tools", hash: "#/tools", key: "t", icon: "tool", hint: "Installed tools, sync and activity" },
];

/** The pages inside a tab. The first one is the default. */
export const SUBVIEWS = {
  work: [],
  memory: [
    { id: "memories", label: "Memories" },
    { id: "facts", label: "Facts" },
    { id: "review", label: "Review" },
    { id: "dismissed", label: "Dismissed" },
    { id: "search", label: "Search" },
  ],
  rules: [
    { id: "rules", label: "Rules" },
    { id: "suggestions", label: "Suggested" },
    { id: "sync", label: "Write to tools" },
    { id: "import", label: "Import" },
  ],
  tools: [
    { id: "tools", label: "Tools" },
    { id: "devices", label: "Devices" },
    { id: "access", label: "Remote access" },
    { id: "checks", label: "Checks" },
    { id: "activity", label: "Activity" },
  ],
};

export const DEFAULT_TAB = "work";

/** "#/memory?x=1" -> "memory"; anything unknown (including "") -> "work". */
export function parseRoute(hash) {
  const raw = String(hash ?? "").replace(/^#\/?/, "").split("?")[0].trim().toLowerCase();
  return TABS.some((tab) => tab.id === raw) ? raw : DEFAULT_TAB;
}

export function routeHash(id) {
  return TABS.some((tab) => tab.id === id) ? `#/${id}` : `#/${DEFAULT_TAB}`;
}

export function healthView(status) {
  const value = String(status ?? "");
  if (value === "ok") return { state: "ok", label: "Server healthy", dot: "●" };
  if (value === "down") return { state: "down", label: "Server not healthy", dot: "●" };
  return { state: "checking", label: "Checking server health", dot: "○" };
}

const isoDay = (value) => {
  if (!value) return "unknown";
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "unknown";
};

export const formatWhen = isoDay;

/** One fact row, with the labels the Memory tab prints. Importance falls back to confidence, and says so. */
export function factView(fact = {}) {
  const importance = Number(fact.importance ?? fact.confidence ?? 0);
  const text = String(fact.text ?? "").trim();
  return {
    id: Number(fact.id),
    text: text || "(empty fact)",
    subject: fact.subject ?? "",
    predicate: fact.predicate ?? "",
    object: fact.object ?? "",
    project: fact.project ?? "default",
    scope: fact.scope ?? "project",
    status: fact.status ?? "active",
    extractorMode: fact.extractorMode ?? fact.extractor_mode ?? "rules",
    importance,
    importanceLabel: `${importance.toFixed(2)} (${fact.importanceSource ?? "confidence"})`,
    validAt: isoDay(fact.validAt ?? fact.validFrom ?? fact.valid_from_epoch),
    recordedAt: isoDay(fact.recordedAt ?? fact.recorded_at_epoch),
    sourceEpisode: Number(fact.source?.episodeId ?? fact.episode_id ?? 0) || null,
    sourceRef: fact.source?.sourceRef ?? fact.source_ref ?? null,
    sourceText: String(fact.source?.episodeText ?? fact.episode_text ?? "").slice(0, 600),
  };
}

/** "facts: lexical + keys, episodes: lexical; fused: none" for the search panel. */
export function channelLines(channels) {
  if (!channels || typeof channels !== "object") return [];
  const lines = [];
  for (const [name, channel] of Object.entries(channels)) {
    if (name === "note" || !channel || typeof channel !== "object") continue;
    const parts = Object.entries(channel).filter(([, value]) => value === true).map(([key]) => key);
    if (parts.length) lines.push(`${name}: ${parts.join(" + ")}`);
    else if (typeof channel === "string") lines.push(`${name}: ${channel}`);
  }
  if (channels.fused) lines.push(`fused: ${channels.fused}`);
  return lines;
}

export function searchReasonText(reason) {
  return {
    no_terms: "The query had no searchable words.",
    no_rows: "The store has no memories yet.",
    filtered: "Rows exist, but the project or the query terms excluded all of them.",
  }[String(reason ?? "")] ?? (reason ? String(reason) : "");
}

/** A review row's human label and what the item is. */
export function reviewView(item = {}) {
  const type = String(item.type ?? item.item_type ?? "item");
  const reasonLabels = { contradiction: "Two facts disagree", ambiguous_alias: "An alias may belong to two entities", rule_suggestion: "A rule was suggested" };
  return {
    id: Number(item.id),
    type,
    reason: reasonLabels[item.reason] ?? String(item.reason ?? type),
    status: item.status ?? "pending",
    title: item.text ?? item.name ?? `${type} #${item.itemId ?? item.item_id ?? "?"}`,
    detail: item.canonicalName ? `canonical: ${item.canonicalName}` : item.project ? `project: ${item.project}` : "",
    confidence: Number.isFinite(item.confidence) ? Number(item.confidence) : null,
    mergeable: type === "fact" || type === "observation",
  };
}

export function duplicateView(pair = {}) {
  const score = Number(pair.score ?? 0);
  return {
    key: pair.key ?? `${pair.a}:${pair.b}`,
    a: Number(pair.a),
    b: Number(pair.b),
    aText: pair.aText ?? `observation #${pair.a}`,
    bText: pair.bText ?? `observation #${pair.b}`,
    score,
    scoreLabel: Number.isFinite(score) ? score.toFixed(2) : "?",
    auto: !!pair.auto,
  };
}

export function tabIdFromElement(element) {
  return TABS.some((tab) => tab.id === element) ? element : DEFAULT_TAB;
}

/** The optional legacy viewer is offered only when the old database exists. */
export function classicViewerAvailable(overview) {
  return overview?.claudeMem?.exists === true;
}

/**
 * A hash split into the tab, the page inside it and the rest. "#/memory/facts?page=2" gives tab memory, sub facts.
 * `key` changes only when the visible page changes, so a page number or a filter in the hash does not rebuild it.
 */
export function routeOf(hash) {
  const { path, params } = parseHash(hash);
  const tab = parseRoute(`#/${path[0] ?? ""}`);
  const subs = SUBVIEWS[tab] ?? [];
  const sub = subs.some((item) => item.id === path[1]) ? path[1] : subs[0]?.id ?? null;
  const rest = tab === "work" ? path.slice(1) : path.slice(sub === path[1] ? 2 : 1);
  return { tab, sub, rest, params, key: [tab, sub, ...rest].filter(Boolean).join("/") };
}
