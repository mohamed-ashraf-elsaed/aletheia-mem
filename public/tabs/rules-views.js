// The pages inside the Rules tab: the rule list, suggested rules, writing rules into each tool's
// instruction file, and importing rules from one. Writing files asks first and says what will happen; everything
// else changes the screen first and can be undone.
import { badge, button, chipFilters, clampText, codeBlock, confirmDialog, disclosure, emptyState, errorState, field, modal, mono, segmented, skeleton, timeEl, toast } from "../ui-components.js";
import { api, h, state, swap } from "../ui-dom.js";
import { optimistic } from "../ui-actions.js";
import { region, pagedList } from "../ui-region.js";
import { estimated } from "../ui-estimates.js";
import { chipFilter, filterBar, hideCard, segmentFilter, selectFilter, textFilter } from "../ui-views.js";
import { queryString } from "./memory-views.js";
import { t } from "../ui-i18n.js";

const ruleTitle = (rule) => (rule.when ? t("rules.ruleTitleWhen", { when: rule.when, then: rule.then }) : rule.then);
const dayOf = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString().slice(0, 10) : t("rules.unknownDate"));
const evidenceRow = (item) => h("div", { class: "ui-fact-source", dir: "auto" },
  h("span", { class: "ui-meta" }, t("rules.evidenceHead", { kind: item.kind, id: item.id, day: dayOf(item.at_epoch) })),
  item.quote ? ` · ${item.quote}` : null,
  item.session_id ? h("span", { class: "ui-meta" }, t("rules.sessionSuffix", { id: item.session_id })) : null);
const scopeLabel = (rule) => (rule.scopeTier === "everywhere" ? t("rules.everywhere") : t("rules.scopeTierName", { tier: rule.scopeTier, name: rule.scopeName }));

// ---- rule list and the add and edit dialogs ---------------------------------------------------------------

