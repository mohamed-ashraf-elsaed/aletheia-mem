// Shared pieces of the Memory, Review and Rules tabs: filter controls, and the cards for a memory, a fact
// and a dismissed item. Cards change the screen first and roll back if the request fails (see ui-actions.js).
// Text from the API is only ever set as text, or through the safe Markdown view.
import { badge, button, chipFilters, clampText, field, highlight, iconButton, modal, mono, promptDialog, segmented, statusDot, timeEl, toast } from "./ui-components.js";
import { collapse, expand } from "./ui-motion.js";
import { factView, formatWhen } from "./ui-core.js";
import { api, h, later, swap } from "./ui-dom.js";
import { optimistic } from "./ui-actions.js";
import { relativeTime } from "./ui-pure.js";
import { t } from "./ui-i18n.js";

export const KIND_OPTIONS = [
  { value: "", get label() { return t("rules.kindAll"); } },
  { value: "observation", get label() { return t("rules.kindObservations"); } },
  { value: "note", get label() { return t("rules.kindNotes"); } },
  { value: "prompt", get label() { return t("rules.kindPrompts"); } },
  { value: "event", get label() { return t("rules.kindEvents"); } },
  { value: "summary", get label() { return t("rules.kindSummaries"); } },
];
export const TYPE_OPTIONS = ["bugfix", "feature", "refactor", "change", "discovery", "decision", "gotcha", "note", "event"];

// ---- filter controls -------------------------------------------------------------------------------------
// Each control is a node with sync(state), so it follows Back and Forward. filterBar() collects them for pagedList.

/** A search box that tells the list after the user stops typing. The URL is replaced, not pushed, while typing. */
export function textFilter({ key = "q", value = "", label, placeholder = "", onChange, delay = 300 }) {
  const input = h("input", { type: "search", class: "ui-input ui-filter-text", value, placeholder, "aria-label": label, dir: "auto", autocomplete: "off" });
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = later(() => onChange(input.value.trim()), delay);
  });
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { clearTimeout(timer); onChange(input.value.trim()); } });
  const wrap = h("div", { class: "ui-filter ui-filter-grow" }, h("label", { class: "ui-sr" }, label), input);
  wrap.sync = (state) => { if (globalThis.document?.activeElement !== input) input.value = state[key] ?? ""; };
  return wrap;
}

/** A labelled select. `options` are strings or { value, label }. */
export function selectFilter({ key, label, value = "", options, onChange, allLabel = null }) {
  const list = (allLabel ? [{ value: "", label: allLabel }] : []).concat(options.map((option) => (typeof option === "string" ? { value: option, label: option } : option)));
  const select = h("select", { class: "ui-select", "aria-label": label, onchange: (event) => onChange(event.target.value) }, ...list.map((option) => h("option", { value: option.value, selected: option.value === value }, option.label)));
  const wrap = h("div", { class: "ui-filter" }, h("span", { class: "ui-filter-label" }, label), select);
  wrap.sync = (state) => { select.value = state[key] ?? ""; };
  return wrap;
}

/** From and To dates. The server reads a bare end date as the end of that day. */
export function dateRange({ since = "", until = "", onChange }) {
  const from = h("input", { type: "date", class: "ui-input ui-date", value: since, "aria-label": t("rules.fromDate") });
  const to = h("input", { type: "date", class: "ui-input ui-date", value: until, "aria-label": t("rules.toDate") });
  const fire = () => onChange({ since: from.value, until: to.value });
  from.addEventListener("change", fire);
  to.addEventListener("change", fire);
  const wrap = h("div", { class: "ui-filter ui-daterange" }, h("span", { class: "ui-filter-label" }, t("rules.dates")), from, h("span", { class: "ui-meta" }, t("rules.dateTo")), to);
  wrap.sync = (state) => { from.value = state.since ?? ""; to.value = state.until ?? ""; };
  return wrap;
}

/** Chips for one key. Single choice; the first option is usually "All" with value "". */
export function chipFilter({ key, label, options, value = "", onChange }) {
  const group = chipFilters({ options, value, label, onChange });
  const wrap = h("div", { class: "ui-filter ui-filter-chips" }, h("span", { class: "ui-filter-label" }, label), group);
  wrap.sync = (state) => group.set(state[key] ?? "");
  return wrap;
}

