// The Work tab (T-143, T-150, T-215): this hub's own sessions, review items, facts and goals. It never reads the legacy
// viewer's database. Sessions and goals are server-paged lists; the counts, the "needs you" items and the recent
// facts come from one small overview request that refreshes every 10 seconds while the tab is visible, and at once
// when the status bar's WebSocket reports a change. Actions change the screen first and can be undone for 8 seconds.
import { routeOf } from "../ui-core.js";
import { badge, button, clampText, disclosure, emptyState, markdownView, mono, skeleton, statTile, statusDot, timeline } from "../ui-components.js";
import { api, byId, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { estimated } from "../ui-estimates.js";
import { firstRunGuide, guideHidden } from "../ui-guide.js";
import { region } from "../ui-region.js";
import { hideCard } from "../ui-views.js";
import { factLineView, sessionDetailView, workHeaderView, workNeedsView } from "../work-view.js";
import { queryString } from "./memory-views.js";
import { goalsRollupView } from "./work-goals.js";
import { requestDetailPage, requestRoute, requestsView } from "./work-requests.js";

const REFRESH_MS = 10_000;
const NEEDS_SHOWN = 6;
let timer = null;
let frameHandler = null;
let visibilityHandler = null;
let frameTimer = null;
let overview = null;

export function stopWorkRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
  clearTimeout(frameTimer);
  if (frameHandler) globalThis.removeEventListener("aletheia:frame", frameHandler);
  frameHandler = null;
  if (visibilityHandler) globalThis.document.removeEventListener("visibilitychange", visibilityHandler);
  visibilityHandler = null;
}

function sessionRoute() {
  const match = /^#\/work\/session\/([^?]+)(?:\?(.*))?$/.exec(String(globalThis.location.hash ?? ""));
  if (!match) return null;
  let id = match[1];
  try { id = decodeURIComponent(id); } catch { /* keep the raw id */ }
  const params = new URLSearchParams(match[2] ?? "");
  return { id, project: params.get("project") ?? "" };
}

const onWorkOverview = () => routeOf(globalThis.location.hash).tab === "work" && !sessionRoute() && !requestRoute();

function startRefresh(refresh) {
  stopWorkRefresh();
  timer = setInterval(() => {
    if (!onWorkOverview()) { stopWorkRefresh(); return; }
    if (globalThis.document.visibilityState === "visible") refresh();
  }, REFRESH_MS);
  // The status bar owns the one WebSocket. It announces each change frame as an event; a short pause groups a burst.
  frameHandler = () => { clearTimeout(frameTimer); frameTimer = setTimeout(() => { if (onWorkOverview() && globalThis.document.visibilityState === "visible") refresh(); }, 500); };
  globalThis.addEventListener("aletheia:frame", frameHandler);
  visibilityHandler = () => { if (globalThis.document.visibilityState === "visible" && onWorkOverview()) refresh(); };
  globalThis.document.addEventListener("visibilitychange", visibilityHandler);
}

// ---- cards -----------------------------------------------------------------------------------------------

function factLine(fact) {
  const view = factLineView(fact);
  return h("article", { class: "ui-card ui-item", "data-kind": "fact" },
    h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, view.text),
    h("div", { class: "ui-meta" }, h("span", {}, view.sourceLabel), h("span", {}, `importance ${view.importanceLabel}`), h("span", {}, view.validAt), badge(view.scope)),
    view.sourceText ? disclosure({ summary: "Show source text", content: clampText({ text: view.sourceText, lines: 6, mono: true }) }) : null);
}

/** One thing that needs a decision. Accept, Reject, Dismiss and Restore are optimistic and undoable. */
function needsCard(item, refresh) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": item.kind, "data-id": item.id });
  const send = (action) => {
    if (item.kind === "review") return api(`/api/hub/review/${item.id}`, { method: "POST", body: { action } });
    if (item.kind === "rule") return api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action } });
    return api(action === "restore" ? "/api/hub/restore" : "/api/hub/dismiss", { method: "POST", body: { type: item.type, id: item.id } });
  };
  const act = (action) => {
    let back = () => {};
    let result = null;
    const undo = async () => {
      if (item.kind === "review") return api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: "reopen" } });
      if (item.kind === "rule") {
        await api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action: "restore" } });
        if (action === "accept" && result?.ruleId) await api(`/api/hub/rules/${result.ruleId}`, { method: "PATCH", body: { enabled: false } });
        return null;
      }
      return api(action === "restore" ? "/api/hub/dismiss" : "/api/hub/restore", { method: "POST", body: { type: item.type, id: item.id } });
    };
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: async () => { result = await send(action); },
      done: { accept: "Accepted.", reject: "Rejected.", dismiss: "Dismissed. Nothing was deleted.", restore: "Restored." }[action],
      undo,
      reapply: () => { back(); refresh(); },
      failure: "Could not do that.",
    }).then((ok) => { if (ok) refresh({ soft: true }); return ok; });
  };
  swap(card,
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, item.title), badge(item.kind === "review" ? "review" : item.kind === "rule" ? "rule suggestion" : "dismissed", "warning")),
    h("div", { class: "ui-meta" }, item.detail),
    h("div", { class: "ui-acts" }, ...item.actions.map((action) => button({ label: action.label, size: "sm", variant: action.id === "accept" ? "primary" : "secondary", onClick: () => act(action.id) }))));
  return card;
}

