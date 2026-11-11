// The Home page: one place, in plain words, to see what Aletheia knows about a project, manage its rules, check which tools
// are connected and read what happened lately. Every block says what it is and gives an example. Text from the database is
// always appended as text, never as markup.
import { badge, button, card, copyText, emptyState, skeleton, toggle } from "../ui-components.js";
import { api, byId, h, run, state, swap } from "../ui-dom.js";
import { t } from "../ui-i18n.js";
import { EXAMPLE_RULES, plainTitle, realProjects, ruleScopeText, rulesFor, toolState, typeWord, whenText } from "../ui-home-model.js";

const q = (name) => encodeURIComponent(name);
const hint = (text) => h("p", { class: "ui-home-hint" }, text);
const example = (text) => h("p", { class: "ui-home-example" }, h("strong", {}, t("home.examplePrefix")), text);

function pickProject(name) {
  const select = byId("ui-project");
  if (!select) return;
  if (![...select.options].some((option) => option.value === name)) select.append(h("option", { value: name }, name));
  select.value = name;
  select.dispatchEvent(new Event("change"));
}

async function load() {
  const project = state.project;
  const get = (path) => api(path);
  const [overview, rules, doctor, observations, summaries, notes] = await Promise.allSettled([
    get("/api/hub/overview"),
    get("/api/hub/rules"),
    get("/api/hub/doctor"),
    project ? get(`/api/hub/memories?project=${q(project)}&kind=observation&limit=60`) : Promise.resolve(null),
    project ? get(`/api/hub/memories?project=${q(project)}&kind=summary&limit=30`) : Promise.resolve(null),
    project ? get(`/api/hub/memories?project=${q(project)}&kind=note&limit=30`) : Promise.resolve(null),
  ]);
  const value = (result, fallback) => (result.status === "fulfilled" && result.value != null ? result.value : fallback);
  return {
    overview: value(overview, null),
    rules: value(rules, { rules: [] }).rules ?? [],
    tools: value(doctor, { tools: [] }).tools ?? [],
    observations: value(observations, { items: [] }).items ?? [],
    summaries: value(summaries, { items: [] }).items ?? [],
    notes: value(notes, { items: [] }).items ?? [],
    failed: [overview, rules, doctor].some((result) => result.status === "rejected"),
  };
}

// ---- first visit: what is this ----

function intro(open) {
  return h("details", { class: "ui-home-intro", open },
    h("summary", {}, t("home.introTitle")),
    h("ol", {},
      h("li", {}, h("strong", {}, t("home.introListensLead")), t("home.introListens")),
      h("li", {}, h("strong", {}, t("home.introRemembersLead")), t("home.introRemembers")),
      h("li", {}, h("strong", {}, t("home.introRemindsLead")), t("home.introReminds"))));
}

// ---- All projects: pick one ----

function projectGrid(data) {
  const { main, other } = realProjects(data.overview?.projects ?? [], { selected: state.project });
  const tile = (project) => h("button", { class: "ui-home-project", type: "button", onclick: () => pickProject(project.name) },
    h("span", { class: "ui-home-project-name" }, project.name),
    h("span", { class: "ui-home-project-meta" }, t("home.thingsRemembered", { count: project.memories })),
    h("span", { class: "ui-home-project-meta" }, project.lastAtEpoch ? t("home.lastUsed", { when: whenText(project.lastAtEpoch) }) : ""));
  return [
    card({
      title: t("home.projectsTitle"),
      subtitle: t("home.projectsSubtitle"),
      children: [
        main.length ? h("div", { class: "ui-home-projects" }, main.map(tile)) : emptyState({ title: t("home.noProjectsTitle"), text: t("home.noProjectsText"), compact: true }),
        other.length ? h("details", { class: "ui-home-other" }, h("summary", {}, t("home.otherFolders", { count: other.length })), h("div", { class: "ui-home-projects" }, other.map(tile))) : null,
      ],
    }),
  ];
}

// ---- What it knows ----

