// Keyboard shortcuts, the shortcut sheet and the command palette. One keydown handler for the page. It never
// reacts while the user types in a field, except for Ctrl+K and Esc, and it leaves the browser's own shortcuts alone.
import { t } from "./ui-i18n.js";
import { badge, icon, modal, spinner } from "./ui-components.js";
import { SUBVIEWS, TABS } from "./ui-core.js";
import { api, h, later, state, swap } from "./ui-dom.js";
import { buildHash, chordStep, isTypingTarget, rankCommands, trapTarget } from "./ui-pure.js";
import { openFactDetail, openMemoryDetail } from "./ui-detail.js";
import { searchHash } from "./ui-search.js";

export const SHORTCUTS = [
  { keys: ["Ctrl", "K"], alt: ["⌘", "K"], get what() { return t("keys.shortcut.palette"); } },
  { keys: ["/"], get what() { return t("keys.shortcut.focusSearch"); } },
  { keys: ["g", "w"], get what() { return t("keys.shortcut.goWork"); } },
  { keys: ["g", "m"], get what() { return t("keys.shortcut.goMemory"); } },
  { keys: ["g", "r"], get what() { return t("keys.shortcut.goRules"); } },
  { keys: ["g", "t"], get what() { return t("keys.shortcut.goTools"); } },
  { keys: ["["], get what() { return t("keys.shortcut.prevPage"); } },
  { keys: ["]"], get what() { return t("keys.shortcut.nextPage"); } },
  { keys: ["←", "→"], get what() { return t("keys.shortcut.arrows"); } },
  { keys: ["?"], get what() { return t("keys.shortcut.showList"); } },
  { keys: ["Esc"], get what() { return t("keys.shortcut.esc"); } },
];