// ---- the overview ------------------------------------------------------------------------------------------

function buildOverview() {
  const guideSlot = h("div", { class: "ui-guide-slot" });
  const needsSlot = h("div", { class: "ui-needs-slot" }, skeleton({ kind: "card", count: 2 }));
  const recentSlot = h("div", { class: "ui-recent-slot" }, skeleton({ kind: "card", count: 2 }));
  let guide = null;
  let requests = null;
  let goals = null;

  const refresh = ({ soft = true } = {}) => { strip.reload({ soft }); requests?.reload({ soft: true }); goals?.reload({ soft: true }); };

  const syncGuide = async (data) => {
    // The overview says `empty` only when there is nothing at all: no sessions, facts, review items or captures.
    if (!data.empty || guideHidden()) { if (guide) { guide.dispose(); guide = null; swap(guideSlot); } return; }
    if (guide) return;
    let tools = [];
    try { tools = (await api("/api/hub/doctor")).tools; } catch { /* the commands still show */ }
    if (guide) return;
    guide = firstRunGuide({ tools, onArrived: () => { guide?.dispose(); guide = null; swap(guideSlot); refresh({ soft: false }); } });
    swap(guideSlot, guide);
  };

  const strip = region({
    className: "ui-work-strip-region",
    load: () => api(`/v1/work?${queryString({ sessions: 1, facts: 8, review: 6, project: state.project })}`),
    skeleton: () => skeleton({ kind: "stat", count: 6 }),
    isEmpty: () => false,
    errorTitle: "Could not load the Work overview",
    onData: (data) => {
      syncGuide(data);
      const needs = workNeedsView(data);
      // The overview can carry many items; show the first few and link to the paged pages for the rest.
      const shown = needs.slice(0, NEEDS_SHOWN);
      swap(needsSlot, shown.length ? shown.map((item) => needsCard(item, refresh)) : emptyState({ title: "Nothing needs you right now", text: "Review items, rule suggestions and recently hidden rows show up here.", art: "review", compact: true }),
        h("p", { class: "ui-meta" }, needs.length > shown.length ? `Showing ${shown.length} of ${needs.length}. ` : "", h("a", { href: "#/memory/review" }, "Open the review queue"), " · ", h("a", { href: "#/rules/suggestions" }, "Suggested rules"), " · ", h("a", { href: "#/memory/dismissed" }, "Hidden items")));
      swap(recentSlot, data.recentFacts.length ? data.recentFacts.map(factLine) : emptyState({ title: "No current facts yet", text: "They appear after extraction runs.", compact: true }),
        h("p", { class: "ui-meta" }, h("a", { href: "#/memory/facts" }, "See all facts")));
    },
    render: (data) => {
      const header = workHeaderView(data);
      const needsTotal = header.review + (data.ruleSuggestions?.length ?? 0) + (data.dismissed?.length ?? 0);
      const health = header.health.state === "ok";
      return h("div", { class: "ui-work-strip" },
        h("div", { class: "ui-card ui-stat" }, h("b", { class: "ui-stat-value" }, h("span", { class: "ui-row" }, statusDot(health ? "ok" : "error"), header.health.label)), h("span", { class: "ui-stat-label" }, "health")),
        h("div", { class: "ui-card ui-stat" }, h("b", { class: "ui-stat-value ui-stat-small" }, header.lastCapture), h("span", { class: "ui-stat-label" }, "last capture")),
        statTile({ label: "queued", value: data.queue?.depth ?? 0, detail: header.queueDetail }),
        h("div", { class: "ui-card ui-stat" }, h("b", { class: "ui-stat-value" }, header.mode), h("span", { class: "ui-stat-label" }, "mode")),
        statTile({ label: "sessions in this window", value: header.sessions, detail: `${header.facts} recent facts` }),
        statTile({ label: "needs you", value: needsTotal, tone: needsTotal ? "warning" : null, detail: `${header.review} review · ${data.ruleSuggestions?.length ?? 0} rules · ${data.dismissed?.length ?? 0} dismissed` }));
    },
  });

  requests = requestsView({ onCounts: () => {} });

  goals = goalsRollupView();

  const root = h("div", { class: "ui-work" },
    h("div", { class: "ui-work-head" }, h("h1", { id: "ui-work-title", tabindex: "-1" }, "Work"), h("p", { class: "ui-meta" }, `Captured sessions, facts and review items from this hub · project: ${state.project || "all"}`)),
    guideSlot,
    strip,
    h("section", { class: "ui-work-requests", "aria-labelledby": "ui-work-requests" },
      h("h2", { id: "ui-work-requests" }, "Requests"),
      h("p", { class: "ui-meta" }, "One card per request: sessions that share a goal in one project. ", estimated("Request grouping")),
      requests),
    h("div", { class: "ui-work-grid" },
      h("section", { class: "ui-work-col", "aria-labelledby": "ui-work-needs" }, h("h2", { id: "ui-work-needs" }, "Needs you"), needsSlot)),
    h("section", { class: "ui-work-memory", "aria-labelledby": "ui-work-recent" }, h("h2", { id: "ui-work-recent" }, "Recent memory"), h("p", { class: "ui-meta" }, "Current facts with their source episode and importance."), recentSlot),
    h("section", { class: "ui-work-goals", "aria-labelledby": "ui-work-goals" }, h("h2", { id: "ui-work-goals" }, "Goals"), h("p", { class: "ui-meta" }, "From your own typed prompts only. A topic is a goal when it repeats in at least two sessions."), goals),
    h("p", { class: "ui-meta ui-work-updated" }, "Refreshes every 10 s while this tab is visible, and at once when something changes."));
  return { el: root, refresh, project: state.project, dispose: () => { guide?.dispose(); requests?.dispose?.(); goals?.dispose?.(); } };
}

