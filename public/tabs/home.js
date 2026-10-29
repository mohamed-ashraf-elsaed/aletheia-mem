// The Home page: one place, in plain words, to see what Aletheia knows about a project, manage its rules, check which tools
// are connected and read what happened lately. Every block says what it is and gives an example. Text from the database is
// always appended as text, never as markup.
import { badge, button, card, copyText, emptyState, skeleton, toggle } from "../ui-components.js";
import { api, byId, h, run, state, swap } from "../ui-dom.js";
import { EXAMPLE_RULES, plainTitle, realProjects, ruleScopeText, rulesFor, toolState, typeWord, whenText } from "../ui-home-model.js";

const q = (name) => encodeURIComponent(name);
const hint = (text) => h("p", { class: "ui-home-hint" }, text);
const example = (text) => h("p", { class: "ui-home-example" }, h("strong", {}, "Example: "), text);

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
    h("summary", {}, "What is Aletheia? (30 seconds)"),
    h("ol", {},
      h("li", {}, h("strong", {}, "It listens. "), "While you work in Claude Code, Command Code or Codex, Aletheia quietly writes down what happened: what you decided, what you fixed, what to remember."),
      h("li", {}, h("strong", {}, "It remembers. "), "Everything stays on this computer. Secrets such as keys and passwords are removed before anything is saved."),
      h("li", {}, h("strong", {}, "It reminds your tools. "), "The next time you start a session, the tool gets a short summary of what you already decided, plus your rules. You stop repeating yourself.")));
}

// ---- All projects: pick one ----

function projectGrid(data) {
  const { main, other } = realProjects(data.overview?.projects ?? [], { selected: state.project });
  const tile = (project) => h("button", { class: "ui-home-project", type: "button", onclick: () => pickProject(project.name) },
    h("span", { class: "ui-home-project-name" }, project.name),
    h("span", { class: "ui-home-project-meta" }, `${project.memories} things remembered`),
    h("span", { class: "ui-home-project-meta" }, project.lastAtEpoch ? `Last used ${whenText(project.lastAtEpoch)}` : ""));
  return [
    card({
      title: "Your projects",
      subtitle: "Click a project to see what Aletheia knows about it, its rules and the tools connected to it.",
      children: [
        main.length ? h("div", { class: "ui-home-projects" }, main.map(tile)) : emptyState({ title: "No projects yet", text: "Work in a connected tool for a few minutes. Your first project appears here by itself.", compact: true }),
        other.length ? h("details", { class: "ui-home-other" }, h("summary", {}, `${other.length} other folders (temporary and tiny ones, hidden)`), h("div", { class: "ui-home-projects" }, other.map(tile))) : null,
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
      button({ label: "Hide", variant: "ghost", size: "sm", title: "Hide this from search and from the notes your tools receive. You can bring it back later.", onClick: () => run(async () => { await api("/api/hub/dismiss", { method: "POST", body: { type: "memory", id: item.id, reason: "hidden from Home" } }); refresh(); }, "Hidden. Find it under Knowledge, Dismissed, to bring it back.") }))));
    if (rows.length > count) list.append(button({ label: `Show ${Math.min(rows.length - count, 20)} more`, variant: "ghost", onClick: (event) => { event.currentTarget.remove(); draw(count + 20); } }));
  };
  draw(8);
  const note = h("input", { class: "ui-input", type: "text", placeholder: "Deploy needs Node 20.19.6 on the staging server", "aria-label": "Something to remember" });
  const save = () => {
    const text = note.value.trim();
    if (!text) { note.focus(); return; }
    run(async () => { await api("/api/hub/memories", { method: "POST", body: { project: state.project, title: text.slice(0, 100), text, type: "note", pinned: true } }); note.value = ""; refresh(); }, "Saved. It will be in the notes your tools receive.");
  };
  note.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); save(); } });
  return card({
    title: `What Aletheia knows about ${state.project}`,
    subtitle: "Newest first. Aletheia writes these down by itself from your sessions.",
    children: [
      example("“Retargeting only works for Meta campaigns” or “The deploy script needs Node 20.19.6”."),
      rows.length ? list : emptyState({ title: "Nothing learned here yet", text: "Work in a connected tool in this project. Decisions, fixes and lessons show up here after the session ends.", compact: true }),
      h("div", { class: "ui-home-actions" },
        button({ label: "Read everything", variant: "secondary", href: "#/memory/memories" }),
        button({ label: "Search", variant: "ghost", onClick: () => byId("ui-search")?.focus() })),
      h("div", { class: "ui-home-add" },
        h("label", { class: "ui-home-label" }, "Tell Aletheia something to remember", note),
        hint("It is saved as a pinned note and is shown at the start of every new session in this project."),
        button({ label: "Save note", variant: "primary", onClick: save })),
    ],
  });
}

