// Requests in the Work tab (T-218): one card per request from T-152, with the T-166 progress and ETA, the T-167
// artifacts and a detail page that says where the request came from. Every number is printed from the response.
// Progress and ETA are chosen rules, so each carries the "estimated" link from ui-estimates.js.
import { badge, button, disclosure, emptyState, mono, progressBar, skeleton, timeEl } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { region } from "../ui-region.js";
import { filterBar, hideCard, segmentFilter, selectFilter } from "../ui-views.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";

const STATUS_TONE = { Working: "success", Shipped: "info", "Waiting on you": "warning", Idle: "neutral" };
const ARTIFACT_LABEL = { commit: "commit", pull: "pull request", branch: "branch" };
const NO_ETA = "No ETA yet. One is shown only when a request has two session starts, one finished session and work left.";

export const requestHref = (id) => `#/work/request/${encodeURIComponent(id)}`;
export const sessionHref = (project, id) => `#/work/session/${encodeURIComponent(id)}?project=${encodeURIComponent(project ?? "")}`;

/** A duration in words, or "unknown" when the row has no usable time. */
export function durationLabel(ms) {
  if (ms == null || ms === "") return "unknown";
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "unknown";
  if (value < 60_000) return "under a minute";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

const statusTone = (status) => STATUS_TONE[status] ?? "neutral";
const externalUrl = (url) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : null);

/** The commit, pull and branch links. A URL is only a link when it is http(s); anything else is shown as text. */
export function artifactList(artifacts = []) {
  if (!artifacts.length) return h("p", { class: "ui-meta" }, "Nothing recorded yet: no commit, pull request or branch was found in this request's tool events.");
  return h("ul", { class: "ui-plain-list" }, ...artifacts.map((artifact) => {
    const label = ARTIFACT_LABEL[artifact.kind] ?? artifact.kind;
    const value = String(artifact.value ?? artifact.name ?? artifact.sha ?? "");
    const url = externalUrl(artifact.url);
    return h("li", { class: "ui-meta", dir: "auto" },
      h("span", {}, `${label}: `),
      url ? h("a", { href: url, dir: "ltr", rel: "noreferrer" }, value) : mono(value, { copy: false }),
      artifact.evidenceId != null ? h("span", {}, ` · evidence ${artifact.evidenceId}`) : null,
      artifact.sessionId ? h("span", {}, ` · session ${artifact.sessionId}`) : null);
  }));
}

/** Progress, its evidence ids and the estimated link. */
export function progressBlock(request = {}) {
  const evidence = request.progressEvidence ?? {};
  const completed = Number(evidence.completedSessions ?? 0);
  const total = Number(evidence.sessionCount ?? request.sessionCount ?? 0);
  const percent = Number(request.progress ?? 0);
  const ids = [
    ...(evidence.completedSessionIds ?? []).map((id) => `session ${id}`),
    ...(evidence.factIds ?? []).map((id) => `fact #${id}`),
    ...(evidence.summaryIds ?? []).map((id) => `summary #${id}`),
  ];
  return h("div", { class: "ui-request-progress" },
    progressBar({ value: percent, max: 100, label: `Progress for ${request.title ?? request.id ?? "this request"}`, text: `${percent}% · ${completed} of ${total} sessions finished` }),
    h("div", { class: "ui-row" }, estimated("Progress"), h("span", { class: "ui-meta" }, "the share of sessions that ended or produced a summary")),
    disclosure({
      summary: `Progress evidence (${ids.length})`,
      content: ids.length ? h("div", { class: "ui-meta", dir: "auto" }, ids.join(" · ")) : h("p", { class: "ui-meta" }, "No evidence ids: no session has ended or produced a summary yet."),
    }));
}

/** The ETA, or the documented reason there is none. */
export function etaBlock(request = {}) {
  if (!request.eta) return h("p", { class: "ui-meta" }, NO_ETA);
  const evidence = request.etaEvidence ?? {};
  const pace = evidence.paceMs ? `pace ${durationLabel(evidence.paceMs)} between starts` : null;
  const left = evidence.remainingSessions != null ? `${evidence.remainingSessions} session${evidence.remainingSessions === 1 ? "" : "s"} left` : null;
  return h("div", { class: "ui-row ui-meta" }, h("span", {}, "Estimated finish "), timeEl(request.eta), estimated("ETA"), [pace, left].filter(Boolean).length ? h("span", {}, ` · ${[pace, left].filter(Boolean).join(" · ")}`) : null);
}

