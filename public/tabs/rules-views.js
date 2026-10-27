// The pages inside the Rules tab (T-210): the rule list, suggested rules, writing rules into each tool's
// instruction file, and importing rules from one. Writing files asks first and says what will happen; everything
// else changes the screen first and can be undone.
import { badge, button, chipFilters, clampText, codeBlock, confirmDialog, disclosure, emptyState, errorState, field, modal, mono, segmented, skeleton, timeEl, toast } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { region, pagedList } from "../ui-region.js";
import { chipFilter, filterBar, hideCard, segmentFilter, selectFilter, textFilter } from "../ui-views.js";
import { queryString } from "./memory-views.js";

const ruleTitle = (rule) => (rule.when ? `When ${rule.when}: ${rule.then}` : rule.then);
const scopeLabel = (rule) => (rule.scopeTier === "everywhere" ? "everywhere" : `${rule.scopeTier}: ${rule.scopeName}`);

// ---- rule list and the add and edit dialogs ---------------------------------------------------------------

/** One rule. Turning it on or off is optimistic and undoable. A rule is never deleted from here. */
function ruleCard(rule, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "rule", "data-id": rule.id });
  const render = () => swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, ruleTitle(rule)),
      h("div", { class: "ui-row" }, badge(rule.enabled ? "on" : "off", rule.enabled ? "success" : "warning"))),
    h("div", { class: "ui-meta" }, badge(scopeLabel(rule)), rule.tools?.length ? badge(`only ${rule.tools.join(", ")}`) : badge("all tools"), h("span", {}, `source: ${rule.source}`)),
    h("div", { class: "ui-acts" },
      button({ label: rule.enabled ? "Turn off" : "Turn on", size: "sm", icon: rule.enabled ? "eye-off" : "check", onClick: () => toggle() }),
      button({ label: "Edit", size: "sm", icon: "edit", onClick: () => edit() })));
  const patch = (body) => api(`/api/hub/rules/${rule.id}`, { method: "PATCH", body });
  const toggle = () => {
    const next = !rule.enabled;
    return optimistic({
      apply: () => { rule.enabled = next; render(); },
      rollback: () => { rule.enabled = !next; render(); },
      request: () => patch({ enabled: next }),
      done: next ? "Rule turned on. Write the files again to update your tools." : "Rule turned off. It is kept, not deleted.",
      undo: () => patch({ enabled: !next }),
      reapply: () => { rule.enabled = !next; render(); },
      failure: "Could not change this rule.",
    }).then((ok) => { if (ok) ctx.changed?.(); return ok; });
  };
  const edit = () => {
    const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": "Rule" });
    then.value = rule.then;
    const when = h("input", { type: "text", class: "ui-input", value: rule.when ?? "", dir: "auto", "aria-label": "When (optional)" });
    const layer = modal({
      title: "Edit rule", size: "md",
      body: h("div", {}, field({ label: "What the tool should do", control: then }), field({ label: "When (optional)", control: when })),
      actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: "Save", variant: "primary", onClick: async () => {
        if (!then.value.trim()) throw new Error("A rule needs some text.");
        const saved = await patch({ then: then.value.trim(), when: when.value.trim() });
        Object.assign(rule, saved);
        render();
        toast("Saved. Write the files again to update your tools.", { tone: "success" });
        layer.close(true);
      } })],
    });
  };
  render();
  return card;
}

