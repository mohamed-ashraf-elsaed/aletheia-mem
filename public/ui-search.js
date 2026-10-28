// The header search: type to see the best matches, Enter for the full results page. Requests are debounced
// and the older one is dropped when a newer one starts. Arrow keys move through the list; Esc closes it.
import { highlight, icon, spinner } from "./ui-components.js";
import { api, h, later, state, swap } from "./ui-dom.js";
import { buildHash } from "./ui-pure.js";
import { openFactDetail, openMemoryDetail } from "./ui-detail.js";

export const SEARCH_DEBOUNCE_MS = 220;
export const MIN_CHARS = 2;

export const searchHash = (query) => buildHash(["memory", "search"], { q: query });

export function mountSearch({ input, form, list, navigate = (hash) => { globalThis.location.hash = hash; } }) {
  let timer = null;
  let controller = null;
  let items = [];
  let active = -1;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const open = () => { list.hidden = false; input.setAttribute("aria-expanded", "true"); };
  const paint = () => {
    items.forEach((item, index) => { item.el.classList.toggle("is-active", index === active); item.el.setAttribute("aria-selected", String(index === active)); });
    if (active >= 0) input.setAttribute("aria-activedescendant", items[active].el.getAttribute("id")); else input.removeAttribute("aria-activedescendant");
    items[active]?.el.scrollIntoView?.({ block: "nearest" });
  };

  const choose = (item) => {
    close();
    if (item.kind === "all") navigate(searchHash(input.value.trim()));
    else if (item.kind === "fact") openFactDetail(item.data);
    else openMemoryDetail({ id: item.data.id, title: item.data.title });
  };

  const row = (id, kind, data, content) => {
    const el = h("div", { class: "ui-search-item", role: "option", id, "aria-selected": "false" }, ...content);
    el.addEventListener("mousedown", (event) => { event.preventDefault(); choose({ kind, data, el }); });
    return { kind, data, el };
  };

  async function run(query) {
    controller?.abort?.();
    controller = typeof AbortController === "function" ? new AbortController() : null;
    const mine = (seq += 1);
    open();
    swap(list, h("div", { class: "ui-search-status" }, spinner(), h("span", {}, "Searching…")));
    try {
      const data = await api("/v1/search", { method: "POST", body: { query, project: state.project || undefined, limit: 8, offset: 0, paged: true, mix: true } });
      if (mine !== seq) return;
      const rows = [];
      data.facts.forEach((fact, index) => rows.push(row(`ui-sr-f${index}`, "fact", fact, [icon("bolt", { size: 14 }), h("span", { class: "ui-search-text" }, highlight(fact.title ?? fact.text, query)), h("span", { class: "ui-chip" }, "fact")])));
      data.results.forEach((memory, index) => rows.push(row(`ui-sr-m${index}`, "memory", memory, [icon("layers", { size: 14 }), h("span", { class: "ui-search-text" }, highlight(memory.title || "(untitled)", query)), h("span", { class: "ui-chip" }, memory.kind ?? "memory")])));
      if (!rows.length) {
        items = [];
        swap(list, h("div", { class: "ui-search-status" }, h("span", {}, "No match. Try fewer or different words.")));
        return;
      }
      const all = row("ui-sr-all", "all", null, [icon("search", { size: 14 }), h("span", { class: "ui-search-text" }, `See all ${data.total}${data.capped ? "+" : ""} results`)]);
      items = [...rows, all];
      active = -1;
      swap(list, ...items.map((item) => item.el));
    } catch (error) {
      if (mine !== seq || error?.name === "AbortError") return;
      items = [];
      swap(list, h("div", { class: "ui-search-status is-error" }, h("span", {}, `Search failed: ${error.message}`)));
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < MIN_CHARS) { seq += 1; controller?.abort?.(); close(); return; }
    timer = later(() => run(query), SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); } else input.blur?.(); return; }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length && !list.hidden) {
      event.preventDefault();
      active = event.key === "ArrowDown" ? (active + 1) % items.length : (active - 1 + items.length) % items.length;
      paint();
    }
  });
  input.addEventListener("blur", () => later(close, 120));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    clearTimeout(timer);
    if (active >= 0 && items[active]) return choose(items[active]);
    close();
    if (query) navigate(searchHash(query));
  });
  return { close, run, focus: () => { input.focus(); input.select?.(); } };
}