/** A segmented control bound to one key. */
export function segmentFilter({ key, label, options, value, onChange }) {
  const group = segmented({ options, value, label, onChange });
  const wrap = h("div", { class: "ui-filter" }, h("span", { class: "ui-filter-label" }, label), group);
  wrap.sync = (state) => group.set(state[key] ?? options[0].value);
  return wrap;
}

/** Lay controls out in rows and give pagedList one sync that updates them all. rows: arrays of controls. */
export function filterBar(rows) {
  const node = h("div", { class: "ui-filterbar" }, ...rows.map((row) => h("div", { class: "ui-filterrow" }, ...row.filter(Boolean))));
  const controls = rows.flat().filter(Boolean);
  return { node, sync: (state) => controls.forEach((control) => control.sync?.(state)) };
}

export const filtersActive = (state, keys) => keys.some((key) => state[key] !== "" && state[key] != null && state[key] !== false && state[key] !== "default");

// ---- cards -----------------------------------------------------------------------------------------------

const isFocusable = (el) => {
  const tag = String(el.tagName ?? "").toLowerCase();
  if (tag === "a") return el.getAttribute?.("href") != null;
  return ["button", "input", "select", "textarea"].includes(tag) && el.getAttribute?.("disabled") == null;
};
function firstFocusable(el) {
  for (const kid of el.children ?? []) {
    if (kid.hidden) continue;
    if (isFocusable(kid)) return kid;
    const deeper = firstFocusable(kid);
    if (deeper) return deeper;
  }
  return null;
}

/** A keyboard user who just used a button on a card must not land on the page top when that card goes away. */
function moveFocusOut(card) {
  const active = globalThis.document?.activeElement;
  let inside = false;
  for (let node = active; node; node = node.parentNode) if (node === card) { inside = true; break; }
  if (!inside) return;
  const siblings = [...(card.parentNode?.children ?? [])];
  const at = siblings.indexOf(card);
  const live = (el) => !el.hidden && firstFocusable(el);
  const neighbour = siblings.slice(at + 1).find(live) ?? siblings.slice(0, at).reverse().find(live);
  (neighbour ? firstFocusable(neighbour) : globalThis.document.querySelector?.(".ui-main"))?.focus?.();
}

/** Remove a card from the screen with a short collapse; returns a function that brings it back. */
export function hideCard(card) {
  moveFocusOut(card);
  card.classList.add("is-leaving");
  const done = collapse(card);
  return () => done.then(() => { card.hidden = false; card.classList.remove("is-leaving"); return expand(card); });
}

const projectBadge = (name) => h("span", { class: "ui-meta-item" }, name);

/**
 * One memory. ctx: { query, onChanged() (reload the list and the counts), onOpen(memory) }.
 * Pin and Dismiss are optimistic with an Undo toast; Edit opens a dialog.
 */