// ---- one session -------------------------------------------------------------------------------------------

function sessionPage(route) {
  const back = h("a", { class: "ui-btn ui-btn-ghost ui-btn-sm", href: "#/work" }, "← Work");
  const reg = region({
    load: () => api(`/v1/work/session/${encodeURIComponent(route.id)}${route.project ? `?project=${encodeURIComponent(route.project)}` : ""}`),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: () => false,
    errorTitle: "Session not found",
    render: (payload) => {
      const view = sessionDetailView(payload.session);
      globalThis.document.title = `Session ${view.id} · Aletheia`;
      const tone = { prompt: "info", tool: "neutral", summary: "success" };
      return h("div", {},
        h("div", { class: "ui-page-head" }, h("div", {}, h("h1", { dir: "auto" }, view.title), h("div", { class: "ui-meta" }, badge(view.project), badge(view.tool), h("span", {}, `first ${view.firstAt}`), h("span", {}, `last ${view.lastAt}`), h("span", {}, view.promptLabel), h("span", {}, view.toolLabel))), back),
        h("h2", {}, "Summary"),
        h("div", { class: "ui-card" }, view.summary === "No summary yet." ? h("p", { class: "ui-meta" }, "No summary yet.") : markdownView(view.summary), view.summaryAt ? h("div", { class: "ui-meta" }, view.summaryAt) : null),
        h("h2", {}, "Timeline"),
        view.timeline.length
          ? timeline(view.timeline.map((item, index) => ({ title: item.kindLabel, at: payload.session.timeline[index]?.at ?? null, tone: tone[item.kind] ?? "neutral", meta: [item.tool, item.source].filter(Boolean).join(" · "), text: item.text })))
          : emptyState({ title: "No timeline rows", text: "This session has no captured prompts or tool events yet.", compact: true }),
        h("h2", {}, `Extracted facts (${view.facts.length})`),
        view.facts.length ? h("div", { class: "ui-list-rows" }, ...view.facts.map((fact) => h("article", { class: "ui-card ui-item" }, h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, fact.text), h("div", { class: "ui-meta" }, h("span", {}, fact.sourceLabel), h("span", {}, `importance ${fact.importanceLabel}`), h("span", {}, fact.validAt), badge(fact.status)))))
          : emptyState({ title: "No facts extracted for this session yet", compact: true }),
        h("p", { class: "ui-meta" }, "Session id ", mono(String(view.id))));
    },
  });
  return h("div", { class: "ui-work" }, h("div", { class: "ui-row" }, back), reg);
}

export async function renderWork() {
  stopWorkRefresh();
  const root = byId("ui-work");
  if (!root) return;
  const route = sessionRoute();
  if (route) {
    overview?.dispose();
    overview = null;
    swap(root, sessionPage(route));
    return;
  }
  const request = requestRoute();
  if (request) {
    overview?.dispose();
    overview = null;
    swap(root, requestDetailPage(request));
    return;
  }
  globalThis.document.title = "Work · Aletheia";
  if (!overview || overview.project !== state.project || !root.contains(overview.el)) {
    overview?.dispose();
    overview = buildOverview();
    swap(root, overview.el);
  } else overview.refresh({ soft: true });
  startRefresh(() => overview?.refresh({ soft: true }));
}