/** One rule. Turning it on or off is optimistic and undoable. A rule is never deleted from here. */
function ruleCard(rule, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "rule", "data-id": rule.id });
  const render = () => swap(card,
    h("div", { class: "ui-item-head" },
      h("p", { class: "ui-item-title", dir: "auto" }, ruleTitle(rule)),
      h("div", { class: "ui-row" }, rule.stale ? badge(t("rules.recheck"), "warning") : null, badge(rule.enabled ? t("rules.on") : t("rules.off"), rule.enabled ? "success" : "warning"))),
    h("div", { class: "ui-meta" }, badge(scopeLabel(rule)), rule.tools?.length ? badge(t("rules.onlyTools", { tools: rule.tools.join(", ") })) : badge(t("rules.allTools")), rule.replaced_by || rule.replacedBy ? badge(t("rules.replacedBy", { id: rule.replaced_by ?? rule.replacedBy })) : null),
    h("div", { class: "ui-meta" },
      h("span", {}, t("rules.added", { day: dayOf(rule.createdAtEpoch ?? rule.created_at_epoch) })),
      h("span", {}, t("rules.source", { source: rule.source })),
      h("span", {}, t("rules.lastConfirmed", { day: dayOf(rule.last_confirmed_epoch) })),
      h("span", {}, t("rules.evidenceCount", { count: rule.evidence?.length ?? 0 }))),
    rule.stale ? h("div", { class: "ui-reasons", role: "note" }, ...(rule.reasons ?? []).map((reason) => h("p", { class: "ui-meta", "data-code": reason.code }, reason.message))) : null,
    rule.evidence?.length ? disclosure({ summary: t("rules.evidenceSummary", { count: rule.evidence.length }), content: h("div", { class: "ui-quotes" }, ...rule.evidence.map(evidenceRow)) }) : null,
    h("div", { class: "ui-acts" },
      button({ label: t("rules.confirm"), size: "sm", icon: "check", onClick: () => confirm() }),
      rule.stale && rule.enabled ? button({ label: t("rules.retire"), size: "sm", icon: "eye-off", onClick: () => retire() }) : null,
      button({ label: rule.enabled ? t("rules.turnOff") : t("rules.turnOn"), size: "sm", icon: rule.enabled ? "eye-off" : "check", onClick: () => toggle() }),
      button({ label: t("rules.edit"), size: "sm", icon: "edit", onClick: () => edit() }),
      button({ label: t("rules.replace"), size: "sm", icon: "undo", onClick: () => replace() })));
  // Confirm says "this rule is still right". It only moves the last-confirmed date; the Re-check flag clears with it,
  // and Undo puts the earlier date back.
  const confirm = () => {
    const before = { stale: rule.stale, reasons: rule.reasons, last_confirmed_epoch: rule.last_confirmed_epoch, age_days: rule.age_days };
    const post = (body) => api(`/api/hub/rules/${rule.id}/confirm`, { method: "POST", body });
    return optimistic({
      apply: () => { Object.assign(rule, { stale: false, reasons: [], last_confirmed_epoch: Date.now(), age_days: 0 }); render(); },
      rollback: () => { Object.assign(rule, before); render(); },
      request: async () => { const result = await post({}); if (result?.rule) Object.assign(rule, result.rule); },
      done: t("rules.confirmed"),
      undo: () => post({ restore: before.last_confirmed_epoch }),
      failure: t("rules.confirmFailed"),
    }).then((ok) => { if (ok) ctx.changed?.({ soft: true }); return ok; });
  };
  const patch = (body) => api(`/api/hub/rules/${rule.id}`, { method: "PATCH", body });
  // the on/off write has its own route and keeps the same optimistic Undo.
  const setEnabled = (enabled) => api(`/api/hub/rules/${rule.id}/toggle`, { method: "POST", body: { enabled } });
  const toggle = () => {
    const next = !rule.enabled;
    return optimistic({
      apply: () => { rule.enabled = next; render(); },
      rollback: () => { rule.enabled = !next; render(); },
      request: () => setEnabled(next),
      done: next ? t("rules.turnedOn") : t("rules.turnedOff"),
      undo: () => setEnabled(!next),
      reapply: () => { rule.enabled = !next; render(); },
      failure: t("rules.changeFailed"),
    }).then((ok) => { if (ok) ctx.changed?.(); return ok; });
  };
  // Retire is the existing turn-off path (kept, not deleted) with wording for a rule that went stale.
  const retire = () => {
    const back = { enabled: rule.enabled };
    return optimistic({
      apply: () => { rule.enabled = false; render(); },
      rollback: () => { rule.enabled = back.enabled; render(); },
      request: () => setEnabled(false),
      done: t("rules.retired"),
      undo: () => setEnabled(true),
      failure: t("rules.retireFailed"),
    }).then((ok) => { if (ok) ctx.changed?.(); return ok; });
  };
  const replace = () => {
    const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": t("rules.replacementRule") });
    then.value = rule.then;
    const when = h("input", { type: "text", class: "ui-input", value: rule.when ?? "", dir: "auto", "aria-label": t("rules.whenOptional") });
    const layer = modal({
      title: t("rules.replaceTitle"), size: "md",
      body: h("div", {},
        h("p", { class: "ui-meta" }, t("rules.replaceNote")),
        field({ label: t("rules.doInstead"), control: then }),
        field({ label: t("rules.whenOptional"), control: when })),
      actions: [button({ label: t("rules.cancel"), onClick: () => layer.close(false) }), button({ label: t("rules.replace"), variant: "primary", onClick: async () => {
        if (!then.value.trim()) throw new Error(t("rules.writeReplacement"));
        const result = await api(`/api/hub/rules/${rule.id}/replace`, { method: "POST", body: { then: then.value.trim(), when: when.value.trim() } });
        toast(t("rules.replacedToast", { id: result.replacedBy }), { tone: "success" });
        layer.close(true);
        ctx.changed?.();
      } })],
    });
  };
  const edit = () => {
    const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": t("rules.rule") });
    then.value = rule.then;
    const when = h("input", { type: "text", class: "ui-input", value: rule.when ?? "", dir: "auto", "aria-label": t("rules.whenOptional") });
    const layer = modal({
      title: t("rules.editRule"), size: "md",
      body: h("div", {}, field({ label: t("rules.doWhat"), control: then }), field({ label: t("rules.whenOptional"), control: when })),
      actions: [button({ label: t("rules.cancel"), onClick: () => layer.close(false) }), button({ label: t("rules.save"), variant: "primary", onClick: async () => {
        if (!then.value.trim()) throw new Error(t("rules.needsText"));
        const saved = await patch({ then: then.value.trim(), when: when.value.trim() });
        Object.assign(rule, saved);
        render();
        toast(t("rules.savedWriteAgain"), { tone: "success" });
        layer.close(true);
      } })],
    });
  };
  render();
  return card;
}

