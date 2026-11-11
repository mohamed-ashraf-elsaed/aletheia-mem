// Context economics in the Memory tab. GET /v1/context/economics reports read tokens per context memory
// and work tokens from the extraction ledger. A null work-token value is printed as "n/a" with the response's own
// reason; zero is never substituted for an unknown.
import { badge, emptyState, skeleton, statTile, timeEl } from "../ui-components.js";
import { api, h, state } from "../ui-dom.js";
import { t } from "../ui-i18n.js";
import { region } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";

const na = () => t("economics.na");

export function formatTokens(value) {
  if (value == null || value === "") return na();
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en").format(number) : na();
}

function contextRow(item = {}) {
  const work = item.workTokens == null ? na() : formatTokens(item.workTokens);
  return h("article", { class: "ui-card ui-item", "data-kind": "context", "data-id": item.id },
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, item.title || t("economics.contextRow", { id: item.id })),
      h("div", { class: "ui-row" }, badge(item.kind ?? "observation"), item.at ? timeEl(item.at) : null)),
    h("div", { class: "ui-meta" }, h("span", {}, t("economics.readTokensLine", { value: formatTokens(item.readTokens) })), h("span", {}, t("economics.workTokensLine", { value: work })), item.project ? badge(item.project) : null),
    item.workTokens == null ? h("p", { class: "ui-meta" }, item.workTokensSource ?? t("economics.noUsageRecord")) : null,
    item.text ? h("p", { class: "ui-meta", dir: "auto" }, item.text) : null);
}

export function economicsView() {
  const reg = region({
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    load: () => api(`/v1/context/economics?${queryString({ project: state.project, limit: 50 })}`),
    isEmpty: (data) => data.empty === true,
    empty: () => emptyState({ title: t("economics.emptyTitle"), text: t("economics.emptyText"), compact: true }),
    errorTitle: t("economics.errorTitle"),
    render: (data) => {
      const totals = data.totals ?? {};
      const observations = data.observations ?? [];
      return h("div", {},
        h("div", { class: "ui-grid ui-stat-grid" },
          statTile({ label: t("economics.observations"), value: totals.observations ?? 0 }),
          statTile({ label: t("economics.readTokens"), value: formatTokens(totals.readTokens), detail: data.counter ?? null, format: (value) => String(value) }),
          statTile({ label: t("economics.workTokens"), value: totals.workTokens == null ? na() : formatTokens(totals.workTokens), detail: totals.workTokensSource ?? null, format: (value) => String(value) }),
          statTile({ label: t("economics.savings"), value: totals.savingsPercent == null ? na() : `${totals.savingsPercent}%`, detail: totals.savingsPercent == null ? t("economics.noReduction") : t("economics.derivedFromLedger"), format: (value) => String(value) })),
        h("p", { class: "ui-meta" }, t("economics.counterNote", { counter: data.counter ?? t("economics.unknown") }), " ", estimated(t("economics.readTokens"))),
        h("h3", {}, t("economics.contextRows")),
        observations.length ? h("div", { class: "ui-list-rows" }, ...observations.map(contextRow)) : h("p", { class: "ui-meta" }, t("economics.noRows")),
        h("p", { class: "ui-meta" }, t("economics.workNote")));
    },
  });
  const el = h("div", { class: "ui-economics" }, reg);
  Object.assign(el, { reload: (options) => reg.reload(options) });
  return el;
}
