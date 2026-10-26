// T-136: the review queue inside the Memory tab. A queue row is accepted, rejected or merged through an API
// route; near-duplicate observation pairs are merged or kept apart. Every action is reversible: rejects and
// "keep both" decisions appear under their own details block with a reopen / restore button.
import { duplicateView, formatWhen, reviewView } from "../ui-core.js";
import { api, chip, errorCard, errorText, h, run, swap, toast } from "../ui-dom.js";

function reviewItemCard(item, refresh) {
  const view = reviewView(item);
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, chip(view.type, "warn"), chip(view.reason), view.confidence != null ? chip(`confidence ${view.confidence.toFixed(2)}`) : null),
    h("b", { class: "ui-fact-text" }, view.title),
    view.detail ? h("div", { class: "ui-meta" }, view.detail) : null,
    h("div", { class: "ui-acts" },
      h("button", { class: "primary", onclick: () => run(async () => {
        await api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: "accept" } });
        toast("Accepted");
        await refresh();
      }) }, "Accept"),
      h("button", { onclick: () => run(async () => {
        await api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: "reject" } });
        toast("Rejected; reopen it under Resolved reviews");
        await refresh();
      }) }, "Reject"),
      view.mergeable ? h("button", { onclick: () => {
        const into = prompt("Merge into which id? The row you name is kept.");
        if (into) run(async () => {
          await api(`/api/hub/review/${view.id}`, { method: "POST", body: { action: "merge", into: Number(into) } });
          toast("Merged");
          await refresh();
        });
      } }, "Merge") : null));
}

export function reviewPanel(review, result, refresh) {
  if (!review) return errorCard(errorText(result, "Review queue"));
  const items = review.items.map((item) => reviewItemCard(item, refresh));
  const duplicates = (review.duplicates ?? []).map((pair) => {
    const view = duplicateView(pair);
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-row" }, chip("near-duplicate", "warn"), chip(`similarity ${view.scoreLabel}`)),
      h("div", { class: "ui-meta" }, `#${view.a} ${view.aText}`),
      h("div", { class: "ui-meta" }, `#${view.b} ${view.bText}`),
      h("div", { class: "ui-acts" },
        h("button", { class: "primary", onclick: () => confirm(`Merge #${view.b} into #${view.a}? The older row is kept and the other is marked merged.`) && run(async () => {
          await api("/api/hub/review/pairs", { method: "POST", body: { a: view.a, b: view.b, action: "merge" } });
          toast("Merged");
          await refresh();
        }) }, "Merge"),
        h("button", { onclick: () => run(async () => {
          await api("/api/hub/review/pairs", { method: "POST", body: { a: view.a, b: view.b, action: "distinct" } });
          toast("Kept apart; still reversible below");
          await refresh();
        }) }, "Keep both")));
  });
  const dismissedPairs = (review.dismissedDuplicates ?? []).map((pair) => {
    const view = duplicateView(pair);
    return h("div", { class: "ui-card" },
      h("div", { class: "ui-meta" }, `#${view.a} ${view.aText} · #${view.b} ${view.bText} · ${view.scoreLabel}`),
      h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
        await api("/api/hub/review/pairs", { method: "POST", body: { a: view.a, b: view.b, action: "restore" } });
        toast("Restored");
        await refresh();
      }) }, "Restore")));
  });
  return h("div", {},
    items.length ? h("div", {}, ...items) : h("div", { class: "ui-empty" }, "Nothing is waiting for review."),
    duplicates.length ? h("h2", {}, "Near-duplicates") : null,
    ...duplicates,
    dismissedPairs.length ? h("details", { class: "ui-details" }, h("summary", {}, `Dismissed duplicate pairs (${dismissedPairs.length})`), ...dismissedPairs) : null,
    resolvedReviews(refresh));
}

function resolvedReviews(refresh) {
  const out = h("div", {});
  return h("details", { class: "ui-details" },
    h("summary", {}, "Resolved reviews (reopen)"),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const [accepted, rejected] = await Promise.all([api("/api/hub/review?status=accepted"), api("/api/hub/review?status=rejected")]);
      const rows = [...accepted.items, ...rejected.items];
      swap(out, ...(rows.length ? rows.map((item) => h("div", { class: "ui-card" },
        h("div", { class: "ui-row" }, chip(item.type), chip(item.reason), chip(item.status), h("span", { class: "ui-meta" }, formatWhen(item.createdAt))),
        h("b", { class: "ui-fact-text" }, item.text ?? item.name ?? `#${item.itemId}`),
        h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
          await api(`/api/hub/review/${item.id}`, { method: "POST", body: { action: "reopen" } });
          toast("Reopened");
          await refresh();
        }) }, "Reopen")))) : [h("div", { class: "ui-empty" }, "No resolved review item.")]));
    }) }, "Load resolved")),
    out);
}