export function memoryCard(memory, ctx = {}) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "memory", "data-id": memory.id });
  const render = () => {
    const pinBadge = memory.pinned ? badge(t("rules.pinned"), "success") : null;
    const files = Array.isArray(memory.files) ? memory.files.slice(0, 6) : [];
    swap(card,
      h("div", { class: "ui-item-head" },
        h("h3", { class: "ui-item-title", dir: "auto" }, ctx.query ? highlight(memory.title || t("rules.untitled"), ctx.query) : memory.title || t("rules.untitled")),
        h("div", { class: "ui-row" }, badge(memory.kind), memory.type && memory.type !== memory.kind ? badge(memory.type) : null, pinBadge)),
      h("div", { class: "ui-meta" }, projectBadge(memory.project), projectBadge(memory.tool), timeEl(memory.created_at_epoch), mono(`#${memory.id}`, { label: t("rules.copyId") })),
      memory.narrative ? clampText({ text: memory.narrative, markdown: true, lines: 3, query: ctx.query }) : null,
      files.length ? h("div", { class: "ui-meta ui-item-files" }, h("span", {}, t("rules.files")), ...files.map((file) => mono(String(file), { copy: false })), memory.files.length > files.length ? h("span", {}, t("rules.moreFiles", { count: memory.files.length - files.length })) : null) : null,
      h("div", { class: "ui-acts" },
        button({ label: t("rules.open"), size: "sm", icon: "external", onClick: () => ctx.onOpen?.(memory) }),
        button({ label: memory.pinned ? t("rules.unpin") : t("rules.pin"), size: "sm", icon: "pin", pressed: memory.pinned, onClick: () => togglePin() }),
        button({ label: t("rules.edit"), size: "sm", icon: "edit", onClick: () => edit() }),
        button({ label: t("rules.dismiss"), size: "sm", icon: "eye-off", onClick: () => dismiss() })));
    card.querySelector(".ui-clamp")?.measure?.();
  };
  const togglePin = () => {
    const next = !memory.pinned;
    return optimistic({
      apply: () => { memory.pinned = next; render(); },
      rollback: () => { memory.pinned = !next; render(); },
      request: () => api(`/api/hub/memories/${memory.id}`, { method: "PATCH", body: { pinned: next } }),
      done: next ? t("rules.pinnedToast") : t("rules.unpinnedToast"),
      undo: () => api(`/api/hub/memories/${memory.id}`, { method: "PATCH", body: { pinned: !next } }),
      reapply: () => { memory.pinned = !next; render(); },
      failure: t("rules.pinFailed"),
    });
  };
  const dismiss = () => {
    let restore = () => {};
    return optimistic({
      apply: () => { restore = hideCard(card); },
      rollback: () => restore(),
      request: () => api("/api/hub/dismiss", { method: "POST", body: { type: "memory", id: memory.id } }),
      done: t("rules.memoryHidden"),
      undo: () => api("/api/hub/restore", { method: "POST", body: { type: "memory", id: memory.id } }),
      reapply: () => { restore(); ctx.onChanged?.(); },
      failure: t("rules.memoryHideFailed"),
    }).then((ok) => { if (ok) ctx.onChanged?.({ soft: true }); return ok; });
  };
  const edit = () => {
    const title = h("input", { type: "text", class: "ui-input", value: memory.title ?? "", dir: "auto", "aria-label": t("rules.title") });
    const text = h("textarea", { class: "ui-input", dir: "auto", "aria-label": t("rules.text"), rows: "8" });
    text.value = memory.narrative ?? "";
    const type = h("select", { class: "ui-select", "aria-label": t("rules.type") }, ...TYPE_OPTIONS.map((value) => h("option", { value, selected: memory.type === value }, value)));
    const project = h("input", { type: "text", class: "ui-input", value: memory.project ?? "", "aria-label": t("rules.project") });
    const layer = modal({
      title: t("rules.editMemory"),
      size: "md",
      body: h("div", {}, field({ label: t("rules.title"), control: title }), field({ label: t("rules.textMarkdown"), control: text }), h("div", { class: "ui-inline" }, field({ label: t("rules.type"), control: type }), field({ label: t("rules.project"), control: project }))),
      actions: [
        button({ label: t("rules.cancel"), onClick: () => layer.close(false) }),
        button({ label: t("rules.save"), variant: "primary", onClick: async () => {
          const saved = await api(`/api/hub/memories/${memory.id}`, { method: "PATCH", body: { title: title.value, narrative: text.value, type: type.value, project: project.value } });
          Object.assign(memory, saved);
          render();
          toast(t("rules.saved"), { tone: "success", duration: 1800 });
          layer.close(true);
        } }),
      ],
    });
  };
  render();
  return card;
}

