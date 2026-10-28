// The pages inside the Memory tab: memories, facts, dismissed and search. Each is a server-paged list whose
// page and filters live in the URL hash. Rows come from the API; nothing here invents a number or a row.
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

function emptyFiltered(noun, set, defaults) {
  return emptyState({ title: `No ${noun} match these filters`, text: "Try fewer filters, a wider date range or other words.", art: "search", actions: [button({ label: "Clear filters", icon: "x", onClick: () => set(clearAll(defaults)) })] });
}

export function memoriesView(ctx) {
  const defaults = { limit: 25, q: "", kind: "", type: "", scope: "", pinned: "", sort: "default", since: "", until: "" };
  let setRef = () => {};
  const list = pagedList({
    defaults, label: "Memories",
    fetchPage: (p) => api(`/api/hub/memories?${queryString({ limit: p.limit, offset: p.offset, project: state.project, q: p.q, kind: p.kind, type: p.type, scope: p.scope, pinned: p.pinned, sort: p.sort, since: p.since, until: p.until })}`),
    renderItem: (memory, { query }) => memoryCard(memory, { query, onChanged: (opts) => ctx.changed(list, opts), onOpen: (m) => ctx.openMemory(m) }),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: "No memories yet", text: "Memories appear when a connected tool captures a session, or when you write one yourself.", command: "aletheia install claude-code --write", actions: [button({ label: "Write a note", variant: "primary", icon: "plus", onClick: () => ctx.newNote() })] }),
    emptyFiltered: (s) => emptyFiltered("memories", setRef, defaults),
    onData: (data) => ctx.counts?.({ memories: data.total }),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: "Filter memories by text", placeholder: "Filter by words…", onChange: (q) => set({ q }, { replace: true }) }),
          selectFilter({ key: "type", label: "Type", value: s.type, options: TYPE_OPTIONS, allLabel: "Any type", onChange: (type) => set({ type }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
        ],
        [
          chipFilter({ key: "kind", label: "Kind", options: KIND_OPTIONS, value: s.kind, onChange: (kind) => set({ kind }) }),
          chipFilter({ key: "scope", label: "Scope", options: [{ value: "", label: "Any scope" }, { value: "project", label: "Project" }, { value: "global", label: "Global" }], value: s.scope, onChange: (scope) => set({ scope }) }),
          chipFilter({ key: "pinned", label: "Pinned", options: [{ value: "", label: "Any" }, { value: "1", label: "Pinned only" }], value: s.pinned, onChange: (pinned) => set({ pinned }) }),
          segmentFilter({ key: "sort", label: "Sort", value: s.sort, options: [{ value: "default", label: "Pinned first" }, { value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "title", label: "A to Z" }], onChange: (sort) => set({ sort }) }),
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
    defaults, label: "Facts",
    fetchPage: (p) => api(`/api/hub/facts?${queryString({ limit: p.limit, offset: p.offset, project: state.project, q: p.q, status: p.status, scope: p.scope, sort: p.sort, since: p.since, until: p.until })}`),
    renderItem: (fact, { query, state: s }) => factCard(fact, { query, dismissed: s.status === "dismissed", onChanged: (opts) => ctx.changed(list, opts), onOpen: (f) => ctx.openFact(f) }),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: (s) => emptyState({
      title: s.status === "dismissed" ? "No hidden facts" : s.status === "history" ? "No fact history yet" : "No facts yet",
      text: s.status === "dismissed" ? "A fact you hide shows up here, and you can restore it." : "Facts are short statements the worker pulls out of captured sessions. They appear after the first captures are processed.",
      command: s.status === "current" ? "aletheia compress" : null,
    }),
    emptyFiltered: () => emptyFiltered("facts", setRef, defaults),
    onData: (data, s) => ctx.counts?.(s.status === "current" ? { facts: data.total } : {}),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: "Filter facts by text", placeholder: "Filter facts…", onChange: (q) => set({ q }, { replace: true }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
          selectFilter({ key: "sort", label: "Sort", value: s.sort, options: [{ value: "recent", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "confidence", label: "Most confident" }], onChange: (sort) => set({ sort }) }),
        ],
        [
          segmentFilter({ key: "status", label: "Status", value: s.status, options: [{ value: "current", label: "Current" }, { value: "history", label: "History" }, { value: "dismissed", label: "Dismissed" }], onChange: (status) => set({ status }) }),
          chipFilter({ key: "scope", label: "Scope", options: [{ value: "", label: "Any scope" }, { value: "project", label: "Project" }, { value: "global", label: "Global" }], value: s.scope, onChange: (scope) => set({ scope }) }),
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
    defaults, label: "Dismissed items",
    fetchPage: (p) => api(`/api/hub/dismissed?${queryString({ limit: p.limit, offset: p.offset, project: state.project, type: p.type })}`),
    renderItem: (item) => dismissedCard(item, { onChanged: (opts) => ctx.changed(list, opts) }),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: "Nothing is dismissed", text: "When you hide a memory or a fact, it moves here. Hidden rows are left out of search and context but are never deleted. You can restore them at any time.", art: "review" }),
    emptyFiltered: () => emptyFiltered("items", setRef, defaults),
    onData: (data) => ctx.counts?.({ dismissed: data.total }),
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([[chipFilter({ key: "type", label: "Type", options: [{ value: "", label: "All" }, { value: "memory", label: "Memories" }, { value: "fact", label: "Facts" }, { value: "observation", label: "Observations" }, { value: "episode", label: "Episodes" }], value: s.type, onChange: (type) => set({ type }) })]]);
    },
  });
  return list;
}

