// The goals roll-up in the Work tab. Every number comes from GET /v1/work/goals: a goal's status,
// its aggregate progress, the requests that serve it, and what came out of them. Pin, Unpin, Dismiss and Restore
// still use POST /api/hub/goals/:id, so that older route keeps working.
import { t } from "../ui-i18n.js";
import { badge, button, disclosure, emptyState, progressBar, skeleton, statTile, timeEl } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { pagedList } from "../ui-region.js";
import { hideCard } from "../ui-views.js";
import { estimated } from "../ui-estimates.js";
import { goalView } from "../work-view.js";
import { queryString } from "./memory-views.js";
import { artifactList, requestHref } from "./work-requests.js";

const STATUS_TONE = { Moving: "success", Stalled: "warning", "Nothing on it": "neutral" };
const statusTone = (status) => STATUS_TONE[status] ?? "neutral";
// Known server statuses get a translated label; an unknown value shows as the server sent it.
const statusLabel = (status) => ({ Moving: t("work.statusMoving"), Stalled: t("work.statusStalled"), "Nothing on it": t("work.statusNothing"), }[status] ?? status ?? t("work.statusUnknown"));

function requestRows(goal) {
  const requests = goal.requests ?? [];
  if (!requests.length) return h("p", { class: "ui-meta" }, t("work.noRequestServes"));
  return h("ul", { class: "ui-plain-list" }, ...requests.map((request) => h("li", { class: "ui-meta" },
    h("a", { href: requestHref(request.id), dir: "auto" }, request.title ?? request.id),
    " · ", statusLabel(request.status),
    request.progress != null ? ` · ${request.progress}%` : "")));
}

/** One goal in the roll-up. `onChanged` reloads the list after a pin, dismiss or restore. */
export function goalRollupCard(goal = {}, { onChanged = null } = {}) {
  const view = goalView(goal);
  const status = goal.status;
  const aggregate = Number(goal.aggregateProgress ?? 0);
  const card = h("article", { class: "ui-card ui-item ui-goal", "data-kind": "goal", "data-id": view.id });
  const post = (action) => api(`/api/hub/goals/${view.id}`, { method: "POST", body: { action } });
  const render = () => swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, view.label),
      h("div", { class: "ui-row" }, badge(statusLabel(status), statusTone(status)), view.pinned ? badge(t("work.pinned"), "success") : null)),
    h("div", { class: "ui-meta" },
      h("span", {}, t("work.requestCount", { count: goal.requestCount ?? 0 })),
      h("span", {}, t("work.sessionCount", { count: goal.sessionCount ?? 0 })),
      h("span", {}, t("work.workingCount", { count: goal.workingCount ?? 0 })),
      h("span", {}, t("work.waitingCount", { count: goal.waitingCount ?? 0 })),
      h("span", {}, t("work.shippedCount", { count: goal.shippedCount ?? 0 })),
      h("span", {}, `${t("work.lastSeen")} `), timeEl(goal.lastSeen),
      view.projects.length ? h("span", {}, t("work.projectsList", { projects: view.projects.join(", ") })) : null),
    h("div", { class: "ui-row" }, progressBar({ value: aggregate, max: 100, label: t("work.aggregateProgressFor", { label: view.label }), text: t("work.aggregateAcross", { percent: aggregate, count: goal.requestCount ?? 0 }) }), estimated(t("work.goalProgress"))),
    disclosure({ summary: t("work.requestsCount", { count: goal.requestCount ?? 0 }), content: requestRows(goal) }),
    disclosure({ summary: t("work.whatWasDone", { count: (goal.whatCameOutOfIt ?? []).length }), content: artifactList(goal.whatCameOutOfIt ?? []) }),
    view.quotes.length ? disclosure({ summary: t("work.datedQuotes", { count: view.quotes.length }), content: h("div", { class: "ui-quotes" }, ...view.quotes.map((quote) => h("div", { class: "ui-fact-source", dir: "auto" }, `#${quote.id} · ${quote.at} · ${quote.project} · ${quote.text}`))) }) : null,
    h("div", { class: "ui-acts" }, goal.dismissed
      ? button({ label: t("work.restore"), size: "sm", icon: "undo", onClick: () => hide("restore", "dismiss", t("work.toastGoalRestored")) })
      : [
        button({ label: view.pinned ? t("work.unpin") : t("work.pin"), size: "sm", icon: "pin", onClick: () => pin(!view.pinned) }),
        button({ label: t("work.dismiss"), size: "sm", icon: "eye-off", onClick: () => hide("dismiss", "restore", t("work.toastGoalDismissed")) }),
      ]));
  const pin = (next) => optimistic({
    apply: () => { goal.pinned = next; render(); },
    rollback: () => { goal.pinned = !next; render(); },
    request: () => post(next ? "pin" : "unpin"),
    done: next ? t("work.toastPinned") : t("work.toastUnpinned"),
    undo: () => post(next ? "unpin" : "pin"),
    reapply: () => { goal.pinned = !next; render(); },
    failure: t("work.toastGoalFailed"),
  }).then((ok) => { if (ok) onChanged?.({ soft: true }); return ok; });
  const hide = (action, undoAction, done) => {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: () => post(action),
      done,
      undo: () => post(undoAction),
      reapply: () => { back(); onChanged?.(); },
      failure: t("work.toastGoalFailed"),
    }).then((ok) => { if (ok) onChanged?.({ soft: true }); return ok; });
  };
  render();
  return card;
}

