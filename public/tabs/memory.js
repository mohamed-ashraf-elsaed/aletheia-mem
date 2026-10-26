// T-135: the Memory tab. Memories, facts (current/history), search channels, dismissed rows and import/export.
import { channelLines, factView, formatWhen, searchReasonText } from "../ui-core.js";
import { activityDetails, api, chip, errorCard, errorText, h, qs, run, settledValue, state, swap, toast } from "../ui-dom.js";

async function dismiss(type, id, what) {
  if (!confirm(`Hide this ${what} from search and context? It is not deleted, and Dismissed below can restore it.`)) return;
  const result = await run(() => api("/api/hub/dismiss", { method: "POST", body: { type, id } }), "Hidden");
  if (result) await renderMemory();
}

export async function renderMemory() {
  const root = document.getElementById("ui-memory");
  const project = state.project;
  const query = state.query;
  const p = qs(project);
  const memoryUrl = `/api/hub/memories?limit=30&offset=0${p ? `&${p}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const results = await Promise.allSettled([
    api("/api/hub/overview"),
    api(memoryUrl),
    api(`/api/hub/facts?limit=100&history=${state.factsHistory ? 1 : 0}${p ? `&${p}` : ""}`),
    api(`/api/hub/review?status=pending${p ? `&${p}` : ""}`),
    api("/api/hub/dismissed"),
    query ? api("/v1/search", { method: "POST", body: { query, project: project || undefined, limit: 5 } }) : Promise.resolve(null),
  ]);
  const overview = settledValue(results[0], null);
  const memories = settledValue(results[1], null);
  const facts = settledValue(results[2], null);
  const review = settledValue(results[3], null);
  const dismissed = settledValue(results[4], null);
  const search = settledValue(results[5], null);

  const memoryList = memories
    ? h("div", {}, ...(memories.items.length ? memories.items.map(memoryCard) : [h("div", { class: "ui-empty" }, "No memories match.")]),
      h("div", { class: "ui-meta" }, `${memories.items.length} of ${memories.total}`))
    : errorCard(errorText(results[1], "Memories"));

  const factList = facts
    ? h("div", {}, ...(facts.items.length ? facts.items.map(factCard) : [h("div", { class: "ui-empty" }, state.factsHistory ? "No fact history." : "No current fact.")]),
      h("div", { class: "ui-meta" }, `${facts.items.length} of ${facts.total}`))
    : errorCard(errorText(results[2], "Facts"));

  swap(root,
    h("h1", {}, "Memory"),
    h("p", { class: "ui-meta" }, "One store every tool reads. Facts first, raw memories after."),
    overview ? statsCard({ ...overview.stats, facts: facts?.total ?? overview.stats.facts }) : errorCard(errorText(results[0], "Overview")),
    search ? searchPanel(search) : null,
    h("h2", {}, "Memories"),
    newNoteForm(),
    memoryList,
    h("h2", {}, "Facts"),
    h("div", { class: "ui-row" },
      h("button", { class: "primary", "aria-pressed": String(!state.factsHistory), onclick: () => { state.factsHistory = false; renderMemory(); } }, "Current"),
      h("button", { "aria-pressed": String(state.factsHistory), onclick: () => { state.factsHistory = true; renderMemory(); } }, "History")),
    factList,
    h("h2", {}, "Review queue"),
    h("div", { class: "ui-empty" }, "The review queue is added in T-136."),
    h("h2", {}, "Dismissed"),
    dismissedPanel(dismissed, results[4]),
    importExport(overview),
    activityDetails());
}

function statsCard(stats) {
  const rows = [
    ["Memories", stats.total],
    ["Pinned", stats.pinned],
    ["Facts", stats.facts ?? "—"],
    ["Rules on", stats.rules],
    ["Projects", stats.projects],
  ];
  return h("div", { class: "ui-grid" }, ...rows.map(([label, value]) => h("div", { class: "ui-card ui-stat" }, h("b", {}, value ?? "—"), h("span", {}, label))));
}

