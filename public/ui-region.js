// The Region wrapper and the paged list (T-207). A Region owns one block of data on the page and always shows one
// of four things: a skeleton while loading, the content, an empty state that says what to do, or an error with
// Retry and Copy details. A paged list is a Region plus a toolbar and a pager whose page and filters live in the
// URL hash, so Back, Forward and reload return to the same place.
import { button, emptyState, enterList, errorState, pager, skeleton } from "./ui-components.js";
import { h, swap } from "./ui-dom.js";
import { reducedMotion } from "./ui-motion.js";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, REGION_INITIAL, buildHash, clampLimit, parseHash, regionReduce } from "./ui-pure.js";

/**
 * region({ load, render, isEmpty, empty, skeleton })
 *   load(signal)  returns the data, or throws.
 *   render(data, { soft })  returns a node; soft is true for a background reload that keeps the screen.
 *   isEmpty(data) true when there is nothing to show (default: an empty array or an empty `items` array).
 *   empty(data)   returns a node for the empty state.
 *   skeleton()    returns a node shaped like the final layout.
 * The returned element has reload({ soft }) (soft keeps the content on screen), state() and onChange.
 */
export function region({ load, render, isEmpty = defaultEmpty, empty = () => emptyState({ title: "Nothing here yet" }), skeleton: makeSkeleton = () => skeleton({ kind: "lines", count: 1, lines: 3 }), errorTitle = "Could not load this", className = "", onData = null, animate = true } = {}) {
  const body = h("div", { class: "ui-region-body" });
  const bar = h("div", { class: "ui-region-bar", hidden: true, "aria-hidden": "true" });
  const el = h("div", { class: `ui-region ${className}`.trim() }, bar, body);
  let state = REGION_INITIAL;
  let sequence = 0;
  let controller = null;
  let shown = null;
  let rendered = false;
  let lastKind = "load";

  const lockHeight = () => {
    const height = body.getBoundingClientRect?.().height;
    if (height > 0) el.style.minHeight = `${Math.ceil(height)}px`;
  };
  const unlockHeight = () => el.style.removeProperty("min-height");

  const labelOf = (node) => (node.getAttribute?.("aria-label") || node.textContent || "").trim();
  const leaving = (node) => { for (let n = node; n && n !== body; n = n.parentNode) if (n.hidden || n.classList?.contains("is-leaving")) return true; return false; };
  const likeThis = (tag, label) => [...body.querySelectorAll(tag)].filter((node) => labelOf(node) === label && !leaving(node));
  /** Which control has focus inside the body, as its tag, label and place among controls like it. */
  const focusMark = () => {
    const active = globalThis.document?.activeElement;
    let inside = false;
    for (let node = active; node; node = node.parentNode) if (node === body) { inside = true; break; }
    if (!inside || active === body) return null;
    const tag = active.tagName.toLowerCase();
    const label = labelOf(active);
    return { tag, label, ordinal: Math.max(0, likeThis(tag, label).indexOf(active)) };
  };
  /** A refresh replaces the nodes. Give focus back to the control that took the old one's place. */
  const restoreFocus = (mark) => {
    if (!mark || !["button", "a", "select", "input", "textarea"].includes(mark.tag)) return;
    const same = likeThis(mark.tag, mark.label);
    (same[Math.min(mark.ordinal, same.length - 1)] ?? body.querySelector("button") ?? body.querySelector("a"))?.focus?.();
  };

  const paint = () => {
    el.setAttribute("aria-busy", String(state.status === "loading" || state.refreshing));
    bar.hidden = !state.refreshing;
    el.dataset.state = state.status;
    if (state.status === "loading") {
      shown = "loading";
      swap(body, makeSkeleton());
      return;
    }
    if (state.status === "error") {
      shown = "error";
      swap(body, errorState({ title: errorTitle, error: state.errorObject, message: state.error, onRetry: () => api.reload() }));
      unlockHeight();
      return;
    }
    const first = shown !== state.status;
    shown = state.status;
    const mark = focusMark();
    const content = state.status === "empty" ? empty(state.data) : render(state.data, { soft: lastKind === "reload" });
    const softError = state.error
      ? h("div", { class: "ui-inline-error", role: "alert" }, h("span", {}, `Could not refresh: ${state.error}`), button({ label: "Retry", size: "sm", onClick: () => api.reload({ soft: true }) }))
      : null;
    swap(body, softError, content);
    restoreFocus(mark);
    if (animate && first && !rendered) { body.classList.add("ui-fade"); setTimeout(() => body.classList.remove("ui-fade"), 400); }
    rendered = true;
    unlockHeight();
  };

  async function run(kind) {
    const mine = (sequence += 1);
    controller?.abort?.();
    controller = typeof AbortController === "function" ? new AbortController() : null;
    lastKind = kind;
    if (kind === "load") lockHeight();
    state = regionReduce(state, { type: kind });
    paint();
    try {
      const data = await load(controller?.signal);
      if (mine !== sequence) return;
      state = regionReduce(state, { type: "resolve", data, empty: isEmpty(data) });
      paint();
      onData?.(data);
    } catch (error) {
      if (mine !== sequence || error?.name === "AbortError") return;
      state = { ...regionReduce(state, { type: "fail", error }), errorObject: error };
      paint();
    }
  }

  const api = Object.assign(el, {
    reload: ({ soft = false } = {}) => run(soft ? "reload" : "load"),
    state: () => state,
    /** Replace the data without a request, for example after an optimistic edit. */
    setData(data) { state = regionReduce(state, { type: "resolve", data, empty: isEmpty(data) }); paint(); },
  });
  run("load");
  return api;
}

function defaultEmpty(data) {
  if (Array.isArray(data)) return data.length === 0;
  if (data && Array.isArray(data.items)) return data.items.length === 0;
  return data == null;
}

