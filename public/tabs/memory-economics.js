// Context economics in the Memory tab (T-221). GET /v1/context/economics reports read tokens per context memory
// and work tokens from the extraction ledger. A null work-token value is printed as "n/a" with the response's own
// reason; zero is never substituted for an unknown.
import { badge, emptyState, skeleton, statTile, timeEl } from "../ui-components.js";
import { api, h, state } from "../ui-dom.js";
import { region } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { queryString } from "./memory-views.js";

const NA = "n/a";

export function formatTokens(value) {
  if (value == null || value === "") return NA;
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en").format(number) : NA;
}

function contextRow(item = {}) {
  const work = item.workTokens == null ? NA : formatTokens(item.workTokens);
  return h("article", { class: "ui-card ui-item", "data-kind": "context", "data-id": item.id },
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, item.title || `Context row #${item.id}`),
      h("div", { class: "ui-row" }, badge(item.kind ?? "observation"), item.at ? timeEl(item.at) : null)),
    h("div", { class: "ui-meta" }, h("span", {}, `read tokens: ${formatTokens(item.readTokens)}`), h("span", {}, `work tokens: ${work}`), item.project ? badge(item.project) : null),
    item.workTokens == null ? h("p", { class: "ui-meta" }, item.workTokensSource ?? "no usage record") : null,
    item.text ? h("p", { class: "ui-meta", dir: "auto" }, item.text) : null);
}

export function economicsView() {
  const reg = region({
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    load: () => api(`/v1/context/economics?${queryString({ project: state.project, limit: 50 })}`),
    isEmpty: (data) => data.empty === true,
    empty: () => emptyState({ title: "No context rows yet", text: "Economics counts the memories a later session would read. Capture something first.", compact: true }),
    errorTitle: "Could not load context economics",
    render: (data) => {
      const totals = data.totals ?? {};
      const observations = data.observations ?? [];
      return h("div", {},
        h("div", { class: "ui-grid ui-stat-grid" },
          statTile({ label: "Observations", value: totals.observations ?? 0 }),
          statTile({ label: "Read tokens", value: formatTokens(totals.readTokens), detail: data.counter ?? null, format: (value) => String(value) }),
          statTile({ label: "Work tokens", value: totals.workTokens == null ? NA : formatTokens(totals.workTokens), detail: totals.workTokensSource ?? null, format: (value) => String(value) }),
          statTile({ label: "Savings", value: totals.savingsPercent == null ? NA : `${totals.savingsPercent}%`, detail: totals.savingsPercent == null ? "no measured reduction" : "derived from the usage ledger", format: (value) => String(value) })),
        h("p", { class: "ui-meta" }, "Read tokens use one documented counter: ", data.counter ?? "unknown", " ", estimated("Read tokens")),
        h("h3", {}, "Context rows"),
        observations.length ? h("div", { class: "ui-list-rows" }, ...observations.map(contextRow)) : h("p", { class: "ui-meta" }, "No context rows in this project."),
        h("p", { class: "ui-meta" }, "Work tokens are recorded per extraction call, never per observation. A null value is printed as n/a, not as zero."));
    },
  });
  const el = h("div", { class: "ui-economics" }, reg);
  Object.assign(el, { reload: (options) => reg.reload(options) });
  return el;
}