function searchPanel(data) {
  const lines = channelLines(data.channels);
  const facts = (data.facts ?? []).map((fact) => {
    const view = factView({ ...fact, source: fact.source });
    return h("div", { class: "ui-card" }, h("b", {}, view.text), h("div", { class: "ui-meta" }, chip("fact"), h("span", {}, `episode #${view.sourceEpisode ?? "—"}`), h("span", {}, `status ${view.status}`)));
  });
  const memories = (data.results ?? []).map((memory) =>
    h("div", { class: "ui-card" }, h("b", {}, memory.title || "(untitled)"), h("div", { class: "ui-meta" }, chip(memory.kind), chip(memory.type), h("span", {}, memory.project), h("span", {}, memory.tool), h("span", {}, `#${memory.id}`))));
  const empty = !facts.length && !memories.length ? h("div", { class: "ui-empty" }, searchReasonText(data.reason) || "No matches.") : null;
  return h("section", { class: "ui-card" },
    h("b", {}, `Search: ${state.query}`),
    h("div", { class: "ui-meta" }, lines.length ? lines.map((line) => chip(line)) : chip("no channel reported")),
    data.channels?.note ? h("p", { class: "ui-meta" }, data.channels.note) : null,
    empty,
    facts.length ? h("h2", {}, "Facts") : null,
    ...facts,
    memories.length ? h("h2", {}, "Memories") : null,
    ...memories);
}

function memoryCard(memory) {
  const el = h("div", { class: "ui-card" });
  const view = () => swap(el,
    h("div", { class: "ui-row" }, h("b", {}, memory.title || "(untitled)"), memory.pinned ? chip("pinned", "ok") : null),
    h("div", { class: "ui-meta" }, chip(memory.kind), chip(memory.type), h("span", {}, memory.project), h("span", {}, memory.tool), h("span", {}, formatWhen(memory.created_at_epoch)), h("span", {}, `#${memory.id}`)),
    memory.narrative ? h("p", { class: "ui-fact-text" }, memory.narrative.length > 800 ? `${memory.narrative.slice(0, 800)}…` : memory.narrative) : null,
    memory.files?.length ? h("div", { class: "ui-meta" }, "Files: ", memory.files.slice(0, 6).join(", ")) : null,
    h("div", { class: "ui-acts" },
      h("button", {
        onclick: () => run(async () => {
          Object.assign(memory, await api(`/api/hub/memories/${memory.id}`, { method: "PATCH", body: { pinned: !memory.pinned } }));
          view();
        }),
      }, memory.pinned ? "Unpin" : "Pin"),
      h("button", { onclick: edit }, "Edit"),
      h("button", { onclick: () => dismiss("memory", memory.id, "memory") }, "Dismiss")));
  const edit = () => {
    const title = h("input", { type: "text", value: memory.title, "aria-label": "Title" });
    const text = h("textarea", { "aria-label": "Text" });
    text.value = memory.narrative ?? "";
    const type = h("select", { "aria-label": "Type" }, ...["bugfix", "feature", "refactor", "change", "discovery", "decision", "gotcha", "note"].map((value) => h("option", { value, selected: memory.type === value }, value)));
    const project = h("input", { type: "text", value: memory.project, "aria-label": "Project" });
    swap(el,
      h("label", {}, "Title", title),
      h("label", {}, "Text", text),
      h("div", { class: "ui-inline" }, h("label", {}, "Type", type), h("label", {}, "Project", project)),
      h("div", { class: "ui-acts" },
        h("button", { class: "primary", onclick: () => run(async () => {
          Object.assign(memory, await api(`/api/hub/memories/${memory.id}`, { method: "PATCH", body: { title: title.value, narrative: text.value, type: type.value, project: project.value } }));
          toast("Saved");
          view();
        }) }, "Save"),
        h("button", { onclick: view }, "Cancel")));
  };
  view();
  return el;
}

function newNoteForm() {
  const title = h("input", { type: "text", placeholder: "Title (optional)", "aria-label": "Title" });
  const text = h("textarea", { placeholder: "What should every tool remember?", "aria-label": "Text" });
  const project = h("input", { type: "text", placeholder: "project", value: state.project, "aria-label": "Project" });
  const type = h("select", { "aria-label": "Type" }, ...["note", "decision", "gotcha", "bugfix", "feature", "discovery"].map((value) => h("option", { value }, value)));
  return h("details", { class: "ui-card" },
    h("summary", {}, "New note"),
    h("label", {}, "Title", title),
    h("label", {}, "Text", text),
    h("div", { class: "ui-inline" }, h("label", {}, "Project", project), h("label", {}, "Type", type)),
    h("div", { class: "ui-acts" }, h("button", { class: "primary", onclick: () => run(async () => {
      await api("/api/hub/memories", { method: "POST", body: { title: title.value, text: text.value, project: project.value || "default", type: type.value } });
      title.value = "";
      text.value = "";
      toast("Saved");
      await renderMemory();
    }) }, "Save")));
}

