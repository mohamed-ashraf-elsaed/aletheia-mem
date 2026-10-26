// The Work tab: this hub's own sessions, review items, facts and goals. It never reads the legacy viewer's database.
// The overview refreshes every 10 seconds only while the tab is visible and the Work route is active. The session
// page is read-only. Every action (accept, reject, dismiss, restore, pin) calls an existing API route.
import { parseRoute } from "../ui-core.js";
import { api, byId, chip, errorCard, errorText, h, run, settledValue, state, swap, toast } from "../ui-dom.js";
import {
  factLineView,
  goalView,
  goalsView,
  sessionCardView,
  sessionDetailView,
  workEmptyView,
  workHeaderView,
  workNeedsView,
} from "../work-view.js";

const REFRESH_MS = 10_000;
let timer = null;
let busy = false;
let visibilityBound = false;
let liveSocket = null;

function disconnectLive() {
  if (!liveSocket) return;
  liveSocket.onmessage = liveSocket.onerror = liveSocket.onclose = null;
  try { liveSocket.close(); } catch { /* ignore */ }
  liveSocket = null;
}

function connectLive() {
  disconnectLive();
  try {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const query = state.project ? `?project=${encodeURIComponent(state.project)}` : "";
    liveSocket = new WebSocket(`${scheme}//${location.host}/v1/live${query}`);
    liveSocket.onmessage = () => renderOverview(true);
    liveSocket.onerror = () => disconnectLive();
    liveSocket.onclose = () => disconnectLive();
  } catch {
    liveSocket = null;
  }
}

export function stopWorkRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
  disconnectLive();
}

function sessionRoute() {
  const match = /^#\/work\/session\/([^?]+)(?:\?(.*))?$/.exec(String(location.hash ?? ""));
  if (!match) return null;
  let id = match[1];
  try { id = decodeURIComponent(id); } catch { /* keep the raw id */ }
  const params = new URLSearchParams(match[2] ?? "");
  return { id, project: params.get("project") ?? "" };
}

function startRefresh() {
  stopWorkRefresh();
  timer = setInterval(() => {
    const onWork = parseRoute(location.hash) === "work" && !sessionRoute();
    if (!onWork) {
      stopWorkRefresh();
      return;
    }
    if (document.visibilityState !== "visible") return;
    renderOverview(true);
  }, REFRESH_MS);
  if (!visibilityBound) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && parseRoute(location.hash) === "work" && !sessionRoute()) renderOverview(true);
    });
    visibilityBound = true;
  }
}

function stat(label, value, detail) {
  return h("div", { class: "ui-card ui-stat" },
    h("b", {}, value),
    h("span", {}, label),
    detail ? h("div", { class: "ui-meta" }, detail) : null);
}

function factLine(fact) {
  const view = factLineView(fact);
  return h("div", { class: "ui-card" },
    h("p", { class: "ui-fact-text" }, view.text),
    h("div", { class: "ui-meta" }, view.sourceLabel, `importance ${view.importanceLabel}`, view.validAt, chip(view.scope)),
    view.sourceText ? h("details", { class: "ui-details" }, h("summary", {}, "Show source text"), h("div", { class: "ui-fact-source" }, view.sourceText)) : null);
}

function promptParagraph(view) {
  if (!view.lastPromptTruncated) return h("p", { class: "ui-fact-text" }, view.lastPrompt);
  const p = h("p", { class: "ui-fact-text" });
  p.textContent = view.lastPrompt;
  p.dataset.expanded = "0";
  const btn = h("button", { class: "ui-more", onclick: () => {
    const expanded = p.dataset.expanded === "1";
    p.textContent = expanded ? view.lastPrompt : view.lastPromptFull;
    p.dataset.expanded = expanded ? "0" : "1";
    btn.textContent = expanded ? "Show more" : "Show less";
  } }, "Show more");
  return h("div", { class: "ui-prompt" }, p, btn);
}

function sessionCard(session) {
  const view = sessionCardView(session);
  return h("article", { class: "ui-card ui-session" },
    h("div", { class: "ui-row" },
      h("a", { class: "ui-work-link", href: view.href }, h("b", {}, `${view.project} · ${view.id}`)),
      chip(view.stateLabel, view.state === "in_progress" ? "ok" : ""),
      chip(view.tool)),
    h("div", { class: "ui-meta" }, `last event ${view.lastAt}`, view.stateDetail ? `ended by ${view.stateDetail}` : null, view.promptLabel, view.toolLabel),
    h("div", { class: "ui-meta" }, "last typed prompt", view.lastPromptAt ? `· ${view.lastPromptAt}` : ""),
    promptParagraph(view),
    h("div", { class: "ui-meta" }, "summary", view.summaryAt ? `· ${view.summaryAt}` : ""),
    h("p", { class: "ui-fact-text" }, view.summary),
    view.sourceFacts.length
      ? h("details", { class: "ui-details" },
        h("summary", {}, `Source facts (${view.sourceFacts.length})`),
        ...view.sourceFacts.map((fact) => h("div", { class: "ui-fact-source" }, `${fact.text} · ${fact.sourceLabel} · importance ${fact.importanceLabel}`)))
      : null,
    h("div", { class: "ui-acts" }, h("a", { class: "ui-button", href: view.href }, "Open session")));
}