function sessionLinks(request) {
  const ids = request.evidence?.sessionIds ?? [];
  if (!ids.length) return h("p", { class: "ui-meta" }, "No sessions are recorded for this request.");
  const links = [];
  ids.forEach((id, index) => {
    if (index) links.push(" · ");
    links.push(h("a", { href: sessionHref(request.project, id), dir: "ltr" }, id));
  });
  return h("div", { class: "ui-meta" }, ...links);
}

/** One request card. `onDismiss(request, card)` is supplied by the list so it can refresh itself. */
export function requestCard(request = {}, { onDismiss = null } = {}) {
  const title = request.title ?? "Untitled request";
  return h("article", { class: "ui-card ui-item ui-request", "data-kind": "request", "data-id": request.id },
    h("div", { class: "ui-item-head" },
      h("a", { class: "ui-work-link ui-item-title", href: requestHref(request.id), dir: "auto" }, title),
      h("div", { class: "ui-row" }, badge(request.status ?? "Unknown", statusTone(request.status)), request.project ? badge(request.project) : null, request.tool ? badge(request.tool) : null)),
    h("div", { class: "ui-meta" },
      h("span", {}, "started "), timeEl(request.startedAt),
      h("span", {}, `ran ${durationLabel(request.runningTimeMs)}`),
      h("span", {}, `${request.sessionCount ?? 0} session${request.sessionCount === 1 ? "" : "s"}`),
      h("span", {}, `${request.promptCount ?? 0} prompt${request.promptCount === 1 ? "" : "s"}`),
      h("span", {}, `${request.toolCount ?? 0} tool event${request.toolCount === 1 ? "" : "s"}`)),
    request.goal ? h("div", { class: "ui-meta" }, h("span", {}, "goal: "), h("span", { dir: "auto" }, request.goal)) : null,
    progressBlock(request),
    etaBlock(request),
    disclosure({ summary: `Came out of it (${(request.cameOutOfIt ?? []).length})`, content: artifactList(request.cameOutOfIt ?? []) }),
    disclosure({ summary: `Sessions (${request.evidence?.sessionIds?.length ?? 0})`, content: sessionLinks(request) }),
    h("div", { class: "ui-acts" },
      h("a", { class: "ui-btn ui-btn-secondary ui-btn-sm", href: requestHref(request.id) }, "Open request"),
      requestDetailDismissButton(request, onDismiss)));
}

function requestDetailDismissButton(request, onDismiss) {
  if (!onDismiss) return null;
  return button({ label: "Dismiss", size: "sm", icon: "eye-off", onClick: () => onDismiss(request) });
}

function dismissedRow(request, reload) {
  return h("article", { class: "ui-card ui-item", "data-kind": "request", "data-id": request.id },
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, request.title ?? "Untitled request"), badge(request.status ?? "Unknown", statusTone(request.status))),
    h("div", { class: "ui-meta" }, request.project ? badge(request.project) : null, h("span", {}, `${request.sessionCount ?? 0} session${request.sessionCount === 1 ? "" : "s"}`)),
    h("div", { class: "ui-acts" }, button({ label: "Restore", size: "sm", icon: "undo", onClick: () => optimistic({
      apply: () => {},
      request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
      done: "Request restored.",
      undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
      reapply: () => reload(),
      failure: "Could not restore this request.",
    }).then((ok) => { if (ok) reload(); }) })));
}

/** Dismiss one request optimistically, with Undo. */
export function dismissRequest(request, card, reload) {
  let back = () => {};
  return optimistic({
    apply: () => { back = hideCard(card); },
    rollback: () => back(),
    request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
    done: "Request dismissed. Nothing was deleted.",
    undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
    reapply: () => { back(); reload(); },
    failure: "Could not dismiss this request.",
  }).then((ok) => { if (ok) reload({ soft: true }); return ok; });
}

/**
 * The request list. The route takes `limit` but no `offset`, so this is a Region with its own controls and a page
 * size, never a pager that would show the same rows on page 2.
 */
