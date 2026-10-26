// T-136, T-209: the review queue inside the Memory tab. Queue rows, near-duplicate pairs and resolved items are three
// server-paged lists. Accept, Reject, Keep both and Restore change the screen first and can be undone for 8 seconds.
// Merging rows is the one action that asks first, because it cannot be undone from here.
import { badge, button, confirmDialog, disclosure, emptyState, promptDialog, segmented, skeleton, timeEl, toast } from "../ui-components.js";
import { duplicateView, reviewView as reviewRowView } from "../ui-core.js";
import { api, h, state } from "../ui-dom.js";
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
  card.append(
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, view.title),
      h("div", { class: "ui-row" }, badge(view.type, "warning"), badge(view.reason), view.confidence != null ? badge(`confidence ${view.confidence.toFixed(2)}`) : null)),
    h("div", { class: "ui-meta" }, view.detail ? h("span", {}, view.detail) : null, item.createdAt ? timeEl(item.createdAt) : null, h("span", {}, `#${view.id}`)),
    h("div", { class: "ui-acts" },
      button({ label: "Accept", variant: "primary", size: "sm", icon: "check", onClick: () => act("accept", "Accepted.", "reopen", "Could not accept this item.") }),
      button({ label: "Reject", size: "sm", icon: "x", onClick: () => act("reject", "Rejected. It moved to Resolved below.", "reopen", "Could not reject this item.") }),
      view.type === "fact" && item.itemId ? button({ label: "Open fact", size: "sm", icon: "external", onClick: () => ctx.openFact({ id: item.itemId, text: view.title, project: item.project, status: item.factStatus, confidence: item.confidence }) }) : null,
      view.mergeable ? button({ label: "Merge into…", size: "sm", icon: "link", onClick: async () => {
        const into = await promptDialog({ title: "Merge into which id?", label: "The id of the row to keep. This row is merged into it.", confirmLabel: "Merge" });
        if (!into) return;
        const target = Number(into);
        if (!Number.isSafeInteger(target) || target <= 0) throw new Error("An id is a whole number, for example 42.");
        const ok = await confirmDialog({ title: `Merge into #${target}?`, message: `Row #${view.id} will be marked merged into #${target}, and #${target} is kept. This cannot be undone from this page.`, confirmLabel: "Merge", danger: true });
        if (!ok) return;
        await api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: "merge", into: target } });
        toast("Merged.", { tone: "success" });
        ctx.changed();
      } }) : null));
  return card;
}

function pairCard(pair, ctx, { dismissed = false } = {}) {
  const view = duplicateView(pair);
  const card = h("article", { class: "ui-card ui-item", "data-kind": "pair", "data-id": view.key });
  const side = (id, text) => h("div", { class: "ui-pair-side" }, h("div", { class: "ui-meta" }, `#${id}`), h("p", { dir: "auto" }, text));
  const post = (action) => api("/api/hub/review/pairs", { method: "POST", body: { a: view.a, b: view.b, action } });
  card.append(
    h("div", { class: "ui-item-head" }, h("div", { class: "ui-row" }, badge(dismissed ? "kept apart" : "near-duplicate", "warning"), badge(`similarity ${view.scoreLabel}`), view.auto ? badge("auto-merge candidate") : null)),
    h("div", { class: "ui-pair" }, side(view.a, view.aText), side(view.b, view.bText)),
    h("div", { class: "ui-acts" }, dismissed
      ? button({ label: "Restore", size: "sm", icon: "undo", onClick: () => {
        let back = () => {};
        return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => post("restore"), done: "Pair restored to the queue.", undo: () => post("distinct"), reapply: () => { back(); ctx.changed(); }, failure: "Could not restore this pair." }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
      } })
      : [
        button({ label: "Merge", variant: "primary", size: "sm", icon: "link", onClick: async () => {
          const ok = await confirmDialog({ title: `Merge #${view.b} into #${view.a}?`, message: `The older row #${view.a} is kept and #${view.b} is marked merged. This cannot be undone from this page.`, confirmLabel: "Merge", danger: true });
          if (!ok) return;
          await post("merge");
          toast("Merged.", { tone: "success" });
          ctx.changed();
        } }),
        button({ label: "Keep both", size: "sm", icon: "check", onClick: () => {
          let back = () => {};
          return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => post("distinct"), done: "Kept apart. They will not be suggested again.", undo: () => post("restore"), reapply: () => { back(); ctx.changed(); }, failure: "Could not keep this pair." }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
        } }),
      ]));
  return card;
}