async function reviewAction(item, action) {
  await run(async () => {
    await api(`/api/hub/review/${item.id}`, { method: "POST", body: { action } });
    toast(`Review ${action}ed`);
    await renderOverview(true);
  });
}

async function ruleAction(item, action) {
  await run(async () => {
    await api(`/api/hub/rule-suggestions/${item.id}`, { method: "POST", body: { action } });
    toast(`Rule suggestion ${action}ed`);
    await renderOverview(true);
  });
}

async function restoreDismissed(item) {
  await run(async () => {
    await api("/api/hub/restore", { method: "POST", body: { type: item.type, id: item.id } });
    toast("Restored");
    await renderOverview(true);
  });
}

function needsCard(item) {
  const buttons = item.actions.map((action) => h("button", {
    onclick: () => {
      if (item.kind === "review") return reviewAction(item, action.id);
      if (item.kind === "rule") return ruleAction(item, action.id);
      return restoreDismissed(item);
    },
  }, action.label));
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, chip(item.kind === "review" ? "review" : item.kind === "rule" ? "rule suggestion" : "dismissed"), h("b", {}, item.title)),
    h("div", { class: "ui-meta" }, item.detail),
    h("div", { class: "ui-acts" }, ...buttons));
}

async function goalAction(goal, action) {
  await run(async () => {
    await api(`/api/hub/goals/${goal.id}`, { method: "POST", body: { action } });
    toast(`Goal ${action === "unpin" ? "unpinned" : action === "pin" ? "pinned" : action === "dismiss" ? "dismissed" : "restored"}`);
    await renderOverview(true);
  });
}

function goalCard(goal, { dismissed = false } = {}) {
  const view = goalView(goal);
  return h("div", { class: "ui-card ui-goal" },
    h("div", { class: "ui-row" }, h("b", {}, view.label), view.pinned ? chip("pinned", "ok") : null),
    h("div", { class: "ui-meta" }, view.countLabel, view.sessionLabel, `last seen ${view.lastSeen}`, view.projects.length ? `projects: ${view.projects.join(", ")}` : ""),
    view.quotes.length
      ? h("details", { class: "ui-details" },
        h("summary", {}, `Dated quotes (${view.quotes.length})`),
        ...view.quotes.map((quote) => h("div", { class: "ui-fact-source" }, `#${quote.id} · ${quote.at} · ${quote.project} · ${quote.text}`)))
      : null,
    h("div", { class: "ui-acts" },
      dismissed
        ? h("button", { onclick: () => goalAction(goal, "restore") }, "Restore")
        : h("button", { onclick: () => goalAction(goal, view.pinned ? "unpin" : "pin") }, view.pinned ? "Unpin" : "Pin"),
      dismissed ? null : h("button", { onclick: () => goalAction(goal, "dismiss") }, "Dismiss")));
}

function goalsSection(data) {
  const view = goalsView(data);
  const dismissed = view.dismissedGoals.length
    ? h("details", { class: "ui-card" }, h("summary", {}, `Dismissed goals (${view.dismissedGoals.length})`), ...data.dismissedGoals.map((goal) => goalCard(goal, { dismissed: true })))
    : null;
  return h("section", { class: "ui-work-goals" },
    h("h2", {}, "Goals"),
    h("p", { class: "ui-meta" }, "From your own typed prompts only. A topic is a goal when it repeats in at least two sessions."),
    view.goals.length ? null : h("div", { class: "ui-empty" }, "No repeated imperative topics across sessions yet."),
    ...data.goals.map((goal) => goalCard(goal)),
    dismissed);
}

function emptyCard(data) {
  const view = workEmptyView(data);
  return h("div", { class: "ui-card ui-work-empty" },
    h("h2", {}, view.title),
    h("p", {}, view.body),
    h("pre", { class: "ui-pre" }, view.command),
    h("p", { class: "ui-meta" }, view.hint));
}

