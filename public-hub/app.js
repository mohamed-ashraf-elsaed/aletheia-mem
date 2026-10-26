// Memory Hub UI. Plain ES modules, no build step. All data goes in as text nodes, never as parsed markup,
// because memories are untrusted text (they come from tools and web pages).
const $app = document.getElementById("app");
const $nav = document.getElementById("nav");
const $toast = document.getElementById("toast");

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
/** replaceChildren that skips null/false (the DOM would print the word "null"). */
const swap = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const toast = (msg) => { $toast.textContent = msg; $toast.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => $toast.classList.remove("show"), 2600); };

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}
const run = async (fn) => { try { return await fn(); } catch (e) { toast(e.message); return null; } };
const when = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "never");
const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => toast("Copy failed"));

const PAGES = [["overview", "Overview"], ["memory", "Memory"], ["rules", "Rules"], ["tools", "Tools"], ["migrate", "Migrate"], ["activity", "Activity"]];
const route = () => (location.hash.replace(/^#\//, "") || "overview").split("?")[0];

function renderNav() {
  $nav.replaceChildren(...PAGES.map(([id, label]) => h("a", { href: `#/${id}`, class: route() === id ? "on" : "" }, label)));
}

// ----------------------------------------------------------------------------------------------- overview
async function pageOverview() {
  const o = await api("/api/hub/overview");
  const s = o.stats;
  const bars = (title, obj) => {
    const max = Math.max(1, ...Object.values(obj));
    const entries = Object.entries(obj);
    return h("div", { class: "card" }, h("b", {}, title), entries.length ? entries.map(([k, n]) => h("div", {}, h("div", { class: "row" }, h("span", {}, k), h("span", { class: "chip" }, n)), h("div", { class: "bar" }, h("i", { style: `width:${Math.round((n / max) * 100)}%` })))) : h("p", { class: "sub" }, "Nothing yet."));
  };
  swap($app, 
    h("h1", {}, "Shared memory for every AI tool"),
    h("p", { class: "sub" }, "One local store your tools read and write. Free, no account, and everything exports."),
    h("div", { class: "grid" },
      ...[["Memories", s.total], ["Pinned", s.pinned], ["Rules on", s.rules], ["Projects", s.projects]].map(([l, n]) => h("div", { class: "card stat" }, h("b", {}, n), h("span", {}, l)))),
    s.total === 0 ? h("div", { class: "empty", style: "margin-top:16px" }, h("p", {}, "The hub is empty."), h("p", {}, o.claudeMem.exists ? "A claude-mem database was found on this machine. Bring its memory in:" : "Import from another system or connect a tool to start filling it."), h("a", { href: "#/migrate" }, "Go to Migrate →")) : null,
    h("h2", {}, "Where memory comes from"),
    h("div", { class: "grid" }, bars("By tool", s.byTool), bars("By kind", s.byKind), bars("By type", s.byType)),
    h("h2", {}, "Tools on this machine"),
    h("div", { class: "row" }, o.tools.map((t) => h("span", { class: `chip ${t.installed ? "ok" : ""}` }, `${t.installed ? "✔" : "·"} ${t.name}`))),
    h("p", { class: "sub" }, "Connect them on the Tools page, sync rules on the Rules page."));
}

// ----------------------------------------------------------------------------------------------- memory
const memState = { q: "", project: "", kind: "", type: "", tool: "", pinned: false, offset: 0, items: [], total: 0 };
async function pageMemory() {
  const [{ projects }, o] = await Promise.all([api("/api/hub/projects"), api("/api/hub/overview")]);
  const list = h("div", { class: "list" });
  const more = h("button", { onclick: () => load(false) }, "Load more");
  const count = h("span", { class: "sub" });
  const q = h("input", { type: "search", placeholder: "Search memory…", value: memState.q, "aria-label": "Search memory" });
  const sel = (key, label, options) => h("select", { "aria-label": label, onchange: (e) => { memState[key] = e.target.value; load(true); } }, h("option", { value: "" }, label), options.map((v) => h("option", { value: v, selected: memState[key] === v }, v)));
  const pin = h("label", { class: "row" }, h("input", { type: "checkbox", checked: memState.pinned, onchange: (e) => { memState.pinned = e.target.checked; load(true); } }), "Pinned only");
  let timer;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { memState.q = q.value; load(true); }, 250); });

  async function load(reset) {
    if (reset) { memState.offset = 0; memState.items = []; }
    const p = new URLSearchParams({ limit: "30", offset: String(memState.offset) });
    for (const k of ["q", "project", "kind", "type", "tool"]) if (memState[k]) p.set(k, memState[k]);
    if (memState.pinned) p.set("pinned", "1");
    const r = await run(() => api(`/api/hub/memories?${p}`));
    if (!r) return;
    memState.items.push(...r.items); memState.total = r.total; memState.offset += r.items.length;
    list.replaceChildren(...(memState.items.length ? memState.items.map(card) : [h("div", { class: "empty" }, "No memories match.")]));
    count.textContent = `${memState.items.length} of ${r.total}`;
    more.hidden = memState.items.length >= r.total;
  }

  function card(m) {
    const el = h("div", { class: "card mem" });
    const view = () => {
      swap(el, 
        h("h3", {}, m.pinned ? "📌 " : "", m.title || "(untitled)"),
        h("div", { class: "meta" }, h("span", { class: "chip" }, m.kind), h("span", { class: "chip" }, m.type), h("span", {}, m.project), h("span", {}, m.tool), h("span", {}, when(m.created_at_epoch)), h("span", {}, `#${m.id}`)),
        m.narrative ? h("p", {}, m.narrative.length > 600 ? `${m.narrative.slice(0, 600)}…` : m.narrative) : null,
        m.files?.length ? h("div", { class: "meta" }, "Files: ", m.files.slice(0, 6).join(", ")) : null,
        h("div", { class: "acts" },
          h("button", { onclick: () => run(async () => { Object.assign(m, await api(`/api/hub/memories/${m.id}`, { method: "PATCH", body: { pinned: !m.pinned } })); view(); }) }, m.pinned ? "Unpin" : "Pin"),
          h("button", { onclick: edit }, "Edit"),
          h("button", { class: "danger", onclick: () => confirm("Delete this memory? This cannot be undone.") && run(async () => { await api(`/api/hub/memories/${m.id}`, { method: "DELETE" }); memState.items = memState.items.filter((x) => x.id !== m.id); el.remove(); toast("Deleted"); }) }, "Delete")));
    };
    const edit = () => {
      const t = h("input", { type: "text", value: m.title, style: "width:100%" });
      const n = h("textarea", {}, m.narrative ?? ""); n.value = m.narrative ?? "";
      const ty = h("select", {}, ["bugfix", "feature", "refactor", "change", "discovery", "decision", "gotcha", "note"].map((v) => h("option", { value: v, selected: m.type === v }, v)));
      const pr = h("input", { type: "text", value: m.project });
      swap(el, h("label", {}, "Title"), t, h("label", {}, "Text"), n, h("div", { class: "row" }, h("div", {}, h("label", {}, "Type"), ty), h("div", {}, h("label", {}, "Project"), pr)),
        h("div", { class: "acts" }, h("button", { class: "primary", onclick: () => run(async () => { Object.assign(m, await api(`/api/hub/memories/${m.id}`, { method: "PATCH", body: { title: t.value, narrative: n.value, type: ty.value, project: pr.value } })); view(); toast("Saved"); }) }, "Save"), h("button", { onclick: view }, "Cancel")));
    };
    view();
    return el;
  }

  const form = () => {
    const t = h("input", { type: "text", placeholder: "Title (optional)", style: "width:100%" });
    const n = h("textarea", { placeholder: "What should every tool remember? A decision, a gotcha, a convention…" });
    const p = h("input", { type: "text", placeholder: "project", value: memState.project || "" });
    const ty = h("select", {}, ["note", "decision", "gotcha", "bugfix", "feature", "discovery"].map((v) => h("option", { value: v }, v)));
    return h("details", { class: "card" }, h("summary", {}, "New note"), t, n, h("div", { class: "row" }, p, ty, h("button", { class: "primary", onclick: () => run(async () => { await api("/api/hub/memories", { method: "POST", body: { title: t.value, text: n.value, project: p.value || "default", type: ty.value } }); t.value = n.value = ""; toast("Saved"); load(true); }) }, "Save")));
  };

  swap($app, h("h1", {}, "Memory"), h("p", { class: "sub" }, "Everything your tools saved. Search, pin, fix or delete."), form(),
    h("div", { class: "row", style: "margin-top:12px" }, q, sel("project", "All projects", projects.map((p) => p.name)), sel("kind", "All kinds", ["observation", "summary", "prompt", "note", "event"]), sel("type", "All types", ["bugfix", "feature", "refactor", "change", "discovery", "decision", "gotcha", "note"]), sel("tool", "All tools", Object.keys(o.stats.byTool)), pin, count),
    list, h("div", { class: "row", style: "margin-top:12px" }, more));
  await load(true);
}

