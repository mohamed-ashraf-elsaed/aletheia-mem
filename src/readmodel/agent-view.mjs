// Agent view: who is working on what, built from recorded activity in the claude-mem database plus the
// folded work state. Port of data-source.mjs (readActivityRows = E3e, buildAgentView = oae).
import { clip, fieldText, isoFromEpoch, lower, placeholders, safeAll } from "../lib/util.mjs";
import { goalHistory, currentGoals } from "./goals.mjs";
import { findStop, readStops } from "./lifecycle.mjs";
import { withDerivedProjects } from "./project.mjs";
import { buildRequests } from "./projection.mjs";
import { readRules } from "./rules.mjs";
import { requestKey, requestText, sessionRequestText } from "./text.mjs";
import { isAgentLifecycleList, isGoalsHistoryList, isMyRulesList } from "./work-state.mjs";
import { isWorkProductField, productFromFields, readProductRows } from "./work-product.mjs";

const CLOSED_FOR_RECORDS = new Set(["done", "dropped", "completed", "failed"]);
const PLATFORM_LABELS = { codex: "Codex", claude: "Claude Code", "gemini-cli": "Gemini CLI", kimi: "Kimi", "hermes-cli": "Hermes", "pi-agent": "Pi" };
const REQUEST_SESSION_WINDOW_MS = 14 * 864e5;
const sortedFieldsKey = (fields) => JSON.stringify(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)));
const callKey = (project, list, fields) => JSON.stringify([lower(project), list, sortedFieldsKey(fields)]);
const sessionAgentId = (platform, sessionDbId, agentId) => JSON.stringify(["session", platform ?? "unknown", String(sessionDbId ?? ""), agentId ?? "unidentified"]);