/** The dialog that adds a rule. `tools` comes from /api/hub/tools. */
export function addRuleDialog({ tools = [], onAdded }) {
  const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": "Rule", placeholder: "For example: Run the tests before saying a task is done" });
  const when = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "When (optional)", placeholder: "When… (optional)" });
  const tier = h("select", { class: "ui-select", "aria-label": "Scope" }, ...[["everywhere", "Everywhere"], ["project", "One project"], ["situation", "One situation"]].map(([value, label]) => h("option", { value }, label)));
  const scopeName = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "Scope name", value: state.project || "", placeholder: "Project or situation name" });
  const scopeField = field({ label: "Name of the project or situation", control: scopeName });
  scopeField.hidden = true;
  tier.addEventListener("change", () => { scopeField.hidden = tier.value === "everywhere"; });
  const checks = tools.map((tool) => h("label", { class: "ui-check" }, h("input", { type: "checkbox", name: "rule-tool", value: tool.id }), h("span", {}, tool.name)));
  const layer = modal({
    title: "Add a rule", size: "md",
    body: h("div", {}, field({ label: "What the tool should do", control: then }), field({ label: "When (optional)", control: when }), h("div", { class: "ui-inline" }, field({ label: "Applies to", control: tier }), scopeField),
      tools.length ? h("fieldset", { class: "ui-fieldset" }, h("legend", { class: "ui-field-label" }, "Only for these tools (none ticked means all tools)"), h("div", { class: "ui-checks" }, ...checks)) : null),
    actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: "Add rule", variant: "primary", onClick: async () => {
      if (!then.value.trim()) throw new Error("A rule needs some text.");
      if (tier.value !== "everywhere" && !scopeName.value.trim()) throw new Error("Name the project or situation, or choose Everywhere.");
      const chosen = checks.map((label) => label.querySelector("input")).filter((input) => input.checked).map((input) => input.value);
      await api("/api/hub/rules", { method: "POST", body: { then: then.value.trim(), when: when.value.trim(), scopeTier: tier.value, scopeName: tier.value === "everywhere" ? "Everywhere" : scopeName.value.trim(), tools: chosen } });
      toast("Rule added. Write the files to put it in your tools.", { tone: "success" });
      layer.close(true);
      onAdded?.();
    } })],
  });
  return layer;
}

export function rulesView(ctx) {
  const needle = h("input", { type: "search", class: "ui-input", placeholder: "Filter rules…", "aria-label": "Filter rules", dir: "auto" });
  const show = { value: "all" };
  let all = [];
  const listEl = h("div", { class: "ui-list-rows" });
  const draw = () => {
    const text = needle.value.trim().toLowerCase();
    const rows = all.filter((rule) => (show.value === "all" || (show.value === "on") === rule.enabled) && (!text || `${ruleTitle(rule)} ${scopeLabel(rule)}`.toLowerCase().includes(text)));
    swap(listEl, rows.length ? rows.map((rule) => ruleCard(rule, ctx)) : emptyState({ title: "No rule matches", text: "Clear the filter to see every rule.", compact: true, art: "rules" }));
  };
  needle.addEventListener("input", draw);
  const status = segmented({ label: "Show", value: "all", options: [{ value: "all", label: "All" }, { value: "on", label: "On" }, { value: "off", label: "Off" }], onChange: (value) => { show.value = value; draw(); } });
  const reg = region({
    load: async () => (await api("/api/hub/rules")).rules,
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: "No rules yet", text: "A rule is something you want every AI tool to follow. Write it once here, then write it into each tool's instruction file. You can also import the rules your tools already have.", art: "rules", actions: [button({ label: "Add a rule", variant: "primary", icon: "plus", onClick: () => ctx.addRule() }), button({ label: "Import from a tool", href: "#/rules/import" })] }),
    render: (rules) => { all = rules; ctx.counts?.({ rules: rules.length }); draw(); return h("div", {}, h("div", { class: "ui-filterrow ui-paged-toolbar" }, h("div", { class: "ui-filter ui-filter-grow" }, needle), h("div", { class: "ui-filter" }, h("span", { class: "ui-filter-label" }, "Show"), status)), listEl); },
  });
  reg.dispose = () => {};
  const wrap = h("div", {}, reg);
  wrap.reload = (options) => reg.reload(options);
  return wrap;
}

// ---- suggested rules ---------------------------------------------------------------------------------------