// ---- Rules ----

function rulesCard(data, refresh) {
  const rules = rulesFor(data.rules, state.project);
  const rows = rules.map((rule) => {
    const row = h("div", { class: "ui-home-rule" });
    const text = [rule.when ? `When ${rule.when}: ` : "", rule.then].join("");
    const sw = toggle({ label: text, checked: rule.enabled, hint: ruleScopeText(rule), onChange: (on) => run(async () => { await api(`/api/hub/rules/${rule.id}/toggle`, { method: "POST", body: { enabled: on } }); refresh(); }, on ? "Rule is on." : "Rule is off. It is kept; turn it on again any time.") });
    row.append(sw);
    if (rule.stale) {
      row.append(h("div", { class: "ui-home-stale" },
        h("span", { class: "ui-meta" }, "Check this rule: ", (rule.reasons ?? []).map((reason) => reason.message).join(" ") || "It has not been checked for a while."),
        button({ label: "Still right", variant: "secondary", size: "sm", onClick: () => run(async () => { await api(`/api/hub/rules/${rule.id}/confirm`, { method: "POST", body: {} }); refresh(); }, "Thanks. The rule stays on.") })));
    }
    return row;
  });
  const input = h("textarea", { class: "ui-input ui-home-textarea", rows: 2, placeholder: EXAMPLE_RULES[0], "aria-label": "A new rule" });
  const onlyHere = h("input", { type: "checkbox", id: "ui-home-only-here" });
  const examples = h("div", { class: "ui-home-chips" }, EXAMPLE_RULES.map((text) => h("button", { class: "ui-chip ui-home-chip", type: "button", onclick: () => { input.value = text; input.focus(); } }, text)));
  const add = () => {
    const then = input.value.trim();
    if (!then) { input.focus(); return; }
    const projectOnly = state.project && onlyHere.checked;
    run(async () => { await api("/api/hub/rules", { method: "POST", body: { then, scopeTier: projectOnly ? "project" : "everywhere", scopeName: projectOnly ? state.project : "Everywhere" } }); input.value = ""; refresh(); }, "Rule added. Press “Write rules into my tools” to put it in each tool’s own file.");
  };
  const panel = h("div", { class: "ui-home-write", hidden: true });
  return card({
    title: state.project ? `Rules for ${state.project}` : "Your rules",
    subtitle: "How you want every AI tool to behave. Write a rule once; Aletheia gives it to all your tools.",
    children: [
      example("“Always run the tests before saying a task is done.”"),
      rows.length ? h("div", { class: "ui-home-rules" }, rows) : emptyState({ title: "No rules yet", text: "Add your first rule below. Click an example to start from it.", compact: true }),
      h("div", { class: "ui-home-add" },
        h("label", { class: "ui-home-label" }, "Add a rule, in your own words", input),
        examples,
        state.project ? h("label", { class: "ui-home-check" }, onlyHere, ` Only for ${state.project} (leave unticked to use it in every project)`) : null,
        button({ label: "Add rule", variant: "primary", onClick: add })),
      h("div", { class: "ui-home-actions" },
        button({ label: "Write rules into my tools", variant: "secondary", title: "Shows what will change first. Nothing is written until you confirm.", onClick: () => openWritePanel(panel, data) })),
      panel,
    ],
  });
}

async function openWritePanel(panel, data) {
  const ready = data.tools.filter((tool) => tool.installed);
  const ids = ready.map((tool) => tool.id);
  panel.hidden = false;
  swap(panel, h("p", { class: "ui-meta" }, "Checking what would change…"));
  const preview = await run(() => api("/api/hub/rules/preview", { method: "POST", body: { scope: "global", tools: ids } }));
  if (!preview) { swap(panel, h("p", { class: "ui-meta" }, "Could not check. Is the server running?")); return; }
  const name = (id) => data.tools.find((tool) => tool.id === id)?.name ?? id;
  const lines = preview.results.map((result) => h("li", {},
    h("strong", {}, name(result.tool)), result.skipped ? ` — ${result.skipped}` : result.changed ? ` — will be updated (${result.rules} rules)` : " — already up to date", result.path ? h("div", { class: "ui-meta" }, result.path) : null));
  const changing = preview.results.filter((result) => result.changed).length;
  swap(panel,
    h("h4", {}, "What will happen"),
    h("p", { class: "ui-meta" }, "Only the block between Aletheia’s own markers is rewritten. Anything else you wrote in those files stays. Each changed file is backed up first."),
    h("ul", { class: "ui-home-write-list" }, lines),
    h("div", { class: "ui-home-actions" },
      changing
        ? button({ label: `Write to ${changing} file${changing === 1 ? "" : "s"}`, variant: "primary", onClick: () => run(async () => { await api("/api/hub/rules/sync", { method: "POST", body: { scope: "global", tools: ids, confirm: true } }); panel.hidden = true; }, "Done. Your tools will see the rules in their next session.") })
        : h("span", { class: "ui-meta" }, "Everything is already up to date."),
      button({ label: "Close", variant: "ghost", onClick: () => { panel.hidden = true; } })));
}

