// Subagent lifecycle: "this subagent finished", recorded as work-state tasks in the "agent-lifecycle" list.
import { AGENT_LIFECYCLE_LIST, isAgentLifecycleList } from "./work-state.mjs";

export const STOP_SOURCES = ["subagent-stop-hook", "owner-marked-finished"];
const key = (platform, session, agent) => JSON.stringify([String(platform ?? "claude"), String(session), String(agent)]);

/** The work-state fields recording that one agent stopped. */
export function stopEntryFields({ platformSource, contentSessionId, agentId, agentType = null, stoppedAtEpoch, stopSource }) {
  if (!contentSessionId || !agentId) throw new Error("An agent stop needs the session and the agent id.");
  if (!STOP_SOURCES.includes(stopSource)) throw new Error(`Unknown agent stop source: ${stopSource}`);
  if (!Number.isFinite(stoppedAtEpoch) || stoppedAtEpoch <= 0) throw new Error("An agent stop needs the time it stopped.");
  return {
    task: `Agent ${agentId} in ${platformSource ?? "claude"} session ${contentSessionId}`,
    status: "done",
    platform_source: platformSource ?? "claude",
    content_session_id: contentSessionId,
    agent_id: agentId,
    agent_type: agentType ?? null,
    stopped_at: new Date(stoppedAtEpoch).toISOString(),
    stopped_at_epoch: stoppedAtEpoch,
    stop_source: stopSource,
  };
}

/** Map of "<platform,session,agent>" -> latest recorded stop. */
export function readStops(workState) {
  const stops = new Map();
  for (const list of workState.lists ?? []) {
    if (!isAgentLifecycleList(list.name)) continue;
    for (const task of list.tasks) {
      const { content_session_id: session, agent_id: agent, platform_source: platform, stopped_at_epoch: at, stop_source: source } = task.fields;
      if (typeof session !== "string" || typeof agent !== "string" || !Number.isFinite(at)) continue;
      const k = key(platform, session, agent);
      const prev = stops.get(k);
      if (!prev || at > prev.stoppedAtEpoch) stops.set(k, { stoppedAtEpoch: at, source, entryId: task.latestEntryId });
    }
  }
  return stops;
}

export const findStop = (stops, platform, session, agent) => (!session || !agent ? null : (stops.get(key(platform, session, agent)) ?? null));

export { AGENT_LIFECYCLE_LIST };