function suggestionCard(item, ctx, { dismissed }) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "suggestion", "data-id": item.id });
  const post = (action) => api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action } });
  const move = (action, done, undo, failure) => {
    let back = () => {};
    return optimistic({ apply: () => { back = hideCard(card); }, rollback: () => back(), request: async () => { result = await post(action); }, done, undo, reapply: () => { back(); ctx.changed(); }, failure }).then((ok) => { if (ok) ctx.changed({ soft: true }); return ok; });
  };
  let result = null;
  swap(card,
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, item.text), h("div", { class: "ui-row" }, badge(dismissed ? "dismissed" : "suggested", "warning"), badge(item.project), badge(`confidence ${Number(item.confidence).toFixed(2)}`))),
    item.when ? h("div", { class: "ui-meta" }, `When ${item.when}`) : null,
    h("div", { class: "ui-meta" }, h("span", {}, `from ${item.sourceType}`), item.createdAt ? timeEl(item.createdAt) : null),
    h("div", { class: "ui-acts" }, dismissed
      ? button({ label: "Restore", size: "sm", icon: "undo", onClick: () => move("restore", "Moved back to Suggested.", () => post("dismiss"), "Could not restore this suggestion.") })
      : [
        button({ label: "Accept", variant: "primary", size: "sm", icon: "check", onClick: () => move("accept", "Rule added. It is on, for every tool you write files for.", async () => {
          await post("restore");
          if (result?.ruleId) await api(`/api/hub/rules/${result.ruleId}`, { method: "PATCH", body: { enabled: false } });
        }, "Could not add this rule.") }),
        button({ label: "Dismiss", size: "sm", icon: "eye-off", onClick: () => move("dismiss", "Dismissed. It is under Dismissed if you change your mind.", () => post("restore"), "Could not dismiss this suggestion.") }),
      ]));
  return card;
}

export function suggestionsView(ctx) {
  const defaults = { limit: 25, status: "pending", q: "", sort: "newest" };
  const list = pagedList({
    defaults, label: "Suggested rules",
    fetchPage: (p) => api(`/api/hub/rule-suggestions?${queryString({ limit: p.limit, offset: p.offset, project: state.project, status: p.status, q: p.q, sort: p.sort })}`),
    renderItem: (item, { state: s }) => suggestionCard(item, { changed: (options) => { list.reload(options); ctx.changed?.(); } }, { dismissed: s.status === "dismissed" }),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: (s) => emptyState({ title: s.status === "dismissed" ? "No dismissed suggestions" : "No rule suggestion is waiting", text: s.status === "dismissed" ? "Suggestions you dismiss are kept here, so you can restore them." : "When you correct a tool the same way a few times, Aletheia suggests a rule here. Nothing is applied until you click Accept.", art: "rules" }),
    emptyFiltered: () => emptyState({ title: "No suggestion matches", text: "Try other words.", art: "search", compact: true }),
    onData: (data, s) => { if (s.status === "pending") ctx.counts?.({ suggestions: data.total }); },
    toolbar: ({ state: s, set }) => filterBar([[
      segmentFilter({ key: "status", label: "Show", value: s.status, options: [{ value: "pending", label: "Suggested" }, { value: "dismissed", label: "Dismissed" }], onChange: (status) => set({ status }) }),
      textFilter({ key: "q", value: s.q, label: "Filter suggestions", placeholder: "Filter suggestions…", onChange: (q) => set({ q }, { replace: true }) }),
      selectFilter({ key: "sort", label: "Sort", value: s.sort, options: [{ value: "newest", label: "Newest" }, { value: "confidence", label: "Most confident" }, { value: "oldest", label: "Oldest" }], onChange: (sort) => set({ sort }) }),
    ]]),
  });
  return list;
}

// ---- write rules into each tool's file --------------------------------------------------------------------

