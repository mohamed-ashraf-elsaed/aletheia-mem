// The Data page of the Connections tab: erase memory with a report first and a typed confirmation, verify an erasure
// receipt, and merge one project into another after a dry-run plan. Both writes are irreversible, so each one is
// locked until a preview has run and then asks for typed words.
import { badge, button, field, modal, mono, skeleton, toast } from "../ui-components.js";
import { api, h, swap } from "../ui-dom.js";
import { region } from "../ui-region.js";

const COUNT_LABELS = [["memories", "Memories"], ["observations", "Observations"], ["episodes", "Episodes"], ["facts", "Facts"], ["summaries", "Summaries"], ["ruleSuggestions", "Rule suggestions"]];
const total = (counts) => ["memories", "observations", "episodes", "facts"].reduce((sum, key) => sum + (counts?.[key] ?? 0), 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function countsTable(rows, label) {
  return h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": label }, h("thead", {}, h("tr", {}, ...rows.head.map((text) => h("th", {}, text)))), h("tbody", {}, ...rows.body.map((cells) => h("tr", {}, ...cells.map((cell) => h("td", {}, String(cell))))))));
}

/** A dialog that only proceeds when the right words were typed. A wrong entry is refused with the words to type. */
function typedConfirm({ title, intro, word, confirmLabel, onConfirm }) {
  const input = h("input", { type: "text", class: "ui-input", dir: "ltr", autocomplete: "off", "aria-label": word === "ERASE" ? "Type ERASE to confirm" : "Type the source project name to confirm" });
  const layer = modal({ title, size: "md", body: [...intro, field({ label: word === "ERASE" ? "Type ERASE to confirm" : "Type the source project name to confirm", control: input, hint: `Type ${word} exactly.` })], initialFocus: () => input, actions: [
    button({ label: "Cancel", onClick: () => layer.close(false) }),
    button({ label: confirmLabel, variant: "danger", onClick: async () => {
      if (input.value.trim() !== word) throw new Error(`Type ${word} to go on.`);
      await onConfirm();
      layer.close(true);
    } }),
  ] });
}

// ---- erasure ---------------------------------------------------------------------------------------------------

function erasureSection() {
  const project = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "Erase: project", placeholder: "demo-blog" });
  const ids = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": "Erase: ids (comma separated)", placeholder: "memory:12, fact:3" });
  const before = h("input", { type: "date", class: "ui-input", "aria-label": "Erase: before (date)" });
  const result = h("div", { class: "ui-stack", role: "status" });
  let selector = null;
  const erase = button({ label: "Erase these rows…", variant: "danger", icon: "trash", disabled: true, onClick: () => confirmErase() });
  const lock = () => { selector = null; erase.disabled = true; };
  for (const el of [project, ids, before]) { el.addEventListener("input", lock); el.addEventListener("change", lock); }

  const read = () => {
    const body = {};
    if (project.value.trim()) body.project = project.value.trim();
    const list = ids.value.split(",").map((item) => item.trim()).filter(Boolean);
    if (list.length) body.ids = list;
    if (before.value) body.before = Date.parse(before.value);
    if (!Object.keys(body).length) throw new Error("Choose a project, some ids or a date to erase.");
    return body;
  };

  const preview = async () => {
    const body = read();
    const { plan } = await api("/api/hub/erasure/report", { method: "POST", body });
    const found = total(plan.counts);
    selector = found ? body : null;
    erase.disabled = !found;
    swap(result, found
      ? h("div", {}, countsTable({ head: ["Kind", "Rows"], body: COUNT_LABELS.map(([key, label]) => [label, plan.counts[key] ?? 0]) }, "Erasure report"), h("p", { class: "ui-meta" }, "Nothing was deleted. This is the report. Erasing writes a pre-erase export first, then a signed receipt."))
      : h("p", { class: "ui-meta" }, "Nothing matches that selection."));
  };

  function confirmErase() {
    if (!selector) return;
    const chosen = selector;
    typedConfirm({
      title: "Erase these rows?", word: "ERASE", confirmLabel: "Erase permanently",
      intro: [
        h("p", { class: "ui-layer-text" }, "This deletes the matching memories, observations, episodes and facts, their search index and vectors, and the matching rows on paired devices. It cannot be undone."),
        h("p", { class: "ui-layer-text" }, "A pre-erase export is written first and a signed receipt after, so you keep proof of what was removed."),
      ],
      onConfirm: async () => {
        const out = await api("/api/hub/erasure/apply", { method: "POST", body: chosen });
        lock();
        if (!out.erased) { swap(result, h("p", { class: "ui-meta" }, out.note ?? "Nothing matched.")); return; }
        toast(`Erased ${plural(total(out.plan.counts), "row")}.`, { tone: "success" });
        swap(result, h("div", { class: "ui-card" },
          h("h3", {}, "Erased"),
          h("div", { class: "ui-meta" }, h("span", {}, "Pre-erase export"), mono(out.exportPath, { copy: false })),
          h("div", { class: "ui-meta" }, h("span", {}, "Receipt file"), mono(out.receiptPath, { copy: false })),
          h("p", { class: "ui-meta" }, "Paste the receipt JSON below to verify it later."),
          mono(JSON.stringify(out.receipt), { copy: true, label: "Copy the receipt JSON" })));
      },
    });
  }

  return h("section", { class: "ui-card ui-stack", "aria-labelledby": "data-erase-h" },
    h("h2", { id: "data-erase-h" }, "Erase memory"),
    h("p", { class: "ui-meta" }, "Remove rows for good: by project, by id, or older than a date. Preview the report first. Erasing is locked until a preview found rows, then asks you to type ERASE."),
    h("div", { class: "ui-inline" }, field({ label: "Project", control: project }), field({ label: "Ids (comma separated)", control: ids }), field({ label: "Older than", control: before })),
    h("div", { class: "ui-acts" }, button({ label: "Preview erasure", icon: "search", onClick: preview }), erase),
    result,
    verifySection());
}

