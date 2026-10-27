// The pages inside the Rules tab (T-210): the rule list, suggested rules, writing rules into each tool's
// instruction file, and importing rules from one. Writing files asks first and says what will happen; everything
// else changes the screen first and can be undone.
import { badge, button, chipFilters, clampText, codeBlock, confirmDialog, disclosure, emptyState, errorState, field, modal, mono, segmented, skeleton, timeEl, toast } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { region, pagedList } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { chipFilter, filterBar, hideCard, segmentFilter, selectFilter, textFilter } from "../ui-views.js";
import { queryString } from "./memory-views.js";

const ruleTitle = (rule) => (rule.when ? `When ${rule.when}: ${rule.then}` : rule.then);
const dayOf = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString().slice(0, 10) : "unknown date");
const evidenceRow = (item) => h("div", { class: "ui-fact-source", dir: "auto" },
  h("span", { class: "ui-meta" }, `${item.kind} #${item.id} · ${dayOf(item.at_epoch)}`),
  item.quote ? ` · ${item.quote}` : null,
  item.session_id ? h("span", { class: "ui-meta" }, ` · session ${item.session_id}`) : null);
const scopeLabel = (rule) => (rule.scopeTier === "everywhere" ? "everywhere" : `${rule.scopeTier}: ${rule.scopeName}`);

// ---- rule list and the add and edit dialogs ---------------------------------------------------------------