// ----------------------------------------------------------------------------------------------- rules
async function pageRules() {
  const [{ rules }, { tools }] = await Promise.all([api("/api/hub/rules"), api("/api/hub/tools")]);
  const toolChecks = (name) => h("div", { class: "checks" }, tools.map((t) => h("label", {}, h("input", { type: "checkbox", name, value: t.id, checked: name === "sync" ? t.installed || t.id === "agents-md" : false }), t.name)));
  const ruleRow = (r) => h("div", { class: "card" },
    h("div", { class: "row" }, h("b", {}, r.when ? `When ${r.when}: ${r.then}` : r.then)),
    h("div", { class: "meta" }, h("span", { class: "chip" }, r.scopeTier === "everywhere" ? "everywhere" : `${r.scopeTier}: ${r.scopeName}`), r.tools ? h("span", { class: "chip" }, `only ${r.tools.join(", ")}`) : h("span", { class: "chip" }, "all tools"), h("span", {}, r.source)),
    h("div", { class: "acts", style: "margin-top:8px;display:flex;gap:6px" },
      h("button", { onclick: () => run(async () => { await api(`/api/hub/rules/${r.id}`, { method: "PATCH", body: { enabled: !r.enabled } }); render(); }) }, r.enabled ? "Turn off" : "Turn on"),
      h("button", { onclick: () => { const v = prompt("Edit rule", r.then); if (v) run(async () => { await api(`/api/hub/rules/${r.id}`, { method: "PATCH", body: { then: v } }); render(); }); } }, "Edit"),
      h("button", { class: "danger", onclick: () => confirm("Delete this rule?") && run(async () => { await api(`/api/hub/rules/${r.id}`, { method: "DELETE" }); render(); }) }, "Delete")));

  const then = h("input", { type: "text", placeholder: "e.g. Run the tests before saying a task is done", style: "width:100%" });
  const whenI = h("input", { type: "text", placeholder: "When… (optional)", style: "width:100%" });
  const tier = h("select", {}, ["everywhere", "project", "situation"].map((v) => h("option", { value: v }, v)));
  const scopeName = h("input", { type: "text", placeholder: "project or situation name" });
  const addForm = h("div", { class: "card" }, h("b", {}, "Add a rule"), h("label", {}, "Rule"), then, h("label", {}, "When (optional)"), whenI,
    h("div", { class: "row" }, tier, scopeName), h("label", {}, "Only for these tools (none checked = all)"), toolChecks("only"),
    h("button", { class: "primary", onclick: () => run(async () => { await api("/api/hub/rules", { method: "POST", body: { then: then.value, when: whenI.value, scopeTier: tier.value, scopeName: scopeName.value || "Everywhere", tools: [...addForm.querySelectorAll("input[name=only]:checked")].map((i) => i.value) } }); toast("Rule added"); render(); }) }, "Add rule"));

  // sync panel
  const dir = h("input", { type: "text", placeholder: "/absolute/path/to/your/project", style: "width:100%" });
  const scope = h("select", {}, h("option", { value: "project" }, "A project folder"), h("option", { value: "global" }, "Global (home folder files)"));
  const out = h("div", {});
  const syncBody = (confirmWrite) => ({ tools: [...syncPanel.querySelectorAll("input[name=sync]:checked")].map((i) => i.value), scope: scope.value, projectDir: dir.value, confirm: confirmWrite || undefined });
  const showResults = (results, wrote) => out.replaceChildren(...results.map((r) => h("div", { class: "card", style: "margin-top:8px" },
    h("div", { class: "row" }, h("b", {}, r.tool), h("span", { class: `chip ${r.written ? "ok" : r.changed ? "warn" : ""}` }, r.skipped ? "skipped" : r.written ? "written" : r.changed ? "would change" : "up to date")),
    r.path ? h("div", { class: "meta" }, r.path, r.backup ? ` · backup ${r.backup}` : "") : null, r.skipped ? h("p", { class: "sub" }, r.skipped) : null,
    r.changed && !wrote ? h("details", {}, h("summary", {}, "Show new content"), h("pre", {}, r.after)) : null)));
  const syncPanel = h("div", { class: "card" }, h("b", {}, "Sync rules into your tools"),
    h("p", { class: "sub" }, "Writes a managed block into each tool's instruction file. Your own text outside the block is never touched. Preview first."),
    h("label", {}, "Tools"), toolChecks("sync"), h("label", {}, "Where"), scope, dir,
    h("div", { class: "row", style: "margin-top:10px" },
      h("button", { onclick: () => run(async () => showResults((await api("/api/hub/rules/preview", { method: "POST", body: syncBody(false) })).results, false)) }, "Preview"),
      h("button", { class: "primary", onclick: () => confirm("Write these files? A backup of each existing file is kept.") && run(async () => { const r = await api("/api/hub/rules/sync", { method: "POST", body: syncBody(true) }); showResults(r.results, true); toast("Synced"); }) }, "Write files")), out);

  const impTool = h("select", {}, tools.map((t) => h("option", { value: t.id }, t.name)));
  const impDir = h("input", { type: "text", placeholder: "/absolute/path/to/project (blank for global)", style: "width:100%" });
  const impOut = h("p", { class: "sub" });
  const importPanel = h("div", { class: "card" }, h("b", {}, "Import rules from an existing file"), h("p", { class: "sub" }, "Reads bullet lines from a tool's current instruction file, so you can start from what you already wrote."),
    h("div", { class: "row" }, impTool, h("button", { onclick: () => run(async () => { const r = await api("/api/hub/rules/import", { method: "POST", body: { tool: impTool.value, scope: impDir.value ? "project" : "global", projectDir: impDir.value || undefined } }); impOut.textContent = `Found ${r.found}, added ${r.added}, already had ${r.skipped}.`; render(); }) }, "Import")), impDir, impOut);

  swap($app, h("h1", {}, "Rules"), h("p", { class: "sub" }, "How you want every AI tool to work. Write once, sync everywhere."),
    h("div", { class: "list" }, ...(rules.length ? rules.map(ruleRow) : [h("div", { class: "empty" }, "No rules yet. Add one, or import what your tools already have.")])),
    h("h2", {}, "Add"), addForm, h("h2", {}, "Sync"), syncPanel, h("h2", {}, "Import"), importPanel);
}