export function openShortcuts() {
  const rows = SHORTCUTS.map((item) => h("tr", {},
    h("td", { class: "ui-keys-cell" }, ...item.keys.flatMap((key, index) => [index ? h("span", { class: "ui-meta" }, t("keys.then")) : null, h("kbd", {}, key)])),
    h("td", {}, item.what)));
  return modal({ title: t("keys.shortcutsTitle"), size: "md", body: h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": t("keys.shortcutsAria") }, h("tbody", {}, ...rows))), actions: [] });
}

/** Static commands: pages, the pages inside them, and a few actions. `ctx` supplies navigate, setTheme and refresh. */
export function staticCommands(ctx) {
  const items = [];
  for (const tab of TABS) {
    items.push({ id: `go-${tab.id}`, group: t("keys.groupGoTo"), label: t("keys.goTo", { page: tab.label }), hint: `g ${tab.key}`, keywords: tab.hint, icon: tab.icon, run: () => ctx.navigate(tab.hash) });
    for (const sub of SUBVIEWS[tab.id] ?? []) {
      if (sub.id === (SUBVIEWS[tab.id][0]?.id)) continue;
      items.push({ id: `go-${tab.id}-${sub.id}`, group: t("keys.groupGoTo"), label: t("keys.pageSub", { page: tab.label, sub: sub.label }), keywords: `${tab.id} ${sub.id}`, icon: tab.icon, run: () => ctx.navigate(buildHash([tab.id, sub.id])) });
    }
  }
  items.push(
    { id: "theme-auto", group: t("keys.groupActions"), label: t("keys.themeAuto"), keywords: t("keys.kwThemeAuto"), icon: "auto", run: () => ctx.setTheme("auto") },
    { id: "theme-dark", group: t("keys.groupActions"), label: t("keys.themeDark"), keywords: t("keys.kwThemeDark"), icon: "moon", run: () => ctx.setTheme("dark") },
    { id: "theme-light", group: t("keys.groupActions"), label: t("keys.themeLight"), keywords: t("keys.kwThemeLight"), icon: "sun", run: () => ctx.setTheme("light") },
    { id: "refresh", group: t("keys.groupActions"), label: t("keys.refresh"), keywords: t("keys.kwRefresh"), icon: "refresh", run: () => ctx.refresh?.() },
    { id: "shortcuts", group: t("keys.groupActions"), label: t("keys.showShortcuts"), hint: "?", keywords: t("keys.kwShortcuts"), icon: "keyboard", run: () => openShortcuts() },
  );
  return items;
}

/**
 * The palette. Static commands filter as you type. From two characters on it also searches memory and sessions on the
 * server (debounced). Up and Down move, Enter runs, Esc closes. The input and list follow the combobox pattern.
 */
export function openPalette(ctx) {
  const input = h("input", { type: "text", class: "ui-input ui-palette-input", placeholder: t("keys.placeholder"), role: "combobox", "aria-expanded": "true", "aria-controls": "ui-palette-list", "aria-autocomplete": "list", "aria-label": t("keys.paletteTitle"), autocomplete: "off", spellcheck: "false" });
  const list = h("div", { id: "ui-palette-list", class: "ui-palette-list", role: "listbox", "aria-label": t("keys.commandsAria") });
  const body = h("div", { class: "ui-palette" }, input, list);
  const statics = staticCommands(ctx);
  let dynamic = [];
  let loading = false;
  let rows = [];
  let active = 0;
  let timer = null;
  let seq = 0;
  let layer = null;

  const run = (command) => { clearTimeout(timer); layer.close(null); later(() => command.run(), 0); };
  const paint = () => {
    rows.forEach((row, index) => { row.el.classList.toggle("is-active", index === active); row.el.setAttribute("aria-selected", String(index === active)); });
    if (rows[active]) input.setAttribute("aria-activedescendant", rows[active].el.getAttribute("id")); else input.removeAttribute("aria-activedescendant");
    rows[active]?.el.scrollIntoView?.({ block: "nearest" });
  };
  const render = () => {
    const query = input.value.trim();
    const matches = rankCommands(statics, query).slice(0, 12);
    const searchRow = query.length >= 2 ? [{ id: "search", group: t("keys.groupSearch"), label: t("keys.searchFor", { query }), icon: "search", run: () => ctx.navigate(searchHash(query)) }] : [];
    // Commands that match the words come first; with no command match the search row leads.
    const all = [...matches.slice(0, 6), ...searchRow, ...dynamic, ...matches.slice(6)];
    rows = all.map((command, index) => {
      const el = h("div", { class: "ui-palette-item", role: "option", id: `ui-pal-${index}`, "aria-selected": "false" },
        icon(command.icon ?? "chevron-right", { size: 16 }),
        h("span", { class: "ui-palette-label", dir: "auto" }, command.label),
        command.badge ? badge(command.badge) : null,
        command.hint ? h("kbd", {}, command.hint) : null);
      el.addEventListener("mousedown", (event) => { event.preventDefault(); run(command); });
      el.addEventListener("mousemove", () => { active = index; paint(); });
      return { el, command };
    });
    active = Math.min(active, Math.max(0, rows.length - 1));
    const groups = [];
    let last = null;
    rows.forEach((row) => {
      if (row.command.group !== last) { last = row.command.group; groups.push(h("div", { class: "ui-palette-group", role: "presentation" }, last)); }
      groups.push(row.el);
    });
    swap(list, rows.length ? groups : h("div", { class: "ui-search-status" }, h("span", {}, t("keys.noMatch"))), loading ? h("div", { class: "ui-search-status" }, spinner(), h("span", {}, t("keys.searchingMemory"))) : null);
    paint();
  };

  async function fetchDynamic(query) {
    const mine = (seq += 1);
    loading = true;
    render();
    try {
      const [found, sessions] = await Promise.all([
        query.length >= 2 ? api("/v1/search", { method: "POST", body: { query, project: state.project || undefined, limit: 6, offset: 0, paged: true, mix: true } }) : Promise.resolve({ facts: [], results: [] }),
        api(`/v1/work/sessions?limit=5${query ? `&q=${encodeURIComponent(query)}` : ""}${state.project ? `&project=${encodeURIComponent(state.project)}` : ""}`),
      ]);
      if (mine !== seq) return;
      dynamic = [
        ...found.facts.map((fact) => ({ id: `fact-${fact.id}`, group: t("keys.groupMemory"), label: fact.title ?? fact.text, icon: "bolt", badge: t("keys.factBadge"), run: () => openFactDetail(fact) })),
        ...found.results.map((memory) => ({ id: `mem-${memory.id}`, group: t("keys.groupMemory"), label: memory.title || t("keys.untitled"), icon: "layers", badge: memory.kind, run: () => openMemoryDetail({ id: memory.id, title: memory.title }) })),
        ...sessions.items.map((session) => ({ id: `ses-${session.id}`, group: t("keys.groupSessions"), label: session.lastPrompt ? `${session.lastPrompt.slice(0, 80)}` : t("keys.session", { id: session.id }), icon: "clock", badge: session.project, run: () => ctx.navigate(session.href) })),
      ];
    } catch {
      if (mine === seq) dynamic = [];
    } finally {
      if (mine === seq) { loading = false; render(); }
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    active = 0;
    render();
    timer = later(() => fetchDynamic(input.value.trim()), 200);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!rows.length) return;
      active = event.key === "ArrowDown" ? (active + 1) % rows.length : (active - 1 + rows.length) % rows.length;
      paint();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[active]) run(rows[active].command);
    }
  });
  layer = modal({ title: t("keys.paletteTitle"), body, size: "lg", actions: [], initialFocus: () => input });
  layer.el.classList.add("ui-palette-panel");
  render();
  fetchDynamic("");
  return layer;
}

/**
 * Install the page-wide shortcuts. Returns a function that removes them. `ctx` supplies navigate(hash),
 * focusSearch(), openPalette() and a way to find the visible pager.
 */
export function installKeys(ctx, doc = globalThis.document) {
  let pending = 0;
  const handler = (event) => {
    if (event.defaultPrevented) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && String(event.key).toLowerCase() === "k") { event.preventDefault(); ctx.openPalette(); return; }
    if (mod || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (doc.querySelector?.(".ui-overlay")) return;
    const key = event.key;
    if (key === "/") { event.preventDefault(); ctx.focusSearch(); return; }
    if (key === "?") { event.preventDefault(); openShortcuts(); return; }
    if (key === "[" || key === "]") {
      const page = [...doc.querySelectorAll(".ui-page")].find((section) => !section.hidden) ?? doc;
      const button = page.querySelector(`.ui-pager-${key === "[" ? "prev" : "next"}`);
      if (button && !button.disabled) { event.preventDefault(); button.click(); }
      return;
    }
    const step = chordStep(pending, key, Date.now());
    pending = step.pending;
    if (step.letter) {
      const tab = TABS.find((item) => item.key === step.letter);
      if (tab) { event.preventDefault(); ctx.navigate(tab.hash); }
    }
  };
  doc.addEventListener("keydown", handler);
  return () => doc.removeEventListener("keydown", handler);
}