/** Rows the view needs from claude-mem's database. `all(sql, params)` runs a SELECT (missing tables -> []). */
export function readActivityRows(db, { observationLimit = 300, summaryLimit = 100, workCallLimit = 5000, requestSessionLimit = 600, workState, ledger = null, now = Date.now(), bugCompatible = false } = {}) {
  const all = (sql, params) => safeAll(db, sql, params);
  const recentEpochs = workState?.lists
    .flatMap((l) => [l.stateUpdatedAtEpoch, ...l.tasks.map((t) => t.updatedAtEpoch)])
    .filter(Boolean)
    .sort((a, b) => b - a)
    .slice(0, 240);
  const sinceEpoch = recentEpochs?.length ? recentEpochs.at(-1) - 5000 : 0;
  const calls = all(
    `SELECT id, project, platform_source, agent_id, agent_type, session_db_id, memory_session_id, content_session_id, prompt_number, tool_input, created_at_epoch
     FROM tool_uses WHERE tool_name IN (SELECT DISTINCT tool_name FROM tool_uses WHERE tool_name LIKE '%work_state_write%')
     AND created_at_epoch >= ? ORDER BY id DESC LIMIT ?`,
    [sinceEpoch, workCallLimit],
  );
  // The original selects observations.content_session_id. That column does not exist in the 15.2.0 schema, the
  // query throws "no such column", the error is swallowed, and the whole observation half of the view is empty.
  // Default: derive the column from sdk_sessions. bugCompatible: true reproduces the original (used by the
  // differential test against a live original worker).
  const observationHasSession = safeAll(db, "PRAGMA table_info(observations)").some((c) => c.name === "content_session_id");
  const sessionColumn = observationHasSession || bugCompatible
    ? "content_session_id"
    : "(SELECT s.content_session_id FROM sdk_sessions s WHERE s.memory_session_id = observations.memory_session_id) AS content_session_id";
  const observations = all(
    `SELECT id, project, memory_session_id, ${sessionColumn}, agent_id, agent_type, prompt_number, title, subtitle, type, created_at_epoch
     FROM observations ORDER BY created_at_epoch DESC, id DESC LIMIT ?`,
    [observationLimit],
  );
  const summaries = all(
    `SELECT id, project, memory_session_id, prompt_number, request, completed, next_steps, created_at_epoch
     FROM session_summaries ORDER BY created_at_epoch DESC, id DESC LIMIT ?`,
    [summaryLimit],
  );
  const { productCalls, productObservations } = readProductRows(all, sinceEpoch);

  const sessionIds = [...new Set([...calls, ...productCalls].map((c) => c.session_db_id).filter((id) => id != null))];
  const memoryIds = [...new Set([...observations, ...summaries, ...productObservations].map((r) => r.memory_session_id).filter(Boolean))];
  const where = [];
  const params = [];
  if (sessionIds.length) {
    where.push(`id IN (${placeholders(sessionIds)})`);
    params.push(...sessionIds);
  }
  if (memoryIds.length) {
    where.push(`memory_session_id IN (${placeholders(memoryIds)})`);
    params.push(...memoryIds);
  }
  const cols = "id, project, platform_source, content_session_id, memory_session_id, user_prompt, custom_title, status, started_at_epoch, completed_at_epoch";
  const sessions = new Map((where.length ? all(`SELECT ${cols} FROM sdk_sessions WHERE ${where.join(" OR ")}`, params) : []).map((s) => [s.id, s]));
  const recentSessions = all(
    `SELECT ${cols} FROM sdk_sessions WHERE id IN (
       SELECT session_db_id FROM user_prompts WHERE created_at_epoch >= ? GROUP BY session_db_id ORDER BY MAX(created_at_epoch) DESC LIMIT ?)`,
    [now - REQUEST_SESSION_WINDOW_MS, requestSessionLimit],
  );
  const groupedPairs = Object.keys(ledger?.groups?.conversations ?? {}).flatMap((key) => {
    try {
      const k = JSON.parse(key);
      return k?.[0] === "conversation" && k.length === 3 ? [[k[1], k[2]]] : [];
    } catch {
      return [];
    }
  });
  const groupedSessions = [];
  for (let i = 0; i < groupedPairs.length; i += 400) {
    const part = groupedPairs.slice(i, i + 400);
    groupedSessions.push(...all(`SELECT ${cols} FROM sdk_sessions WHERE (platform_source, content_session_id) IN (VALUES ${part.map(() => "(?, ?)").join(",")})`, part.flat()));
  }
  for (const s of [...recentSessions, ...groupedSessions]) if (!sessions.has(s.id)) sessions.set(s.id, s);
  const withProjects = withDerivedProjects(db, [...sessions.values()]);
  const ids = withProjects.map((s) => s.id);
  const prompts = ids.length
    ? all(`SELECT id, session_db_id, prompt_number, substr(prompt_text, 1, 1200) AS prompt_text, created_at_epoch FROM user_prompts WHERE session_db_id IN (${placeholders(ids)}) ORDER BY id DESC LIMIT 12000`, ids)
    : [];
  const agentSessions = [...new Set([...observations, ...calls].filter((r) => r.agent_id && r.content_session_id).map((r) => r.content_session_id))];
  const marks = placeholders(agentSessions);
  const agentLaunches = agentSessions.length
    ? all(
        `SELECT id, session_db_id, content_session_id, platform_source, prompt_number, created_at_epoch,
           json_extract(tool_response, '$.agentId') AS agent_id, json_extract(tool_response, '$.status') AS status,
           json_extract(tool_response, '$.isAsync') AS is_async,
           coalesce(json_extract(tool_input, '$.description'), json_extract(tool_response, '$.description')) AS description,
           substr(coalesce(json_extract(tool_input, '$.prompt'), json_extract(tool_response, '$.prompt')), 1, 600) AS prompt
         FROM tool_uses WHERE tool_name IN ('Agent', 'Task') AND json_valid(tool_response) AND json_valid(coalesce(tool_input, '{}'))
           AND content_session_id IN (${marks}) ORDER BY id DESC LIMIT 2000`,
        agentSessions,
      )
    : [];
  const agentToolActivity = agentSessions.length
    ? all(`SELECT content_session_id, agent_id, MAX(created_at_epoch) AS last_epoch FROM tool_uses WHERE agent_id IS NOT NULL AND content_session_id IN (${marks}) GROUP BY content_session_id, agent_id`, agentSessions)
    : [];
  return { calls, observations, summaries, sessions: withProjects, prompts, productCalls, productObservations, agentLaunches, agentToolActivity };
}