function factCard(fact) {
  const view = factView(fact);
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, h("b", { class: "ui-fact-text" }, view.text), chip(view.status, view.status === "active" ? "ok" : "warn")),
    h("div", { class: "ui-meta" },
      chip(`scope: ${view.scope}`),
      chip(`extractor: ${view.extractorMode}`),
      h("span", {}, `importance ${view.importanceLabel}`),
      h("span", {}, `valid_at ${view.validAt}`),
      h("span", {}, `#${view.id}`)),
    h("div", { class: "ui-fact-source" }, view.sourceEpisode ? `source: episode #${view.sourceEpisode}${view.sourceRef ? ` (${view.sourceRef})` : ""}` : "source: no episode"),
    view.sourceText ? h("details", { class: "ui-details" }, h("summary", {}, "Show source text"), h("div", { class: "ui-fact-source" }, view.sourceText)) : null,
    h("div", { class: "ui-acts" }, h("button", { onclick: () => dismiss("fact", view.id, "fact") }, "Dismiss")));
}

function dismissedPanel(dismissed, result) {
  if (!dismissed) return errorCard(errorText(result, "Dismissed items"));
  if (!dismissed.items.length) return h("div", { class: "ui-empty" }, "Nothing is dismissed.");
  return h("div", {}, ...dismissed.items.map((item) => h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, chip(item.item_type), h("b", {}, `#${item.item_id}`), h("span", { class: "ui-meta" }, formatWhen(item.at_epoch))),
    item.reason ? h("div", { class: "ui-meta" }, item.reason) : null,
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      await api("/api/hub/restore", { method: "POST", body: { type: item.item_type, id: item.item_id } });
      toast("Restored");
      await renderMemory();
    }) }, "Restore")))));
}

function importExport(overview) {
  const file = h("input", { type: "file", accept: ".jsonl,.ndjson", "aria-label": "Bundle file" });
  const bundleOut = h("div", { class: "ui-meta" });
  const claudePath = h("input", { type: "text", value: overview?.claudeMem?.path ?? "", "aria-label": "claude-mem database path" });
  const compressButton = h("button", { disabled: !overview || overview.provider === "none", onclick: () => run(async () => {
    const result = await api("/api/hub/compress", { method: "POST", body: {} });
    bundleOut.textContent = JSON.stringify(result);
  }) }, "Compress now");
  return h("details", { class: "ui-card" },
    h("summary", {}, "Import and export"),
    h("div", { class: "ui-row" },
      h("a", { href: "/api/hub/export?format=jsonl" }, "Export bundle (.jsonl)"),
      h("a", { href: "/api/hub/export?format=markdown" }, "Export Markdown")),
    h("label", {}, "Import a bundle", file),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const chosen = file.files?.[0];
      if (!chosen) return toast("Choose a file first");
      const result = await api("/api/hub/import/bundle", { method: "POST", body: { bundle: await chosen.text() } });
      bundleOut.textContent = `memories: ${result.memories.added} added, ${result.memories.skipped} skipped; rules: ${result.rules.added} added`;
      toast("Imported");
      await renderMemory();
    }) }, "Import bundle")),
    h("label", {}, "Import from claude-mem (read-only on that database)", claudePath),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const result = await api("/api/hub/import/claude-mem", { method: "POST", body: { path: claudePath.value } });
      bundleOut.textContent = JSON.stringify(result);
      toast("Imported");
      await renderMemory();
    }) }, "Import claude-mem")),
    h("label", {}, overview?.provider === "none" ? "Turn raw events into observations (needs a provider)" : `Turn raw events into observations (${overview?.provider})`),
    h("div", { class: "ui-acts" }, compressButton),
    bundleOut);
}