/** One rule. Turning it on or off is optimistic and undoable. A rule is never deleted from here. */
function ruleCard(rule, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "rule", "data-id": rule.id });
  const render = () => swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, ruleTitle(rule)),
      h("div", { class: "ui-row" }, rule.stale ? badge("Re-check", "warning") : null, badge(rule.enabled ? "on" : "off", rule.enabled ? "success" : "warning"))),
    h("div", { class: "ui-meta" }, badge(scopeLabel(rule)), rule.tools?.length ? badge(`only ${rule.tools.join(", ")}`) : badge("all tools"), rule.replaced_by || rule.replacedBy ? badge(`replaced by ${rule.replaced_by ?? rule.replacedBy}`) : null),
    h("div", { class: "ui-meta" },
      h("span", {}, `added ${dayOf(rule.createdAtEpoch ?? rule.created_at_epoch)}`),
      h("span", {}, `source: ${rule.source}`),
      h("span", {}, `last confirmed ${dayOf(rule.last_confirmed_epoch)}`),
      h("span", {}, `${rule.evidence?.length ?? 0} evidence`)),
    rule.stale ? h("div", { class: "ui-reasons", role: "note" }, ...(rule.reasons ?? []).map((reason) => h("p", { class: "ui-meta", "data-code": reason.code }, reason.message))) : null,
    rule.evidence?.length ? disclosure({ summary: `Evidence (${rule.evidence.length})`, content: h("div", { class: "ui-quotes" }, ...rule.evidence.map(evidenceRow)) }) : null,
    h("div", { class: "ui-acts" },
      button({ label: "Confirm", size: "sm", icon: "check", onClick: () => confirm() }),
      rule.stale && rule.enabled ? button({ label: "Retire", size: "sm", icon: "eye-off", onClick: () => retire() }) : null,
      button({ label: rule.enabled ? "Turn off" : "Turn on", size: "sm", icon: rule.enabled ? "eye-off" : "check", onClick: () => toggle() }),
      button({ label: "Edit", size: "sm", icon: "edit", onClick: () => edit() }),
      button({ label: "Replace", size: "sm", icon: "undo", onClick: () => replace() })));
  // Confirm says "this rule is still right". It only moves the last-confirmed date; the Re-check flag clears with it,
  // and Undo puts the earlier date back.
  const confirm = () => {
    const before = { stale: rule.stale, reasons: rule.reasons, last_confirmed_epoch: rule.last_confirmed_epoch, age_days: rule.age_days };
    const post = (body) => api(`/api/hub/rules/${rule.id}/confirm`, { method: "POST", body });
    return optimistic({
      apply: () => { Object.assign(rule, { stale: false, reasons: [], last_confirmed_epoch: Date.now(), age_days: 0 }); render(); },
      rollback: () => { Object.assign(rule, before); render(); },
      request: async () => { const result = await post({}); if (result?.rule) Object.assign(rule, result.rule); },
      done: "Rule confirmed. It is unchanged; only its last-confirmed date moved.",
      undo: () => post({ restore: before.last_confirmed_epoch }),
      failure: "Could not confirm this rule.",
    }).then((ok) => { if (ok) ctx.changed?.({ soft: true }); return ok; });
  };
  const patch = (body) => api(`/api/hub/rules/${rule.id}`, { method: "PATCH", body });
  // T-172: the on/off write has its own route and keeps the same optimistic Undo.
  const setEnabled = (enabled) => api(`/api/hub/rules/${rule.id}/toggle`, { method: "POST", body: { enabled } });
  const toggle = () => {
    const next = !rule.enabled;
    return optimistic({
      apply: () => { rule.enabled = next; render(); },
      rollback: () => { rule.enabled = !next; render(); },
      request: () => setEnabled(next),
      done: next ? "Rule turned on. Write the files again to update your tools." : "Rule turned off. It is kept, not deleted.",
      undo: () => setEnabled(!next),
      reapply: () => { rule.enabled = !next; render(); },
      failure: "Could not change this rule.",
    }).then((ok) => { if (ok) ctx.changed?.(); return ok; });
  };
  // Retire is the existing turn-off path (kept, not deleted) with wording for a rule that went stale.
  const retire = () => {
    const back = { enabled: rule.enabled };
    return optimistic({
      apply: () => { rule.enabled = false; render(); },
      rollback: () => { rule.enabled = back.enabled; render(); },
      request: () => setEnabled(false),
      done: "Rule retired. It is turned off and kept, not deleted.",
      undo: () => setEnabled(true),
      failure: "Could not retire this rule.",
    }).then((ok) => { if (ok) ctx.changed?.(); return ok; });
  };
  const replace = () => {
    const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": "Replacement rule" });
    then.value = rule.then;
    const when = h("input", { type: "text", class: "ui-input", value: rule.when ?? "", dir: "auto", "aria-label": "When (optional)" });
    const layer = modal({
      title: "Replace this rule", size: "md",
      body: h("div", {},
        h("p", { class: "ui-meta" }, "The replacement is added as a new rule. This rule is kept and marked as replaced; there is no unreplace route, so this cannot be undone here."),
        field({ label: "What the tool should do instead", control: then }),
        field({ label: "When (optional)", control: when })),
      actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: "Replace", variant: "primary", onClick: async () => {
        if (!then.value.trim()) throw new Error("Write the replacement rule first.");
        const result = await api(`/api/hub/rules/${rule.id}/replace`, { method: "POST", body: { then: then.value.trim(), when: when.value.trim() } });
        toast(`Replaced with rule ${result.replacedBy}. The old rule is kept.`, { tone: "success" });
        layer.close(true);
        ctx.changed?.();
      } })],
    });
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
  const syncLine = h("p", { class: "ui-meta", role: "status", hidden: true });
  const staleLine = h("p", { class: "ui-meta", role: "status", hidden: true });
  const listEl = h("div", { class: "ui-list-rows" });
  const draw = () => {
    const text = needle.value.trim().toLowerCase();
    const staleCount = all.filter((rule) => rule.stale).length;
    staleLine.hidden = !staleCount;
    staleLine.textContent = staleCount ? `${staleCount} rule${staleCount === 1 ? "" : "s"} to re-check. Flagged rules stay on and keep syncing until you retire them.` : "";
    const rows = all.filter((rule) => (show.value === "all" || (show.value === "recheck" ? rule.stale : (show.value === "on") === rule.enabled)) && (!text || `${ruleTitle(rule)} ${scopeLabel(rule)}`.toLowerCase().includes(text)));
    swap(listEl, rows.length ? rows.map((rule) => ruleCard(rule, ctx)) : emptyState({ title: "No rule matches", text: "Clear the filter to see every rule.", compact: true, art: "rules" }));
  };
  needle.addEventListener("input", draw);
  const status = segmented({ label: "Show", value: "all", options: [{ value: "all", label: "All" }, { value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "recheck", label: "Re-check" }], onChange: (value) => { show.value = value; draw(); } });
  // How many tools' managed blocks differ from these rules. Read-only; a failed lookup just leaves the line hidden.
  const loadSync = async () => {
    try {
      const report = await api("/api/hub/rules/diff");
      syncLine.hidden = !report.outOfSync;
      syncLine.textContent = report.outOfSync ? `${report.outOfSync} tool${report.outOfSync === 1 ? "" : "s"} out of sync with these rules. Open Write to tools to preview the difference.` : "";
    } catch { syncLine.hidden = true; }
  };
  const reg = region({
    load: async () => (await api("/api/hub/rules")).rules,
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: "No rules yet", text: "A rule is something you want every AI tool to follow. Write it once here, then write it into each tool's instruction file. You can also import the rules your tools already have.", art: "rules", actions: [button({ label: "Add a rule", variant: "primary", icon: "plus", onClick: () => ctx.addRule() }), button({ label: "Import from a tool", href: "#/rules/import" })] }),
    render: (rules) => { all = rules; ctx.counts?.({ rules: rules.length }); draw(); loadSync(); return h("div", {}, syncLine, staleLine, h("div", { class: "ui-filterrow ui-paged-toolbar" }, h("div", { class: "ui-filter ui-filter-grow" }, needle), h("div", { class: "ui-filter" }, h("span", { class: "ui-filter-label" }, "Show"), status)), listEl); },
  });
  reg.dispose = () => {};
  const wrap = h("div", {}, reg);
  wrap.reload = (options) => reg.reload(options);
  return wrap;
}

