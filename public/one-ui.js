// The one UI shell: one page at /, hash routes, a shared header (brand, tabs with a sliding
// indicator, project, search, theme), a status bar, shortcuts and the command palette. Each tab is a module in
// ./tabs/ loaded on first visit, so the shell stays small. Nothing here builds markup from strings.
import { SUBVIEWS, TABS, isDemo, parseRoute, routeOf } from "./ui-core.js";
import { brainMark } from "./ui-brand.js";
import { banner, errorState, segmented, startClock, tabs, toast } from "./ui-components.js";
import { byId, h, state, swap } from "./ui-dom.js";
import { installKeys, openPalette, openShortcuts } from "./ui-keys.js";
import { enter, watchVisibility } from "./ui-motion.js";
import { parseHash } from "./ui-pure.js";
import { realProjects } from "./ui-home-model.js";
import { mountSearch } from "./ui-search.js";
import { mountStatus } from "./ui-status.js";
import { applyTheme, readTheme } from "./ui-theme.js";

const RENDERERS = { home: "renderHome", work: "renderWork", memory: "renderMemory", rules: "renderRules", tools: "renderTools" };
const LABEL = Object.fromEntries(TABS.map((tab) => [tab.id, tab.label]));
const PROJECT_KEY = "aletheia.project";

let nav = null;
let current = null;
let search = null;
let statusApi = null;

const navigate = (hash) => { globalThis.location.hash = hash; };
const announce = (text) => { const el = byId("ui-announcer"); if (el) el.textContent = text; };

function storedProject() {
  try { return globalThis.localStorage.getItem(PROJECT_KEY) ?? ""; } catch { return ""; }
}
function storeProject(value) {
  try { if (value) globalThis.localStorage.setItem(PROJECT_KEY, value); else globalThis.localStorage.removeItem(PROJECT_KEY); } catch { /* storage blocked */ }
}

async function loadProjects() {
  try {
    const data = await fetch("/api/hub/projects").then((response) => response.json());
    const select = byId("ui-project");
    const names = data.projects.map((project) => project.name);
    if (state.project && !names.includes(state.project)) state.project = "";
    // Worktree, temp and tiny folders are not projects a person works in; the Home page lists them under "other folders".
    const { main } = realProjects(data.projects, { selected: state.project });
    swap(select,
      h("option", { value: "" }, "All projects"),
      ...main.map((project) => h("option", { value: project.name, selected: state.project === project.name }, `${project.name} (${project.memories})`)));
    select.value = state.project;
  } catch {
    // the status bar already reports an unreachable server
  }
}

async function tabRenderer(id) {
  if (!RENDERERS[id]) return null;
  try {
    const module = await import(`./tabs/${id}.js`);
    return module[RENDERERS[id]] ?? null;
  } catch (error) {
    return () => {
      const root = byId(`ui-${id}`);
      if (root) swap(root, errorState({ title: "Could not load this tab", error, onRetry: () => { current = null; return showRoute(); } }));
    };
  }
}

/** Keep the search box in step with the results page it opened. */
function syncSearchField(route) {
  const input = byId("ui-search");
  if (!input || globalThis.document.activeElement === input) return;
  input.value = route.tab === "memory" && route.sub === "search" ? route.params.q ?? "" : "";
}

async function showRoute() {
  const route = routeOf(globalThis.location.hash);
  // Only the page or the tab changing rebuilds a view. A page number or a filter in the hash is the list's own business.
  if (current && current.key === route.key) { current = route; syncSearchField(route); return; }
  const changedTab = !current || current.tab !== route.tab;
  current = route;
  nav.setActive(route.tab);
  for (const tab of TABS) byId(`tab-${tab.id}`).hidden = tab.id !== route.tab;
  const section = byId(`tab-${route.tab}`);
  if (changedTab) enter(section, "rise");
  const page = SUBVIEWS[route.tab]?.find((item) => item.id === route.sub);
  document.title = `${page && route.tab !== "work" && page.label !== LABEL[route.tab] ? `${page.label} · ` : ""}${LABEL[route.tab]} · Aletheia`;
  announce(`${LABEL[route.tab]}${page ? `, ${page.label}` : ""}`);
  syncSearchField(route);
  const render = await tabRenderer(route.tab);
  if (!render) return;
  try {
    await render(route);
    state.loaded[route.tab] = true;
  } catch (error) {
    const root = byId(`ui-${route.tab}`);
    if (root) swap(root, errorState({ title: "Could not load this tab", error, onRetry: () => { current = null; return showRoute(); } }));
  }
}