// ---- URL-backed list state -------------------------------------------------------------------------------

const realEnv = () => ({
  getHash: () => globalThis.location.hash,
  push: (hash) => globalThis.history.pushState(null, "", hash),
  replace: (hash) => globalThis.history.replaceState(null, "", hash),
  onPop: (fn) => { globalThis.addEventListener("popstate", fn); return () => globalThis.removeEventListener("popstate", fn); },
});

/** Read list state from a hash: { page, limit, ...filters }. Missing values fall back to the defaults. */
export function readListState(hash, defaults, prefix = "") {
  const { params } = parseHash(hash);
  const state = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key === "limit" || key === "page") continue;
    const value = params[`${prefix}${key}`];
    if (value !== undefined) state[key] = value;
  }
  state.limit = clampLimit(params[`${prefix}limit`] ?? defaults.limit, defaults.limit ?? DEFAULT_PAGE_SIZE);
  if (!PAGE_SIZES.includes(state.limit)) state.limit = clampLimit(defaults.limit ?? DEFAULT_PAGE_SIZE);
  state.page = Math.max(1, Math.trunc(Number(params[`${prefix}page`] ?? 1)) || 1);
  return state;
}

/** Write list state into a hash, keeping the path and any keys that belong to someone else. Defaults are left out. */
export function writeListState(hash, state, defaults, prefix = "") {
  const { path, params } = parseHash(hash);
  const next = { ...params };
  const flat = { [`${prefix}page`]: 1, [`${prefix}limit`]: defaults.limit ?? DEFAULT_PAGE_SIZE };
  for (const key of Object.keys(defaults)) {
    if (key === "limit" || key === "page") continue;
    next[`${prefix}${key}`] = state[key];
    flat[`${prefix}${key}`] = defaults[key];
  }
  next[`${prefix}page`] = state.page;
  next[`${prefix}limit`] = state.limit;
  return buildHash(path, next, flat);
}

/**
 * A list that loads one server page at a time.
 *   fetchPage({ ...filters, limit, offset }, signal) -> { items, total }
 *   renderItem(item, { query, state }) -> node
 *   toolbar({ state, set }) -> node, where set(patch) changes filters and returns to page 1.
 */
export function pagedList({ defaults = { limit: DEFAULT_PAGE_SIZE }, prefix = "", fetchPage, renderItem, toolbar = null, skeleton: makeSkeleton, empty, emptyFiltered = null, rowsClass = "", onData = null, env = realEnv(), label = "Results" } = {}) {
  const base = { limit: DEFAULT_PAGE_SIZE, ...defaults };
  let state = readListState(env.getHash(), base, prefix);
  let lastTotal = 0;
  const pagerSlot = h("div", { class: "ui-pager-slot" });
  const rows = h("div", { class: `ui-list-rows ${rowsClass}`.trim(), tabindex: "-1", "aria-label": label });

  const filtered = () => Object.keys(base).some((key) => key !== "limit" && key !== "page" && state[key] !== base[key] && state[key] !== "" && state[key] != null);

  const reg = region({
    skeleton: makeSkeleton,
    load: (signal) => fetchPage({ ...state, offset: (state.page - 1) * state.limit }, signal),
    isEmpty: (data) => !data || data.items.length === 0,
    empty: () => (filtered() && emptyFiltered ? emptyFiltered(state) : empty(state)),
    render: (data, { soft = false } = {}) => {
      lastTotal = data.total ?? data.items.length;
      enterList(rows, data.items.map((item) => renderItem(item, { query: state.q ?? "", state })), { animate: !soft });
      return rows;
    },
    onData: (data) => {
      const total = data.total ?? data.items.length;
      // A page past the end (rows were deleted, or the URL was edited): go to the last page.
      const maxPage = Math.max(1, Math.ceil(total / state.limit));
      if (state.page > maxPage && total > 0) { go({ page: maxPage }, { replace: true }); return; }
      // One page of results needs no pager, only the count, so a filter always says how many rows it found.
      swap(pagerSlot, total > Math.min(...PAGE_SIZES) || state.page > 1
        ? pager({ total, limit: state.limit, offset: (state.page - 1) * state.limit, onChange: ({ offset, limit }) => go({ limit, page: Math.floor(offset / limit) + 1 }), label: `${label} pages` })
        : total > 0 ? h("div", { class: "ui-meta ui-results-line", role: "status" }, `${total} ${total === 1 ? "result" : "results"}`) : null);
      onData?.(data, state);
    },
  });

  function go(patch, { replace = false, resetPage = false } = {}) {
    const previous = state;
    state = { ...state, ...patch };
    if (resetPage) state.page = 1;
    const hash = writeListState(env.getHash(), state, base, prefix);
    if (hash !== env.getHash()) (replace ? env.replace : env.push)(hash);
    reg.reload();
    if (previous.page !== state.page) {
      const top = el.getBoundingClientRect?.().top;
      if (top < 0) el.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }
  const set = (patch, options = {}) => go(patch, { resetPage: true, ...options });

  // A toolbar may return a node, or { node, sync(state) } so its controls follow Back and Forward.
  const bar = toolbar ? toolbar({ state, set }) : null;
  const barNode = bar && bar.node ? bar.node : bar;
  const el = h("div", { class: "ui-paged" }, barNode ? h("div", { class: "ui-paged-toolbar" }, barNode) : null, reg, pagerSlot);
  const stop = env.onPop(() => {
    const next = readListState(env.getHash(), base, prefix);
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; bar?.sync?.(state); reg.reload(); }
  });
  Object.assign(el, { reload: (options) => reg.reload(options), state: () => state, set, go, region: reg, dispose: stop });
  return el;
}
