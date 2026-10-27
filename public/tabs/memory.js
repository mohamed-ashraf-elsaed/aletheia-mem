// T-135, T-136, T-208: the Memory tab. One frame (title, counts, page links, New note, Import and export) and the
// pages inside it: memories, facts, review, dismissed and search. The review queue is in ./review.js. The import
// panel keeps the form that imports from the older claude-mem database (opened read-only).
import { badge, button, drawer, emptyState, errorState, field, modal, progressBar, skeleton, statTile, tabs, toast } from "../ui-components.js";
import { SUBVIEWS } from "../ui-core.js";
import { api, byId, h, state, swap } from "../ui-dom.js";
import { withProgress } from "../ui-actions.js";
import { region } from "../ui-region.js";
import { openFactDetail, openMemoryDetail } from "../ui-detail.js";
import { GUIDE_HIDDEN_KEY, firstRunGuide, guideHidden, storeIsEmpty } from "../ui-guide.js";
import { TYPE_OPTIONS } from "../ui-views.js";
import { dismissedView, factsView, memoriesView, queryString, searchView } from "./memory-views.js";
import { reviewView } from "./review.js";

let frame = null;

/** Build the frame once per project; later route changes only swap the page inside it. */
function buildFrame() {
  const el = h("div", { class: "ui-memory-frame" });
  const content = h("div", { class: "ui-memory-content" });
  let currentView = null;
  const data = { overview: null, counts: {} };

  const loadStats = async () => {
    const p = state.project ? { project: state.project } : {};
    const [overview, review, dismissed, memories, facts] = await Promise.all([
      api("/api/hub/overview"),
      api(`/api/hub/review?${queryString({ status: "pending", limit: 1, ...p })}`),
      api(`/api/hub/dismissed?${queryString({ limit: 1, ...p })}`),
      state.project ? api(`/api/hub/memories?${queryString({ limit: 1, ...p })}`) : Promise.resolve(null),
      api(`/api/hub/facts?${queryString({ limit: 1, ...p })}`),
    ]);
    return { overview, review, dismissed, memories: memories?.total ?? overview.stats.total, facts: facts.total, pinned: overview.stats.pinned };
  };

  // The first-run guide shows while nothing has been captured, and goes away by itself once something arrives.
  const guideSlot = h("div", { class: "ui-guide-slot" });
  let guide = null;
  const syncGuide = async (d) => {
    const empty = storeIsEmpty({ stats: d.overview.stats, facts: d.facts });
    if (!empty || guideHidden()) { guide?.dispose(); guide = null; swap(guideSlot); return; }
    if (guide) return;
    let tools = [];
    try { tools = (await api("/api/hub/doctor")).tools; } catch { /* the guide still shows its commands */ }
    if (guide) return;
    guide = firstRunGuide({
      tools,
      onHide: () => { try { globalThis.localStorage.setItem(GUIDE_HIDDEN_KEY, "1"); } catch { /* storage blocked */ } guide?.dispose(); guide = null; swap(guideSlot); },
      onArrived: () => { guide?.dispose(); guide = null; swap(guideSlot); stats.reload({ soft: true }); currentView?.reload?.() ?? currentView?.list?.reload?.(); },
    });
    swap(guideSlot, guide);
  };

  const stats = region({
    className: "ui-stats-region",
    load: loadStats,
    skeleton: () => skeleton({ kind: "stat", count: 5 }),
    isEmpty: () => false,
    errorTitle: "Could not load the counts",
    render: (d) => {
      data.overview = d.overview;
      syncGuide(d);
      data.counts = { memories: d.memories, facts: d.facts, review: d.review.total, dismissed: d.dismissed.total };
      subnav.setCount("review", d.review.total);
      subnav.setCount("dismissed", d.dismissed.total);
      return h("div", { class: "ui-grid ui-stat-grid" },
        statTile({ label: "Memories", value: d.memories, href: "#/memory/memories" }),
        statTile({ label: "Facts", value: d.facts, href: "#/memory/facts" }),
        statTile({ label: "Pinned", value: d.pinned, href: "#/memory/memories?pinned=1" }),
        statTile({ label: "To review", value: d.review.total, href: "#/memory/review", tone: d.review.total ? "warning" : null }),
        statTile({ label: "Hidden", value: d.dismissed.total, href: "#/memory/dismissed" }));
    },
  });

  const subnav = tabs({
    label: "Memory pages", className: "ui-subnav-tabs",
    items: SUBVIEWS.memory.map((item) => ({ id: item.id, label: item.label, href: `#/memory/${item.id}`, count: item.id === "review" || item.id === "dismissed" ? 0 : undefined })),
    active: "memories",
  });

  const ctx = {
    changed: (list, options) => { list?.reload?.({ soft: true, ...options }); stats.reload({ soft: true }); },
    counts: () => {},
    openMemory: (memory) => openMemoryDetail({ id: memory.id, title: memory.title }),
    openFact: (fact) => openFactDetail(fact),
    newNote: () => newNote(),
    importExport: () => importExport(data),
  };

  function newNote() {
    const title = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "Title", placeholder: "A short title (optional)" });
    const text = h("textarea", { class: "ui-input", dir: "auto", "aria-label": "Text", rows: "8", placeholder: "What should every tool remember? Markdown works." });
    const project = h("input", { type: "text", class: "ui-input", value: state.project || "default", "aria-label": "Project" });
    const type = h("select", { class: "ui-select", "aria-label": "Type" }, ...TYPE_OPTIONS.map((value) => h("option", { value, selected: value === "note" }, value)));
    const layer = modal({
      title: "New note", size: "md",
      body: h("div", {}, field({ label: "Title", control: title }), field({ label: "Text", control: text }), h("div", { class: "ui-inline" }, field({ label: "Project", control: project }), field({ label: "Type", control: type }))),
      actions: [
        button({ label: "Cancel", onClick: () => layer.close(false) }),
        button({ label: "Save note", variant: "primary", onClick: async () => {
          if (!title.value.trim() && !text.value.trim()) throw new Error("Write a title or some text first.");
          await api("/api/hub/memories", { method: "POST", body: { title: title.value, text: text.value, project: project.value || "default", type: type.value } });
          toast("Note saved", { tone: "success", duration: 2000 });
          layer.close(true);
          ctx.changed(currentView?.list ?? currentView);
        } }),
      ],
    });
  }

  swap(el,
    h("div", { class: "ui-page-head" },
      h("div", {}, h("h1", { id: "ui-memory-title", tabindex: "-1" }, "Memory"), h("p", { class: "ui-page-lede" }, "One store every tool reads. Facts first, raw memories after.")),
      h("div", { class: "ui-row" }, button({ label: "Import and export", icon: "download", onClick: () => importExport(data) }), button({ label: "New note", variant: "primary", icon: "plus", onClick: () => newNote() }))),
    guideSlot,
    stats,
    h("div", { class: "ui-subnav" }, subnav),
    content);

  function show(route) {
    subnav.setActive(route.sub);
    currentView?.dispose?.();
    const make = { memories: memoriesView, facts: factsView, review: reviewView, dismissed: dismissedView, search: searchView }[route.sub] ?? memoriesView;
    currentView = make(ctx, route);
    ctx.counts = (next) => {
      if (next.memories != null && !state.project) subnav.setCount?.("memories", next.memories);
    };
    const pageLabel = SUBVIEWS.memory.find((item) => item.id === route.sub)?.label ?? "Memories";
    swap(content, h("div", { class: "ui-memory-page", role: "region", "aria-label": pageLabel }, h("h2", { class: "ui-sr" }, pageLabel), currentView));
  }
  return { el, show, project: state.project, stats };
}