function knowledgeItems(data) {
  const seen = new Set();
  const rows = [...data.observations, ...data.summaries, ...data.notes]
    .map((item) => ({ item, title: plainTitle(item.title) ?? plainTitle(item.narrative) }))
    .filter((row) => row.title)
    .sort((a, b) => Number(b.item.pinned) - Number(a.item.pinned) || b.item.created_at_epoch - a.item.created_at_epoch)
    .filter((row) => (seen.has(row.title) ? false : seen.add(row.title)));
  return rows;
}

function knowledgeCard(data, refresh) {
  const rows = knowledgeItems(data);
  const list = h("div", { class: "ui-home-list" });
  const draw = (count) => {
    swap(list, rows.slice(0, count).map(({ item, title }) => h("div", { class: "ui-home-row" },
      badge(typeWord(item.type, item.kind), item.type === "decision" || item.pinned ? "success" : "neutral"),
      h("div", { class: "ui-home-row-main" }, h("a", { href: `#/memory/memories?q=${q(title.slice(0, 40))}`, class: "ui-home-row-title" }, title), h("span", { class: "ui-meta" }, whenText(item.created_at_epoch))),
      button({ label: t("home.hide"), variant: "ghost", size: "sm", title: t("home.hideTitle"), onClick: () => run(async () => { await api("/api/hub/dismiss", { method: "POST", body: { type: "memory", id: item.id, reason: "hidden from Home" } }); refresh(); }, t("home.hiddenToast")) }))));
    if (rows.length > count) list.append(button({ label: t("home.showMore", { count: Math.min(rows.length - count, 20) }), variant: "ghost", onClick: (event) => { event.currentTarget.remove(); draw(count + 20); } }));
  };
  draw(8);
  const note = h("input", { class: "ui-input", type: "text", placeholder: t("home.notePlaceholder"), "aria-label": t("home.noteAria") });
  const save = () => {
    const text = note.value.trim();
    if (!text) { note.focus(); return; }
    run(async () => { await api("/api/hub/memories", { method: "POST", body: { project: state.project, title: text.slice(0, 100), text, type: "note", pinned: true } }); note.value = ""; refresh(); }, t("home.noteSaved"));
  };
  note.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); save(); } });
  return card({
    title: t("home.knowsTitle", { project: state.project }),
    subtitle: t("home.knowsSubtitle"),
    children: [
      example(t("home.knowsExample")),
      rows.length ? list : emptyState({ title: t("home.nothingLearnedTitle"), text: t("home.nothingLearnedText"), compact: true }),
      h("div", { class: "ui-home-actions" },
        button({ label: t("home.readEverything"), variant: "secondary", href: "#/memory/memories" }),
        button({ label: t("home.search"), variant: "ghost", onClick: () => byId("ui-search")?.focus() })),
      h("div", { class: "ui-home-add" },
        h("label", { class: "ui-home-label" }, t("home.noteLabel"), note),
        hint(t("home.noteHint")),
        button({ label: t("home.saveNote"), variant: "primary", onClick: save })),
    ],
  });
}

// ---- Rules ----

