// T-137: the Rules tab. The editor, the sync panel and the import panel are the existing Hub features. Rule
// suggestions are listed separately and nothing is applied without Accept; a dismissed suggestion can be
// restored. A rule is turned off rather than deleted, so every hide action in this tab is reversible.
import { api, chip, errorCard, errorText, h, qs, run, settledValue, state, swap, toast } from "../ui-dom.js";

export async function renderRules() {
  const root = document.getElementById("ui-rules");
  const p = qs(state.project);
  const results = await Promise.allSettled([
    api("/api/hub/rules"),
    api("/api/hub/tools"),
    api(`/api/hub/rule-suggestions?status=pending${p ? `&${p}` : ""}`),
    api(`/api/hub/rule-suggestions?status=dismissed${p ? `&${p}` : ""}`),
  ]);
  const rules = settledValue(results[0], null);
  const tools = settledValue(results[1], null);
  const suggestions = settledValue(results[2], null);
  const dismissed = settledValue(results[3], null);

  const ruleRows = rules
    ? (rules.rules.length ? rules.rules.map(ruleCard) : [h("div", { class: "ui-empty" }, "No rules yet. Add one, or import what your tools already have.")])
    : [errorCard(errorText(results[0], "Rules"))];

  const suggestionRows = suggestions
    ? (suggestions.items.length ? suggestions.items.map((item) => h("div", { class: "ui-card" },
      h("div", { class: "ui-row" }, chip("suggested", "warn"), chip(item.project), chip(`confidence ${Number(item.confidence).toFixed(2)}`)),
      h("b", { class: "ui-fact-text" }, item.text),
      item.when ? h("div", { class: "ui-meta" }, `When ${item.when}`) : null,
      h("div", { class: "ui-acts" },
        h("button", { class: "primary", onclick: () => run(async () => {
          await api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action: "accept" } });
          toast("Rule added");
          await renderRules();
        }) }, "Accept"),
        h("button", { onclick: () => run(async () => {
          await api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action: "dismiss" } });
          toast("Dismissed; still under Dismissed suggestions");
          await renderRules();
        }) }, "Dismiss")))) : [h("div", { class: "ui-empty" }, "No rule suggestion is waiting.")])
    : [errorCard(errorText(results[2], "Suggestions"))];

  const dismissedRows = dismissed && dismissed.items.length
    ? h("details", { class: "ui-details" }, h("summary", {}, `Dismissed suggestions (${dismissed.items.length})`),
      ...dismissed.items.map((item) => h("div", { class: "ui-card" },
        h("b", { class: "ui-fact-text" }, item.text),
        h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
          await api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action: "restore" } });
          toast("Restored");
          await renderRules();
        }) }, "Restore")))))
    : null;

  swap(root,
    h("h1", {}, "Rules"),
    h("p", { class: "ui-meta" }, "How you want every AI tool to work. Write once, sync everywhere."),
    h("div", {}, ...ruleRows),
    h("h2", {}, "Add a rule"),
    addRuleForm(tools),
    h("h2", {}, "Suggested rules"),
    h("p", { class: "ui-meta" }, "Nothing is applied until you click Accept."),
    ...suggestionRows,
    dismissedRows,
    h("h2", {}, "Sync"),
    tools ? syncPanel(tools.tools) : errorCard(errorText(results[1], "Tools")),
    h("h2", {}, "Import from a tool file"),
    tools ? importRulesPanel(tools.tools) : null);
}

function ruleCard(rule) {
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, h("b", {}, rule.when ? `When ${rule.when}: ${rule.then}` : rule.then), chip(rule.enabled ? "on" : "off", rule.enabled ? "ok" : "warn")),
    h("div", { class: "ui-meta" }, chip(rule.scopeTier === "everywhere" ? "everywhere" : `${rule.scopeTier}: ${rule.scopeName}`), rule.tools ? chip(`only ${rule.tools.join(", ")}`) : chip("all tools"), h("span", {}, rule.source)),
    h("div", { class: "ui-acts" },
      h("button", { onclick: () => run(async () => {
        await api(`/api/hub/rules/${rule.id}`, { method: "PATCH", body: { enabled: !rule.enabled } });
        await renderRules();
      }) }, rule.enabled ? "Turn off" : "Turn on"),
      h("button", { onclick: () => {
        const value = prompt("Edit rule", rule.then);
        if (value) run(async () => {
          await api(`/api/hub/rules/${rule.id}`, { method: "PATCH", body: { then: value } });
          await renderRules();
        });
      } }, "Edit")));
}