/** The import and export panel. Long calls show a progress bar and never block the page. */
function importExport(data) {
  const overview = data.overview;
  const out = h("div", { class: "ui-longtask-slot" });
  const file = h("input", { type: "file", accept: ".jsonl,.ndjson", class: "ui-input", "aria-label": "Bundle file" });
  const oldPath = h("input", { type: "text", class: "ui-input", value: overview?.claudeMem?.path ?? "", "aria-label": "Path of the older database", dir: "ltr" });
  const claudeMemExists = overview?.claudeMem?.exists === true;
  const canCompress = overview && overview.provider !== "none";
  const body = h("div", { class: "ui-io" },
    h("section", {}, h("h3", { class: "ui-detail-h" }, "Export"), h("p", { class: "ui-meta" }, "A bundle moves your memories and rules to another machine or tool. Secrets are already redacted."),
      h("div", { class: "ui-row" }, button({ label: "Export bundle (.jsonl)", icon: "download", href: "/api/hub/export?format=jsonl" }), button({ label: "Export Markdown", icon: "download", href: "/api/hub/export?format=markdown" }))),
    h("section", {}, h("h3", { class: "ui-detail-h" }, "Import a bundle"), field({ label: "A .jsonl file made by Export", control: file }),
      h("div", { class: "ui-acts" }, button({ label: "Import bundle", icon: "upload", variant: "primary", onClick: async () => {
        const chosen = file.files?.[0];
        if (!chosen) throw new Error("Choose a file first.");
        const result = await withProgress(out, { label: `Importing ${chosen.name}`, task: async () => api("/api/hub/import/bundle", { method: "POST", body: { bundle: await chosen.text() } }), summarize: (r) => `${r.memories.added} memories added, ${r.memories.skipped} skipped; ${r.rules.added} rules added` });
        toast("Import finished", { tone: "success" });
        frame?.stats.reload({ soft: true });
        return result;
      } }))),
    claudeMemExists ? h("section", {}, h("h3", { class: "ui-detail-h" }, "Import from claude-mem"), h("p", { class: "ui-meta" }, "Reads the older memory database. It is opened read-only and never changed."), field({ label: "Database path", control: oldPath }),
      h("div", { class: "ui-acts" }, button({ label: "Import from claude-mem", icon: "upload", onClick: async () => {
        await withProgress(out, { label: "Importing from claude-mem", task: () => api("/api/hub/import/claude-mem", { method: "POST", body: { path: oldPath.value } }), summarize: (r) => Object.entries(r).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(", ") || "Done" });
        toast("Import finished", { tone: "success" });
        frame?.stats.reload({ soft: true });
      } }))) : null,
    h("section", {}, h("h3", { class: "ui-detail-h" }, "Turn raw events into observations"),
      h("p", { class: "ui-meta" }, canCompress ? `Runs the extractor with the ${overview.provider} provider.` : "This needs a model provider. Set ALETHEIA_PROVIDER, then restart the server. Captured events are still searchable without it."),
      h("div", { class: "ui-acts" }, button({ label: "Compress now", icon: "bolt", disabled: !canCompress, onClick: async () => {
        await withProgress(out, { label: "Compressing events", task: () => api("/api/hub/compress", { method: "POST", body: {} }), summarize: (r) => JSON.stringify(r).slice(0, 160) });
        frame?.stats.reload({ soft: true });
      } }))),
    out);
  return drawer({ title: "Import and export", body, actions: [], size: "lg" });
}

export async function renderMemory(route = { sub: "memories", params: {} }) {
  const root = byId("ui-memory");
  if (!frame || frame.project !== state.project || !root.contains(frame.el)) {
    frame = buildFrame();
    swap(root, frame.el);
  }
  frame.show(route);
}