/** One launch per (session, agent): Agent/Task tool calls that started a subagent. */
function indexLaunches(rows) {
  const out = new Map();
  for (const r of rows) {
    const agentId = typeof r.agent_id === "string" && r.agent_id ? r.agent_id : null;
    if (!agentId || !r.content_session_id) continue;
    const key = JSON.stringify([r.content_session_id, agentId]);
    if (out.has(key)) continue;
    const isAsync = r.is_async === 1 || r.is_async === true || r.status === "async_launched";
    out.set(key, {
      toolUseId: r.id,
      promptNumber: r.prompt_number ?? null,
      launchedAtEpoch: r.created_at_epoch,
      isAsync,
      returnedAtEpoch: !isAsync && r.status === "completed" ? r.created_at_epoch : null,
      description: clip(r.description, 160),
      prompt: clip(r.prompt, 500),
    });
  }
  return out;
}

const launchAsRequest = (launch) => {
  if (!launch) return null;
  const text = launch.description ?? launch.prompt;
  return text ? { text, source: "agent-launch", sourceId: launch.toolUseId, url: `/api/work-view/evidence/tool-use/${launch.toolUseId}` } : null;
};

/**
 * Build the agent view: agents (sessions and subagents with their work and activity), recent activity,
 * goals, rules, and the human requests projected from prompts and the ledger.
 */
