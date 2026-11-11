// Requests in the Work tab: one card per request, with the progress and ETA, the
// artifacts and a detail page that says where the request came from. Every number is printed from the response.
// Progress and ETA are chosen rules, so each carries the "estimated" link from ui-estimates.js.
import { t } from "../ui-i18n.js";
import { badge, button, disclosure, emptyState, mono, progressBar, skeleton, timeEl } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { region } from "../ui-region.js";
import { filterBar, hideCard, segmentFilter, selectFilter } from "../ui-views.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";
import { plainTitle } from "../ui-home-model.js";

/** A card needs a title a person can read; raw prompts are often pasted text, JSON or numbers. */
const requestTitle = (request) => plainTitle(request.title) ?? t("work.untitledRequest");

const STATUS_TONE = { Working: "success", Shipped: "info", "Waiting on you": "warning", Idle: "neutral" };
const artifactLabel = (kind) => ({ commit: t("work.artifactCommit"), pull: t("work.artifactPull"), branch: t("work.artifactBranch") }[kind] ?? kind);
// Known server statuses get a translated label; an unknown value shows as the server sent it.
const statusLabel = (status) => ({ Working: t("work.statusWorking"), Shipped: t("work.statusShipped"), "Waiting on you": t("work.statusWaiting"), Idle: t("work.statusIdle"), }[status] ?? status ?? t("work.statusUnknown"));

export const requestHref = (id) => `#/work/request/${encodeURIComponent(id)}`;
export const sessionHref = (project, id) => `#/work/session/${encodeURIComponent(id)}?project=${encodeURIComponent(project ?? "")}`;

/** A duration in words, or "unknown" when the row has no usable time. */
export function durationLabel(ms) {
  if (ms == null || ms === "") return t("work.unknown");
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return t("work.unknown");
  if (value < 60_000) return t("work.underMinute");
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return t("work.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? t("work.hoursMinutes", { hours, minutes: rest }) : t("work.hours", { hours });
  const days = Math.floor(hours / 24);
  return t("work.days", { count: days });
}

const statusTone = (status) => STATUS_TONE[status] ?? "neutral";
const externalUrl = (url) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : null);

/** The commit, pull and branch links. A URL is only a link when it is http(s); anything else is shown as text. */
export function artifactList(artifacts = []) {
  if (!artifacts.length) return h("p", { class: "ui-meta" }, t("work.noArtifacts"));
  return h("ul", { class: "ui-plain-list" }, ...artifacts.map((artifact) => {
    const label = artifactLabel(artifact.kind);
    const value = String(artifact.value ?? artifact.name ?? artifact.sha ?? "");
    const url = externalUrl(artifact.url);
    return h("li", { class: "ui-meta", dir: "auto" },
      h("span", {}, `${t("work.artifactPrefix", { label })} `),
      url ? h("a", { class: "ui-artifact-link", href: url, dir: "ltr", rel: "noreferrer" }, value) : mono(value, { copy: false }),
      artifact.evidenceId != null ? h("span", {}, ` · ${t("work.evidenceRef", { id: artifact.evidenceId })}`) : null,
      artifact.sessionId ? h("span", {}, ` · ${t("work.sessionRef", { id: artifact.sessionId })}`) : null);
  }));
}

/** Progress, its evidence ids and the estimated link. */
export function progressBlock(request = {}) {
  const evidence = request.progressEvidence ?? {};
  const completed = Number(evidence.completedSessions ?? 0);
  const total = Number(evidence.sessionCount ?? request.sessionCount ?? 0);
  const percent = Number(request.progress ?? 0);
  const ids = [
    ...(evidence.completedSessionIds ?? []).map((id) => t("work.sessionRef", { id })),
    ...(evidence.factIds ?? []).map((id) => t("work.factRef", { id })),
    ...(evidence.summaryIds ?? []).map((id) => t("work.summaryRef", { id })),
  ];
  return h("div", { class: "ui-request-progress" },
    progressBar({ value: percent, max: 100, label: t("work.progressFor", { title: requestTitle(request) }), text: t("work.progressText", { percent, completed, total }) }),
    h("div", { class: "ui-row" }, estimated(t("work.progress")), h("span", { class: "ui-meta" }, t("work.progressNote"))),
    disclosure({
      summary: t("work.howWorkedOut", { count: ids.length }),
      content: ids.length ? h("div", { class: "ui-meta", dir: "auto" }, ids.join(" · ")) : h("p", { class: "ui-meta" }, t("work.noEvidenceIds")),
    }));
}