function addRuleForm(tools) {
  const then = h("input", { type: "text", placeholder: "e.g. Run the tests before saying a task is done", "aria-label": "Rule" });
  const when = h("input", { type: "text", placeholder: "When… (optional)", "aria-label": "When" });
  const tier = h("select", { "aria-label": "Scope" }, ...["everywhere", "project", "situation"].map((value) => h("option", { value }, value)));
  const scopeName = h("input", { type: "text", placeholder: "project or situation name", "aria-label": "Scope name" });
  const checks = tools ? h("div", { class: "ui-row" }, ...tools.tools.map((tool) => h("label", {}, h("input", { type: "checkbox", name: "rule-tool", value: tool.id }), tool.name))) : null;
  return h("div", { class: "ui-card" },
    h("label", {}, "Rule", then),
    h("label", {}, "When (optional)", when),
    h("div", { class: "ui-inline" }, h("label", {}, "Scope", tier), h("label", {}, "Scope name", scopeName)),
    checks ? h("div", {}, h("div", { class: "ui-meta" }, "Only for these tools (none checked = all)"), checks) : null,
    h("div", { class: "ui-acts" }, h("button", { class: "primary", onclick: () => run(async () => {
      await api("/api/hub/rules", { method: "POST", body: { then: then.value, when: when.value, scopeTier: tier.value, scopeName: scopeName.value || "Everywhere", tools: [...document.querySelectorAll("input[name=rule-tool]:checked")].map((input) => input.value) } });
      toast("Rule added");
      await renderRules();
    }) }, "Add rule")));
}

function syncPanel(tools) {
  const dir = h("input", { type: "text", placeholder: "/absolute/path/to/your/project", "aria-label": "Project folder" });
  const scope = h("select", { "aria-label": "Where to write" }, h("option", { value: "project" }, "A project folder"), h("option", { value: "global" }, "Global (home folder files)"));
  const checks = h("div", { class: "ui-row" }, ...tools.map((tool) => h("label", {}, h("input", { type: "checkbox", name: "sync-tool", value: tool.id, checked: tool.installed || tool.id === "agents-md" }), tool.name)));
  const out = h("div", {});
  const body = (confirmWrite) => ({ tools: [...document.querySelectorAll("input[name=sync-tool]:checked")].map((input) => input.value), scope: scope.value, projectDir: dir.value, confirm: confirmWrite || undefined });
  const show = (results, wrote) => swap(out, ...results.map((result) => h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, h("b", {}, result.tool), chip(result.skipped ? "skipped" : result.written ? "written" : result.changed ? "would change" : "up to date", result.written ? "ok" : result.changed ? "warn" : "")),
    result.path ? h("div", { class: "ui-meta" }, result.path, result.backup ? ` · backup ${result.backup}` : "") : null,
    result.skipped ? h("div", { class: "ui-meta" }, result.skipped) : null,
    result.changed && !wrote ? h("details", { class: "ui-details" }, h("summary", {}, "Show new content"), h("pre", { class: "ui-pre" }, result.after)) : null)));
  return h("div", { class: "ui-card" },
    h("p", { class: "ui-meta" }, "Writes a managed block into each tool's instruction file. Your own text outside the block is never touched, and a backup is kept."),
    checks,
    h("div", { class: "ui-inline" }, h("label", {}, "Where", scope), h("label", {}, "Project folder", dir)),
    h("div", { class: "ui-acts" },
      h("button", { onclick: () => run(async () => show((await api("/api/hub/rules/preview", { method: "POST", body: body(false) })).results, false)) }, "Preview"),
      h("button", { class: "primary", onclick: () => confirm("Write these files? A backup of each existing file is kept.") && run(async () => {
        const result = await api("/api/hub/rules/sync", { method: "POST", body: body(true) });
        show(result.results, true);
        toast("Synced");
      }) }, "Write files")),
    out);
}

function importRulesPanel(tools) {
  const tool = h("select", { "aria-label": "Tool" }, ...tools.map((option) => h("option", { value: option.id }, option.name)));
  const dir = h("input", { type: "text", placeholder: "/absolute/path/to/project (blank for global)", "aria-label": "Project folder" });
  const out = h("div", { class: "ui-meta" });
  return h("div", { class: "ui-card" },
    h("p", { class: "ui-meta" }, "Reads bullet lines from a tool's current instruction file. Nothing is overwritten."),
    h("div", { class: "ui-inline" }, h("label", {}, "Tool", tool), h("label", {}, "Project folder", dir)),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const result = await api("/api/hub/rules/import", { method: "POST", body: { tool: tool.value, scope: dir.value ? "project" : "global", projectDir: dir.value || undefined } });
      out.textContent = `Found ${result.found}, added ${result.added}, already had ${result.skipped}.`;
      await renderRules();
    }) }, "Import")),
    out);
}