function rulesCard(data, refresh) {
  const rules = rulesFor(data.rules, state.project);
  const rows = rules.map((rule) => {
    const row = h("div", { class: "ui-home-rule" });
    const text = [rule.when ? t("home.ruleWhen", { when: rule.when }) : "", rule.then].join("");
    const sw = toggle({ label: text, checked: rule.enabled, hint: ruleScopeText(rule), onChange: (on) => run(async () => { await api(`/api/hub/rules/${rule.id}/toggle`, { method: "POST", body: { enabled: on } }); refresh(); }, on ? t("home.ruleOn") : t("home.ruleOff")) });
    row.append(sw);
    if (rule.stale) {
      row.append(h("div", { class: "ui-home-stale" },
        h("span", { class: "ui-meta" }, t("home.checkRule"), " ", (rule.reasons ?? []).map((reason) => reason.message).join(" ") || t("home.notChecked")),
        button({ label: t("home.stillRight"), variant: "secondary", size: "sm", onClick: () => run(async () => { await api(`/api/hub/rules/${rule.id}/confirm`, { method: "POST", body: {} }); refresh(); }, t("home.ruleStays")) })));
    }
    return row;
  });
  const input = h("textarea", { class: "ui-input ui-home-textarea", rows: 2, placeholder: EXAMPLE_RULES[0], "aria-label": t("home.newRuleAria") });
  const onlyHere = h("input", { type: "checkbox", id: "ui-home-only-here" });
  const examples = h("div", { class: "ui-home-chips" }, EXAMPLE_RULES.map((text) => h("button", { class: "ui-chip ui-home-chip", type: "button", onclick: () => { input.value = text; input.focus(); } }, text)));
  const add = () => {
    const then = input.value.trim();
    if (!then) { input.focus(); return; }
    const projectOnly = state.project && onlyHere.checked;
    run(async () => { await api("/api/hub/rules", { method: "POST", body: { then, scopeTier: projectOnly ? "project" : "everywhere", scopeName: projectOnly ? state.project : "Everywhere" } }); input.value = ""; refresh(); }, t("home.ruleAdded"));
  };
  const panel = h("div", { class: "ui-home-write", hidden: true });
  return card({
    title: state.project ? t("home.rulesFor", { project: state.project }) : t("home.yourRules"),
    subtitle: t("home.rulesSubtitle"),
    children: [
      example(t("home.rulesExample")),
      rows.length ? h("div", { class: "ui-home-rules" }, rows) : emptyState({ title: t("home.noRulesTitle"), text: t("home.noRulesText"), compact: true }),
      h("div", { class: "ui-home-add" },
        h("label", { class: "ui-home-label" }, t("home.addRuleLabel"), input),
        examples,
        state.project ? h("label", { class: "ui-home-check" }, onlyHere, t("home.onlyHere", { project: state.project })) : null,
        button({ label: t("home.addRule"), variant: "primary", onClick: add })),
      h("div", { class: "ui-home-actions" },
        button({ label: t("home.writeRules"), variant: "secondary", title: t("home.writeRulesTitle"), onClick: () => openWritePanel(panel, data) })),
      panel,
    ],
  });
}

async function openWritePanel(panel, data) {
  const ready = data.tools.filter((tool) => tool.installed);
  const ids = ready.map((tool) => tool.id);
  panel.hidden = false;
  swap(panel, h("p", { class: "ui-meta" }, t("home.checking")));
  const preview = await run(() => api("/api/hub/rules/preview", { method: "POST", body: { scope: "global", tools: ids } }));
  if (!preview) { swap(panel, h("p", { class: "ui-meta" }, t("home.checkFailed"))); return; }
  const name = (id) => data.tools.find((tool) => tool.id === id)?.name ?? id;
  const lines = preview.results.map((result) => h("li", {},
    h("strong", {}, name(result.tool)), result.skipped ? ` — ${result.skipped}` : result.changed ? t("home.willUpdate", { count: result.rules }) : t("home.upToDate"), result.path ? h("div", { class: "ui-meta" }, result.path) : null));
  const changing = preview.results.filter((result) => result.changed).length;
  swap(panel,
    h("h4", {}, t("home.whatWillHappen")),
    h("p", { class: "ui-meta" }, t("home.writeNote")),
    h("ul", { class: "ui-home-write-list" }, lines),
    h("div", { class: "ui-home-actions" },
      changing
        ? button({ label: t("home.writeToFiles", { count: changing }), variant: "primary", onClick: () => run(async () => { await api("/api/hub/rules/sync", { method: "POST", body: { scope: "global", tools: ids, confirm: true } }); panel.hidden = true; }, t("home.writeDone")) })
        : h("span", { class: "ui-meta" }, t("home.allUpToDate")),
      button({ label: t("home.close"), variant: "ghost", onClick: () => { panel.hidden = true; } })));
}

// ---- Tools ----