function askRows(items, emptyText) {
  if (!items?.length) return h("p", { class: "ui-meta" }, emptyText);
  return h("ul", { class: "ui-plain-list" }, ...items.map((goal) => h("li", { class: "ui-meta", dir: "auto" },
    goal.object ?? goal.label ?? goal.id,
    ` · ${t("work.sessionCount", { count: goal.sessionCount ?? 0 })}`,
    ` · ${t("work.quoteCount", { count: goal.count ?? 0 })}`)));
}

/** The roll-up strip: goal progress, the open-ask split and the no-goal bucket. */
export function rollupSummary(data = {}) {
  const goals = data.goals ?? [];
  const asks = data.openAsks ?? {};
  const noGoal = data.noGoal ?? {};
  const mean = goals.length ? Math.round(goals.reduce((sum, goal) => sum + (Number(goal.aggregateProgress) || 0), 0) / goals.length) : null;
  return h("div", { class: "ui-card ui-rollup" },
    h("h3", {}, t("work.rollup")),
    h("div", { class: "ui-grid ui-stat-grid" },
      statTile({ label: t("work.goalsOnPage"), value: goals.length }),
      statTile({ label: t("work.openAsks"), value: asks.total ?? 0 }),
      statTile({ label: t("work.beingWorked"), value: (asks.beingWorked ?? []).length }),
      statTile({ label: t("work.nothingWorking"), value: (asks.nothingWorking ?? []).length }),
      statTile({ label: t("work.noGoal"), value: noGoal.count ?? 0 })),
    mean == null
      ? h("p", { class: "ui-meta" }, t("work.noMeanProgress"))
      : h("div", { class: "ui-row" }, progressBar({ value: mean, max: 100, label: t("work.meanProgressLabel"), text: t("work.meanProgressText", { percent: mean }) }), estimated(t("work.goalProgress"))),
    h("div", { class: "ui-rollup-asks" },
      h("div", {}, h("h4", {}, t("work.beingWorkedCount", { count: (asks.beingWorked ?? []).length })), askRows(asks.beingWorked, t("work.nothingMoving"))),
      h("div", {}, h("h4", {}, t("work.nothingWorkingCount", { count: (asks.nothingWorking ?? []).length })), askRows(asks.nothingWorking, t("work.everyAskMoving")))),
    (noGoal.count ?? 0) > 0
      ? h("div", {}, h("h4", {}, t("work.noGoalCount", { count: noGoal.count })), h("ul", { class: "ui-plain-list" }, ...(noGoal.requests ?? []).map((request) => h("li", { class: "ui-meta" },
        h("a", { href: requestHref(request.id), dir: "auto" }, request.title ?? request.id), ` · ${statusLabel(request.status)}`))))
      : null);
}

/** The goals panel. The route pages, so this is a paged list with the roll-up above it. */
export function goalsRollupView() {
  const summarySlot = h("div", { class: "ui-rollup-slot" });
  const dismissedSlot = h("div", { class: "ui-dismissed-goals" });
  const list = pagedList({
    defaults: { limit: 10 }, prefix: "g", label: t("work.goalsTitle"),
    fetchPage: async (p) => {
      const data = await api(`/v1/work/goals?${queryString({ limit: p.limit, offset: p.offset, project: state.project })}`);
      return { items: data.goals ?? [], total: data.total ?? (data.goals ?? []).length, data };
    },
    renderItem: (goal) => goalRollupCard(goal, { onChanged: (options) => list.reload({ soft: true, ...options }) }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: t("work.noTopicsTitle"), text: t("work.noTopicsText"), art: "memory", compact: true }),
    onData: (data) => {
      const raw = data.data ?? {};
      swap(summarySlot, rollupSummary(raw));
      const dismissed = raw.dismissedGoals ?? [];
      swap(dismissedSlot, dismissed.length
        ? disclosure({ summary: t("work.dismissedGoals", { count: dismissed.length }), content: h("div", {}, ...dismissed.map((goal) => goalRollupCard({ ...goal, dismissed: true }, { onChanged: () => list.reload() })) ) })
        : null);
    },
  });
  const el = h("div", { class: "ui-goals-rollup" }, summarySlot, list, dismissedSlot);
  Object.assign(el, { reload: (options) => list.reload(options), dispose: () => list.dispose?.() });
  return el;
}