/** A compact row for a memory hit: search returns the index layer, so the full text opens in a drawer. */
function memoryHit(hit, { query }, ctx) {
  return h("article", { class: "ui-card ui-item", "data-kind": "memory", "data-id": hit.id },
    h("div", { class: "ui-item-head" },
      h("h3", { class: "ui-item-title", dir: "auto" }, hit.title || "(untitled)"),
      h("div", { class: "ui-row" }, badge(hit.kind), hit.type && hit.type !== hit.kind ? badge(hit.type) : null, hit.pinned ? badge("pinned", "success") : null)),
    h("div", { class: "ui-meta" }, h("span", {}, hit.project), h("span", {}, hit.tool), h("span", {}, `#${hit.id}`)),
    h("div", { class: "ui-acts" }, button({ label: "Open", size: "sm", icon: "external", onClick: () => ctx.openMemory(hit) })));
}

export function searchView(ctx, route) {
  const defaults = { limit: 25, q: "", scope: "", history: "", since: "", until: "", kind: "" };
  let setRef = () => {};
  let extra = null;
  const summary = h("div", { class: "ui-search-summary", role: "status" });
  const list = pagedList({
    defaults, label: "Search results",
    fetchPage: async (p) => {
      if (!p.q) return { items: [], total: 0, noQuery: true };
      const data = await api("/v1/search", { method: "POST", body: { query: p.q, project: state.project || undefined, limit: p.limit, offset: p.offset, paged: true, scope: p.scope === "all" ? "all" : undefined, includeHistory: p.history === "1", since: p.since || undefined, until: p.until || undefined, kind: p.kind || undefined } });
      extra = data;
      return { items: [...data.facts, ...data.results], total: data.total, data };
    },
    renderItem: (item, { query }) => (item.kind === "fact" ? factCard(item, { query, onChanged: (opts) => ctx.changed(list, opts), onOpen: (f) => ctx.openFact(f) }) : memoryHit(item, { query }, ctx)),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: "Search your memory", text: "Type words in the box above. Facts come first, then raw memories. Matches are highlighted.", art: "search" }),
    emptyFiltered: (s) => emptyState({
      title: "No results",
      text: (extra && searchReasonText(extra.reason)) || "Nothing matched these words and filters.",
      art: "search",
      actions: [
        s.scope !== "all" && state.project ? button({ label: "Search all projects", onClick: () => setRef({ scope: "all" }) }) : null,
        s.scope || s.history || s.since || s.until || s.kind ? button({ label: "Clear filters", onClick: () => setRef({ scope: "", history: "", since: "", until: "", kind: "" }) }) : null,
      ].filter(Boolean),
    }),
    onData: (data, s) => {
      const info = data.data;
      summary.replaceChildren(...(info ? [
        h("span", {}, `${info.total}${info.capped ? "+" : ""} result${info.total === 1 ? "" : "s"} for `), h("b", { dir: "auto" }, `“${s.q}”`),
        h("span", { class: "ui-meta" }, `${info.totals.facts} facts, ${info.totals.memories} memories${info.capped ? " (the ranking pool is full; refine the words to see more)" : ""}`),
        ...channelLines(info.channels).map((line) => badge(line)),
      ] : []));
    },
    toolbar: ({ state: s, set }) => {
      setRef = set;
      return filterBar([
        [
          textFilter({ key: "q", value: s.q, label: "Search words", placeholder: "Search memory…", onChange: (q) => set({ q }, { replace: true }) }),
          dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
        ],
        [
          chipFilter({ key: "scope", label: "Where", options: [{ value: "", label: "This project" }, { value: "all", label: "All projects" }], value: s.scope, onChange: (scope) => set({ scope }) }),
          chipFilter({ key: "history", label: "Facts", options: [{ value: "", label: "Current facts" }, { value: "1", label: "Include history" }], value: s.history, onChange: (history) => set({ history }) }),
          chipFilter({ key: "kind", label: "Memory kind", options: KIND_OPTIONS, value: s.kind, onChange: (kind) => set({ kind }) }),
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