/** The ETA, or the documented reason there is none. */
export function etaBlock(request = {}) {
  if (!request.eta) return h("p", { class: "ui-meta" }, t("work.noEta"));
  const evidence = request.etaEvidence ?? {};
  const pace = evidence.paceMs ? t("work.pace", { duration: durationLabel(evidence.paceMs) }) : null;
  const left = evidence.remainingSessions != null ? t("work.sessionsLeft", { count: evidence.remainingSessions }) : null;
  return h("div", { class: "ui-row ui-meta" }, h("span", {}, `${t("work.estimatedFinish")} `), timeEl(request.eta), estimated(t("work.eta")), [pace, left].filter(Boolean).length ? h("span", {}, ` · ${[pace, left].filter(Boolean).join(" · ")}`) : null);
}

function sessionLinks(request) {
  const ids = request.evidence?.sessionIds ?? [];
  if (!ids.length) return h("p", { class: "ui-meta" }, t("work.noSessionsRecorded"));
  const links = [];
  ids.forEach((id, index) => {
    if (index) links.push(" · ");
    links.push(h("a", { href: sessionHref(request.project, id), dir: "ltr" }, id));
  });
  return h("div", { class: "ui-meta" }, ...links);
}

/** One request card. `onDismiss(request, card)` is supplied by the list so it can refresh itself. */
export function requestCard(request = {}, { onDismiss = null } = {}) {
  const title = requestTitle(request);
  return h("article", { class: "ui-card ui-item ui-request", "data-kind": "request", "data-id": request.id },
    h("div", { class: "ui-item-head" },
      h("a", { class: "ui-work-link ui-item-title", href: requestHref(request.id), dir: "auto" }, title),
      h("div", { class: "ui-row" }, badge(statusLabel(request.status), statusTone(request.status)), request.project ? badge(request.project) : null, request.tool ? badge(request.tool) : null)),
    h("div", { class: "ui-meta" },
      h("span", {}, `${t("work.started")} `), timeEl(request.startedAt),
      h("span", {}, t("work.ran", { duration: durationLabel(request.runningTimeMs) })),
      h("span", {}, t("work.sessionCount", { count: request.sessionCount ?? 0 })),
      h("span", {}, t("work.promptCount", { count: request.promptCount ?? 0 })),
      h("span", {}, t("work.toolEventCount", { count: request.toolCount ?? 0 }))),
    request.goal ? h("div", { class: "ui-meta" }, h("span", {}, `${t("work.goalLabel")} `), h("span", { dir: "auto" }, request.goal)) : null,
    progressBlock(request),
    etaBlock(request),
    disclosure({ summary: t("work.whatWasDone", { count: (request.cameOutOfIt ?? []).length }), content: artifactList(request.cameOutOfIt ?? []) }),
    disclosure({ summary: t("work.sessionsCount", { count: request.evidence?.sessionIds?.length ?? 0 }), content: sessionLinks(request) }),
    h("div", { class: "ui-acts" },
      h("a", { class: "ui-btn ui-btn-secondary ui-btn-sm", href: requestHref(request.id) }, t("work.openRequest")),
      requestDetailDismissButton(request, onDismiss)));
}

function requestDetailDismissButton(request, onDismiss) {
  if (!onDismiss) return null;
  return button({ label: t("work.dismiss"), size: "sm", icon: "eye-off", onClick: () => onDismiss(request) });
}

function dismissedRow(request, reload) {
  return h("article", { class: "ui-card ui-item", "data-kind": "request", "data-id": request.id },
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, requestTitle(request)), badge(statusLabel(request.status), statusTone(request.status))),
    h("div", { class: "ui-meta" }, request.project ? badge(request.project) : null, h("span", {}, t("work.sessionCount", { count: request.sessionCount ?? 0 }))),
    h("div", { class: "ui-acts" }, button({ label: t("work.restore"), size: "sm", icon: "undo", onClick: () => optimistic({
      apply: () => {},
      request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
      done: t("work.toastRequestRestored"),
      undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
      reapply: () => reload(),
      failure: t("work.toastRestoreFailed"),
    }).then((ok) => { if (ok) reload(); }) })));
}

