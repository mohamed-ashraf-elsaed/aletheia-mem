// The pages inside the Memory tab: memories, facts, dismissed and search. Each is a server-paged list whose
// page and filters live in the URL hash. Rows come from the API; nothing here invents a number or a row.
import { t } from "../ui-i18n.js";
import { badge, button, emptyState, skeleton } from "../ui-components.js";
import { channelLines, searchReasonText } from "../ui-core.js";
import { api, h, state } from "../ui-dom.js";
import { pagedList } from "../ui-region.js";
import { KIND_OPTIONS, TYPE_OPTIONS, chipFilter, dateRange, dismissedCard, factCard, filterBar, filtersActive, memoryCard, segmentFilter, selectFilter, textFilter } from "../ui-views.js";

/** key=value pairs for a URL, leaving out empty values. */
export function queryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== "" && value != null && value !== false) query.set(key, String(value));
  return query.toString();
}

const clearAll = (defaults, keep = ["limit"]) => Object.fromEntries(Object.entries(defaults).filter(([key]) => !keep.includes(key)));

function emptyFiltered(title, set, defaults) {
  return emptyState({ title, text: t("memory.filterHint"), art: "search", actions: [button({ label: t("memory.clearFilters"), icon: "x", onClick: () => set(clearAll(defaults)) })] });
}

export function memoriesView(ctx) {
  const defaults = { limit: 25, q: "", kind: "", type: "", scope: "", pinned: "", sort: "default", since: "", until: "" };
  let setRef = () => {};
  const list = pagedList({
    defaults, label: t("memory.memories"),
    fetchPage: (p) => api(`/api/hub/memories?${queryString({ limit: p.limit, offset: p.offset, project: state.project, q: p.q, kind: p.kind, type: p.type, scope: p.scope, pinned: p.pinned, sort: p.sort, since: p.since, until: p.until })}`),
    renderItem: (memory, { query }) => memoryCard(memory, { query, onChanged: (opts) => ctx.changed(list, opts), onOpen: (m) => ctx.openMemory(m) }),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: t("memory.noMemoriesTitle"), text: t("memory.noMemoriesText"), command: "aletheia install claude-code --write", actions: [button({ label: t("memory.writeNote"), variant: "primary", icon: "plus", onClick: () => ctx.newNote() })] }),
    emptyFiltered: (s) => emptyFiltered(t("memory.noMemoriesMatch"), setRef, defaults),
    onData: (data) => ctx.counts?.({ memories: data.total }),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: t("memory.filterMemoriesAria"), placeholder: t("memory.filterPlaceholder"), onChange: (q) => set({ q }, { replace: true }) }),
          selectFilter({ key: "type", label: t("memory.type"), value: s.type, options: TYPE_OPTIONS, allLabel: t("memory.anyType"), onChange: (type) => set({ type }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
        ],
        [
          chipFilter({ key: "kind", label: t("memory.kind"), options: KIND_OPTIONS, value: s.kind, onChange: (kind) => set({ kind }) }),
          chipFilter({ key: "scope", label: t("memory.scope"), options: [{ value: "", label: t("memory.anyScope") }, { value: "project", label: t("memory.project") }, { value: "global", label: t("memory.global") }], value: s.scope, onChange: (scope) => set({ scope }) }),
          chipFilter({ key: "pinned", label: t("memory.pinned"), options: [{ value: "", label: t("memory.any") }, { value: "1", label: t("memory.pinnedOnly") }], value: s.pinned, onChange: (pinned) => set({ pinned }) }),
          segmentFilter({ key: "sort", label: t("memory.sort"), value: s.sort, options: [{ value: "default", label: t("memory.sortPinnedFirst") }, { value: "newest", label: t("memory.sortNewest") }, { value: "oldest", label: t("memory.sortOldest") }, { value: "title", label: t("memory.sortAZ") }], onChange: (sort) => set({ sort }) }),
        ],
      ]);
    },
  });
  return list;
}

