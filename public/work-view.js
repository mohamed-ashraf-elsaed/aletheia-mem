// DOM-free view models for the Work tab and the session page. `public/tabs/work.js` turns these objects into
// elements; this module never touches `document`, so the shapes are tested without a browser. Every string is
// derived from a row the API returned. An empty store gets an instruction, never a fake session.
import { factView, formatWhen } from "./ui-core.js";

const oneLine = (text, max = 400) => {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const healthState = (health) => {
  const status = typeof health === "string" ? health : health?.status;
  if (status === "ok") return { state: "ok", label: "Healthy", dot: "●" };
  return { state: "down", label: status ? `Not healthy: ${status}` : "Health unknown", dot: "●" };
};

export function workHeaderView(data = {}) {
  const last = Array.isArray(data.lastCapture) ? data.lastCapture[0] : null;
  const queue = data.queue ?? {};
  const health = healthState(data.health);
  return {
    project: data.project ?? "all",
    generatedAt: formatWhen(data.generatedAt),
    health,
    mode: String(data.mode ?? "unknown"),
    lastCapture: last ? `${formatWhen(last.at)} · ${last.tool}` : "never",
    lastCaptureTool: last?.tool ?? null,
    queue: `${queue.depth ?? 0} queued`,
    queueDetail: `${queue.pending ?? 0} pending · ${queue.running ?? 0} running · ${queue.failed ?? 0} failed`,
    sessions: data.sessions?.length ?? 0,
    facts: data.recentFacts?.length ?? 0,
    review: data.review?.pending ?? 0,
    pinned: data.pinned?.length ?? 0,
    empty: !!data.empty,
  };
}

export const WORK_EMPTY = {
  title: "No captures yet",
  body: "Aletheia has no sessions for this project yet.",
  command: "aletheia install claude-code --write",
  hint: "Run one prompt in the tool, then come back. This page refreshes every 10 seconds while it is visible.",
};

export function workEmptyView(data = {}) {
  return { ...WORK_EMPTY, project: data.project ?? "all" };
}

export function sessionCardView(session = {}) {
  const facts = Array.isArray(session.sourceFacts) ? session.sourceFacts : [];
  return {
    id: session.id,
    project: session.project ?? "default",
    href: session.href ?? `#/work/session/${encodeURIComponent(session.id ?? "")}?project=${encodeURIComponent(session.project ?? "default")}`,
    state: session.state === "in_progress" ? "in_progress" : "finished",
    stateLabel: session.state === "in_progress" ? "In progress" : "Finished",
    lastAt: formatWhen(session.lastAt),
    promptLabel: `${session.promptCount ?? 0} prompt${session.promptCount === 1 ? "" : "s"}`,
    toolLabel: `${session.toolCount ?? 0} tool event${session.toolCount === 1 ? "" : "s"}`,
    tool: session.tool ?? "unknown",
    lastPrompt: session.lastPrompt?.text ? oneLine(session.lastPrompt.text, 500) : "No typed prompt captured.",
    lastPromptAt: session.lastPrompt?.at ? formatWhen(session.lastPrompt.at) : null,
    summary: session.summary?.text ? oneLine(session.summary.text, 900) : "No summary yet.",
    summaryAt: session.summary?.at ? formatWhen(session.summary.at) : null,
    sourceFacts: facts.map(factLineView),
  };
}

export function factLineView(fact = {}) {
  const view = factView(fact);
  const ref = view.sourceRef ? ` · ${view.sourceRef}` : "";
  return {
    id: view.id,
    text: view.text,
    sourceLabel: view.sourceEpisode ? `episode #${view.sourceEpisode}${ref}` : view.sourceRef ?? "no source",
    sourceText: view.sourceText,
    importanceLabel: view.importanceLabel,
    validAt: view.validAt,
    status: view.status,
    scope: view.scope,
  };
}

export function needsItemView(item = {}, kind) {
  if (kind === "review" || item.type && !item.itemId) {
    return {
      key: `review:${item.id}`,
      kind: "review",
      id: item.id,
      title: oneLine(item.label ?? item.title ?? `review #${item.id}`, 240),
      detail: `${item.reason ?? "review"}${item.project ? ` · ${item.project}` : ""}`,
      actions: [
        { id: "accept", label: "Accept" },
        { id: "reject", label: "Reject" },
      ],
    };
  }
  if (kind === "rule" || item.when !== undefined) {
    return {
      key: `rule:${item.id}`,
      kind: "rule",
      id: item.id,
      title: oneLine(item.text ?? `rule #${item.id}`, 240),
      detail: `${item.when ? `when ${item.when}` : "always"}${item.project ? ` · ${item.project}` : ""}`,
      actions: [
        { id: "accept", label: "Accept" },
        { id: "dismiss", label: "Dismiss" },
      ],
    };
  }
  return {
    key: `dismissed:${item.type}:${item.itemId}`,
    kind: "dismissed",
    id: item.itemId,
    type: item.type,
    title: oneLine(item.label ?? `${item.type} #${item.itemId}`, 240),
    detail: `${item.reason ?? "dismissed"}${item.at ? ` · ${formatWhen(item.at)}` : ""}`,
    actions: [{ id: "restore", label: "Restore" }],
  };
}

export function workNeedsView(data = {}) {
  return [
    ...(data.review?.items ?? []).map((item) => needsItemView(item, "review")),
    ...(data.ruleSuggestions ?? []).map((item) => needsItemView(item, "rule")),
    ...(data.dismissed ?? []).map((item) => needsItemView(item, "dismissed")),
  ];
}

export function goalView(goal = {}) {
  return {
    id: goal.id,
    label: oneLine(goal.label ?? goal.object ?? "Untitled goal", 240),
    count: goal.count ?? 0,
    countLabel: `${goal.count ?? 0} quote${goal.count === 1 ? "" : "s"}`,
    sessionCount: goal.sessionCount ?? 0,
    sessionLabel: `${goal.sessionCount ?? 0} session${goal.sessionCount === 1 ? "" : "s"}`,
    projects: goal.projects ?? [],
    lastSeen: formatWhen(goal.lastSeen),
    firstSeen: formatWhen(goal.firstSeen),
    pinned: !!goal.pinned,
    dismissed: !!goal.dismissed,
    quotes: (goal.quotes ?? []).map((quote) => ({
      id: quote.id,
      at: formatWhen(quote.at),
      project: quote.project,
      sessionId: quote.sessionId,
      text: oneLine(quote.text, 240),
    })),
  };
}

export function goalsView(data = {}) {
  return {
    project: data.project ?? "all",
    goals: (data.goals ?? []).map(goalView),
    dismissedGoals: (data.dismissedGoals ?? []).map(goalView),
  };
}

export function sessionDetailView(detail = {}) {
  const kinds = { prompt: "Prompt", tool: "Tool event", summary: "Summary" };
  return {
    id: detail.id,
    project: detail.project ?? "default",
    title: `Session ${detail.id ?? ""}`,
    firstAt: formatWhen(detail.firstAt),
    lastAt: formatWhen(detail.lastAt),
    tool: detail.tool ?? "unknown",
    promptLabel: `${detail.promptCount ?? 0} prompt${detail.promptCount === 1 ? "" : "s"}`,
    toolLabel: `${detail.toolCount ?? 0} tool event${detail.toolCount === 1 ? "" : "s"}`,
    summary: detail.summary?.text ? oneLine(detail.summary.text, 1200) : "No summary yet.",
    summaryAt: detail.summary?.at ? formatWhen(detail.summary.at) : null,
    timeline: (detail.timeline ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      kindLabel: kinds[item.kind] ?? item.kind,
      at: formatWhen(item.at),
      text: oneLine(item.text, 1200),
      tool: item.tool ?? null,
      source: item.source ?? null,
    })),
    facts: (detail.facts ?? []).map(factLineView),
  };
}
