// The goals roll-up in the Work tab. Every number comes from GET /v1/work/goals: a goal's status,
// its aggregate progress, the requests that serve it, and what came out of them. Pin, Unpin, Dismiss and Restore
// still use POST /api/hub/goals/:id, so that older route keeps working.
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

function requestRows(goal) {
  const requests = goal.requests ?? [];
  if (!requests.length) return h("p", { class: "ui-meta" }, "No request serves this goal yet.");
  return h("ul", { class: "ui-plain-list" }, ...requests.map((request) => h("li", { class: "ui-meta" },
    h("a", { href: requestHref(request.id), dir: "auto" }, request.title ?? request.id),
    " · ", request.status ?? "Unknown",
    request.progress != null ? ` · ${request.progress}%` : "")));
}

/** One goal in the roll-up. `onChanged` reloads the list after a pin, dismiss or restore. */
export function goalRollupCard(goal = {}, { onChanged = null } = {}) {
  const view = goalView(goal);
  const status = goal.status ?? "Unknown";
  const aggregate = Number(goal.aggregateProgress ?? 0);
  const card = h("article", { class: "ui-card ui-item ui-goal", "data-kind": "goal", "data-id": view.id });
  const post = (action) => api(`/api/hub/goals/${view.id}`, { method: "POST", body: { action } });
  const render = () => swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, view.label),
      h("div", { class: "ui-row" }, badge(status, statusTone(status)), view.pinned ? badge("pinned", "success") : null)),
    h("div", { class: "ui-meta" },
      h("span", {}, `${goal.requestCount ?? 0} request${goal.requestCount === 1 ? "" : "s"}`),
      h("span", {}, `${goal.sessionCount ?? 0} session${goal.sessionCount === 1 ? "" : "s"}`),
      h("span", {}, `${goal.workingCount ?? 0} working`),
      h("span", {}, `${goal.waitingCount ?? 0} waiting`),
      h("span", {}, `${goal.shippedCount ?? 0} shipped`),
      h("span", {}, "last seen "), timeEl(goal.lastSeen),
      view.projects.length ? h("span", {}, `projects: ${view.projects.join(", ")}`) : null),
    h("div", { class: "ui-row" }, progressBar({ value: aggregate, max: 100, label: `Aggregate progress for ${view.label}`, text: `${aggregate}% across ${goal.requestCount ?? 0} request${goal.requestCount === 1 ? "" : "s"}` }), estimated("Goal progress")),
    disclosure({ summary: `Requests (${goal.requestCount ?? 0})`, content: requestRows(goal) }),
    disclosure({ summary: `What was done (${(goal.whatCameOutOfIt ?? []).length})`, content: artifactList(goal.whatCameOutOfIt ?? []) }),
    view.quotes.length ? disclosure({ summary: `Dated quotes (${view.quotes.length})`, content: h("div", { class: "ui-quotes" }, ...view.quotes.map((quote) => h("div", { class: "ui-fact-source", dir: "auto" }, `#${quote.id} · ${quote.at} · ${quote.project} · ${quote.text}`))) }) : null,
    h("div", { class: "ui-acts" }, goal.dismissed
      ? button({ label: "Restore", size: "sm", icon: "undo", onClick: () => hide("restore", "dismiss", "Goal restored.") })
      : [
        button({ label: view.pinned ? "Unpin" : "Pin", size: "sm", icon: "pin", onClick: () => pin(!view.pinned) }),
        button({ label: "Dismiss", size: "sm", icon: "eye-off", onClick: () => hide("dismiss", "restore", "Goal dismissed.") }),
      ]));
  const pin = (next) => optimistic({
    apply: () => { goal.pinned = next; render(); },
    rollback: () => { goal.pinned = !next; render(); },
    request: () => post(next ? "pin" : "unpin"),
    done: next ? "Pinned." : "Unpinned.",
    undo: () => post(next ? "unpin" : "pin"),
    reapply: () => { goal.pinned = !next; render(); },
    failure: "Could not change this goal.",
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
      failure: "Could not change this goal.",
    }).then((ok) => { if (ok) onChanged?.({ soft: true }); return ok; });
  };
  render();
  return card;
}