/** The dialog that adds a rule. `tools` comes from /api/hub/tools. */
export function addRuleDialog({ tools = [], onAdded }) {
  const then = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": t("rules.rule"), placeholder: t("rules.ruleExample") });
  const when = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": t("rules.whenOptional"), placeholder: t("rules.whenPlaceholder") });
  const tier = h("select", { class: "ui-select", "aria-label": t("rules.scope") }, ...[["everywhere", t("rules.scopeEverywhere")], ["project", t("rules.scopeProject")], ["situation", t("rules.scopeSituation")]].map(([value, label]) => h("option", { value }, label)));
  const scopeName = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": t("rules.scopeName"), value: state.project || "", placeholder: t("rules.scopeNamePlaceholder") });
  const scopeField = field({ label: t("rules.scopeNameLabel"), control: scopeName });
  scopeField.hidden = true;
  tier.addEventListener("change", () => { scopeField.hidden = tier.value === "everywhere"; });
  const checks = tools.map((tool) => h("label", { class: "ui-check" }, h("input", { type: "checkbox", name: "rule-tool", value: tool.id }), h("span", {}, tool.name)));
  const layer = modal({
    title: t("rules.addTitle"), size: "md",
    body: h("div", {}, field({ label: t("rules.doWhat"), control: then }), field({ label: t("rules.whenOptional"), control: when }), h("div", { class: "ui-inline" }, field({ label: t("rules.appliesTo"), control: tier }), scopeField),
      tools.length ? h("fieldset", { class: "ui-fieldset" }, h("legend", { class: "ui-field-label" }, t("rules.onlyForTools")), h("div", { class: "ui-checks" }, ...checks)) : null),
    actions: [button({ label: t("rules.cancel"), onClick: () => layer.close(false) }), button({ label: t("rules.addRule"), variant: "primary", onClick: async () => {
      if (!then.value.trim()) throw new Error(t("rules.needsText"));
      if (tier.value !== "everywhere" && !scopeName.value.trim()) throw new Error(t("rules.nameScope"));
      const chosen = checks.map((label) => label.querySelector("input")).filter((input) => input.checked).map((input) => input.value);
      await api("/api/hub/rules", { method: "POST", body: { then: then.value.trim(), when: when.value.trim(), scopeTier: tier.value, scopeName: tier.value === "everywhere" ? "Everywhere" : scopeName.value.trim(), tools: chosen } });
      toast(t("rules.added2"), { tone: "success" });
      layer.close(true);
      onAdded?.();
    } })],
  });
  return layer;
}

