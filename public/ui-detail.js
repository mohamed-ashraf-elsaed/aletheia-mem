// Detail views opened from a list, from search and from the command palette. A drawer shows the full text
// of one memory or fact. Narrative text is rendered as Markdown (safe renderer), ids and paths are monospace with
// a copy button, and times show the exact moment on hover.
import { t } from "./ui-i18n.js";
import { badge, button, clampText, drawer, errorState, markdownView, mono, skeleton, timeEl } from "./ui-components.js";
import { api, h } from "./ui-dom.js";
import { factView } from "./ui-core.js";

const metaRow = (...kids) => h("div", { class: "ui-meta ui-detail-meta" }, ...kids.filter(Boolean));

function memoryBody(memory) {
  const files = Array.isArray(memory.files) ? memory.files : [];
  const concepts = Array.isArray(memory.concepts) ? memory.concepts : [];
  const facts = Array.isArray(memory.facts) ? memory.facts : [];
  return h("div", { class: "ui-detail" },
    metaRow(badge(memory.kind), badge(memory.type), memory.pinned ? badge(t("ui.pinned"), "success") : null, h("span", {}, memory.project), h("span", {}, memory.tool), timeEl(memory.created_at_epoch)),
    metaRow(h("span", {}, t("ui.id")), mono(String(memory.id)), memory.session_id ? h("span", {}, t("ui.session")) : null, memory.session_id ? mono(String(memory.session_id)) : null, memory.origin ? h("span", {}, t("ui.origin")) : null, memory.origin ? mono(String(memory.origin)) : null, Number.isFinite(memory.created_at_epoch) ? h("span", {}, t("ui.savedOn", { date: new Date(memory.created_at_epoch).toISOString().slice(0, 10) })) : null),
    memory.subtitle ? h("p", { class: "ui-meta", dir: "auto" }, memory.subtitle) : null,
    memory.narrative ? h("section", { "aria-label": t("ui.text") }, markdownView(memory.narrative)) : h("p", { class: "ui-meta" }, t("ui.titleOnly")),
    facts.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, t("ui.factsInMemory")), h("ul", { class: "ui-detail-list" }, ...facts.map((fact) => h("li", { dir: "auto" }, String(fact))))) : null,
    concepts.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, t("ui.concepts")), h("div", { class: "ui-row" }, ...concepts.map((concept) => badge(String(concept))))) : null,
    files.length ? h("section", {}, h("h3", { class: "ui-detail-h" }, t("ui.files")), h("div", { class: "ui-detail-files" }, ...files.slice(0, 40).map((file) => mono(String(file))))) : null);
}

/** Open a memory by id. Shows a skeleton first, then the text, or an error with Retry. */
export function openMemoryDetail({ id, title = t("ui.memory") } = {}) {
  const body = h("div", {}, skeleton({ kind: "lines", lines: 5, count: 1 }));
  const layer = drawer({ title, body, actions: [] });
  const load = async () => {
    body.replaceChildren(skeleton({ kind: "lines", lines: 5, count: 1 }));
    try {
      const memory = await api(`/api/hub/memories/${encodeURIComponent(id)}`);
      layer.el.querySelector(".ui-layer-title").textContent = memory.title || t("ui.untitled");
      body.replaceChildren(memoryBody(memory));
    } catch (error) {
      body.replaceChildren(errorState({ title: t("ui.couldNotOpenMemory"), error, path: `/api/hub/memories/${id}`, onRetry: load, compact: true }));
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
    metaRow(badge(view.status, view.status === "active" ? "success" : "warning"), badge(t("ui.scopeValue", { scope: view.scope })), badge(t("ui.extractorValue", { mode: view.extractorMode })), h("span", {}, view.project)),
    h("p", { class: "ui-detail-fact", dir: "auto" }, view.text),
    view.subject || view.predicate || view.object ? metaRow(h("span", {}, t("ui.subject")), h("b", { dir: "auto" }, view.subject), h("span", {}, t("ui.predicate")), h("b", { dir: "auto" }, view.predicate), h("span", {}, t("ui.object")), h("b", { dir: "auto" }, view.object)) : null,
    metaRow(h("span", {}, t("ui.importance")), h("b", {}, view.importanceLabel), h("span", {}, t("ui.validFrom")), h("b", {}, view.validAt), h("span", {}, t("ui.recorded")), h("b", {}, view.recordedAt)),
    metaRow(h("span", {}, t("ui.id")), mono(String(view.id)), view.sourceRef ? h("span", {}, t("ui.sourceLower")) : null, view.sourceRef ? mono(String(view.sourceRef)) : null),
    view.sourceText ? h("section", {}, h("h3", { class: "ui-detail-h" }, view.sourceEpisode ? t("ui.sourceEpisode", { episode: view.sourceEpisode }) : t("ui.source")), clampText({ text: view.sourceText, lines: 8, mono: true })) : h("p", { class: "ui-meta" }, t("ui.noSourceEpisode")));
  return drawer({ title: t("ui.fact"), body, actions: [] });
}
