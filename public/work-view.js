// DOM-free view models for the Work tab and the session page. `public/tabs/work.js` turns these objects into
// elements; this module never touches `document`, so the shapes are tested without a browser. Every string is
// derived from a row the API returned. An empty store gets an instruction, never a fake session.
import { factView, formatWhen } from "./ui-core.js";
import { t } from "./ui-i18n.js";

const oneLine = (text, max = 400) => {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const healthState = (health) => {
  const status = typeof health === "string" ? health : health?.status;
  if (status === "ok") return { state: "ok", label: t("work.healthy"), dot: "●" };
  return { state: "down", label: status ? t("work.notHealthy", { status }) : t("work.healthUnknown"), dot: "●" };
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
    lastCapture: last ? `${formatWhen(last.at)} · ${last.tool}` : t("work.never"),
    lastCaptureTool: last?.tool ?? null,
    queue: t("work.queued", { count: queue.depth ?? 0 }),
    queueDetail: t("work.queueDetail", { pending: queue.pending ?? 0, running: queue.running ?? 0, failed: queue.failed ?? 0 }),
    sessions: data.sessions?.length ?? 0,
    facts: data.recentFacts?.length ?? 0,
    review: data.review?.pending ?? 0,
    pinned: data.pinned?.length ?? 0,
    empty: !!data.empty,
  };
}

export const WORK_EMPTY = {
  get title() { return t("work.emptyTitle"); },
  get body() { return t("work.emptyBody"); },
  command: "aletheia install claude-code --write",
  get hint() { return t("work.emptyHint"); },
};

export function workEmptyView(data = {}) {
  return { ...WORK_EMPTY, project: data.project ?? "all" };
}

export function sessionCardView(session = {}) {
  const facts = Array.isArray(session.sourceFacts) ? session.sourceFacts : [];
  const promptFull = session.lastPrompt?.text ? oneLine(session.lastPrompt.text, 500) : "";
  const promptShort = promptFull.length > 200 ? `${promptFull.slice(0, 200)}…` : promptFull;
  const endedBy = session.state === "in_progress" ? null : (session.endedBy === "event" ? t("work.endedByEvent") : t("work.endedByQuiet"));
  return {
    id: session.id,
    project: session.project ?? "default",
    href: session.href ?? `#/work/session/${encodeURIComponent(session.id ?? "")}?project=${encodeURIComponent(session.project ?? "default")}`,
    state: session.state === "in_progress" ? "in_progress" : "finished",
    stateLabel: session.state === "in_progress" ? t("work.inProgress") : t("work.finished"),
    stateDetail: endedBy,
    lastAt: formatWhen(session.lastAt),
    promptLabel: t("work.promptCount", { count: session.promptCount ?? 0 }),
    toolLabel: t("work.toolEventCount", { count: session.toolCount ?? 0 }),
    tool: session.tool ?? t("work.unknown"),
    lastPrompt: promptShort || t("work.noPrompt"),
    lastPromptFull: promptFull,
    lastPromptTruncated: promptFull.length > 200,
    lastPromptAt: session.lastPrompt?.at ? formatWhen(session.lastPrompt.at) : null,
    summary: session.summary?.text ? oneLine(session.summary.text, 900) : t("work.noSummary"),
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
    sourceLabel: view.sourceEpisode ? t("work.episodeRef", { id: view.sourceEpisode, ref }) : view.sourceRef ?? t("work.noSource"),
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
      title: oneLine(item.label ?? item.title ?? t("work.reviewFallback", { id: item.id }), 240),
      detail: `${item.reason ?? t("work.reasonReview")}${item.project ? ` · ${item.project}` : ""}`,
      actions: [
        { id: "accept", label: t("work.accept") },
        { id: "reject", label: t("work.reject") },
      ],
    };
  }
  if (kind === "rule" || item.when !== undefined) {
    return {
      key: `rule:${item.id}`,
      kind: "rule",
      id: item.id,
      title: oneLine(item.text ?? t("work.ruleFallback", { id: item.id }), 240),
      detail: `${item.when ? t("work.whenCondition", { when: item.when }) : t("work.always")}${item.project ? ` · ${item.project}` : ""}`,
      actions: [
        { id: "accept", label: t("work.accept") },
        { id: "dismiss", label: t("work.dismiss") },
      ],
    };
  }
  return {
    key: `dismissed:${item.type}:${item.itemId}`,
    kind: "dismissed",
    id: item.itemId,
    type: item.type,
    title: oneLine(item.label ?? t("work.dismissedFallback", { type: item.type, id: item.itemId }), 240),
    detail: `${item.reason ?? t("work.reasonDismissed")}${item.at ? ` · ${formatWhen(item.at)}` : ""}`,
    actions: [{ id: "restore", label: t("work.restore") }],
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
    label: oneLine(goal.label ?? goal.object ?? t("work.untitledGoal"), 240),
    count: goal.count ?? 0,
    countLabel: t("work.quoteCount", { count: goal.count ?? 0 }),
    sessionCount: goal.sessionCount ?? 0,
    sessionLabel: t("work.sessionCount", { count: goal.sessionCount ?? 0 }),
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
  const kinds = { prompt: t("work.kindPrompt"), tool: t("work.kindTool"), summary: t("work.kindSummary") };
  return {
    id: detail.id,
    project: detail.project ?? "default",
    title: t("work.sessionTitle", { id: detail.id ?? "" }),
    firstAt: formatWhen(detail.firstAt),
    lastAt: formatWhen(detail.lastAt),
    tool: detail.tool ?? t("work.unknown"),
    promptLabel: t("work.promptCount", { count: detail.promptCount ?? 0 }),
    toolLabel: t("work.toolEventCount", { count: detail.toolCount ?? 0 }),
    summary: detail.summary?.text ? oneLine(detail.summary.text, 1200) : t("work.noSummary"),
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