export function rulesView(ctx) {
  const needle = h("input", { type: "search", class: "ui-input", placeholder: t("rules.filterPlaceholder"), "aria-label": t("rules.filterRules"), dir: "auto" });
  const show = { value: "all" };
  let all = [];
  const syncLine = h("p", { class: "ui-meta", role: "status", hidden: true });
  const staleLine = h("p", { class: "ui-meta", role: "status", hidden: true });
  const listEl = h("div", { class: "ui-list-rows" });
  const draw = () => {
    const text = needle.value.trim().toLowerCase();
    const staleCount = all.filter((rule) => rule.stale).length;
    staleLine.hidden = !staleCount;
    staleLine.textContent = staleCount ? t("rules.staleLine", { count: staleCount }) : "";
    const rows = all.filter((rule) => (show.value === "all" || (show.value === "recheck" ? rule.stale : (show.value === "on") === rule.enabled)) && (!text || `${ruleTitle(rule)} ${scopeLabel(rule)}`.toLowerCase().includes(text)));
    swap(listEl, rows.length ? rows.map((rule) => ruleCard(rule, ctx)) : emptyState({ title: t("rules.noMatchTitle"), text: t("rules.noMatchText"), compact: true, art: "rules" }));
  };
  needle.addEventListener("input", draw);
  const status = segmented({ label: t("rules.show"), value: "all", options: [{ value: "all", label: t("rules.showAll") }, { value: "on", label: t("rules.showOn") }, { value: "off", label: t("rules.showOff") }, { value: "recheck", label: t("rules.recheck") }], onChange: (value) => { show.value = value; draw(); } });
  // How many tools' managed blocks differ from these rules. Read-only; a failed lookup just leaves the line hidden.
  const loadSync = async () => {
    try {
      const report = await api("/api/hub/rules/diff");
      syncLine.hidden = !report.outOfSync;
      syncLine.textContent = report.outOfSync ? t("rules.outOfSync", { count: report.outOfSync }) : "";
    } catch { syncLine.hidden = true; }
  };
  const reg = region({
    load: async () => (await api("/api/hub/rules")).rules,
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: t("rules.emptyTitle"), text: t("rules.emptyText"), art: "rules", actions: [button({ label: t("rules.addTitle"), variant: "primary", icon: "plus", onClick: () => ctx.addRule() }), button({ label: t("rules.importFromTool"), href: "#/rules/import" })] }),
    render: (rules) => { all = rules; ctx.counts?.({ rules: rules.length }); draw(); loadSync(); return h("div", {}, syncLine, staleLine, h("div", { class: "ui-filterrow ui-paged-toolbar" }, h("div", { class: "ui-filter ui-filter-grow" }, needle), h("div", { class: "ui-filter" }, h("span", { class: "ui-filter-label" }, t("rules.show")), status)), listEl); },
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
    h("span", { class: "ui-meta" }, quote.at ? String(quote.at) : t("rules.unknownTime")),
    " · ", quote.text,
    quote.sessionId ? h("span", { class: "ui-meta" }, t("rules.sessionSuffix", { id: quote.sessionId })) : null);
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
    const text = h("textarea", { class: "ui-input", rows: "3", dir: "auto", "aria-label": t("rules.ruleText") });
    text.value = item.text;
    const layer = modal({
      title: t("rules.editBeforeApproving"), size: "md",
      body: field({ label: t("rules.ruleText"), control: text }),
      actions: [button({ label: t("rules.cancel"), onClick: () => layer.close(false) }), button({ label: t("rules.saveApprove"), variant: "primary", onClick: async () => {
        const next = text.value.trim();
        if (next.length < 6) throw new Error(t("rules.minChars"));
        const ok = await decide("edit", { extra: { text: next }, done: t("rules.editedAdded"), undo: undoDecide, failure: t("rules.saveSuggestionFailed") });
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
      done: t("rules.movedBack"),
      undo: () => post("reject"),
      reapply: () => { back(); ctx.changed?.(); },
      failure: t("rules.restoreSuggestionFailed"),
    }).then((ok) => { if (ok) ctx.changed?.({ soft: true }); return ok; });
  };
  swap(card,
    h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, item.text), h("div", { class: "ui-row" }, badge(dismissed ? t("rules.dismissed") : t("rules.suggested"), "warning"), item.project ? badge(item.project) : null, badge(t("rules.strength", { value: item.strength ?? "Light" }), strengthTone(item.strength)))),
    h("div", { class: "ui-meta" },
      h("span", {}, t("rules.timesSeen", { count: item.timesSeen ?? 1 })),
      h("span", {}, t("rules.confidence", { value: Number(item.confidence ?? 0).toFixed(2) })),
      item.latestAt ? h("span", {}, t("rules.lastSeen")) : null,
      item.latestAt ? timeEl(item.latestAt) : null,
      h("span", {}, t("rules.from", { source: item.sourceType ?? "prompt" })),
      estimated(t("rules.strengthBands"))),
    item.when ? h("div", { class: "ui-meta" }, t("rules.whenLine", { when: item.when })) : null,
    first.length ? h("div", { class: "ui-quotes" }, ...first.map(quoteRow)) : h("p", { class: "ui-meta" }, t("rules.noQuotes")),
    more.length ? disclosure({ summary: t("rules.moreQuotes", { count: item.moreQuotes ?? more.length }), content: h("div", { class: "ui-quotes" }, ...more.map(quoteRow)) }) : null,
    h("div", { class: "ui-acts" }, dismissed
      ? button({ label: t("rules.restore"), size: "sm", icon: "undo", onClick: restore })
      : [
        button({ label: t("rules.approve"), variant: "primary", size: "sm", icon: "check", onClick: () => decide("approve", { done: t("rules.approved"), undo: undoDecide, failure: t("rules.approveFailed") }) }),
        button({ label: t("rules.edit"), size: "sm", icon: "edit", onClick: edit }),
        button({ label: t("rules.reject"), size: "sm", icon: "x", onClick: () => decide("reject", { done: t("rules.rejected"), undo: () => post("restore"), failure: t("rules.rejectFailed") }) }),
      ]));
  return card;
}