/** verify answers 400 with {ok:false, reason}; read it directly so the reason reaches the page. */
async function verifyReceipt(receipt) {
  const cookie = (globalThis.document?.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("aletheia_csrf="));
  const headers = { "Content-Type": "application/json", ...(cookie ? { "X-CSRF-Token": decodeURIComponent(cookie.slice("aletheia_csrf=".length)) } : {}) };
  const response = await fetch("/api/hub/erasure/verify", { method: "POST", headers, body: JSON.stringify({ receipt }) });
  const data = await response.json().catch(() => ({}));
  if (response.status >= 500 || (!response.ok && data.ok === undefined)) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

function verifySection() {
  const text = h("textarea", { class: "ui-input ui-textarea", rows: "5", dir: "ltr", spellcheck: "false", "aria-label": "Receipt JSON", placeholder: '{"id": "…", "signature": "…"}' });
  const out = h("div", { role: "status" });
  return h("div", { class: "ui-stack" },
    h("h3", {}, "Verify a receipt"),
    h("p", { class: "ui-meta" }, "Checks the signature of an erasure receipt against the local key."),
    field({ label: "Receipt JSON", control: text }),
    h("div", { class: "ui-acts" }, button({ label: "Verify receipt", icon: "check", onClick: async () => {
      if (!text.value.trim()) throw new Error("Paste the receipt JSON first.");
      let receipt;
      try { receipt = JSON.parse(text.value); } catch { throw new Error("That text is not valid JSON."); }
      const answer = await verifyReceipt(receipt);
      swap(out, answer.ok ? h("p", {}, badge("valid", "success"), " The receipt is genuine: its signature matches.") : h("p", {}, badge("invalid", "danger"), ` The receipt does not verify: ${answer.reason ?? "unknown reason"}.`));
    } })),
    out);
}

// ---- project merge ---------------------------------------------------------------------------------------------

function mergeSection() {
  let projects = [];
  let planned = null;
  const from = h("select", { class: "ui-select", "aria-label": "Merge from" });
  const into = h("select", { class: "ui-select", "aria-label": "Merge into" });
  const result = h("div", { role: "status" });
  const merge = button({ label: "Merge these projects…", variant: "danger", icon: "refresh", disabled: true, onClick: () => confirmMerge() });
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
    if (!from.value || !into.value || from.value === into.value) throw new Error("Pick two different projects.");
    const plan = await api(`/api/hub/projects/merge-plan?from=${encodeURIComponent(from.value)}&into=${encodeURIComponent(into.value)}`);
    planned = { from: plan.from, into: plan.into };
    merge.disabled = false;
    swap(result, h("div", {},
      h("p", {}, `${plan.moved} ${plan.moved === 1 ? "row moves" : "rows move"}; ${plan.dropped} ${plan.dropped === 1 ? "duplicate is" : "duplicates are"} dropped. Nothing was changed.`),
      Object.keys(plan.tables).length ? countsTable({ head: ["Table", "Moved", "Dropped"], body: Object.entries(plan.tables).map(([table, c]) => [table, c.moved, c.dropped]) }, "Merge plan") : h("p", { class: "ui-meta" }, "Neither project has rows in a project table.")));
  };

  function confirmMerge() {
    if (!planned) return;
    const { from: source, into: target } = planned;
    typedConfirm({
      title: `Merge ${source} into ${target}?`, word: source, confirmLabel: "Merge projects",
      intro: [h("p", { class: "ui-layer-text" }, `Every row of ${source} moves to ${target}, and rows ${target} already has are dropped. This cannot be undone and ${source} stops existing as a project. One audit entry records the counts.`)],
      onConfirm: async () => {
        const out = await api("/api/hub/projects/merge", { method: "POST", body: { from: source, into: target } });
        toast(`Merged ${source} into ${target}: ${plural(out.moved, "row")} moved, ${plural(out.dropped, "duplicate")} dropped.`, { tone: "success" });
        swap(result, h("p", { class: "ui-meta" }, `${source} is merged into ${target}.`));
        await reload();
      },
    });
  }

  const holder = region({
    load: async () => (await api("/api/hub/projects")).projects,
    skeleton: () => skeleton({ kind: "lines", count: 1, lines: 2 }),
    isEmpty: () => false,
    errorTitle: "Could not read the projects",
    render: (rows) => { fill(rows); return h("div", { class: "ui-inline" }, field({ label: "Merge this project", control: from }), field({ label: "into", control: into })); },
  });
  return h("section", { class: "ui-card ui-stack", "aria-labelledby": "data-merge-h" },
    h("h2", { id: "data-merge-h" }, "Merge two projects"),
    h("p", { class: "ui-meta" }, "Fold a duplicate or worktree project into the main one. Preview the plan first: it lists how many rows move and how many duplicates are dropped, per table. Merging then asks you to type the source project's name."),
    holder,
    h("div", { class: "ui-acts" }, button({ label: "Preview merge", icon: "search", onClick: preview }), merge),
    result);
}

export function dataView() {
  return h("div", {}, h("p", { class: "ui-meta" }, "Two irreversible tools live here. Each one shows what it would do before it does it."), erasureSection(), mergeSection());
}