/** One fact. ctx: { query, onChanged(), onOpen(fact) }. status "dismissed" shows Restore instead of Dismiss. */
export function factCard(fact, ctx = {}) {
  const view = factView(fact);
  const dismissed = ctx.dismissed === true;
  const card = h("article", { class: "ui-card ui-item", "data-kind": "fact", "data-id": view.id });
  const tone = view.status === "active" ? "success" : "warning";
  swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title ui-fact-text", dir: "auto" }, ctx.query ? highlight(view.text, ctx.query) : view.text),
      h("div", { class: "ui-row" }, badge(view.status, tone), badge(t("rules.scopeBadge", { scope: view.scope })), badge(t("rules.extractorBadge", { mode: view.extractorMode })))),
    h("div", { class: "ui-meta" }, projectBadge(view.project), h("span", {}, t("rules.importance", { label: view.importanceLabel })), h("span", {}, t("rules.validFrom")), timeEl(fact.validAt ?? fact.validFrom ?? fact.recordedAt), mono(`#${view.id}`, { label: t("rules.copyId") })),
    view.sourceText ? clampText({ text: view.sourceText, lines: 2, mono: true, query: ctx.query }) : h("div", { class: "ui-meta" }, t("rules.noSourceEpisode")),
    h("div", { class: "ui-acts" },
      button({ label: t("rules.open"), size: "sm", icon: "external", onClick: () => ctx.onOpen?.(fact) }),
      dismissed
        ? button({ label: t("rules.restore"), size: "sm", icon: "undo", onClick: () => restore() })
        : button({ label: t("rules.dismiss"), size: "sm", icon: "eye-off", onClick: () => dismiss() })));
  card.querySelector(".ui-clamp")?.measure?.();
  function dismiss() {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: () => api("/api/hub/dismiss", { method: "POST", body: { type: "fact", id: view.id } }),
      done: t("rules.factHidden"),
      undo: () => api("/api/hub/restore", { method: "POST", body: { type: "fact", id: view.id } }),
      reapply: () => { back(); ctx.onChanged?.(); },
      failure: t("rules.factHideFailed"),
    }).then((ok) => { if (ok) ctx.onChanged?.({ soft: true }); return ok; });
  }
  function restore() {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: () => api("/api/hub/restore", { method: "POST", body: { type: "fact", id: view.id } }),
      done: t("rules.factRestored"),
      undo: () => api("/api/hub/dismiss", { method: "POST", body: { type: "fact", id: view.id } }),
      reapply: () => { back(); ctx.onChanged?.(); },
      failure: t("rules.factRestoreFailed"),
    }).then((ok) => { if (ok) ctx.onChanged?.({ soft: true }); return ok; });
  }
  return card;
}

const TYPE_LABEL = {
  get memory() { return t("rules.typeMemory"); },
  get fact() { return t("rules.typeFact"); },
  get observation() { return t("rules.typeObservation"); },
  get episode() { return t("rules.typeEpisode"); },
};

/** One dismissed row, with what was hidden (when the server could look it up) and a Restore button. */
export function dismissedCard(item, ctx = {}) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": item.item_type, "data-id": item.item_id });
  swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, item.label || `${TYPE_LABEL[item.item_type] ?? item.item_type} #${item.item_id}`),
      h("div", { class: "ui-row" }, badge(TYPE_LABEL[item.item_type] ?? item.item_type), item.project ? badge(item.project) : null)),
    h("div", { class: "ui-meta" }, h("span", {}, t("rules.hidden")), timeEl(item.at_epoch), item.reason ? h("span", {}, t("rules.reason", { reason: item.reason })) : null, mono(`${item.item_type}:${item.item_id}`, { label: t("rules.copyId") })),
    h("div", { class: "ui-acts" }, button({ label: t("rules.restore"), size: "sm", icon: "undo", onClick: () => {
      let back = () => {};
      return optimistic({
        apply: () => { back = hideCard(card); },
        rollback: () => back(),
        request: () => api("/api/hub/restore", { method: "POST", body: { type: item.item_type, id: item.item_id } }),
        done: t("rules.itemRestored"),
        undo: () => api("/api/hub/dismiss", { method: "POST", body: { type: item.item_type, id: item.item_id, reason: item.reason ?? undefined } }),
        reapply: () => { back(); ctx.onChanged?.(); },
        failure: t("rules.itemRestoreFailed"),
      }).then((ok) => { if (ok) ctx.onChanged?.({ soft: true }); return ok; });
    } })));
  return card;
}

/** A small note about what a filter result means, used above a list: "12 of 312". */
export const resultsLine = (shown, total, noun) => h("div", { class: "ui-meta ui-results-line", role: "status" }, total === 0 ? t("rules.noneOf", { noun }) : t("rules.shownOf", { shown, total, noun }));

export { relativeTime, formatWhen, promptDialog, iconButton, statusDot };