// ---- suggested rules ---------------------------------------------------------------------------------------

const STRENGTH_TONE = { Strong: "success", Steady: "info", Light: "neutral" };
const strengthTone = (value) => STRENGTH_TONE[value] ?? "neutral";

function quoteRow(quote) {
  return h("div", { class: "ui-fact-source", dir: "auto" },
    h("span", { class: "ui-meta" }, quote.at ? String(quote.at) : "unknown time"),
    " · ", quote.text,
    quote.sessionId ? h("span", { class: "ui-meta" }, ` · session ${quote.sessionId}`) : null);
}

function suggestionCard(item, ctx, { dismissed }) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "suggestion", "data-id": item.id });
  const post = (action, extra = {}) => api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action, ...extra } });
  let result = null;
  const quotes = item.quotes ?? [];
  const first = quotes.slice(0, 2);
  const more = quotes.slice(2);
  const decide = (action, { done, undo, failure, extra = {} }) => {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: async () => { result = await post(action, extra); },
      done, undo,
      reapply: () => { back(); ctx.changed?.(); },
      failure,
    }).then((ok) => { if (ok) ctx.changed?.({ soft: true }); return ok; });
  };
  const undoDecide = async () => {
    await post("restore");
    if (result?.ruleId) await api(`/api/hub/rules/${result.ruleId}/toggle`, { method: "POST", body: { enabled: false } });
  };
  const edit = () => {
    const text = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": "Rule text" });
    text.value = item.text;
    const layer = modal({
      title: "Edit before approving", size: "md",
      body: field({ label: "Rule text", control: text }),
      actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: "Save and approve", variant: "primary", onClick: async () => {
        const next = text.value.trim();
        if (next.length < 6) throw new Error("The rule needs at least 6 characters.");
        const ok = await decide("edit", { extra: { text: next }, done: "Edited and added. It is on, for every tool you write files for.", undo: undoDecide, failure: "Could not save this suggestion." });
        if (ok) layer.close(true);
      } })],
    });
  };
  const restore = () => {
    let back = () => {};
    return optimistic({
      apply: () => { back = hideCard(card); },
      rollback: () => back(),
      request: () => post("restore"),
      done: "Moved back to Suggested.",
      undo: () => post("reject"),
      reapply: () => { back(); ctx.changed?.(); },
      failure: "Could not restore this suggestion.",
    }).then((ok) => { if (ok) ctx.changed?.({ soft: true }); return ok; });
  };
  swap(card,
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, item.text), h("div", { class: "ui-row" }, badge(dismissed ? "dismissed" : "suggested", "warning"), item.project ? badge(item.project) : null, badge(`strength: ${item.strength ?? "Light"}`, strengthTone(item.strength)))),
    h("div", { class: "ui-meta" },
      h("span", {}, `${item.timesSeen ?? 1}× seen`),
      h("span", {}, `confidence ${Number(item.confidence ?? 0).toFixed(2)}`),
      item.latestAt ? h("span", {}, "last seen ") : null,
      item.latestAt ? timeEl(item.latestAt) : null,
      h("span", {}, `from ${item.sourceType ?? "prompt"}`),
      estimated("Rule strength bands")),
    item.when ? h("div", { class: "ui-meta" }, `When ${item.when}`) : null,
    first.length ? h("div", { class: "ui-quotes" }, ...first.map(quoteRow)) : h("p", { class: "ui-meta" }, "No dated quotes were stored for this suggestion."),
    more.length ? disclosure({ summary: `More quotes (${item.moreQuotes ?? more.length})`, content: h("div", { class: "ui-quotes" }, ...more.map(quoteRow)) }) : null,
    h("div", { class: "ui-acts" }, dismissed
      ? button({ label: "Restore", size: "sm", icon: "undo", onClick: restore })
      : [
        button({ label: "Approve", variant: "primary", size: "sm", icon: "check", onClick: () => decide("approve", { done: "Rule added. It is on, for every tool you write files for.", undo: undoDecide, failure: "Could not approve this suggestion." }) }),
        button({ label: "Edit", size: "sm", icon: "edit", onClick: edit }),
        button({ label: "Reject", size: "sm", icon: "x", onClick: () => decide("reject", { done: "Rejected. It is under Dismissed if you change your mind.", undo: () => post("restore"), failure: "Could not reject this suggestion." }) }),
      ]));
  return card;
}