/** The last learning run, and a button that runs it again. */
function learningRunPanel({ onRan }) {
  const out = h("div", { class: "ui-meta", role: "status" });
  const show = (run) => swap(out, run ? t("rules.runLine", { at: run.at ?? t("rules.unknownTime"), found: run.found ?? 0, proposed: run.proposed ?? 0, errors: run.errors ?? 0 }) : t("rules.noRun"));
  const load = async () => {
    try { show((await api("/api/hub/rules/learning-run")).learningRun); } catch (error) { swap(out, t("rules.runReadFailed", { message: error.message })); }
  };
  const run = button({ label: t("rules.runNow"), size: "sm", icon: "bolt", onClick: async () => {
    const data = await api(`/api/hub/rules/learning-run${state.project ? `?project=${encodeURIComponent(state.project)}` : ""}`, { method: "POST" });
    show(data.learningRun);
    toast(t("rules.runRecorded", { found: data.learningRun?.found ?? 0, proposed: data.learningRun?.proposed ?? 0, errors: data.learningRun?.errors ?? 0 }), { tone: "success" });
    onRan?.();
  } });
  load();
  return h("div", { class: "ui-card ui-learning-run" }, h("div", { class: "ui-row" }, h("b", {}, t("rules.learning")), run), out);
}

export function suggestionsView(ctx) {
  const defaults = { limit: 25, status: "pending", q: "", sort: "newest" };
  const list = pagedList({
    defaults, label: t("rules.suggestedRules"),
    fetchPage: (p) => api(`/api/hub/rule-suggestions?${queryString({ limit: p.limit, offset: p.offset, project: state.project, status: p.status, q: p.q, sort: p.sort })}`),
    renderItem: (item, { state: s }) => suggestionCard(item, { changed: (options) => { list.reload(options); ctx.changed?.(); } }, { dismissed: s.status === "dismissed" }),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: (s) => emptyState({ title: s.status === "dismissed" ? t("rules.noDismissedTitle") : t("rules.noSuggestionTitle"), text: s.status === "dismissed" ? t("rules.noDismissedText") : t("rules.noSuggestionText"), art: "rules" }),
    emptyFiltered: () => emptyState({ title: t("rules.noSuggestionMatch"), text: t("rules.tryOther"), art: "search", compact: true }),
    onData: (data, s) => { if (s.status === "pending") ctx.counts?.({ suggestions: data.total }); },
    toolbar: ({ state: s, set }) => filterBar([[
      segmentFilter({ key: "status", label: t("rules.show"), value: s.status, options: [{ value: "pending", label: t("rules.optSuggested") }, { value: "dismissed", label: t("rules.optDismissed") }], onChange: (status) => set({ status }) }),
      textFilter({ key: "q", value: s.q, label: t("rules.filterSuggestions"), placeholder: t("rules.filterSuggestionsPh"), onChange: (q) => set({ q }, { replace: true }) }),
      selectFilter({ key: "sort", label: t("rules.sort"), value: s.sort, options: [{ value: "newest", label: t("rules.sortNewest") }, { value: "confidence", label: t("rules.sortConfident") }, { value: "oldest", label: t("rules.sortOldest") }], onChange: (sort) => set({ sort }) }),
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
      const scope = h("select", { class: "ui-select", "aria-label": t("rules.whereToWrite") }, h("option", { value: "project" }, t("rules.projectFolderOpt")), h("option", { value: "global" }, t("rules.globalOpt")));
      const dir = h("input", { type: "text", class: "ui-input", dir: "ltr", placeholder: "/absolute/path/to/your/project", "aria-label": t("rules.projectFolder") });
      const dirField = field({ label: t("rules.projectFolder"), control: dir });
      scope.addEventListener("change", () => { dirField.hidden = scope.value === "global"; });
      const body = (confirmWrite) => ({ tools: boxes.filter((entry) => entry.input.checked).map((entry) => entry.tool.id), scope: scope.value, projectDir: dir.value, confirm: confirmWrite || undefined });
      const show = (results, wrote) => swap(out, ...results.map((result) => h("div", { class: "ui-card" },
        h("div", { class: "ui-row" }, h("b", {}, result.tool), badge(result.skipped ? t("rules.skipped") : result.written ? t("rules.written") : result.changed ? t("rules.wouldChange") : t("rules.upToDate"), result.written ? "success" : result.changed ? "warning" : "neutral")),
        result.path ? h("div", { class: "ui-meta" }, mono(result.path), result.backup ? h("span", {}, t("rules.backup")) : null, result.backup ? mono(result.backup) : null) : null,
        result.skipped ? h("div", { class: "ui-meta" }, result.skipped) : null,
        result.changed && !wrote ? disclosure({ summary: t("rules.showNew"), content: codeBlock({ code: result.after, lang: "md" }) }) : null)));
      const check = () => { if (!body(false).tools.length) throw new Error(t("rules.tickOne")); if (scope.value === "project" && !dir.value.trim()) throw new Error(t("rules.typePath")); };
      return h("div", { class: "ui-card" },
        h("p", { class: "ui-meta" }, t("rules.syncIntro")),
        h("fieldset", { class: "ui-fieldset" }, h("legend", { class: "ui-field-label" }, t("rules.tools")), h("div", { class: "ui-checks" }, ...boxes.map((entry) => h("label", { class: "ui-check" }, entry.input, h("span", {}, entry.tool.name), entry.tool.installed ? badge(t("rules.detected"), "success") : null)))),
        h("div", { class: "ui-inline" }, field({ label: t("rules.where"), control: scope }), dirField),
        h("div", { class: "ui-acts" },
          button({ label: t("rules.preview"), icon: "search", onClick: async () => { check(); show((await api("/api/hub/rules/preview", { method: "POST", body: body(false) })).results, false); } }),
          button({ label: t("rules.writeFiles"), variant: "primary", icon: "upload", onClick: async () => {
            check();
            const ids = body(false).tools;
            const ok = await confirmDialog({ title: t("rules.writeTitle"), message: t("rules.writeConfirm", { count: ids.length, tools: ids.join(", ") }), confirmLabel: t("rules.writeFiles") });
            if (!ok) return;
            const result = await api("/api/hub/rules/sync", { method: "POST", body: body(true) });
            show(result.results, true);
            toast(t("rules.filesWritten"), { tone: "success" });
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
      const tool = h("select", { class: "ui-select", "aria-label": t("rules.tool") }, ...tools.map((option) => h("option", { value: option.id }, option.name)));
      const dir = h("input", { type: "text", class: "ui-input", dir: "ltr", placeholder: t("rules.importPathPh"), "aria-label": t("rules.projectFolder") });
      return h("div", { class: "ui-card" },
        h("p", { class: "ui-meta" }, t("rules.importIntro")),
        h("div", { class: "ui-inline" }, field({ label: t("rules.tool"), control: tool }), field({ label: t("rules.projectFolder"), control: dir })),
        h("div", { class: "ui-acts" }, button({ label: t("rules.importRules"), variant: "primary", icon: "download", onClick: async () => {
          const result = await api("/api/hub/rules/import", { method: "POST", body: { tool: tool.value, scope: dir.value ? "project" : "global", projectDir: dir.value || undefined } });
          out.textContent = t("rules.importResult", { found: result.found, added: result.added, skipped: result.skipped });
          toast(t("rules.imported", { count: result.added }), { tone: "success" });
          ctx.changed?.();
        } })),
        out);
    },
  });
}