// ---- Tools ----

function toolsCard(data) {
  const rows = data.tools.map((tool) => {
    const info = toolState(tool);
    const command = `aletheia install ${tool.id} --write`;
    return h("div", { class: "ui-home-tool" },
      h("div", { class: "ui-home-tool-head" }, h("strong", {}, tool.name), badge(info.state === "on" ? "On" : info.state === "missing" ? "Not installed" : info.state === "info" ? "Limited" : "Needs setup", info.tone === "success" ? "success" : info.tone === "warning" ? "warning" : "neutral")),
      h("span", { class: "ui-meta" }, info.label),
      info.state === "off" || info.state === "partial"
        ? h("div", { class: "ui-home-command" },
          h("span", { class: "ui-meta" }, "To turn it on, run this in a terminal (it backs up your files first):"),
          h("code", {}, command),
          button({ label: "Copy", variant: "ghost", size: "sm", onClick: () => copyText(command) }))
        : null);
  });
  return card({
    title: "Connected tools",
    subtitle: "A tool must be turned on before Aletheia can listen to it and give it your memory and rules. Tools are connected once, for all your projects; Aletheia sorts what it hears by the folder you work in.",
    children: [
      example("Claude Code: “Turned on: it remembers your sessions”."),
      rows.length ? h("div", { class: "ui-home-tools" }, rows) : emptyState({ title: "No tools found", text: "Install Claude Code, Command Code or Codex, then run: aletheia install <tool> --write", compact: true }),
      hint("Turning a tool on never deletes anything. You can remove it again with: aletheia uninstall <tool> --write"),
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
    title: "What happened lately",
    subtitle: "One line per finished session, newest first.",
    children: [
      example("“Fixed the deploy script and merged the pull request.”"),
      rows.length
        ? h("div", { class: "ui-home-list" }, rows.map(({ item, title }) => h("div", { class: "ui-home-row" },
          h("div", { class: "ui-home-when" }, whenText(item.created_at_epoch), h("span", { class: "ui-meta" }, item.tool)),
          h("div", { class: "ui-home-row-main" }, h("span", { class: "ui-home-row-title" }, title)))))
        : emptyState({ title: "No finished sessions yet", text: "When a session ends, a one-line summary shows up here.", compact: true }),
      h("div", { class: "ui-home-actions" }, button({ label: "See every request and session", variant: "ghost", href: "#/work" })),
    ],
  });
}

// ---- page ----

function header(data) {
  const info = (data.overview?.projects ?? []).find((project) => project.name === state.project);
  return h("div", { class: "ui-page-head" },
    h("div", {},
      h("h1", {}, state.project ? state.project : "Welcome back"),
      h("p", { class: "ui-meta" }, state.project
        ? `${info ? `${info.memories} things remembered · ` : ""}${info?.lastAtEpoch ? `last used ${whenText(info.lastAtEpoch)}` : "no activity yet"}`
        : "Pick a project to see what Aletheia knows, its rules and its connected tools.")),
    state.project ? button({ label: "← All projects", variant: "ghost", onClick: () => pickProject("") }) : null);
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
    data.failed ? h("div", { class: "ui-banner tone-warning" }, "Some information could not be loaded. Is the server running? Try: systemctl --user status aletheia.service") : null,
    intro(first),
    project
      ? h("div", { class: "ui-home-grid" },
        h("div", { class: "ui-home-col" }, knowledgeCard(data, refresh), activityCard(data)),
        h("div", { class: "ui-home-col" }, rulesCard(data, refresh), toolsCard(data)))
      : h("div", { class: "ui-home-grid" },
        h("div", { class: "ui-home-col" }, projectGrid(data)),
        h("div", { class: "ui-home-col" }, rulesCard(data, refresh), toolsCard(data))));
}