function overviewDom(data, goals) {
  const header = workHeaderView(data);
  const sessions = data.sessions.map(sessionCard);
  const needs = workNeedsView(data);
  return h("div", { class: "ui-work" },
    h("div", { class: "ui-work-head" },
      h("h1", {}, "Work"),
      h("p", { class: "ui-meta" }, `Captured sessions, facts and review items from this hub · project: ${header.project}`)),
    data.empty ? emptyCard(data) : null,
    h("div", { class: "ui-work-strip" },
      stat("health", header.health.label),
      stat("last capture", header.lastCapture),
      stat("queue", header.queue, header.queueDetail),
      stat("mode", header.mode),
      stat("sessions", String(header.sessions), `${header.facts} recent facts`),
      stat("needs you", String(header.review + (data.ruleSuggestions?.length ?? 0) + (data.dismissed?.length ?? 0)), `${header.review} review · ${data.ruleSuggestions?.length ?? 0} rules · ${data.dismissed?.length ?? 0} dismissed`)),
    data.empty ? null : h("div", { class: "ui-work-grid" },
      h("section", { class: "ui-work-col" },
        h("h2", {}, "Now"),
        h("p", { class: "ui-meta" }, "Sessions in progress and recently finished, newest first."),
        sessions.length ? null : h("div", { class: "ui-empty" }, "No sessions in this window."),
        ...sessions),
      h("section", { class: "ui-work-col" },
        h("h2", {}, "Needs you"),
        needs.length ? null : h("div", { class: "ui-empty" }, "Nothing needs you right now."),
        ...needs.map(needsCard))),
    data.empty ? null : h("section", { class: "ui-work-memory" },
      h("h2", {}, "Recent memory"),
      h("p", { class: "ui-meta" }, "Current facts with their source episode and importance."),
      data.recentFacts.length ? null : h("div", { class: "ui-empty" }, "No current facts yet. They appear after extraction runs."),
      ...data.recentFacts.map(factLine)),
    data.empty ? null : goalsSection(goals),
    h("p", { class: "ui-meta ui-work-updated" }, `Updated ${header.generatedAt} · refreshes every 10 s while this tab is visible.`));
}

async function renderOverview(silent = false) {
  if (silent && busy) return;
  const root = byId("ui-work");
  if (!root) return;
  busy = true;
  if (!silent) swap(root, h("div", { class: "ui-empty" }, "Loading Work…"));
  try {
    const project = state.project;
    const query = project ? `?project=${encodeURIComponent(project)}` : "";
    const [workResult, goalResult] = await Promise.allSettled([api(`/v1/work${query}`), api(`/v1/work/goals${query}`)]);
    const data = settledValue(workResult, null);
    if (!data) {
      swap(root, h("h1", {}, "Work"), errorCard(errorText(workResult, "Work")));
      return;
    }
    const goals = settledValue(goalResult, { goals: [], dismissedGoals: [] });
    document.title = "Work · Aletheia";
    swap(root, overviewDom(data, goals));
  } catch (error) {
    swap(root, h("h1", {}, "Work"), errorCard(`Work: ${error.message}`));
  } finally {
    busy = false;
  }
}

async function renderSession(route) {
  const root = byId("ui-work");
  if (!root) return;
  swap(root, h("div", { class: "ui-empty" }, "Loading session…"));
  const query = route.project ? `?project=${encodeURIComponent(route.project)}` : "";
  let payload;
  try {
    payload = await api(`/v1/work/session/${encodeURIComponent(route.id)}${query}`);
  } catch (error) {
    swap(root, h("div", { class: "ui-work" },
      h("div", { class: "ui-row" }, h("a", { href: "#/work" }, "← Work")),
      h("div", { class: "ui-card ui-work-empty" }, h("h2", {}, "Session not found"), h("p", { class: "ui-meta" }, error.message))));
    return;
  }
  const view = sessionDetailView(payload.session);
  document.title = `Session ${view.id} · Aletheia`;
  const timeline = view.timeline.length
    ? h("ol", { class: "ui-timeline" }, ...view.timeline.map((item) => h("li", { class: `ui-timeline-${item.kind}` },
      h("div", { class: "ui-meta" }, chip(item.kindLabel), item.at, item.tool ?? ""),
      h("div", { class: "ui-fact-text" }, item.text),
      item.source ? h("div", { class: "ui-fact-source" }, item.source) : null)))
    : h("div", { class: "ui-empty" }, "No timeline rows for this session.");
  swap(root, h("div", { class: "ui-work" },
    h("div", { class: "ui-row" }, h("a", { href: "#/work" }, "← Work"), h("h1", {}, view.title)),
    h("div", { class: "ui-meta" }, view.project, view.tool, `first ${view.firstAt}`, `last ${view.lastAt}`, view.promptLabel, view.toolLabel),
    h("h2", {}, "Summary"),
    h("div", { class: "ui-card" }, h("p", { class: "ui-fact-text" }, view.summary), view.summaryAt ? h("div", { class: "ui-meta" }, view.summaryAt) : null),
    h("h2", {}, "Timeline"),
    timeline,
    h("h2", {}, `Extracted facts (${view.facts.length})`),
    view.facts.length ? null : h("div", { class: "ui-empty" }, "No facts extracted for this session yet."),
    ...view.facts.map((fact) => h("div", { class: "ui-card" },
      h("p", { class: "ui-fact-text" }, fact.text),
      h("div", { class: "ui-meta" }, fact.sourceLabel, `importance ${fact.importanceLabel}`, fact.validAt, chip(fact.status))))));
}

export async function renderWork() {
  stopWorkRefresh();
  const route = sessionRoute();
  if (route) {
    await renderSession(route);
    return;
  }
  await renderOverview(false);
  startRefresh();
  connectLive();
}
