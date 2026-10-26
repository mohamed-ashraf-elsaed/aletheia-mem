// The one UI shell (T-134): one page at /, four hash routes, a shared header (project, memory search, health)
// and the tab bar. The Work tab is Aletheia's own view (T-143); the other tabs are loaded on first visit from
// ./tabs/ so the shell stays small. The legacy viewer is an optional page, not the default Work tab.
import { TABS, healthView, parseRoute, routeHash } from "./ui-core.js";
import { byId, h, state, swap } from "./ui-dom.js";

const RENDERERS = { work: "renderWork", memory: "renderMemory", rules: "renderRules", tools: "renderTools" };
const LABEL = Object.fromEntries(TABS.map((tab) => [tab.id, tab.label]));

function renderTabs(active) {
  swap(byId("ui-tabs"), ...TABS.map((tab) =>
    h("a", {
      href: routeHash(tab.id),
      class: `ui-tab-link${tab.id === active ? " on" : ""}`,
      role: "tab",
      "aria-selected": String(tab.id === active),
      "data-tab": tab.id,
    }, tab.label)));
}

function updateHealth() {
  const view = healthView(state.health);
  const el = byId("ui-health");
  el.className = `ui-health ${view.state}`;
  el.textContent = view.dot;
  el.title = view.title ?? view.label;
  el.setAttribute("aria-label", view.label);
}

async function loadHealth() {
  try {
    const response = await fetch("/v1/health", { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    state.health = response.ok && data.status === "ok" ? "ok" : "down";
    state.healthLabel = data.db?.detail ? `${data.status}: ${data.db.detail}` : "";
  } catch {
    state.health = "down";
    state.healthLabel = "not reachable";
  }
  updateHealth();
}

async function loadProjects() {
  try {
    const data = await fetch("/api/hub/projects").then((response) => response.json());
    const select = byId("ui-project");
    swap(select,
      h("option", { value: "" }, "All projects"),
      ...data.projects.map((project) => h("option", { value: project.name, selected: state.project === project.name }, `${project.name} (${project.memories})`)));
    select.value = state.project;
  } catch {
    // the Health dot already reports a down server
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
      if (root) swap(root, h("div", { class: "ui-card ui-meta" }, `Could not load this tab: ${error.message}`));
    };
  }
}

async function showRoute() {
  const active = parseRoute(location.hash);
  for (const tab of TABS) byId(`tab-${tab.id}`).hidden = tab.id !== active;
  renderTabs(active);
  document.title = `${LABEL[active]} · Aletheia`;
  const render = await tabRenderer(active);
  if (!render) return;
  try {
    await render();
    state.loaded[active] = true;
  } catch (error) {
    const root = byId(`ui-${active}`);
    if (root) swap(root, h("div", { class: "ui-empty" }, `Could not load: ${error.message}`));
  }
}

function markStale() {
  state.loaded = {};
}

function boot() {
  renderTabs(parseRoute(location.hash));
  updateHealth();
  loadHealth();
  loadProjects();
  byId("ui-project").addEventListener("change", (event) => {
    state.project = event.target.value;
    markStale();
    showRoute();
  });
  byId("ui-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = byId("ui-search").value.trim();
    markStale();
    if (parseRoute(location.hash) !== "memory") location.hash = "#/memory";
    else showRoute();
  });
  window.addEventListener("hashchange", () => {
    if (parseRoute(location.hash) !== "memory") state.query = "";
    showRoute();
  });
  setInterval(loadHealth, 30_000);
  showRoute();
}

if (typeof document !== "undefined") boot();
