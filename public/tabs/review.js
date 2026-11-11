// the review queue inside the Memory tab. Queue rows, near-duplicate pairs and resolved items are three
// server-paged lists. Accept, Reject, Keep both and Restore change the screen first and can be undone for 8 seconds.
// Merging rows is the one action that asks first, because it cannot be undone from here.
import { t } from "../ui-i18n.js";
import { badge, button, confirmDialog, disclosure, emptyState, promptDialog, segmented, skeleton, timeEl, toast } from "../ui-components.js";
import { duplicateView, reviewView as reviewRowView } from "../ui-core.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { pagedList } from "../ui-region.js";
import { hideCard } from "../ui-views.js";
import { queryString } from "./memory-views.js";

function queueCard(item, ctx) {
  const view = reviewRowView(item);
  const card = h("article", { class: "ui-card ui-item", "data-kind": "review", "data-id": view.id });
  const act = (action, done, undoAction, failure) => {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: () => api(`/api/hub/review/${view.id}`, { method: "POST", body: { action } }),
      done,
      undo: () => api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: undoAction } }),
      reapply: () => { back(); ctx.changed(); },
      failure,
    }).then((ok) => { if (ok) ctx.changed({ soft: true }); return ok; });
  };
  swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, view.title),
      h("div", { class: "ui-row" }, badge(view.type, "warning"), badge(view.reason), view.confidence != null ? badge(t("review.confidence", { value: view.confidence.toFixed(2) })) : null)),
    h("div", { class: "ui-meta" }, view.detail ? h("span", {}, view.detail) : null, item.createdAt ? timeEl(item.createdAt) : null, h("span", {}, `#${view.id}`)),
    h("div", { class: "ui-acts" },
      button({ label: t("review.accept"), variant: "primary", size: "sm", icon: "check", onClick: () => act("accept", t("review.accepted"), "reopen", t("review.acceptFailed")) }),
      button({ label: t("review.reject"), size: "sm", icon: "x", onClick: () => act("reject", t("review.rejected"), "reopen", t("review.rejectFailed")) }),
      view.type === "fact" && item.itemId ? button({ label: t("review.openFact"), size: "sm", icon: "external", onClick: () => ctx.openFact({ id: item.itemId, text: view.title, project: item.project, status: item.factStatus, confidence: item.confidence }) }) : null,
      view.mergeable ? button({ label: t("review.mergeInto"), size: "sm", icon: "link", onClick: async () => {
        const into = await promptDialog({ title: t("review.mergePromptTitle"), label: t("review.mergePromptLabel"), confirmLabel: t("review.merge") });
        if (!into) return;
        const target = Number(into);
        if (!Number.isSafeInteger(target) || target <= 0) throw new Error(t("review.idInvalid"));
        const ok = await confirmDialog({ title: t("review.mergeIntoTitle", { target }), message: t("review.mergeIntoMessage", { id: view.id, target }), confirmLabel: t("review.merge"), danger: true });
        if (!ok) return;
        await api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: "merge", into: target } });
        toast(t("review.merged"), { tone: "success" });
        ctx.changed();
      } }) : null));
  return card;
}

function pairCard(pair, ctx, { dismissed = false } = {}) {
  const view = duplicateView(pair);
  const card = h("article", { class: "ui-card ui-item", "data-kind": "pair", "data-id": view.key });
  const side = (id, text) => h("div", { class: "ui-pair-side" }, h("div", { class: "ui-meta" }, `#${id}`), h("p", { dir: "auto" }, text));
  const post = (action) => api("/api/hub/review/pairs", { method: "POST", body: { a: view.a, b: view.b, action } });
  swap(card,
    h("div", { class: "ui-item-head" }, h("div", { class: "ui-row" }, badge(dismissed ? t("review.keptApart") : t("review.nearDuplicate"), "warning"), badge(t("review.similarity", { score: view.scoreLabel })), view.auto ? badge(t("review.autoMergeCandidate")) : null)),
    h("div", { class: "ui-pair" }, side(view.a, view.aText), side(view.b, view.bText)),
    h("div", { class: "ui-acts" }, dismissed
      ? button({ label: t("review.restore"), size: "sm", icon: "undo", onClick: () => {
        let back = () => {};
        return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => post("restore"), done: t("review.pairRestored"), undo: () => post("distinct"), reapply: () => { back(); ctx.changed(); }, failure: t("review.restoreFailed") }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
      } })
      : [
        button({ label: t("review.merge"), variant: "primary", size: "sm", icon: "link", onClick: async () => {
          const ok = await confirmDialog({ title: t("review.mergePairTitle", { a: view.a, b: view.b }), message: t("review.mergePairMessage", { a: view.a, b: view.b }), confirmLabel: t("review.merge"), danger: true });
          if (!ok) return;
          await post("merge");
          toast(t("review.merged"), { tone: "success" });
          ctx.changed();
        } }),
        button({ label: t("review.keepBoth"), size: "sm", icon: "check", onClick: () => {
          let back = () => {};
          return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => post("distinct"), done: t("review.keptApartDone"), undo: () => post("restore"), reapply: () => { back(); ctx.changed(); }, failure: t("review.keepFailed") }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
        } }),
      ]));
  return card;
}