/** The last learning run from T-172, and a button that runs it again. */
function learningRunPanel({ onRan }) {
  const out = h("div", { class: "ui-meta", role: "status" });
  const show = (run) => swap(out, run ? `${run.at ?? "unknown time"} · found ${run.found ?? 0} · proposed ${run.proposed ?? 0} · errors ${run.errors ?? 0}` : "No learning run has been recorded yet. Run it to scan your prompts for repeated corrections.");
  const load = async () => {
    try { show((await api("/api/hub/rules/learning-run")).learningRun); } catch (error) { swap(out, `Could not read the learning run: ${error.message}`); }
  };
  const run = button({ label: "Run learning now", size: "sm", icon: "bolt", onClick: async () => {
    const data = await api(`/api/hub/rules/learning-run${state.project ? `?project=${encodeURIComponent(state.project)}` : ""}`, { method: "POST" });
    show(data.learningRun);
    toast(`Learning run recorded: found ${data.learningRun?.found ?? 0}, proposed ${data.learningRun?.proposed ?? 0}, errors ${data.learningRun?.errors ?? 0}.`, { tone: "success" });
    onRan?.();
  } });
  load();
  return h("div", { class: "ui-card ui-learning-run" }, h("div", { class: "ui-row" }, h("b", {}, "Rule learning"), run), out);
}

export function suggestionsView(ctx) {
  const defaults = { limit: 25, status: "pending", q: "", sort: "newest" };
  const list = pagedList({
    defaults, label: "Suggested rules",
    fetchPage: (p) => api(`/api/hub/rule-suggestions?${queryString({ limit: p.limit, offset: p.offset, project: state.project, status: p.status, q: p.q, sort: p.sort })}`),
    renderItem: (item, { state: s }) => suggestionCard(item, { changed: (options) => { list.reload(options); ctx.changed?.(); } }, { dismissed: s.status === "dismissed" }),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: (s) => emptyState({ title: s.status === "dismissed" ? "No dismissed suggestions" : "No rule suggestion is waiting", text: s.status === "dismissed" ? "Suggestions you dismiss are kept here, so you can restore them." : "When you correct a tool the same way a few times, Aletheia suggests a rule here. Nothing is applied until you Approve it.", art: "rules" }),
    emptyFiltered: () => emptyState({ title: "No suggestion matches", text: "Try other words.", art: "search", compact: true }),
    onData: (data, s) => { if (s.status === "pending") ctx.counts?.({ suggestions: data.total }); },
    toolbar: ({ state: s, set }) => filterBar([[
      segmentFilter({ key: "status", label: "Show", value: s.status, options: [{ value: "pending", label: "Suggested" }, { value: "dismissed", label: "Dismissed" }], onChange: (status) => set({ status }) }),
      textFilter({ key: "q", value: s.q, label: "Filter suggestions", placeholder: "Filter suggestions…", onChange: (q) => set({ q }, { replace: true }) }),
      selectFilter({ key: "sort", label: "Sort", value: s.sort, options: [{ value: "newest", label: "Newest" }, { value: "confidence", label: "Most confident" }, { value: "oldest", label: "Oldest" }], onChange: (sort) => set({ sort }) }),
    ]]),
  });
  const panel = learningRunPanel({ onRan: () => { list.reload(); ctx.changed?.(); } });
  const el = h("div", { class: "ui-suggestions" }, panel, list);
  Object.assign(el, { reload: (options) => list.reload(options), dispose: () => list.dispose?.() });
  return el;
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