export function requestsView({ onCounts = null } = {}) {
  const state = { filter: "all", sort: "newest", group: "", limit: 10 };
  const rows = h("div", { class: "ui-list-rows" });
  const dismissedSlot = h("div", { class: "ui-dismissed-requests" });
  const countsLine = h("div", { class: "ui-meta ui-results-line", role: "status" });
  let shown = 0;

  const reload = (options) => reg.reload(options);
  const set = (patch) => { Object.assign(state, patch); reg.reload(); };

  const reg = region({
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    load: () => api(`/v1/work/requests?${queryString({ project: state.project, filter: state.filter, sort: state.sort, group: state.group, limit: state.limit })}`),
    isEmpty: (data) => (data.requests ?? []).length === 0 && (data.groups ?? []).length === 0,
    empty: () => emptyState({ title: "No requests yet", text: "A request is a set of sessions that share a goal in one project. Run a prompt in a connected tool and it appears here.", art: "memory", compact: true }),
    errorTitle: "Could not load requests",
    onData: (data) => { onCounts?.(data); },
    render: (data) => {
      const requests = data.requests ?? [];
      const groups = data.group && Array.isArray(data.groups) ? data.groups : null;
      shown = groups ? groups.reduce((sum, group) => sum + (group.requests?.length ?? 0), 0) : requests.length;
      const cards = [];
      if (groups) {
        for (const group of groups) {
          cards.push(h("h3", { class: "ui-subhead", dir: "auto" }, `${group.label ?? group.key ?? "unknown"} (${group.count ?? group.requests?.length ?? 0})`));
          for (const request of group.requests ?? []) cards.push(requestCard(request, { onDismiss: (item) => dismissRequest(item, cards[cards.length - 1], reload) }));
        }
      } else {
        for (const request of requests) {
          const card = requestCard(request, { onDismiss: (item) => dismissRequest(item, card, reload) });
          cards.push(card);
        }
      }
      swap(rows, ...cards, cards.length ? null : emptyState({ title: "No request matches", text: "Change the filter or clear the project.", art: "search", compact: true }));
      const all = data.counts?.all ?? shown;
      swap(countsLine, `${shown} of ${all} request${all === 1 ? "" : "s"} · ${data.counts?.working ?? 0} working · ${data.counts?.needsYou ?? 0} need you · ${data.counts?.shipped ?? 0} shipped`);
      const dismissed = data.dismissedRequests ?? [];
      swap(dismissedSlot, dismissed.length
        ? disclosure({ summary: `Dismissed requests (${dismissed.length})`, content: h("div", {}, ...dismissed.map((request) => dismissedRow(request, reload))) })
        : null);
      return h("div", {}, countsLine, rows, dismissedSlot);
    },
  });

  const bar = filterBar([[
    segmentFilter({ key: "filter", label: "Show", value: state.filter, options: [{ value: "all", label: "All" }, { value: "needs-you", label: "Needs you" }, { value: "shipped", label: "Shipped" }], onChange: (filter) => set({ filter }) }),
    selectFilter({ key: "sort", label: "Sort", value: state.sort, options: [{ value: "newest", label: "Newest" }, { value: "needs-you", label: "Needs you first" }, { value: "most-progress", label: "Most progress" }], onChange: (sort) => set({ sort }) }),
    selectFilter({ key: "group", label: "Group", value: state.group, options: [{ value: "", label: "None" }, { value: "tool", label: "By tool" }], onChange: (group) => set({ group }) }),
    selectFilter({ key: "limit", label: "Show at most", value: String(state.limit), options: [{ value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }], onChange: (limit) => set({ limit: Number(limit) }) }),
  ]]);
  const el = h("div", { class: "ui-requests" }, h("div", { class: "ui-filterbar" }, bar.node), reg);
  Object.assign(el, { reload, dispose: () => reg.dispose?.() });
  return el;
}

/** `#/work/request/<16 hex>` or null. */
export function requestRoute() {
  const match = /^#\/work\/request\/([a-f0-9]{16})(?:\?(.*))?$/.exec(String(globalThis.location.hash ?? ""));
  if (!match) return null;
  return { id: match[1], project: new URLSearchParams(match[2] ?? "").get("project") ?? "" };
}

function promptRows(session) {
  if (!session.prompts?.length) return h("p", { class: "ui-meta" }, "No prompts recorded for this session.");
  return h("div", { class: "ui-quotes" }, ...session.prompts.map((prompt) => h("div", { class: "ui-fact-source", dir: "auto" },
    h("span", { class: "ui-meta" }, `#${prompt.id} · `), prompt.at ? timeEl(prompt.at) : "unknown time", " · ", prompt.text)));
}