// ----------------------------------------------------------------------------------------------- tools
async function pageTools() {
  const { tools } = await api("/api/hub/tools");
  swap($app, h("h1", {}, "Tools"), h("p", { class: "sub" }, "Connect a tool once and it can search and save to the same memory. Connecting edits that tool's own config, with a backup."),
    h("div", { class: "list" }, ...tools.map((t) => {
      const body = h("div", {});
      const m = t.mcp;
      const status = m ? (m.connected === true ? h("span", { class: "chip ok" }, "connected") : m.connected === false ? h("span", { class: "chip warn" }, "not connected") : h("span", { class: "chip" }, "manual")) : h("span", { class: "chip" }, "rules only");
      if (m?.command) body.append(h("pre", {}, m.command), h("button", { onclick: () => copy(m.command) }, "Copy command"));
      if (m?.snippet) body.append(h("div", { class: "meta" }, m.path), h("pre", {}, m.snippet), h("div", { class: "row" },
        h("button", { onclick: () => copy(m.snippet) }, "Copy"),
        m.connected ? null : h("button", { class: "primary", disabled: !!m.error, onclick: () => confirm(`Write the connection into ${m.path}? A backup is kept.`) && run(async () => { const r = await api(`/api/hub/tools/${t.id}/connect`, { method: "POST", body: { apply: true, confirm: true } }); toast(r.written ? "Connected" : "Already connected"); render(); }) }, "Connect")));
      if (m?.error) body.append(h("p", { class: "sub" }, m.error));
      return h("div", { class: "card" }, h("div", { class: "row" }, h("b", {}, t.name), status, t.installed ? h("span", { class: "chip ok" }, "detected") : h("span", { class: "chip" }, "not detected")),
        h("div", { class: "meta" }, "Rules file: ", t.rules.project, t.rules.global ? ` · global ~/${t.rules.global}` : ""), body);
    })));
}

