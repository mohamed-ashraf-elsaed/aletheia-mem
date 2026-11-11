// The Data page of the Connections tab: erase memory with a report first and a typed confirmation, verify an erasure
// receipt, and merge one project into another after a dry-run plan. Both writes are irreversible, so each one is
// locked until a preview has run and then asks for typed words.
import { badge, button, copyText, field, modal, mono, skeleton, toast } from "../ui-components.js";
import { api, h, swap } from "../ui-dom.js";
import { region } from "../ui-region.js";
import { t } from "../ui-i18n.js";

const countLabels = () => [["memories", t("tools.kindMemories")], ["observations", t("tools.kindObservations")], ["episodes", t("tools.kindEpisodes")], ["facts", t("tools.kindFacts")], ["summaries", t("tools.kindSummaries")], ["ruleSuggestions", t("tools.kindRuleSuggestions")]];
const total = (counts) => ["memories", "observations", "episodes", "facts"].reduce((sum, key) => sum + (counts?.[key] ?? 0), 0);

function countsTable(rows, label) {
  return h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": label }, h("thead", {}, h("tr", {}, ...rows.head.map((text) => h("th", {}, text)))), h("tbody", {}, ...rows.body.map((cells) => h("tr", {}, ...cells.map((cell) => h("td", {}, String(cell))))))));
}

/** A dialog that only proceeds when the right words were typed. A wrong entry is refused with the words to type. */
function typedConfirm({ title, intro, word, confirmLabel, onConfirm }) {
  const confirmPrompt = word === "ERASE" ? t("tools.typeErase") : t("tools.typeSource");
  const input = h("input", { type: "text", class: "ui-input", dir: "ltr", autocomplete: "off", "aria-label": confirmPrompt });
  const layer = modal({ title, size: "md", body: [...intro, field({ label: confirmPrompt, control: input, hint: t("tools.typeExactly", { word }) })], initialFocus: () => input, actions: [
    button({ label: t("tools.cancel"), onClick: () => layer.close(false) }),
    button({ label: confirmLabel, variant: "danger", onClick: async () => {
      if (input.value.trim() !== word) throw new Error(t("tools.typeToGoOn", { word }));
      await onConfirm();
      layer.close(true);
    } }),
  ] });
}

// ---- erasure ---------------------------------------------------------------------------------------------------