function resolvedCard(item, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "review", "data-id": item.id });
  card.append(
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, item.text ?? item.name ?? `${item.type} #${item.itemId}`), h("div", { class: "ui-row" }, badge(item.type), badge(item.status, item.status === "accepted" ? "success" : "warning"))),
    h("div", { class: "ui-meta" }, h("span", {}, item.reason), item.createdAt ? timeEl(item.createdAt) : null),
    h("div", { class: "ui-acts" }, button({ label: "Reopen", size: "sm", icon: "undo", onClick: () => {
      let back = () => {};
      return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: () => api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: "reopen" } }), done: "Back in the queue.", undo: () => api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: item.status === "accepted" ? "accept" : "reject" } }), reapply: () => { back(); ctx.changed(); }, failure: "Could not reopen this item." }).then((ok) => { if (ok) ctx.changed({ soft: true }); });
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
    defaults: { limit: 10 }, label: "Review queue",
    fetchPage: (p) => api(`/api/hub/review?${queryString({ status: "pending", limit: p.limit, offset: p.offset, project: state.project, dupes: 0 })}`),
    renderItem: (item) => queueCard(item, local),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: "Nothing is waiting for review", text: "When two facts disagree, or a name could mean two things, the item lands here. You decide; nothing changes without you.", art: "review" }),
  });
  const dupes = pagedList({
    defaults: { limit: 10 }, prefix: "d", label: "Near-duplicates",
    fetchPage: async (p) => { const data = await api(`/api/hub/review?${queryString({ status: "pending", items: 0, project: state.project, dupLimit: p.limit, dupOffset: p.offset })}`); return { items: data.duplicates, total: data.duplicatesTotal, extra: data }; },
    renderItem: (pair) => pairCard(pair, local),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No near-duplicates", text: "Aletheia compares memories in your most recent project. Pairs that read almost the same show up here, so you can merge them or keep both.", art: "review", compact: true }),
  });
  const makeKeptApart = () => {
    const list = pagedList({
    defaults: { limit: 10 }, prefix: "k", label: "Pairs kept apart",
    fetchPage: async (p) => { const data = await api(`/api/hub/review?${queryString({ status: "pending", items: 0, project: state.project, dupLimit: p.limit, dupOffset: p.offset })}`); return { items: data.dismissedDuplicates, total: data.dismissedDuplicatesTotal }; },
    renderItem: (pair) => pairCard(pair, local, { dismissed: true }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No pairs kept apart", compact: true }),
  });
    lists.push(list);
    return list;
  };
  const makeResolved = () => {
    const list = pagedList({
    defaults: { limit: 10, status: "accepted" }, prefix: "r", label: "Resolved reviews",
    fetchPage: (p) => api(`/api/hub/review?${queryString({ status: p.status, limit: p.limit, offset: p.offset, project: state.project, dupes: 0 })}`),
    renderItem: (item) => resolvedCard(item, local),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: (s) => emptyState({ title: `No ${s.status} items`, compact: true }),
    toolbar: ({ state: s, set }) => {
      const group = segmented({ label: "Decision", value: s.status, options: [{ value: "accepted", label: "Accepted" }, { value: "rejected", label: "Rejected" }], onChange: (status) => set({ status }) });
      return { node: group, sync: (next) => group.set(next.status) };
    },
  });
    lists.push(list);
    return list;
  };
  lists.push(queue, dupes);

  const root = h("div", { class: "ui-review" },
    section("Review queue", "Decide each item. Accept or reject can be undone for 8 seconds, and any decision can be reopened later.", queue),
    section("Near-duplicates", "Memories that read almost the same. Keep both, or merge the newer into the older one.", dupes),
    disclosure({ summary: "Pairs you kept apart", lazy: makeKeptApart }),
    disclosure({ summary: "Resolved reviews", lazy: makeResolved }));
  root.list = queue;
  root.reload = reloadAll;
  root.dispose = () => lists.forEach((list) => list.dispose?.());
  return root;
}

/** Older name for the same panel. */
export const reviewPanel = reviewView;