// ----------------------------------------------------------------------------------------------- migrate
async function pageMigrate() {
  const o = await api("/api/hub/overview");
  const file = h("input", { type: "file", accept: ".jsonl,.ndjson,.json,application/x-ndjson" });
  const res = h("pre", { hidden: true });
  const show = (v) => { res.hidden = false; res.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2); };
  const cmPath = h("input", { type: "text", value: o.claudeMem.path, style: "width:100%" });
  const prompts = h("input", { type: "checkbox", checked: true });
  const project = h("input", { type: "text", placeholder: "only this project (optional)" });
  swap($app, h("h1", {}, "Migrate"), h("p", { class: "sub" }, "Your memory is yours. Move it in, out, and between tools without losing it."),
    h("div", { class: "card" }, h("b", {}, "Export"), h("p", { class: "sub" }, "A versioned bundle (JSON Lines) restores everything here or anywhere that reads the format. Markdown is for pasting into any chat."),
      h("div", { class: "row" }, h("a", { href: "/api/hub/export?format=jsonl" }, h("button", {}, "Bundle (.jsonl)")), h("a", { href: "/api/hub/export?format=markdown" }, h("button", {}, "Markdown (.md)")), h("a", { href: "/api/hub/export?format=jsonl&events=1" }, h("button", {}, "Bundle with raw events")))),
    h("div", { class: "card", style: "margin-top:12px" }, h("b", {}, "Import a bundle"), h("p", { class: "sub" }, "Safe to repeat: memories already here are skipped."),
      h("div", { class: "row" }, file, h("button", { class: "primary", onclick: () => run(async () => { const f = file.files[0]; if (!f) return toast("Choose a file first"); show(await api("/api/hub/import/bundle", { method: "POST", body: { bundle: await f.text() } })); toast("Imported"); }) }, "Import"))),
    h("div", { class: "card", style: "margin-top:12px" }, h("b", {}, "Import from claude-mem"), h("p", { class: "sub" }, o.claudeMem.exists ? "A claude-mem database was found. Observations, session summaries and prompts are copied (read-only on your side)." : "No claude-mem database at the default path. Enter one."),
      h("label", {}, "Database file"), cmPath, h("label", {}, "Project filter"), project, h("label", { class: "row" }, prompts, "Include prompts"),
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "primary", onclick: () => run(async () => { show(await api("/api/hub/import/claude-mem", { method: "POST", body: { path: cmPath.value, includePrompts: prompts.checked, project: project.value || undefined } })); toast("Imported"); }) }, "Import"))),
    h("div", { class: "card", style: "margin-top:12px" }, h("b", {}, "Turn raw events into observations"), h("p", { class: "sub" }, o.provider === "none" ? "Needs a model. Start the server with ALETHEIA_PROVIDER=claude-cli (or openai)." : `Uses the ${o.provider} provider. Sends recent captured events to that model.`),
      h("button", { disabled: o.provider === "none", onclick: () => run(async () => show(await api("/api/hub/compress", { method: "POST", body: {} }))) }, "Compress now")),
    res);
}