function toolsCard(data) {
  const rows = data.tools.map((tool) => {
    const info = toolState(tool);
    const command = `aletheia install ${tool.id} --write`;
    return h("div", { class: "ui-home-tool" },
      h("div", { class: "ui-home-tool-head" }, h("strong", {}, tool.name), badge(info.state === "on" ? t("home.badgeOn") : info.state === "missing" ? t("home.badgeMissing") : info.state === "info" ? t("home.badgeLimited") : t("home.badgeNeedsSetup"), info.tone === "success" ? "success" : info.tone === "warning" ? "warning" : "neutral")),
      h("span", { class: "ui-meta" }, info.label),
      info.state === "off" || info.state === "partial"
        ? h("div", { class: "ui-home-command" },
          h("span", { class: "ui-meta" }, t("home.turnOnHint")),
          h("code", {}, command),
          button({ label: t("home.copy"), variant: "ghost", size: "sm", onClick: () => copyText(command) }))
        : null);
  });
  return card({
    title: t("home.toolsTitle"),
    subtitle: t("home.toolsSubtitle"),
    children: [
      example(t("home.toolsExample")),
      rows.length ? h("div", { class: "ui-home-tools" }, rows) : emptyState({ title: t("home.noToolsTitle"), text: t("home.noToolsText"), compact: true }),
      hint(t("home.toolsHint")),
    ],
  });
}

// ---- Lately ----

function activityCard(data) {
  const rows = data.summaries
    .map((item) => ({ item, title: plainTitle(item.narrative) ?? plainTitle(item.title) }))
    .filter((row) => row.title)
    .slice(0, 6);
  return card({
    title: t("home.activityTitle"),
    subtitle: t("home.activitySubtitle"),
    children: [
      example(t("home.activityExample")),
      rows.length
        ? h("div", { class: "ui-home-list" }, rows.map(({ item, title }) => h("div", { class: "ui-home-row" },
          h("div", { class: "ui-home-when" }, whenText(item.created_at_epoch), h("span", { class: "ui-meta" }, item.tool)),
          h("div", { class: "ui-home-row-main" }, h("span", { class: "ui-home-row-title" }, title)))))
        : emptyState({ title: t("home.noSessionsTitle"), text: t("home.noSessionsText"), compact: true }),
      h("div", { class: "ui-home-actions" }, button({ label: t("home.seeAll"), variant: "ghost", href: "#/work" })),
    ],
  });
}

// ---- page ----

function header(data) {
  const info = (data.overview?.projects ?? []).find((project) => project.name === state.project);
  return h("div", { class: "ui-page-head" },
    h("div", {},
      h("h1", {}, state.project ? state.project : t("home.welcomeBack")),
      h("p", { class: "ui-meta" }, state.project
        ? `${info ? `${t("home.thingsRemembered", { count: info.memories })} · ` : ""}${info?.lastAtEpoch ? t("home.lastUsedLower", { when: whenText(info.lastAtEpoch) }) : t("home.noActivity")}`
        : t("home.pickProject"))),
    state.project ? button({ label: t("home.allProjects"), variant: "ghost", onClick: () => pickProject("") }) : null);
}

export async function renderHome() {
  const root = byId("ui-home");
  if (!root) return;
  if (!root.firstChild) swap(root, skeleton({ kind: "lines", count: 4, lines: 3 }));
  const refresh = () => renderHome();
  const data = await load();
  if (!byId("ui-home") || byId("ui-home") !== root) return;
  const first = (data.overview?.stats?.total ?? 0) < 50;
  const project = state.project;
  swap(root,
    header(data),
    data.failed ? h("div", { class: "ui-banner tone-warning" }, t("home.loadFailed")) : null,
    intro(first),
    project
      ? h("div", { class: "ui-home-grid" },
        h("div", { class: "ui-home-col" }, knowledgeCard(data, refresh), activityCard(data)),
        h("div", { class: "ui-home-col" }, rulesCard(data, refresh), toolsCard(data)))
      : h("div", { class: "ui-home-grid" },
        h("div", { class: "ui-home-col" }, projectGrid(data)),
        h("div", { class: "ui-home-col" }, rulesCard(data, refresh), toolsCard(data))));
}