export function syncView(ctx) {
  const out = h("div", { class: "ui-sync-results", "aria-live": "polite" });
  const reg = region({
    load: async () => (await api("/api/hub/tools")).tools,
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    isEmpty: () => false,
    render: (tools) => {
      const boxes = tools.map((tool) => ({ tool, input: h("input", { type: "checkbox", name: "sync-tool", value: tool.id, checked: tool.installed || tool.id === "agents-md" }) }));
      const scope = h("select", { class: "ui-select", "aria-label": "Where to write" }, h("option", { value: "project" }, "A project folder"), h("option", { value: "global" }, "Global (files in your home folder)"));
      const dir = h("input", { type: "text", class: "ui-input", dir: "ltr", placeholder: "/absolute/path/to/your/project", "aria-label": "Project folder" });
      const dirField = field({ label: "Project folder", control: dir });
      scope.addEventListener("change", () => { dirField.hidden = scope.value === "global"; });
      const body = (confirmWrite) => ({ tools: boxes.filter((entry) => entry.input.checked).map((entry) => entry.tool.id), scope: scope.value, projectDir: dir.value, confirm: confirmWrite || undefined });
      const show = (results, wrote) => swap(out, ...results.map((result) => h("div", { class: "ui-card" },
        h("div", { class: "ui-row" }, h("b", {}, result.tool), badge(result.skipped ? "skipped" : result.written ? "written" : result.changed ? "would change" : "up to date", result.written ? "success" : result.changed ? "warning" : "neutral")),
        result.path ? h("div", { class: "ui-meta" }, mono(result.path), result.backup ? h("span", {}, "backup:") : null, result.backup ? mono(result.backup) : null) : null,
        result.skipped ? h("div", { class: "ui-meta" }, result.skipped) : null,
        result.changed && !wrote ? disclosure({ summary: "Show the new content", content: codeBlock({ code: result.after, lang: "md" }) }) : null)));
      const check = () => { if (!body(false).tools.length) throw new Error("Tick at least one tool."); if (scope.value === "project" && !dir.value.trim()) throw new Error("Type the absolute path of the project folder."); };
      return h("div", { class: "ui-card" },
        h("p", { class: "ui-meta" }, "Writes your enabled rules as a managed block in each tool's instruction file. Your own text outside the block is never touched, and a backup is kept."),
        h("fieldset", { class: "ui-fieldset" }, h("legend", { class: "ui-field-label" }, "Tools"), h("div", { class: "ui-checks" }, ...boxes.map((entry) => h("label", { class: "ui-check" }, entry.input, h("span", {}, entry.tool.name), entry.tool.installed ? badge("detected", "success") : null)))),
        h("div", { class: "ui-inline" }, field({ label: "Where", control: scope }), dirField),
        h("div", { class: "ui-acts" },
          button({ label: "Preview changes", icon: "search", onClick: async () => { check(); show((await api("/api/hub/rules/preview", { method: "POST", body: body(false) })).results, false); } }),
          button({ label: "Write files", variant: "primary", icon: "upload", onClick: async () => {
            check();
            const ids = body(false).tools;
            const ok = await confirmDialog({ title: "Write these files?", message: `This writes a managed block into the rules file of ${ids.length} tool${ids.length === 1 ? "" : "s"} (${ids.join(", ")}). A backup of each existing file is kept, and nothing outside the block changes. You can run Preview first to see the new content.`, confirmLabel: "Write files" });
            if (!ok) return;
            const result = await api("/api/hub/rules/sync", { method: "POST", body: body(true) });
            show(result.results, true);
            toast("Files written.", { tone: "success" });
          } })),
        out);
    },
  });
  return reg;
}

// ---- import from a tool's file ----------------------------------------------------------------------------

export function importView(ctx) {
  const out = h("div", { class: "ui-meta", role: "status" });
  return region({
    load: async () => (await api("/api/hub/tools")).tools,
    skeleton: () => skeleton({ kind: "card", count: 1 }),
    isEmpty: () => false,
    render: (tools) => {
      const tool = h("select", { class: "ui-select", "aria-label": "Tool" }, ...tools.map((option) => h("option", { value: option.id }, option.name)));
      const dir = h("input", { type: "text", class: "ui-input", dir: "ltr", placeholder: "/absolute/path/to/project (blank for the global file)", "aria-label": "Project folder" });
      return h("div", { class: "ui-card" },
        h("p", { class: "ui-meta" }, "Reads the bullet lines from a tool's current instruction file and adds them as rules. Nothing is overwritten, and rules you already have are skipped."),
        h("div", { class: "ui-inline" }, field({ label: "Tool", control: tool }), field({ label: "Project folder", control: dir })),
        h("div", { class: "ui-acts" }, button({ label: "Import rules", variant: "primary", icon: "download", onClick: async () => {
          const result = await api("/api/hub/rules/import", { method: "POST", body: { tool: tool.value, scope: dir.value ? "project" : "global", projectDir: dir.value || undefined } });
          out.textContent = `Found ${result.found}, added ${result.added}, already had ${result.skipped}.`;
          toast(`Imported ${result.added} rule${result.added === 1 ? "" : "s"}.`, { tone: "success" });
          ctx.changed?.();
        } })),
        out);
    },
  });
}