export function buildAgentView(workState, rows, { now = Date.now(), workLimit = 240, activityLimit = 160, recentMs = 900_000, titleCache = {}, ledger = null } = {}) {
  const { calls = [], observations = [], summaries = [], sessions = [], prompts = [], agentLaunches = [], agentToolActivity = [] } = rows;
  const launches = indexLaunches(agentLaunches);
  const lastToolEpoch = new Map(agentToolActivity.map((r) => [JSON.stringify([r.content_session_id, r.agent_id]), Number(r.last_epoch) || 0]));
  const stops = readStops(workState);
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const sessionsByMemory = new Map(sessions.filter((s) => s.memory_session_id).map((s) => [s.memory_session_id, s]));
  const scope = new Set(workState.currentProjectScope.map(lower));
  const eventsById = new Map(workState.events.map((e) => [e.id, e]));
  // Newest event that wrote each field of each list/task (events are newest-first).
  const fieldEvent = new Map();
  for (const event of workState.events) {
    for (const name of Object.keys(event.fields)) {
      const key = JSON.stringify([event.taskId ?? event.listId, name]);
      if (!fieldEvent.has(key)) fieldEvent.set(key, event);
    }
  }
  const stringField = (v) => typeof v === "string" && v.trim();

  /** Candidate values for `names` on a record (task field first, else its list's), newest first, with provenance. */
  function fieldSources(record, names, accept = stringField) {
    const found = [];
    for (const name of names) {
      const onRecord = Object.hasOwn(record.fields, name);
      const value = onRecord ? record.fields[name] : record.list.fields[name];
      if (!accept(value)) continue;
      const event = fieldEvent.get(JSON.stringify([onRecord ? record.id : record.list.id, name]));
      found.push({
        value, field: name,
        atEpoch: event?.atEpoch ?? record.updatedAtEpoch ?? null,
        sourceOrder: event?.sourceOrder ?? null,
        sourceRef: event ? { kind: "work-state", id: event.id } : null,
      });
    }
    return found.sort((a, b) => (b.atEpoch ?? 0) - (a.atEpoch ?? 0));
  }

  function recordExtras(record) {
    const requestedBy = fieldSources(record, ["requested_by", "requester", "human_requester"])[0] ?? null;
    const ship = fieldSources(record, ["ship_estimate", "eta", "target_ship_at", "due_at"])[0] ?? null;
    const stage = fieldSources(record, ["stage", "phase"])[0] ?? null;
    const resources = [];
    for (const field of ["docs_url", "documentation_url", "promo_url", "announcement_url"]) {
      for (const source of fieldSources(record, [field])) {
        try {
          const url = new URL(source.value.trim());
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
          resources.push({
            kind: ["docs_url", "documentation_url"].includes(field) ? "documentation" : "promotion",
            url: source.value.trim(), field, atEpoch: source.atEpoch, sourceRefs: source.sourceRef ? [source.sourceRef] : [],
          });
        } catch {}
      }
    }
    const texts = (names) => names.flatMap((n) => fieldSources(record, [n]).map((s) => ({ text: clip(s.value, 600), field: n, atEpoch: s.atEpoch, sourceRefs: s.sourceRef ? [s.sourceRef] : [] })));
    const classifications = texts(["classification", "category", "tags"]);
    const notes = texts(["post_ship", "after_ship"]);
    const requestStatus = fieldSources(record, ["request_status"])[0] ?? null;
    const requestComplete = fieldSources(record, ["request_complete"], (v) => typeof v === "boolean")[0] ?? null;
    return {
      workProduct: Object.keys({ ...record.list.fields, ...record.fields })
        .filter(isWorkProductField)
        .flatMap((name) => {
          const event = fieldEvent.get(JSON.stringify([Object.hasOwn(record.fields, name) ? record.id : record.list.id, name]));
          return event ? productFromFields(event.fields, { atEpoch: event.atEpoch, sourceRef: { kind: "work-state", id: event.id } }).filter((p) => p.field === name) : [];
        }),
      requestedBy: requestedBy?.value.trim() ?? null,
      requestedBySource: requestedBy,
      shipEstimate: ship?.value ?? null,
      shipEstimateSource: ship,
      stageSourceText: stage?.value ?? null,
      stageSource: stage,
      requestStatusSource: requestStatus,
      requestCompleteSource: requestComplete,
      afterShip: resources.length || classifications.length || notes.length ? { resources, classifications, notes } : null,
    };
  }

  const promptBySessionAndNumber = new Map();
  for (const p of prompts) {
    const key = JSON.stringify([p.session_db_id, p.prompt_number]);
    if (!promptBySessionAndNumber.has(key)) promptBySessionAndNumber.set(key, p);
  }
  const summaryByMemoryAndNumber = new Map();
  for (const s of summaries) {
    const key = JSON.stringify([s.memory_session_id, s.prompt_number]);
    if (!summaryByMemoryAndNumber.has(key)) summaryByMemoryAndNumber.set(key, s);
  }
  // Captured work_state_write calls, indexed by what they wrote, to attribute an entry to a session.
  const callsByContent = new Map();
  for (const call of calls) {
    let input;
    try {
      input = JSON.parse(call.tool_input);
    } catch {
      continue;
    }
    if (!input?.list || !input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) continue;
    const key = callKey(call.project, input.list, input.fields);
    if (!callsByContent.has(key)) callsByContent.set(key, []);
    callsByContent.get(key).push(call);
  }

  const agents = new Map();
  const allActivity = [];
  let linkedWork = 0;
  let ownerWork = 0;
  let unattributedWork = 0;

  function agentFor({ session, agentId = null, agentType = null, owner = null, project }) {
    const platform = session?.platform_source ?? null;
    const id = session ? sessionAgentId(platform, session.id, agentId) : JSON.stringify([owner ? "owner" : "unassigned", lower(project), owner, agentId]);
    if (!agents.has(id)) {
      const label = PLATFORM_LABELS[platform] ?? clip(platform, 48) ?? "Unassigned";
      agents.set(id, {
        id,
        kind: session ? "session" : owner ? "recorded-owner" : "unassigned",
        label: session ? label : owner ? clip(owner, 70) : "Unassigned work",
        platformSource: platform,
        agentId, agentType,
        sessionId: session?.id ?? null,
        contentSessionId: session?.content_session_id ?? null,
        sessionTitle: clip(session?.custom_title, 120),
        recordedSessionStatus: session?.status ?? null,
        project,
        projects: [project],
        inCurrentScope: scope.has(lower(project)),
        identityEvidence: session ? "captured-session" : owner ? "explicit-owner-field" : agentId ? "recorded-agent-id" : "no-attribution",
        presence: { status: "unknown", isLive: null, evidence: "recorded-activity-only", lastActivityAt: null },
        isSubagent: !!(session && agentId && platform === "claude"),
        launch: session && agentId ? (launches.get(JSON.stringify([session.content_session_id, agentId])) ?? null) : null,
        work: [],
        activity: [],
        lastActivityEpoch: 0,
      });
    }
    const agent = agents.get(id);
    if (!agent.projects.includes(project)) agent.projects.push(project);
    agent.inCurrentScope ||= scope.has(lower(project));
    return agent;
  }

  /** The request text behind (session, prompt number): summary request, else the user prompt, else the initial prompt. */
  function requestFor(session, promptNumber) {
    if (!session) return null;
    const key = requestKey(session, promptNumber);
    const prompt = promptBySessionAndNumber.get(JSON.stringify([session.id, promptNumber]));
    const summary = summaryByMemoryAndNumber.get(JSON.stringify([session.memory_session_id, promptNumber]));
    const original = prompt ? { source: "user-prompt", sourceId: prompt.id, url: `/api/work-view/evidence/prompt/${prompt.id}` } : null;
    if (summary && sessionRequestText(summary.request)) {
      return { key, text: sessionRequestText(summary.request), source: "session-summary-request", sourceId: summary.id, url: `/api/work-view/evidence/summary/${summary.id}`, original };
    }
    if (prompt && sessionRequestText(prompt.prompt_text)) return { key, text: sessionRequestText(prompt.prompt_text), ...original };
    if ((promptNumber == null || promptNumber <= 1) && sessionRequestText(session.user_prompt)) {
      return { key, text: sessionRequestText(session.user_prompt), source: "session-initial-request", sourceId: session.id, url: `/api/work-view/evidence/session/${session.id}` };
    }
    return null;
  }

  function addActivity(agent, item) {
    agent.lastActivityEpoch = Math.max(agent.lastActivityEpoch, item.atEpoch ?? 0);
    agent.activity.push(item);
    allActivity.push({ ...item, agentGroupId: agent.id });
  }

  // ---- Work records: every task, plus lists that carry fields of their own.
  const records = workState.lists
    .filter((l) => !isGoalsHistoryList(l.name) && !isMyRulesList(l.name) && !isAgentLifecycleList(l.name))
    .flatMap((list) => [
      ...list.tasks.map((task) => ({ ...task, list, recordKind: "task" })),
      ...(Object.keys(list.fields).some((k) => k !== "task")
        ? [{
            id: list.id, name: list.name, fields: list.fields, status: list.status, isOpen: !CLOSED_FOR_RECORDS.has(list.status),
            updatedAtEpoch: list.stateUpdatedAtEpoch,
            latestEntryId: workState.events.find((e) => e.listId === list.id && e.task === null)?.id ?? 0,
            list, recordKind: "list",
          }]
        : []),
    ])
    .sort((a, b) => b.updatedAtEpoch - a.updatedAtEpoch)
    .slice(0, workLimit);

  /** The one captured tool call that wrote this exact entry, within 5s, else null. */
  function capturedCall(event) {
    const hits = (callsByContent.get(callKey(event.originProject ?? event.project, event.listName, event.fields)) ?? []).filter((c) => Math.abs(c.created_at_epoch - event.atEpoch) <= 5000);
    return hits.length === 1 ? hits[0] : null;
  }
  const eventsByRecord = new Map();
  for (const event of workState.events) {
    const id = event.taskId ?? (event.task === null ? event.listId : null);
    if (id === null) continue;
    if (!eventsByRecord.has(id)) eventsByRecord.set(id, []);
    eventsByRecord.get(id).push(event);
  }

  for (const record of records) {
    const latest = eventsById.get(record.latestEntryId);
    let call = null;
    let linkedEvent = null;
    for (const event of eventsByRecord.get(record.id) ?? (latest ? [latest] : [])) {
      call = capturedCall(event);
      if (call) {
        linkedEvent = event;
        break;
      }
    }
    const session = call ? (sessionsById.get(call.session_db_id) ?? sessionsByMemory.get(call.memory_session_id)) : null;
    const owner = clip(record.fields.owner, 100);
    const agent = agentFor({ session, agentId: call?.agent_id ?? null, agentType: call?.agent_type ?? null, owner, project: record.list.project });
    if (session) linkedWork++;
    else if (owner) ownerWork++;
    else unattributedWork++;
    const explicitRequest = fieldText(record.fields, ["request", "human_request", "user_request"], 500);
    const key = requestKey(session, call?.prompt_number);
    const request = {
      ...(explicitRequest ?? requestFor(session, call?.prompt_number) ?? {
        text: clip(record.name, 500),
        source: record.recordKind === "task" ? "task-label" : "list-label",
        sourceId: record.id, url: null,
      }),
      key,
    };
    const nextStep = fieldText(record.fields, ["next_step", "nextStep", "next", "next_action", "remaining", "pending", "then_run"]);
    const outcome = fieldText(record.fields, ["outcome", "result", "completed", "verified", "verification"]);
    const progress = fieldText(record.fields, ["human_summary", "summary", "progress", "phase", "stage", "status_note"]);
    const evidenceId = latest?.id ?? record.latestEntryId;
    const requestIdField = record.fields.request_id ?? record.list.fields.request_id;
    const requestTextField = (max) => fieldText(record.fields, ["human_request", "request", "user_request"], max)?.text ?? fieldText(record.list.fields, ["human_request", "request", "user_request"], max)?.text ?? null;
    const item = {
      id: record.id,
      kind: "work-state",
      recordKind: record.recordKind,
      title: clip(record.name, 160),
      project: record.list.project,
      listId: record.list.id,
      listName: record.list.name,
      taskId: record.recordKind === "task" ? record.id : null,
      status: record.status,
      statusExplicit: Object.hasOwn(record.fields, "status"),
      isOpen: record.isOpen,
      request, nextStep, outcome, progress, owner,
      requestId: (["string", "number"].includes(typeof requestIdField) && String(requestIdField).trim()) || null,
      requestText: requestTextField(1200),
      requestStatus: typeof (record.fields.request_status ?? record.list.fields.request_status) === "string" ? (record.fields.request_status ?? record.list.fields.request_status) : null,
      requestComplete: typeof (record.fields.request_complete ?? record.list.fields.request_complete) === "boolean" ? (record.fields.request_complete ?? record.list.fields.request_complete) : null,
      ...recordExtras(record),
      lastUpdateAt: isoFromEpoch(record.updatedAtEpoch),
      lastUpdateEpoch: record.updatedAtEpoch,
      attribution: session
        ? { source: "captured-work-state-call", toolUseId: call.id, sessionId: session.id, agentId: call.agent_id ?? null, meaning: linkedEvent.id === latest?.id ? "update-author" : "latest-linked-update-author", linkedEntryId: linkedEvent.id, match: "unique-project-list-fields-within-5s" }
        : { source: owner ? "explicit-owner-field" : "unavailable", meaning: owner ? "recorded-assignee" : "unknown" },
      sourceRefs: [{ kind: "work-state", id: evidenceId }, ...(call ? [{ kind: "tool-use", id: call.id }] : [])],
      url: `/api/work-view/evidence/work-state/${evidenceId}`,
    };
    agent.work.push(item);
    addActivity(agent, {
      id: `work-state:${evidenceId}`, requestKey: key, kind: "work-state", title: item.title,
      detail: outcome?.text ?? progress?.text ?? nextStep?.text ?? null,
      project: item.project, at: item.lastUpdateAt, atEpoch: item.lastUpdateEpoch, sourceRef: item.sourceRefs[0], url: item.url,
    });
  }

  // ---- Observations: one "session-request" work row per (session, prompt), plus activity.
  const sessionRequests = new Map();
  function sessionRequestRow(agent, obs, session, request, key, rowKey, { withSummary }) {
    if (sessionRequests.has(rowKey)) return sessionRequests.get(rowKey);
    const summary = withSummary ? summaryByMemoryAndNumber.get(JSON.stringify([obs.memory_session_id, obs.prompt_number])) : null;
    const row = {
      id: `session-request:${rowKey}`,
      kind: "session-request",
      recordKind: "session",
      title: request?.text ?? clip(obs.title, 160) ?? "Recorded observation",
      project: obs.project,
      listId: null, taskId: null, status: "unknown", statusExplicit: false, isOpen: true,
      request: { ...(request ?? { text: clip(obs.title, 500) ?? "Recorded observation", source: "observation-title", sourceId: obs.id, url: `/api/work-view/evidence/observation/${obs.id}` }), key },
      nextStep: summary?.next_steps ? { text: clip(summary.next_steps), source: "session-summary", sourceId: summary.id } : null,
      outcome: summary?.completed ? { text: clip(summary.completed), source: "session-summary", sourceId: summary.id } : null,
      progress: { text: clip(obs.title), source: "observation", sourceId: obs.id },
      owner: null,
      lastUpdateAt: isoFromEpoch(obs.created_at_epoch),
      lastUpdateEpoch: obs.created_at_epoch,
      attribution: { source: request ? "observation-session-link" : "unavailable", meaning: agent.isSubagent ? "recorded-subagent" : "recorded-session", agentId: agent.agentId ?? null },
      sourceRefs: [{ kind: "observation", id: obs.id }],
      url: `/api/work-view/evidence/observation/${obs.id}`,
    };
    sessionRequests.set(rowKey, row);
    agent.work.push(row);
    return row;
  }
  const rowKeyOf = (agent, obs) => JSON.stringify([agent.id, obs.memory_session_id ?? null, obs.content_session_id ?? null, obs.prompt_number ?? null]);

  for (const obs of observations) {
    const session = sessionsByMemory.get(obs.memory_session_id);
    const agent = agentFor({ session, agentId: obs.agent_id, agentType: obs.agent_type, project: obs.project });
    const activity = {
      id: `observation:${obs.id}`, kind: "observation", title: clip(obs.title, 160) ?? "Recorded observation", detail: clip(obs.subtitle),
      project: obs.project, at: isoFromEpoch(obs.created_at_epoch), atEpoch: obs.created_at_epoch,
      sourceRef: { kind: "observation", id: obs.id }, url: `/api/work-view/evidence/observation/${obs.id}`,
    };
    if (!agent.isSubagent) {
      const key = requestKey(session, obs.prompt_number);
      sessionRequestRow(agent, obs, session, requestFor(session, obs.prompt_number), key, rowKeyOf(agent, obs), { withSummary: true });
      addActivity(agent, { ...activity, requestKey: key });
      continue;
    }
    const launch = agent.launch;
    const launchKey = launch ? requestKey(session, launch.promptNumber) : null;
    sessionRequestRow(agent, obs, session, launchAsRequest(launch), launchKey, JSON.stringify([agent.id]), { withSummary: false });
    addActivity(agent, { ...activity, requestKey: launchKey });
    const own = requestFor(session, obs.prompt_number);
    if (session && own) {
      const parent = agentFor({ session, agentId: null, agentType: null, project: obs.project });
      const parentKey = requestKey(session, obs.prompt_number);
      const row = sessionRequestRow(parent, obs, session, own, parentKey, rowKeyOf(parent, obs), { withSummary: true });
      if (!row.sourceRefs.some((r) => r.kind === "observation" && r.id === obs.id)) row.sourceRefs.push({ kind: "observation", id: obs.id });
    }
  }

  function stopFor(agent) {
    const lastTool = lastToolEpoch.get(JSON.stringify([agent.contentSessionId, agent.agentId])) ?? 0;
    const lastActive = Math.max(agent.lastActivityEpoch, lastTool);
    const candidates = [];
    const stop = findStop(stops, agent.platformSource, agent.contentSessionId, agent.agentId);
    if (stop) candidates.push({ evidence: stop.source, atEpoch: stop.stoppedAtEpoch, sourceRef: { kind: "work-state", id: stop.entryId } });
    if (agent.launch?.returnedAtEpoch) candidates.push({ evidence: "agent-call-returned", atEpoch: agent.launch.returnedAtEpoch, sourceRef: { kind: "tool-use", id: agent.launch.toolUseId } });
    return candidates.filter((c) => c.atEpoch >= lastActive).sort((a, b) => b.atEpoch - a.atEpoch)[0] ?? null;
  }

  const agentList = [...agents.values()]
    .map((agent) => {
      const { lastActivityEpoch, ...rest } = agent;
      const quietFor = Math.max(0, now - lastActivityEpoch);
      const stop = agent.isSubagent ? stopFor(agent) : null;
      if (stop) for (const w of agent.work) if (w.kind === "session-request") { w.status = "finished"; w.isOpen = false; }
      return {
        ...rest,
        presence: stop
          ? { ...agent.presence, status: "finished", evidence: stop.evidence, finishedAt: isoFromEpoch(stop.atEpoch), sourceRef: stop.sourceRef, lastActivityAt: isoFromEpoch(lastActivityEpoch) }
          : { ...agent.presence, status: lastActivityEpoch ? (quietFor <= recentMs ? "recent" : "quiet") : "unknown", lastActivityAt: isoFromEpoch(lastActivityEpoch) },
        canMarkFinished: agent.isSubagent && !stop,
        work: agent.work.sort((a, b) => b.lastUpdateEpoch - a.lastUpdateEpoch),
        activity: agent.activity.sort((a, b) => b.atEpoch - a.atEpoch).slice(0, 8),
        counts: { work: agent.work.length, open: agent.work.filter((w) => w.isOpen).length, done: agent.work.filter((w) => w.status === "done").length },
      };
    })
    .sort((a, b) => String(b.presence.lastActivityAt ?? "").localeCompare(String(a.presence.lastActivityAt ?? "")));
  const recentActivity = allActivity.sort((a, b) => b.atEpoch - a.atEpoch).slice(0, activityLimit);
  const projected = buildRequests({ agents: agentList, recentActivity }, rows, { titleCache, ledger });

  return {
    version: 1,
    generatedAt: isoFromEpoch(now),
    currentProject: workState.currentProject,
    currentProjectScope: workState.currentProjectScope,
    agents: agentList,
    recentActivity,
    goals: currentGoals(workState),
    goalHistory: goalHistory(workState),
    ...readRules(workState, ledger),
    ...projected,
    coverage: {
      workRows: records.length, workLimit, linkedWork, ownerWork, unattributedWork,
      observations: observations.length, observationLimit: 300, summaries: summaries.length,
      livePresenceAvailable: false, summaryMethod: "bounded-recorded-text", fullHistoryUrl: "/viewer",
    },
  };
}

export { requestText };
