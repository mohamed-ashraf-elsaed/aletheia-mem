// The build story in the Work tab (T-221). Counts, shipping velocity and learned habits all come from
// GET /v1/work/story (T-169). Where a value is absent the panel says so; it never fills a gap with a number.
import { badge, disclosure, emptyState, skeleton, statTile, timeEl } from "../ui-components.js";
import { api, h, state } from "../ui-dom.js";
import { region } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";

const quoteRow = (quote) => h("div", { class: "ui-fact-source", dir: "auto" },
  h("span", { class: "ui-meta" }, quote.at ? String(quote.at) : "unknown time"), " · ", quote.text);

function habitCard(item = {}) {
  const quotes = item.quotes ?? [];
  const first = quotes.slice(0, 2);
  const more = quotes.slice(2);
  return h("article", { class: "ui-card ui-item", "data-kind": "habit", "data-id": item.text ?? "habit" },
    h("p", { class: "ui-item-title", dir: "auto" }, item.text ?? "Untitled habit"),
    h("div", { class: "ui-meta" },
      h("span", {}, `${item.timesSeen ?? quotes.length}× seen`),
      item.latestAt ? h("span", {}, "last seen ") : null,
      item.latestAt ? timeEl(item.latestAt) : null,
      estimated("Learned habits")),
    first.length ? h("div", { class: "ui-quotes" }, ...first.map(quoteRow)) : h("p", { class: "ui-meta" }, "No dated quotes were stored for this habit."),
    more.length ? disclosure({ summary: `More quotes (${more.length})`, content: h("div", { class: "ui-quotes" }, ...more.map(quoteRow)) }) : null);
}

export function storyView() {
  const reg = region({
    skeleton: () => skeleton({ kind: "stat", count: 4 }),
    load: () => {
      const query = queryString({ project: state.project });
      return api(`/v1/work/story${query ? `?${query}` : ""}`);
    },
    isEmpty: (data) => data.empty === true || ((data.counts?.total ?? 0) === 0 && (data.learned ?? []).length === 0),
    empty: () => emptyState({ title: "No story yet", text: "The story is counted from requests and your own prompts. Run a session and it appears here.", compact: true }),
    errorTitle: "Could not load the build story",
    render: (data) => {
      const counts = data.counts ?? {};
      const velocity = data.velocity ?? {};
      const weeks = velocity.perWeek ?? [];
      const learned = data.learned ?? [];
      const average = velocity.averageDaysToShip;
      return h("div", {},
        h("div", { class: "ui-grid ui-stat-grid" },
          statTile({ label: "Shipped", value: counts.shipped ?? 0 }),
          statTile({ label: "Working", value: counts.working ?? 0 }),
          statTile({ label: "Waiting on you", value: counts.waitingOnYou ?? 0 }),
          statTile({ label: "Idle", value: counts.idle ?? 0 }),
          statTile({ label: "Requests", value: counts.total ?? 0 }),
          statTile({ label: "Shipped so far", value: velocity.totalShipped ?? counts.shipped ?? 0, detail: average == null ? "average days to ship: n/a" : `${average} average days to ship` })),
        h("h3", {}, "Shipping velocity"),
        weeks.length
          ? h("ul", { class: "ui-plain-list" }, ...weeks.map((week) => h("li", { class: "ui-meta" }, `${week.week}: ${week.shipped} shipped`)))
          : h("p", { class: "ui-meta" }, "No shipped week is recorded yet."),
        h("h3", {}, "Learned habits"),
        learned.length
          ? h("div", { class: "ui-list-rows" }, ...learned.map(habitCard))
          : h("p", { class: "ui-meta" }, "No repeated correction was found in your prompts yet."));
    },
  });
  const el = h("div", { class: "ui-story" }, reg);
  Object.assign(el, { reload: (options) => reg.reload(options) });
  return el;
}