function erasureSection() {
  const project = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": t("tools.eraseProject"), placeholder: "demo-blog" });
  const ids = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": t("tools.eraseIds"), placeholder: "memory:12, fact:3" });
  const before = h("input", { type: "date", class: "ui-input", "aria-label": t("tools.eraseBefore") });
  const result = h("div", { class: "ui-stack", role: "status" });
  let selector = null;
  const verify = verifySection();
  const erase = button({ label: t("tools.eraseButton"), variant: "danger", icon: "trash", disabled: true, onClick: () => confirmErase() });
  const lock = () => { selector = null; erase.disabled = true; };
  for (const el of [project, ids, before]) { el.addEventListener("input", lock); el.addEventListener("change", lock); }

  const read = () => {
    const body = {};
    if (project.value.trim()) body.project = project.value.trim();
    const list = ids.value.split(",").map((item) => item.trim()).filter(Boolean);
    if (list.length) body.ids = list;
    if (before.value) body.before = Date.parse(before.value);
    if (!Object.keys(body).length) throw new Error(t("tools.eraseChoose"));
    return body;
  };

  const preview = async () => {
    const body = read();
    const { plan } = await api("/api/hub/erasure/report", { method: "POST", body });
    const found = total(plan.counts);
    selector = found ? body : null;
    erase.disabled = !found;
    swap(result, found
      ? h("div", {}, countsTable({ head: [t("tools.thKind"), t("tools.thRows")], body: countLabels().map(([key, label]) => [label, plan.counts[key] ?? 0]) }, t("tools.erasureReport")), h("p", { class: "ui-meta" }, t("tools.reportNote")))
      : h("p", { class: "ui-meta" }, t("tools.noMatchSelection")));
  };

  function confirmErase() {
    if (!selector) return;
    const chosen = selector;
    typedConfirm({
      title: t("tools.eraseTitle"), word: "ERASE", confirmLabel: t("tools.erasePermanently"),
      intro: [
        h("p", { class: "ui-layer-text" }, t("tools.eraseWarn")),
        h("p", { class: "ui-layer-text" }, t("tools.eraseProof")),
      ],
      onConfirm: async () => {
        const out = await api("/api/hub/erasure/apply", { method: "POST", body: chosen });
        lock();
        if (!out.erased) { swap(result, h("p", { class: "ui-meta" }, out.note ?? t("tools.nothingMatched"))); return; }
        toast(t("tools.erasedRows", { count: total(out.plan.counts) }), { tone: "success" });
        swap(result, h("div", { class: "ui-card" },
          h("h3", {}, t("tools.erased")),
          h("div", { class: "ui-meta" }, h("span", {}, t("tools.preErase")), mono(out.exportPath, { copy: false })),
          h("div", { class: "ui-meta" }, h("span", {}, t("tools.receiptFile")), mono(out.receiptPath, { copy: false })),
          h("p", { class: "ui-meta" }, t("tools.keepReceipt")),
          h("div", { class: "ui-acts" },
            button({ label: t("tools.verifyThis"), size: "sm", icon: "check", onClick: () => verify.fill(JSON.stringify(out.receipt)) }),
            button({ label: t("tools.copyReceipt"), size: "sm", icon: "copy", onClick: () => copyText(JSON.stringify(out.receipt)) }))));
      },
    });
  }

  return h("section", { class: "ui-card ui-stack", "aria-labelledby": "data-erase-h" },
    h("h2", { id: "data-erase-h" }, t("tools.eraseHeading")),
    h("p", { class: "ui-meta" }, t("tools.eraseIntro")),
    h("div", { class: "ui-inline" }, field({ label: t("tools.fieldProject"), control: project }), field({ label: t("tools.fieldIds"), control: ids }), field({ label: t("tools.fieldOlder"), control: before })),
    h("div", { class: "ui-acts" }, button({ label: t("tools.previewErase"), icon: "search", onClick: preview }), erase),
    result,
    verify.node);
}

/** verify answers 400 with {ok:false, reason}; read it directly so the reason reaches the page. */
async function verifyReceipt(receipt) {
  const cookie = (globalThis.document?.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("aletheia_csrf="));
  const headers = { "Content-Type": "application/json", ...(cookie ? { "X-CSRF-Token": decodeURIComponent(cookie.slice("aletheia_csrf=".length)) } : {}) };
  const response = await fetch("/api/hub/erasure/verify", { method: "POST", headers, body: JSON.stringify({ receipt }) });
  const data = await response.json().catch(() => ({}));
  if (response.status >= 500 || (!response.ok && data.ok === undefined)) throw new Error(data.error ?? t("tools.requestFailed", { status: response.status }));
  return data;
}

function verifySection() {
  const text = h("textarea", { class: "ui-input ui-textarea", rows: "5", dir: "ltr", spellcheck: "false", "aria-label": t("tools.receiptJson"), placeholder: '{"id": "…", "signature": "…"}' });
  const out = h("div", { role: "status" });
  const node = h("div", { class: "ui-stack" },
    h("h3", {}, t("tools.verifyHeading")),
    h("p", { class: "ui-meta" }, t("tools.verifyIntro")),
    field({ label: t("tools.receiptJson"), control: text }),
    h("div", { class: "ui-acts" }, button({ label: t("tools.verifyReceipt"), icon: "check", onClick: async () => {
      if (!text.value.trim()) throw new Error(t("tools.pasteFirst"));
      let receipt;
      try { receipt = JSON.parse(text.value); } catch { throw new Error(t("tools.notJson")); }
      const answer = await verifyReceipt(receipt);
      swap(out, answer.ok ? h("p", {}, badge(t("tools.valid"), "success"), " " + t("tools.receiptGenuine")) : h("p", {}, badge(t("tools.invalid"), "danger"), " " + t("tools.receiptInvalid", { reason: answer.reason ?? t("tools.unknownReason") })));
    } })),
    out);
  return { node, fill: (value) => { text.value = value; text.scrollIntoView?.({ block: "center" }); text.focus?.(); } };
}