/** Dismiss one request optimistically, with Undo. */
export function dismissRequest(request, card, reload) {
  let back = () => {};
  return optimistic({
    apply: () => { back = hideCard(card); },
    rollback: () => back(),
    request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
    done: t("work.toastRequestDismissed"),
    undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
    reapply: () => { back(); reload(); },
    failure: t("work.toastDismissFailed"),
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
    empty: () => emptyState({ title: t("work.noRequestsTitle"), text: t("work.noRequestsText"), art: "memory", compact: true }),
    errorTitle: t("work.requestsError"),
    onData: (data) => { onCounts?.(data); },
    render: (data) => {
      const requests = data.requests ?? [];
      const groups = data.group && Array.isArray(data.groups) ? data.groups : null;
      shown = groups ? groups.reduce((sum, group) => sum + (group.requests?.length ?? 0), 0) : requests.length;
      const cards = [];
      if (groups) {
        for (const group of groups) {
          cards.push(h("h3", { class: "ui-subhead", dir: "auto" }, t("work.groupHeading", { label: group.label ?? group.key ?? t("work.unknown"), count: group.count ?? group.requests?.length ?? 0 })));
          for (const request of group.requests ?? []) cards.push(requestCard(request, { onDismiss: (item) => dismissRequest(item, cards[cards.length - 1], reload) }));
        }
      } else {
        for (const request of requests) {
          const card = requestCard(request, { onDismiss: (item) => dismissRequest(item, card, reload) });
          cards.push(card);
        }
      }
      swap(rows, ...cards, cards.length ? null : emptyState({ title: t("work.noMatchTitle"), text: t("work.noMatchText"), art: "search", compact: true }));
      const all = data.counts?.all ?? shown;
      swap(countsLine, t("work.requestsSummary", { shown, count: all, working: data.counts?.working ?? 0, needsYou: data.counts?.needsYou ?? 0, shipped: data.counts?.shipped ?? 0 }));
      const dismissed = data.dismissedRequests ?? [];
      swap(dismissedSlot, dismissed.length
        ? disclosure({ summary: t("work.dismissedRequests", { count: dismissed.length }), content: h("div", {}, ...dismissed.map((request) => dismissedRow(request, reload))) })
        : null);
      return h("div", {}, countsLine, rows, dismissedSlot);
    },
  });

  const bar = filterBar([[
    segmentFilter({ key: "filter", label: t("work.filterShow"), value: state.filter, options: [{ value: "all", label: t("work.filterAll") }, { value: "needs-you", label: t("work.needsTitle") }, { value: "shipped", label: t("work.shipped") }], onChange: (filter) => set({ filter }) }),
    selectFilter({ key: "sort", label: t("work.filterSort"), value: state.sort, options: [{ value: "newest", label: t("work.sortNewest") }, { value: "needs-you", label: t("work.sortNeedsYou") }, { value: "most-progress", label: t("work.sortProgress") }], onChange: (sort) => set({ sort }) }),
    selectFilter({ key: "group", label: t("work.filterGroup"), value: state.group, options: [{ value: "", label: t("work.groupNone") }, { value: "tool", label: t("work.groupTool") }], onChange: (group) => set({ group }) }),
    selectFilter({ key: "limit", label: t("work.filterLimit"), value: String(state.limit), options: [{ value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }], onChange: (limit) => set({ limit: Number(limit) }) }),
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
  if (!session.prompts?.length) return h("p", { class: "ui-meta" }, t("work.noPrompts"));
  return h("div", { class: "ui-quotes" }, ...session.prompts.map((prompt) => h("div", { class: "ui-fact-source", dir: "auto" },
    h("span", { class: "ui-meta" }, `#${prompt.id} · `), prompt.at ? timeEl(prompt.at) : t("work.unknownTime"), " · ", prompt.text)));
}

function factRows(session) {
  if (!session.facts?.length) return h("p", { class: "ui-meta" }, t("work.noFacts"));
  return h("div", { class: "ui-list-rows" }, ...session.facts.map((fact) => h("article", { class: "ui-card ui-item" },
    h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, fact.text ?? t("work.factRef", { id: fact.id })),
    h("div", { class: "ui-meta" }, mono(`#${fact.id}`, { copy: false }), fact.status ? badge(fact.status) : null, fact.recordedAt ? timeEl(fact.recordedAt) : null))));
}

function sessionDetail(session) {
  return h("article", { class: "ui-card ui-item" },
    h("div", { class: "ui-item-head" },
      h("a", { class: "ui-work-link ui-item-title", href: sessionHref(session.project, session.sessionId), dir: "ltr" }, session.sessionId),
      h("div", { class: "ui-row" }, badge(session.ended ? t("work.ended") : t("work.open"), session.ended ? "success" : "neutral"))),
    h("div", { class: "ui-meta" }, h("span", {}, `${t("work.first")} `), timeEl(session.firstAt), h("span", {}, `${t("work.last")} `), timeEl(session.lastAt), h("span", {}, t("work.promptCount", { count: session.prompts?.length ?? 0 })), h("span", {}, t("work.factCount", { count: session.facts?.length ?? 0 }))),
    disclosure({ summary: t("work.promptsCount", { count: session.prompts?.length ?? 0 }), content: promptRows(session) }),
    disclosure({ summary: t("work.factsCount", { count: session.facts?.length ?? 0 }), content: factRows(session) }));
}

/** The request detail page: where this came from, and what it produced. */
export function requestDetailPage(route) {
  const back = h("a", { class: "ui-btn ui-btn-ghost ui-btn-sm", href: "#/work" }, t("work.backToWork"));
  const reg = region({
    load: () => api(`/v1/work/requests/${encodeURIComponent(route.id)}${route.project ? `?project=${encodeURIComponent(route.project)}` : ""}`),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: () => false,
    errorTitle: t("work.requestNotFound"),
    render: (payload) => {
      const request = payload.request ?? {};
      const origin = request.whereThisCameFrom ?? {};
      globalThis.document.title = t("work.requestDocTitle", { id: request.id ?? "" });
      return h("div", {},
        h("div", { class: "ui-page-head" },
          h("div", {},
            h("h1", { dir: "auto" }, requestTitle(request)),
            h("div", { class: "ui-meta" }, badge(statusLabel(request.status), statusTone(request.status)), request.project ? badge(request.project) : null, request.tool ? badge(request.tool) : null, h("span", {}, `${t("work.started")} `), timeEl(request.startedAt), h("span", {}, t("work.ran", { duration: durationLabel(request.runningTimeMs) })), h("span", {}, t("work.promptsTotal", { count: request.promptCount ?? 0 })), h("span", {}, t("work.toolEventsTotal", { count: request.toolCount ?? 0 })))),
          back),
        progressBlock(request),
        etaBlock(request),
        h("h2", {}, t("work.whatWasDoneTitle")),
        h("div", { class: "ui-card" }, artifactList(request.cameOutOfIt ?? [])),
        h("h2", {}, t("work.whereFrom", { prompts: origin.promptCount ?? 0, facts: origin.factCount ?? 0 })),
        h("p", { class: "ui-meta" }, t("work.whereFromNote")),
        origin.sessions?.length
          ? h("div", { class: "ui-list-rows" }, ...origin.sessions.map(sessionDetail))
          : emptyState({ title: t("work.noSourceTitle"), text: t("work.noSourceText"), compact: true }),
        h("div", { class: "ui-acts" }, button({ label: t("work.dismissThisRequest"), size: "sm", icon: "eye-off", onClick: () => optimistic({
          apply: () => { globalThis.location.hash = "#/work"; },
          rollback: () => { globalThis.location.hash = requestHref(request.id); },
          request: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "dismiss" } }),
          done: t("work.toastRequestDismissed"),
          undo: () => api(`/api/hub/requests/${request.id}`, { method: "POST", body: { action: "restore" } }),
          failure: t("work.toastDismissFailed"),
        }) })),
        h("p", { class: "ui-meta" }, t("work.requestIdLabel"), " ", mono(String(request.id ?? ""), { copy: false })));
    },
  });
  return h("div", { class: "ui-work" }, reg);
}