/** The project or another global filter changed: rebuild the visible tab from the top. */
function reloadView() {
  state.loaded = {};
  // A page number from the old filter would point past the end of the new one.
  const { path, params } = parseHash(globalThis.location.hash);
  const kept = Object.entries(params).filter(([key]) => !/page$/.test(key));
  if (kept.length !== Object.keys(params).length) {
    const query = new URLSearchParams(kept).toString();
    globalThis.history.replaceState(null, "", `#/${path.map(encodeURIComponent).join("/")}${query ? `?${query}` : ""}`);
  }
  current = null;
  return showRoute();
}

function mountTheme() {
  const pref = readTheme();
  const control = segmented({
    label: "Theme",
    value: pref,
    options: [
      { value: "auto", label: "Auto", icon: "auto", iconOnly: true, title: "Follow the system theme" },
      { value: "dark", label: "Dark", icon: "moon", iconOnly: true, title: "Dark theme" },
      { value: "light", label: "Light", icon: "sun", iconOnly: true, title: "Light theme" },
    ],
    onChange: (value) => { applyTheme(value); },
  });
  control.classList.add("ui-theme-switch");
  swap(byId("ui-theme"), control);
  return control;
}

function boot() {
  watchVisibility();
  startClock();
  // ?demo=1 labels the page: every row on it was made up by scripts/seed-demo.mjs.
  if (isDemo(globalThis.location.search)) {
    const slot = byId("ui-banner-slot");
    if (slot) slot.append(banner({ tone: "info", text: "Demo mode. The data on this page is made up by scripts/seed-demo.mjs. None of it came from a real tool." }));
    document.documentElement.setAttribute("data-demo", "1");
  }
  state.project = storedProject();
  swap(byId("ui-brand-mark"), brainMark({ size: 30 }));

  nav = tabs({ label: "Sections", active: routeOf(globalThis.location.hash).tab, className: "ui-nav-tabs", items: TABS.map((tab) => ({ id: tab.id, label: tab.label, href: tab.hash, icon: tab.icon })) });
  swap(byId("ui-tabs"), nav);
  const themeControl = mountTheme();

  statusApi = mountStatus({ el: byId("ui-status"), healthEl: byId("ui-health"), announce });
  loadProjects();
  byId("ui-project").addEventListener("change", (event) => {
    state.project = event.target.value;
    storeProject(state.project);
    statusApi?.setProject();
    reloadView();
  });

  search = mountSearch({ input: byId("ui-search"), form: byId("ui-search-form"), list: byId("ui-search-list"), navigate });

  const ctx = {
    navigate,
    focusSearch: () => search.focus(),
    openPalette: () => openPalette(ctx),
    setTheme: (value) => { applyTheme(value); themeControl.set(value); toast(`Theme: ${value === "auto" ? "follow the system" : value}`, { duration: 1800 }); },
    refresh: () => statusApi?.refresh?.(),
  };
  installKeys(ctx);
  globalThis.addEventListener("hashchange", showRoute);
  globalThis.addEventListener("resize", () => nav.refreshIndicator());
  showRoute();
  // Fonts are system fonts, so the indicator can be placed right away; place it again once layout settles.
  requestAnimationFrame(() => nav.refreshIndicator());
}

export { parseRoute, openShortcuts };
if (typeof document !== "undefined") boot();
