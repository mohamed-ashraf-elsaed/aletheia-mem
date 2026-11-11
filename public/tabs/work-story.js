// The build story in the Work tab. Counts, shipping velocity and learned habits all come from
// GET /v1/work/story. Where a value is absent the panel says so; it never fills a gap with a number.
import { t } from "../ui-i18n.js";
import { badge, disclosure, emptyState, skeleton, statTile, timeEl } from "../ui-components.js";
import { api, h, state } from "../ui-dom.js";
import { region } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";

const quoteRow = (quote) => h("div", { class: "ui-fact-source", dir: "auto" },
  h("span", { class: "ui-meta" }, quote.at ? String(quote.at) : t("work.unknownTime")), " · ", quote.text);

function habitCard(item = {}) {
  const quotes = item.quotes ?? [];
  const first = quotes.slice(0, 2);
  const more = quotes.slice(2);
  return h("article", { class: "ui-card ui-item", "data-kind": "habit", "data-id": item.text ?? "habit" },
    h("p", { class: "ui-item-title", dir: "auto" }, item.text ?? t("work.untitledHabit")),
    h("div", { class: "ui-meta" },
      h("span", {}, t("work.timesSeen", { count: item.timesSeen ?? quotes.length })),
      item.latestAt ? h("span", {}, `${t("work.lastSeen")} `) : null,
      item.latestAt ? timeEl(item.latestAt) : null,
      estimated(t("work.learnedHabits"))),
    first.length ? h("div", { class: "ui-quotes" }, ...first.map(quoteRow)) : h("p", { class: "ui-meta" }, t("work.noHabitQuotes")),
    more.length ? disclosure({ summary: t("work.moreQuotes", { count: more.length }), content: h("div", { class: "ui-quotes" }, ...more.map(quoteRow)) }) : null);
}

export function storyView() {
  const reg = region({
    skeleton: () => skeleton({ kind: "stat", count: 4 }),
    load: () => {
      const query = queryString({ project: state.project });
      return api(`/v1/work/story${query ? `?${query}` : ""}`);
    },
    isEmpty: (data) => data.empty === true || ((data.counts?.total ?? 0) === 0 && (data.learned ?? []).length === 0),
    empty: () => emptyState({ title: t("work.noStoryTitle"), text: t("work.noStoryText"), compact: true }),
    errorTitle: t("work.storyError"),
    render: (data) => {
      const counts = data.counts ?? {};
      const velocity = data.velocity ?? {};
      const weeks = velocity.perWeek ?? [];
      const learned = data.learned ?? [];
      const average = velocity.averageDaysToShip;
      return h("div", {},
        h("div", { class: "ui-grid ui-stat-grid" },
          statTile({ label: t("work.shipped"), value: counts.shipped ?? 0 }),
          statTile({ label: t("work.working"), value: counts.working ?? 0 }),
          statTile({ label: t("work.waitingOnYou"), value: counts.waitingOnYou ?? 0 }),
          statTile({ label: t("work.idle"), value: counts.idle ?? 0 }),
          statTile({ label: t("work.requestsTitle"), value: counts.total ?? 0 }),
          statTile({ label: t("work.shippedSoFar"), value: velocity.totalShipped ?? counts.shipped ?? 0, detail: average == null ? t("work.avgDaysNone") : t("work.avgDays", { days: average }) })),
        h("h3", {}, t("work.shippingVelocity")),
        weeks.length
          ? h("ul", { class: "ui-plain-list" }, ...weeks.map((week) => h("li", { class: "ui-meta" }, t("work.weekShipped", { week: week.week, count: week.shipped }))))
          : h("p", { class: "ui-meta" }, t("work.noShippedWeek")),
        h("h3", {}, t("work.learnedHabits")),
        learned.length
          ? h("div", { class: "ui-list-rows" }, ...learned.map(habitCard))
          : h("p", { class: "ui-meta" }, t("work.noCorrections")));
    },
  });
  const el = h("div", { class: "ui-story" }, reg);
  Object.assign(el, { reload: (options) => reg.reload(options) });
  return el;
}
