// DOM-free helpers for the one UI. Everything here is a plain function so it can be imported in
// a test with no browser. The router, the tab list and the view models live here; one-ui.js only touches the DOM.

import { parseHash } from "./ui-pure.js";
import { t } from "./ui-i18n.js";

export const TABS = [
  { id: "home", get label() { return t("nav.home"); }, hash: "#/home", key: "h", icon: "home", get hint() { return t("nav.homeHint"); } },
  { id: "work", get label() { return t("nav.work"); }, hash: "#/work", key: "w", icon: "layers", get hint() { return t("nav.workHint"); } },
  { id: "memory", get label() { return t("nav.memory"); }, hash: "#/memory", key: "m", icon: "layers", get hint() { return t("nav.memoryHint"); } },
  { id: "rules", get label() { return t("nav.rules"); }, hash: "#/rules", key: "r", icon: "rules", get hint() { return t("nav.rulesHint"); } },
  { id: "tools", get label() { return t("nav.tools"); }, hash: "#/tools", key: "t", icon: "tool", get hint() { return t("nav.toolsHint"); } },
];

/** The pages inside a tab. The first one is the default. */
export const SUBVIEWS = {
  home: [],
  work: [],
  memory: [
    { id: "memories", get label() { return t("nav.sub.memory.memories"); } },
    { id: "facts", get label() { return t("nav.sub.memory.facts"); } },
    { id: "review", get label() { return t("nav.sub.memory.review"); } },
    { id: "dismissed", get label() { return t("nav.sub.memory.dismissed"); } },
    { id: "economics", get label() { return t("nav.sub.memory.economics"); } },
    { id: "search", get label() { return t("nav.sub.memory.search"); } },
  ],
  rules: [
    { id: "rules", get label() { return t("nav.sub.rules.rules"); } },
    { id: "suggestions", get label() { return t("nav.sub.rules.suggestions"); }, count: 0 },
    { id: "sync", get label() { return t("nav.sub.rules.sync"); } },
    { id: "import", get label() { return t("nav.sub.rules.import"); } },
  ],
  tools: [
    { id: "tools", get label() { return t("nav.sub.tools.tools"); } },
    { id: "devices", get label() { return t("nav.sub.tools.devices"); } },
    { id: "access", get label() { return t("nav.sub.tools.access"); } },
    { id: "alerts", get label() { return t("nav.sub.tools.alerts"); } },
    { id: "team", get label() { return t("nav.sub.tools.team"); } },
    { id: "data", get label() { return t("nav.sub.tools.data"); } },
    { id: "checks", get label() { return t("nav.sub.tools.checks"); } },
    { id: "activity", get label() { return t("nav.sub.tools.activity"); } },
    { id: "context", get label() { return t("nav.sub.tools.context"); } },
    { id: "settings", get label() { return t("nav.sub.tools.settings"); } },
  ],
};

export const DEFAULT_TAB = "home";

/** "#/memory?x=1" -> "memory"; anything unknown (including "") -> "home". */
export function parseRoute(hash) {
  const raw = String(hash ?? "").replace(/^#\/?/, "").split("?")[0].trim().toLowerCase();
  return TABS.some((tab) => tab.id === raw) ? raw : DEFAULT_TAB;
}

export function routeHash(id) {
  return TABS.some((tab) => tab.id === id) ? `#/${id}` : `#/${DEFAULT_TAB}`;
}

export function healthView(status) {
  const value = String(status ?? "");
  if (value === "ok") return { state: "ok", label: t("shell.health.ok"), dot: "●" };
  if (value === "down") return { state: "down", label: t("shell.health.down"), dot: "●" };
  return { state: "checking", label: t("shell.health.checking"), dot: "○" };
}

const isoDay = (value) => {
  if (!value) return t("shell.unknown");
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : t("shell.unknown");
};

export const formatWhen = isoDay;

/** One fact row, with the labels the Memory tab prints. Importance falls back to confidence, and says so. */
export function factView(fact = {}) {
  const importance = Number(fact.importance ?? fact.confidence ?? 0);
  const text = String(fact.text ?? "").trim();
  return {
    id: Number(fact.id),
    text: text || t("shell.emptyFact"),
    subject: fact.subject ?? "",
    predicate: fact.predicate ?? "",
    object: fact.object ?? "",
    project: fact.project ?? "default",
    scope: fact.scope ?? "project",
    status: fact.status ?? "active",
    extractorMode: fact.extractorMode ?? fact.extractor_mode ?? "rules",
    importance,
    importanceLabel: `${importance.toFixed(2)} (${fact.importanceSource ?? t("shell.confidence")})`,
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
    no_terms: t("shell.reason.noTerms"),
    no_rows: t("shell.reason.noRows"),
    filtered: t("shell.reason.filtered"),
  }[String(reason ?? "")] ?? (reason ? String(reason) : "");
}

/** A review row's human label and what the item is. */
export function reviewView(item = {}) {
  const type = String(item.type ?? item.item_type ?? "item");
  const reasonLabels = { contradiction: t("shell.review.contradiction"), ambiguous_alias: t("shell.review.alias"), rule_suggestion: t("shell.review.rule") };
  return {
    id: Number(item.id),
    type,
    reason: reasonLabels[item.reason] ?? String(item.reason ?? type),
    status: item.status ?? "pending",
    title: item.text ?? item.name ?? `${type} #${item.itemId ?? item.item_id ?? "?"}`,
    detail: item.canonicalName ? t("shell.review.canonical", { name: item.canonicalName }) : item.project ? t("shell.review.project", { name: item.project }) : "",
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
    aText: pair.aText ?? t("shell.observation", { id: pair.a }),
    bText: pair.bText ?? t("shell.observation", { id: pair.b }),
    score,
    scoreLabel: Number.isFinite(score) ? score.toFixed(2) : "?",
    auto: !!pair.auto,
  };
}

export function tabIdFromElement(element) {
  return TABS.some((tab) => tab.id === element) ? element : DEFAULT_TAB;
}

/** True when the page was opened with ?demo=1, which is how screenshots and demos of seeded data are labelled. */
export const isDemo = (search) => new URLSearchParams(String(search ?? "")).get("demo") === "1";

/**
 * The optional legacy viewer is offered only when the old database exists. It cannot send ALETHEIA_API_KEY (its
 * EventSource and file links cannot carry a header), so it is not offered when the server needs the key.
 */
export function classicViewerAvailable(overview) {
  return overview?.claudeMem?.exists === true && overview?.apiKeyRequired !== true;
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
  const rest = tab === "work" || tab === "home" ? path.slice(1) : path.slice(sub === path[1] ? 2 : 1);
  return { tab, sub, rest, params, key: [tab, sub, ...rest].filter(Boolean).join("/") };
}