function factRows(session) {
  if (!session.facts?.length) return h("p", { class: "ui-meta" }, "No facts recorded for this session.");
  return h("div", { class: "ui-list-rows" }, ...session.facts.map((fact) => h("article", { class: "ui-card ui-item" },
    h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, fact.text ?? `fact #${fact.id}`),
    h("div", { class: "ui-meta" }, mono(`#${fact.id}`, { copy: false }), fact.status ? badge(fact.status) : null, fact.recordedAt ? timeEl(fact.recordedAt) : null))));
}

function sessionDetail(session) {
  return h("article", { class: "ui-card ui-item" },
    h("div", { class: "ui-item-head" },
      h("a", { class: "ui-work-link ui-item-title", href: sessionHref(session.project, session.sessionId), dir: "ltr" }, session.sessionId),
      h("div", { class: "ui-row" }, badge(session.ended ? "ended" : "open", session.ended ? "success" : "neutral"))),
    h("div", { class: "ui-meta" }, h("span", {}, "first "), timeEl(session.firstAt), h("span", {}, "last "), timeEl(session.lastAt), h("span", {}, `${session.prompts?.length ?? 0} prompt${session.prompts?.length === 1 ? "" : "s"}`), h("span", {}, `${session.facts?.length ?? 0} fact${session.facts?.length === 1 ? "" : "s"}`)),
    disclosure({ summary: `Prompts (${session.prompts?.length ?? 0})`, content: promptRows(session) }),
    disclosure({ summary: `Facts (${session.facts?.length ?? 0})`, content: factRows(session) }));
}

/** The request detail page: where this came from, and what it produced. */
export function requestDetailPage(route) {
  const back = h("a", { class: "ui-btn ui-btn-ghost ui-btn-sm", href: "#/work" }, "← Work");
  const reg = region({
    load: () => api(`/v1/work/requests/${encodeURIComponent(route.id)}${route.project ? `?project=${encodeURIComponent(route.project)}` : ""}`),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: () => false,
    errorTitle: "Request not found",
    render: (payload) => {
      const request = payload.request ?? {};
      const origin = request.whereThisCameFrom ?? {};
      globalThis.document.title = `Request ${request.id ?? ""} · Aletheia`;
      return h("div", {},
        h("div", { class: "ui-page-head" },
          h("div", {},
            h("h1", { dir: "auto" }, request.title ?? "Untitled request"),
            h("div", { class: "ui-meta" }, badge(request.status ?? "Unknown", statusTone(request.status)), request.project ? badge(request.project) : null, request.tool ? badge(request.tool) : null, h("span", {}, "started "), timeEl(request.startedAt), h("span", {}, `ran ${durationLabel(request.runningTimeMs)}`), h("span", {}, `${request.promptCount ?? 0} prompts`), h("span", {}, `${request.toolCount ?? 0} tool events`))),
          back),
        progressBlock(request),
        etaBlock(request),
        h("h2", {}, "Came out of it"),
        h("div", { class: "ui-card" }, artifactList(request.cameOutOfIt ?? [])),
        h("h2", {}, `Where this came from (${origin.promptCount ?? 0} prompts, ${origin.factCount ?? 0} facts)`),
        h("p", { class: "ui-meta" }, "Each session keeps a link back to its own page."),
        origin.sessions?.length
          ? h("div", { class: "ui-list-rows" }, ...origin.sessions.map(sessionDetail))
          : emptyState({ title: "No source rows", text: "This request has no stored session, prompt or fact rows.", compact: true }),
        h("div", { class: "ui-acts" }, button({ label: "Dismiss this request", size: "sm", icon: "eye-off", onClick: () => optimistic({
          apply: () => { globalThis.location.hash = "#/work"; },
          rollback: () => { globalThis.location.hash = requestHref(request.id); },
          request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
          done: "Request dismissed. Nothing was deleted.",
          undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
          failure: "Could not dismiss this request.",
        }) })),
        h("p", { class: "ui-meta" }, "Request id ", mono(String(request.id ?? ""), { copy: false })));
    },
  });
  return h("div", { class: "ui-work" }, reg);
}
