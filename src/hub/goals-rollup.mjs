// Goals roll-up: link requests to the owner's goals, give each goal a status and aggregate progress, and split the
// still-open asks into "nothing is working on these" and "being worked on". Rule-based only; requests and goals are
// both computed from stored rows, and every number is read back out.
import { proposeGoals } from "./goals.mjs";
import { proposeRequests } from "./requests.mjs";

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};

const topicKeyOf = (goal) => String(goal.key ?? "").split("|").slice(1).join("|") || goal.key;

function dedupeArtifacts(artifacts) {
  const seen = new Set();
  return (artifacts ?? []).filter((artifact) => {
    const key = `${artifact.kind}\u0000${artifact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const requestView = (request) => ({ id: request.id, title: request.title, status: request.status, progress: request.progress, project: request.project, startedAt: request.startedAt, goalKey: request.goalKey ?? null });

export function proposeGoalsRollup(store, { project = null, now = Date.now(), minSessions, limit, maxGapHours, activeMinutes } = {}) {
  const goalsData = proposeGoals(store, { project, now, minSessions, limit: clamp(limit, 1, 100, 100) });
  const requestsData = proposeRequests(store, { project, now, maxGapHours, activeMinutes, limit: 100 });

  const requestByGoal = new Map();
  for (const request of requestsData.requests) {
    if (!request.goalKey) continue;
    if (!requestByGoal.has(request.goalKey)) requestByGoal.set(request.goalKey, []);
    requestByGoal.get(request.goalKey).push(request);
  }

  const linkedIds = new Set();
  const goals = goalsData.goals.map((goal) => {
    const serving = (requestByGoal.get(topicKeyOf(goal)) ?? []).filter((request) => goal.projects.includes(request.project));
    for (const request of serving) linkedIds.add(request.id);
    const moving = serving.filter((request) => ["Working", "Waiting on you", "Shipped"].includes(request.status));
    const status = serving.length === 0 ? "Nothing on it" : moving.length ? "Moving" : "Stalled";
    const aggregateProgress = serving.length ? Math.round(serving.reduce((sum, request) => sum + (request.progress ?? 0), 0) / serving.length) : 0;
    const whatCameOutOfIt = dedupeArtifacts(serving.flatMap((request) => request.cameOutOfIt ?? []));
    return {
      ...goal,
      status,
      aggregateProgress,
      requestCount: serving.length,
      workingCount: serving.filter((request) => request.status === "Working").length,
      waitingCount: serving.filter((request) => request.status === "Waiting on you").length,
      shippedCount: serving.filter((request) => request.status === "Shipped").length,
      requests: serving.map(requestView),
      whatCameOutOfIt,
    };
  });

  const noGoal = requestsData.requests.filter((request) => !linkedIds.has(request.id));
  const openAsks = goals.filter((goal) => goal.shippedCount === 0);
  const beingWorked = openAsks.filter((goal) => goal.status === "Moving");
  const nothingWorking = openAsks.filter((goal) => goal.status !== "Moving");

  return {
    project: goalsData.project,
    generatedAt: iso(now),
    goals,
    dismissedGoals: goalsData.dismissedGoals,
    pinned: goalsData.pinned,
    noGoal: { count: noGoal.length, requests: noGoal.map(requestView) },
    openAsks: {
      total: openAsks.length,
      nothingWorking: nothingWorking.map((goal) => ({ id: goal.id, label: goal.label, object: goal.object, count: goal.count, sessionCount: goal.sessionCount, projects: goal.projects, lastSeen: goal.lastSeen })),
      beingWorked: beingWorked.map((goal) => ({ id: goal.id, label: goal.label, object: goal.object, count: goal.count, sessionCount: goal.sessionCount, projects: goal.projects, lastSeen: goal.lastSeen })),
    },
    empty: goals.length === 0 && noGoal.length === 0,
  };
}