function askRows(items, emptyText) {
  if (!items?.length) return h("p", { class: "ui-meta" }, emptyText);
  return h("ul", { class: "ui-plain-list" }, ...items.map((goal) => h("li", { class: "ui-meta", dir: "auto" },
    goal.object ?? goal.label ?? goal.id,
    ` · ${goal.sessionCount ?? 0} session${goal.sessionCount === 1 ? "" : "s"}`,
    ` · ${goal.count ?? 0} quote${goal.count === 1 ? "" : "s"}`)));
}

/** The roll-up strip: goal progress, the open-ask split and the no-goal bucket. */
export function rollupSummary(data = {}) {
  const goals = data.goals ?? [];
  const asks = data.openAsks ?? {};
  const noGoal = data.noGoal ?? {};
  const mean = goals.length ? Math.round(goals.reduce((sum, goal) => sum + (Number(goal.aggregateProgress) || 0), 0) / goals.length) : null;
  return h("div", { class: "ui-card ui-rollup" },
    h("h3", {}, "Roll-up"),
    h("div", { class: "ui-grid ui-stat-grid" },
      statTile({ label: "Goals on this page", value: goals.length }),
      statTile({ label: "Open asks", value: asks.total ?? 0 }),
      statTile({ label: "Being worked", value: (asks.beingWorked ?? []).length }),
      statTile({ label: "Nothing working", value: (asks.nothingWorking ?? []).length }),
      statTile({ label: "No goal", value: noGoal.count ?? 0 })),
    mean == null
      ? h("p", { class: "ui-meta" }, "No goal on this page, so there is no mean progress to show.")
      : h("div", { class: "ui-row" }, progressBar({ value: mean, max: 100, label: "Mean goal progress on this page", text: `${mean}% mean progress on this page` }), estimated("Goal progress")),
    h("div", { class: "ui-rollup-asks" },
      h("div", {}, h("h4", {}, `Being worked (${(asks.beingWorked ?? []).length})`), askRows(asks.beingWorked, "Nothing is moving right now.")),
      h("div", {}, h("h4", {}, `Nothing working (${(asks.nothingWorking ?? []).length})`), askRows(asks.nothingWorking, "Every open ask has a request moving on it."))),
    (noGoal.count ?? 0) > 0
      ? h("div", {}, h("h4", {}, `No goal (${noGoal.count})`), h("ul", { class: "ui-plain-list" }, ...(noGoal.requests ?? []).map((request) => h("li", { class: "ui-meta" },
        h("a", { href: requestHref(request.id), dir: "auto" }, request.title ?? request.id), ` · ${request.status ?? "Unknown"}`))))
      : null);
}

/** The goals panel. The route pages, so this is a paged list with the roll-up above it. */
export function goalsRollupView() {
  const summarySlot = h("div", { class: "ui-rollup-slot" });
  const dismissedSlot = h("div", { class: "ui-dismissed-goals" });
  const list = pagedList({
    defaults: { limit: 10 }, prefix: "g", label: "Goals",
    fetchPage: async (p) => {
      const data = await api(`/v1/work/goals?${queryString({ limit: p.limit, offset: p.offset, project: state.project })}`);
      return { items: data.goals ?? [], total: data.total ?? (data.goals ?? []).length, data };
    },
    renderItem: (goal) => goalRollupCard(goal, { onChanged: (options) => list.reload({ soft: true, ...options }) }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No repeated topics yet", text: "A topic becomes a goal when you type it in at least two sessions. Every number here is read from those prompts.", art: "memory", compact: true }),
    onData: (data) => {
      const raw = data.data ?? {};
      swap(summarySlot, rollupSummary(raw));
      const dismissed = raw.dismissedGoals ?? [];
      swap(dismissedSlot, dismissed.length
        ? disclosure({ summary: `Dismissed goals (${dismissed.length})`, content: h("div", {}, ...dismissed.map((goal) => goalRollupCard({ ...goal, dismissed: true }, { onChanged: () => list.reload() })) ) })
        : null);
    },
  });
  const el = h("div", { class: "ui-goals-rollup" }, summarySlot, list, dismissedSlot);
  Object.assign(el, { reload: (options) => list.reload(options), dispose: () => list.dispose?.() });
  return el;
}
