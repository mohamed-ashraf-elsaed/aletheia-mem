// Detail views opened from a list, from search and from the command palette (T-205). A drawer shows the full text
// of one memory or fact. Narrative text is rendered as Markdown (safe renderer), ids and paths are monospace with
// a copy button, and times show the exact moment on hover.
import { badge, button, clampText, drawer, errorState, markdownView, mono, skeleton, timeEl } from "./ui-components.js";
import { api, h } from "./ui-dom.js";
import { factView } from "./ui-core.js";

const metaRow = (...kids) => h("div", { class: "ui-meta ui-detail-meta" }, ...kids.filter(Boolean));

function memoryBody(memory) {
  const files = Array.isArray(memory.files) ? memory.files : [];
  const concepts = Array.isArray(memory.concepts) ? memory.concepts : [];
  const facts = Array.isArray(memory.facts) ? memory.facts : [];
  return h("div", { class: "ui-detail" },
    metaRow(badge(memory.kind), badge(memory.type), memory.pinned ? badge("pinned", "success") : null, h("span", {}, memory.project), h("span", {}, memory.tool), timeEl(memory.created_at_epoch)),
    metaRow(h("span", {}, "id"), mono(String(memory.id)), memory.session_id ? h("span", {}, "session") : null, memory.session_id ? mono(String(memory.session_id)) : null),
    memory.subtitle ? h("p", { class: "ui-meta", dir: "auto" }, memory.subtitle) : null,
    memory.narrative ? h("section", { "aria-label": "Text" }, markdownView(memory.narrative)) : h("p", { class: "ui-meta" }, "This memory has a title only."),
    facts.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, "Facts in this memory"), h("ul", { class: "ui-detail-list" }, ...facts.map((fact) => h("li", { dir: "auto" }, String(fact))))) : null,
    concepts.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, "Concepts"), h("div", { class: "ui-row" }, ...concepts.map((concept) => badge(String(concept))))) : null,
    files.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, "Files"), h("div", { class: "ui-detail-files" }, ...files.slice(0, 40).map((file) => mono(String(file))))) : null);
}

/** Open a memory by id. Shows a skeleton first, then the text, or an error with Retry. */
export function openMemoryDetail({ id, title = "Memory" } = {}) {
  const body = h("div", {}, skeleton({ kind: "lines", lines: 5, count: 1 }));
  const layer = drawer({ title, body, actions: [] });
  const load = async () => {
    body.replaceChildren(skeleton({ kind: "lines", lines: 5, count: 1 }));
    try {
      const memory = await api(`/api/hub/memories/${encodeURIComponent(id)}`);
      layer.el.querySelector(".ui-layer-title").textContent = memory.title || "(untitled)";
      body.replaceChildren(memoryBody(memory));
    } catch (error) {
      body.replaceChildren(errorState({ title: "Could not open this memory", error, path: `/api/hub/memories/${id}`, onRetry: load, compact: true }));
    }
  };
  load();
  return layer;
}

/** Open a fact from a list row or a search hit. The source episode text is shown as a quote. */
export function openFactDetail(fact) {
  // A search hit names its times `at` and `validFrom`; a list row names them `recordedAt` and `validAt`.
  const view = factView({ ...fact, recordedAt: fact.recordedAt ?? fact.at, validAt: fact.validAt ?? fact.validFrom ?? fact.at });
  const body = h("div", { class: "ui-detail" },
    metaRow(badge(view.status, view.status === "active" ? "success" : "warning"), badge(`scope: ${view.scope}`), badge(`extractor: ${view.extractorMode}`), h("span", {}, view.project)),
    h("p", { class: "ui-detail-fact", dir: "auto" }, view.text),
    view.subject || view.predicate || view.object ? metaRow(h("span", {}, "subject"), h("b", { dir: "auto" }, view.subject), h("span", {}, "predicate"), h("b", { dir: "auto" }, view.predicate), h("span", {}, "object"), h("b", { dir: "auto" }, view.object)) : null,
    metaRow(h("span", {}, "importance"), h("b", {}, view.importanceLabel), h("span", {}, "valid from"), h("b", {}, view.validAt), h("span", {}, "recorded"), h("b", {}, view.recordedAt)),
    metaRow(h("span", {}, "id"), mono(String(view.id)), view.sourceRef ? h("span", {}, "source") : null, view.sourceRef ? mono(String(view.sourceRef)) : null),
    view.sourceText ? h("section", {}, h("h3", { class: "ui-detail-h" }, `Source${view.sourceEpisode ? ` (episode ${view.sourceEpisode})` : ""}`), clampText({ text: view.sourceText, lines: 8, mono: true })) : h("p", { class: "ui-meta" }, "No source episode is linked to this fact."));
  return drawer({ title: "Fact", body, actions: [] });
}