export function factsView(ctx) {
  const defaults = { limit: 25, q: "", status: "current", scope: "", sort: "recent", since: "", until: "" };
  let setRef = () => {};
  const list = pagedList({
    defaults, label: t("memory.facts"),
    fetchPage: (p) => api(`/api/hub/facts?${queryString({ limit: p.limit, offset: p.offset, project: state.project, q: p.q, status: p.status, scope: p.scope, sort: p.sort, since: p.since, until: p.until })}`),
    renderItem: (fact, { query, state: s }) => factCard(fact, { query, dismissed: s.status === "dismissed", onChanged: (opts) => ctx.changed(list, opts), onOpen: (f) => ctx.openFact(f) }),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: (s) => emptyState({
      title: s.status === "dismissed" ? t("memory.noHiddenFacts") : s.status === "history" ? t("memory.noFactHistory") : t("memory.noFacts"),
      text: s.status === "dismissed" ? t("memory.hiddenFactsText") : t("memory.noFactsText"),
      command: s.status === "current" ? "aletheia compress" : null,
    }),
    emptyFiltered: () => emptyFiltered(t("memory.noFactsMatch"), setRef, defaults),
    onData: (data, s) => ctx.counts?.(s.status === "current" ? { facts: data.total } : {}),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: t("memory.filterFactsAria"), placeholder: t("memory.filterFactsPlaceholder"), onChange: (q) => set({ q }, { replace: true }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
          selectFilter({ key: "sort", label: t("memory.sort"), value: s.sort, options: [{ value: "recent", label: t("memory.sortNewestFirst") }, { value: "oldest", label: t("memory.sortOldestFirst") }, { value: "confidence", label: t("memory.sortMostConfident") }], onChange: (sort) => set({ sort }) }),
        ],
        [
          segmentFilter({ key: "status", label: t("memory.status"), value: s.status, options: [{ value: "current", label: t("memory.statusCurrent") }, { value: "history", label: t("memory.statusHistory") }, { value: "dismissed", label: t("memory.statusDismissed") }], onChange: (status) => set({ status }) }),
          chipFilter({ key: "scope", label: t("memory.scope"), options: [{ value: "", label: t("memory.anyScope") }, { value: "project", label: t("memory.project") }, { value: "global", label: t("memory.global") }], value: s.scope, onChange: (scope) => set({ scope }) }),
        ],
      ]);
    },
  });
  return list;
}

export function dismissedView(ctx) {
  const defaults = { limit: 25, type: "" };
  let setRef = () => {};
  const list = pagedList({
    defaults, label: t("memory.dismissedItems"),
    fetchPage: (p) => api(`/api/hub/dismissed?${queryString({ limit: p.limit, offset: p.offset, project: state.project, type: p.type })}`),
    renderItem: (item) => dismissedCard(item, { onChanged: (opts) => ctx.changed(list, opts) }),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: t("memory.nothingDismissed"), text: t("memory.nothingDismissedText"), art: "review" }),
    emptyFiltered: () => emptyFiltered(t("memory.noItemsMatch"), setRef, defaults),
    onData: (data) => ctx.counts?.({ dismissed: data.total }),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([[chipFilter({ key: "type", label: t("memory.type"), options: [{ value: "", label: t("memory.all") }, { value: "memory", label: t("memory.memories") }, { value: "fact", label: t("memory.facts") }, { value: "observation", label: t("memory.observations") }, { value: "episode", label: t("memory.episodes") }], value: s.type, onChange: (type) => set({ type }) })]]);
    },
  });
  return list;
}

/** A compact row for a memory hit: search returns the index layer, so the full text opens in a drawer. */
function memoryHit(hit, { query }, ctx) {
  return h("article", { class: "ui-card ui-item", "data-kind": "memory", "data-id": hit.id },
    h("div", { class: "ui-item-head" },
      h("h3", { class: "ui-item-title", dir: "auto" }, hit.title || t("memory.untitled")),
      h("div", { class: "ui-row" }, badge(hit.kind), hit.type && hit.type !== hit.kind ? badge(hit.type) : null, hit.pinned ? badge(t("memory.pinnedBadge"), "success") : null)),
    h("div", { class: "ui-meta" }, h("span", {}, hit.project), h("span", {}, hit.tool), h("span", {}, `#${hit.id}`)),
    h("div", { class: "ui-acts" }, button({ label: t("memory.open"), size: "sm", icon: "external", onClick: () => ctx.openMemory(hit) })));
}