// ----------------------------------------------------------------------------------------------- activity
async function pageActivity() {
  const [{ audit }, o] = await Promise.all([api("/api/hub/audit?limit=100"), api("/api/hub/overview")]);
  swap($app, h("h1", {}, "Activity"), h("p", { class: "sub" }, "Every change, and who made it."),
    h("div", { class: "card" }, h("b", {}, "This hub"), h("div", { class: "meta" }, `Data: ${o.dataDir}`, ` · provider: ${o.provider}`, ` · /v1 key: ${o.apiKeyRequired ? "required" : "not required (loopback only)"}`),
      h("p", { class: "sub" }, "MCP command for any tool:"), h("pre", {}, o.mcp.command.join(" "))),
    h("h2", {}, "Audit log"),
    audit.length ? h("table", {}, h("thead", {}, h("tr", {}, ["When", "Actor", "Action", "Detail"].map((x) => h("th", {}, x)))), h("tbody", {}, audit.map((a) => h("tr", {}, h("td", {}, when(a.at_epoch)), h("td", {}, a.actor), h("td", {}, a.action), h("td", {}, a.detail ? JSON.stringify(a.detail).slice(0, 140) : ""))))) : h("div", { class: "empty" }, "No activity yet."));
}

const PAGE_FNS = { overview: pageOverview, memory: pageMemory, rules: pageRules, tools: pageTools, migrate: pageMigrate, activity: pageActivity };
async function render() {
  renderNav();
  const fn = PAGE_FNS[route()] ?? pageOverview;
  try { await fn(); } catch (e) { swap($app, h("div", { class: "empty" }, `Could not load: ${e.message}`)); }
}
window.addEventListener("hashchange", render);
render();