function resolvedCard(item, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "review", "data-id": item.id });
  swap(card,
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, item.text ?? item.name ?? t("review.itemFallback", { type: item.type, id: item.itemId })), h("div", { class: "ui-row" }, badge(item.type), badge(item.status, item.status === "accepted" ? "success" : "warning"))),
    h("div", { class: "ui-meta" }, h("span", {}, item.reason), item.createdAt ? timeEl(item.createdAt) : null),
    h("div", { class: "ui-acts" }, button({ label: t("review.reopen"), size: "sm", icon: "undo", onClick: () => {
      let back = () => {};
      return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: "reopen" } }), done: t("review.reopened"), undo: () => api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: item.status === "accepted" ? "accept" : "reject" } }), reapply: () => { back(); ctx.changed(); }, failure: t("review.reopenFailed") }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
    } })));
  return card;
}

/** The whole review page: the queue, the near-duplicates and, folded away, what was already decided. */
export function reviewView(ctx) {
  const lists = [];
  const reloadAll = (options) => { for (const list of lists) list.reload(options); ctx.changed(null, options); };
  const local = { ...ctx, changed: (options) => reloadAll(options) };
  const section = (title, hint, body) => h("section", { class: "ui-section" }, h("div", { class: "ui-section-head" }, h("div", {}, h("h2", {}, title), hint ? h("p", { class: "ui-meta" }, hint) : null)), body);

  const queue = pagedList({
    defaults: { limit: 10 }, label: t("review.queueTitle"),
    fetchPage: (p) => api(`/api/hub/review?${queryString({ status: "pending", limit: p.limit, offset: p.offset, project: state.project, dupes: 0 })}`),
    renderItem: (item) => queueCard(item, local),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: t("review.queueEmpty"), text: t("review.queueEmptyText"), art: "review" }),
  });
  const dupes = pagedList({
    defaults: { limit: 10 }, prefix: "d", label: t("review.dupesTitle"),
    fetchPage: async (p) => { const data = await api(`/api/hub/review?${queryString({ status: "pending", items: 0, project: state.project, dupLimit: p.limit, dupOffset: p.offset })}`); return { items: data.duplicates, total: data.duplicatesTotal, extra: data }; },
    renderItem: (pair) => pairCard(pair, local),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: t("review.dupesEmpty"), text: t("review.dupesEmptyText"), art: "review", compact: true }),
  });
  const makeKeptApart = () => {
    const list = pagedList({
    defaults: { limit: 10 }, prefix: "k", label: t("review.keptApartLabel"),
    fetchPage: async (p) => { const data = await api(`/api/hub/review?${queryString({ status: "pending", items: 0, project: state.project, dupLimit: p.limit, dupOffset: p.offset })}`); return { items: data.dismissedDuplicates, total: data.dismissedDuplicatesTotal }; },
    renderItem: (pair) => pairCard(pair, local, { dismissed: true }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: t("review.noKeptApart"), compact: true }),
  });
    lists.push(list);
    return list;
  };
  const makeResolved = () => {
    const list = pagedList({
    defaults: { limit: 10, status: "accepted" }, prefix: "r", label: t("review.resolvedLabel"),
    fetchPage: (p) => api(`/api/hub/review?${queryString({ status: p.status, limit: p.limit, offset: p.offset, project: state.project, dupes: 0 })}`),
    renderItem: (item) => resolvedCard(item, local),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: (s) => emptyState({ title: s.status === "rejected" ? t("review.noRejected") : t("review.noAccepted"), compact: true }),
    toolbar: ({ state: s, set }) => {
      const group = segmented({ label: t("review.decision"), value: s.status, options: [{ value: "accepted", label: t("review.statusAccepted") }, { value: "rejected", label: t("review.statusRejected") }], onChange: (status) => set({ status }) });
      return { node: group, sync: (next) => group.set(next.status) };
    },
  });
    lists.push(list);
    return list;
  };
  lists.push(queue, dupes);

  const root = h("div", { class: "ui-review" },
    section(t("review.queueTitle"), t("review.queueHint"), queue),
    section(t("review.dupesTitle"), t("review.dupesHint"), dupes),
    disclosure({ summary: t("review.keptApartSummary"), lazy: makeKeptApart }),
    disclosure({ summary: t("review.resolvedLabel"), lazy: makeResolved }));
  root.list = queue;
  root.reload = reloadAll;
  root.dispose = () => lists.forEach((list) => list.dispose?.());
  return root;
}

/** Older name for the same panel. */
export const reviewPanel = reviewView;