export function searchView(ctx, route) {
  const defaults = { limit: 25, q: "", scope: "", history: "", since: "", until: "", kind: "" };
  let setRef = () => {};
  let extra = null;
  const summary = h("div", { class: "ui-search-summary", role: "status" });
  const list = pagedList({
    defaults, label: t("memory.searchResults"),
    fetchPage: async (p) => {
      if (!p.q) return { items: [], total: 0, noQuery: true };
      const data = await api("/v1/search", { method: "POST", body: { query: p.q, project: state.project || undefined, limit: p.limit, offset: p.offset, paged: true, scope: p.scope === "all" ? "all" : undefined, includeHistory: p.history === "1", since: p.since || undefined, until: p.until || undefined, kind: p.kind || undefined } });
      extra = data;
      return { items: [...data.facts, ...data.results], total: data.total, data };
    },
    renderItem: (item, { query }) => (item.kind === "fact" ? factCard(item, { query, onChanged: (opts) => ctx.changed(list, opts), onOpen: (f) => ctx.openFact(f) }) : memoryHit(item, { query }, ctx)),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: t("memory.searchEmptyTitle"), text: t("memory.searchEmptyText"), art: "search" }),
    emptyFiltered: (s) => emptyState({
      title: t("memory.noResults"),
      text: (extra && searchReasonText(extra.reason)) || t("memory.noResultsText"),
      art: "search",
      actions: [
        s.scope !== "all" && state.project ? button({ label: t("memory.searchAll"), onClick: () => setRef({ scope: "all" }) }) : null,
        s.scope || s.history || s.since || s.until || s.kind ? button({ label: t("memory.clearFilters"), onClick: () => setRef({ scope: "", history: "", since: "", until: "", kind: "" }) }) : null,
      ].filter(Boolean),
    }),
    onData: (data, s) => {
      const info = data.data;
      summary.replaceChildren(...(info ? [
        h("span", {}, t("memory.resultsFor", { count: info.total, shown: `${info.total}${info.capped ? "+" : ""}` })), h("b", { dir: "auto" }, `“${s.q}”`),
        h("span", { class: "ui-meta" }, t(info.capped ? "memory.searchTotalsCapped" : "memory.searchTotals", { facts: info.totals.facts, memories: info.totals.memories })),
        ...channelLines(info.channels).map((line) => badge(line)),
        ...(info.channels?.notice ? [h("span", { class: "ui-meta", role: "note" }, info.channels.notice)] : []),
      ] : []));
    },
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: t("memory.searchWordsAria"), placeholder: t("memory.searchPlaceholder"), onChange: (q) => set({ q }, { replace: true }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
        ],
        [
          chipFilter({ key: "scope", label: t("memory.where"), options: [{ value: "", label: t("memory.thisProject") }, { value: "all", label: t("memory.allProjects") }], value: s.scope, onChange: (scope) => set({ scope }) }),
          chipFilter({ key: "history", label: t("memory.facts"), options: [{ value: "", label: t("memory.currentFacts") }, { value: "1", label: t("memory.includeHistory") }], value: s.history, onChange: (history) => set({ history }) }),
          chipFilter({ key: "kind", label: t("memory.memoryKind"), options: KIND_OPTIONS, value: s.kind, onChange: (kind) => set({ kind }) }),
        ],
      ]);
    },
  });
  const wrap = h("div", {}, summary, list);
  wrap.reload = (options) => list.reload(options);
  wrap.dispose = () => list.dispose?.();
  wrap.list = list;
  return wrap;
}