// ---- project merge ---------------------------------------------------------------------------------------------

function mergeSection() {
  let projects = [];
  let planned = null;
  const from = h("select", { class: "ui-select", "aria-label": t("tools.mergeFrom") });
  const into = h("select", { class: "ui-select", "aria-label": t("tools.mergeInto") });
  const result = h("div", { role: "status" });
  const merge = button({ label: t("tools.mergeButton"), variant: "danger", icon: "refresh", disabled: true, onClick: () => confirmMerge() });
  const lock = () => { planned = null; merge.disabled = true; };
  for (const el of [from, into]) { el.addEventListener("change", lock); el.addEventListener("input", lock); }
  const fill = (rows) => {
    projects = rows;
    for (const select of [from, into]) select.replaceChildren(...rows.map((row) => h("option", { value: row.name }, `${row.name} (${row.memories})`)));
    if (rows[1]) into.value = rows[1].name;
    lock();
  };
  const reload = async () => fill((await api("/api/hub/projects")).projects);

  const preview = async () => {
    if (!from.value || !into.value || from.value === into.value) throw new Error(t("tools.pickTwo"));
    const plan = await api(`/api/hub/projects/merge-plan?from=${encodeURIComponent(from.value)}&into=${encodeURIComponent(into.value)}`);
    planned = { from: plan.from, into: plan.into };
    merge.disabled = false;
    swap(result, h("div", {},
      h("p", {}, t("tools.mergePlan", { moved: t("tools.planMoved", { count: plan.moved }), dropped: t("tools.planDropped", { count: plan.dropped }) })),
      Object.keys(plan.tables).length ? countsTable({ head: [t("tools.thTable"), t("tools.thMoved"), t("tools.thDropped")], body: Object.entries(plan.tables).map(([table, c]) => [table, c.moved, c.dropped]) }, t("tools.mergePlanLabel")) : h("p", { class: "ui-meta" }, t("tools.noRowsInTables"))));
  };

  function confirmMerge() {
    if (!planned) return;
    const { from: source, into: target } = planned;
    typedConfirm({
      title: t("tools.mergeTitle", { source, target }), word: source, confirmLabel: t("tools.mergeProjects"),
      intro: [h("p", { class: "ui-layer-text" }, t("tools.mergeWarn", { source, target }))],
      onConfirm: async () => {
        const out = await api("/api/hub/projects/merge", { method: "POST", body: { from: source, into: target } });
        toast(t("tools.mergedToast", { source, target, moved: t("tools.toastMoved", { count: out.moved }), dropped: t("tools.toastDropped", { count: out.dropped }) }), { tone: "success" });
        swap(result, h("p", { class: "ui-meta" }, t("tools.mergedNote", { source, target })));
        await reload();
      },
    });
  }

  const holder = region({
    load: async () => (await api("/api/hub/projects")).projects,
    skeleton: () => skeleton({ kind: "lines", count: 1, lines: 2 }),
    isEmpty: () => false,
    errorTitle: t("tools.errProjects"),
    render: (rows) => { fill(rows); return h("div", { class: "ui-inline" }, field({ label: t("tools.mergeThis"), control: from }), field({ label: t("tools.into"), control: into })); },
  });
  return h("section", { class: "ui-card ui-stack", "aria-labelledby": "data-merge-h" },
    h("h2", { id: "data-merge-h" }, t("tools.mergeHeading")),
    h("p", { class: "ui-meta" }, t("tools.mergeIntro")),
    holder,
    h("div", { class: "ui-acts" }, button({ label: t("tools.previewMerge"), icon: "search", onClick: preview }), merge),
    result);
}

export function dataView() {
  return h("div", {}, h("p", { class: "ui-meta" }, t("tools.dataIntro")), erasureSection(), mergeSection());
}
