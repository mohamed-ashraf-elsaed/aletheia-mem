// Request projection: one card per HUMAN request. A conversation's first substantive ask owns its follow-ups;
// agent work, activity and progress hang beneath it. The ledger can merge several conversations into one
// overall request. Port of request-projection.mjs (V5e).
import { NO_PROJECT, projectRoot, upgradedGroupRoot } from "./project.mjs";
import { compareSourceOrder, conversationKey, isConversationKey, isHumanActionRequest, originalFor, requestText, titleFromRequest } from "./text.mjs";
import { existingProductFile, mergeWorkProduct, productFileUrl, productFromObservation, productFromToolUse } from "./work-product.mjs";

const COMPLETE_WORDS = ["done", "completed", "complete", "shipped", "delivered"];

export function buildRequests(view, rows = {}, { titleCache = {}, ledger = null } = {}) {
  const sessionsById = new Map((rows.sessions ?? []).map((s) => [s.id, s]));
  const prompts = rows.prompts ?? [];
  const agents = view.agents ?? [];
  const workItems = agents.flatMap((agent) => (agent.work ?? []).map((w) => ({ ...w, agentId: agent.id, agentLabel: agent.label, agentSessionId: agent.sessionId })));
  const subagentIds = new Set(agents.filter((a) => a.isSubagent).map((a) => a.id));

  // Every known activity row, addressable by "<agentId>:<activityId>".
  const activityIndex = new Map();
  for (const agent of agents) for (const a of agent.activity ?? []) activityIndex.set(`${agent.id}:${a.id}`, { ...a, agentId: agent.id, agentLabel: agent.label });
  for (const a of view.recentActivity ?? []) {
    const agent = agents.find((x) => x.id === a.agentGroupId);
    if (agent) activityIndex.set(`${agent.id}:${a.id}`, { ...a, agentId: agent.id, agentLabel: agent.label });
  }
  /** Activity belonging to `items` (by source ref, or by observation under the same request key). */
  function activityFor(items, requestId, limit) {
    const out = new Map();
    for (const item of items) {
      const refs = new Set((item.sourceRefs ?? []).map((r) => `${r.kind}:${r.id}`));
      for (const a of activityIndex.values()) {
        if (a.agentId !== item.agentId) continue;
        const byRef = refs.has(a.id) || (a.sourceRef && refs.has(`${a.sourceRef.kind}:${a.sourceRef.id}`));
        const byRequest = a.kind === "observation" && item.request?.key && a.requestKey === item.request.key;
        if (byRef || byRequest) out.set(`${a.agentId}:${a.id}`, { ...a, promptRequestKey: a.requestKey ?? null, requestKey: requestId });
      }
    }
    return [...out.values()].sort((a, b) => (b.atEpoch ?? 0) - (a.atEpoch ?? 0)).slice(0, limit);
  }

  // Explicit request ids (work-state `request_id`) per conversation.
  const explicitIds = new Map();
  for (const w of workItems) {
    const key = conversationKey(sessionsById.get(w.agentSessionId));
    if (key && w.requestId) {
      if (!explicitIds.has(key)) explicitIds.set(key, new Set());
      explicitIds.get(key).add(String(w.requestId));
    }
  }
  const sessionByConversation = new Map();
  for (const s of sessionsById.values()) {
    const key = conversationKey(s);
    if (key && !sessionByConversation.has(key)) sessionByConversation.set(key, s);
  }

  const groups = ledger?.groups?.groups ?? {};
  const conversationGroup = ledger?.groups?.conversations ?? {};
  const ignored = ledger?.groups?.ignored ?? {};
  const membersOf = (groupId) => Object.entries(conversationGroup).filter(([, g]) => g === groupId).map(([k]) => k);

  /** For a group with no saved root: the one project root its member conversations share, else NO_PROJECT. */
  const rootFromMembers = (groupId, group) => {
    const anchorRoot = projectRoot(sessionByConversation.get(group.anchor)?.project);
    if (anchorRoot) return anchorRoot;
    const roots = new Set(membersOf(groupId).map((k) => projectRoot(sessionByConversation.get(k)?.project)).filter(Boolean));
    return roots.size === 1 ? [...roots][0] : NO_PROJECT;
  };
  const rootCache = new Map();
  const groupRoot = (groupId) => {
    const group = groups[groupId];
    if (group?.projectRoot === NO_PROJECT) {
      if (!rootCache.has(groupId)) rootCache.set(groupId, rootFromMembers(groupId, group));
      return rootCache.get(groupId);
    }
    const anchorRoot = projectRoot(sessionByConversation.get(group?.anchor)?.project);
    if (typeof group?.projectRoot === "string") {
      if (!rootCache.has(groupId)) rootCache.set(groupId, upgradedGroupRoot(group.projectRoot, anchorRoot, membersOf(groupId).map((k) => projectRoot(sessionByConversation.get(k)?.project))));
      return rootCache.get(groupId);
    }
    return anchorRoot;
  };
  /** The group a conversation belongs to, only when its project root agrees with the group's. */
  const groupIdFor = (key, session) => {
    const groupId = key ? (conversationGroup[key] ?? null) : null;
    if (!groupId) return null;
    const own = projectRoot(session?.project);
    const root = groupRoot(groupId);
    const unrooted = groups[groupId]?.projectRoot === NO_PROJECT;
    return own == null || root == null || own === root || (unrooted && own === NO_PROJECT) ? groupId : null;
  };

  const requests = new Map();
  const unlinkedWork = [];
  function requestFor(id, { key, original, groupId = null, explicit = null, explicitText = null }) {
    let request = requests.get(id);
    const anchorAsk = groupId ? (groups[groupId]?.anchorAsk ?? null) : null;
    if (anchorAsk && (anchorAsk.atEpoch ?? Infinity) < (original.atEpoch ?? Infinity)) original = anchorAsk;
    if (request) {
      if (!request.explicitRequestText && explicitText) request.explicitRequestText = explicitText;
      if (groupId && (original.atEpoch ?? Infinity) < (request.original.atEpoch ?? Infinity)) request.original = original;
    } else {
      request = {
        id, conversationKey: key, conversationKeys: [], original, explicitRequestText: explicitText, scopeUpdates: [], projects: [],
        agentIds: [], items: [], workstreams: [], updatedAtEpoch: 0, explicitRequestId: explicit, groupId,
      };
      requests.set(id, request);
    }
    if (key && !request.conversationKeys.includes(key)) request.conversationKeys.push(key);
    return request;
  }
  const addProject = (request, project) => {
    if (typeof project === "string" && project && !request.projects.includes(project)) request.projects.push(project);
  };

  // 1. Every conversation with a substantive opening ask (unless explicit ids rule it, or the ledger ignored it).
  for (const [key, session] of sessionByConversation) {
    if (explicitIds.has(key) || ignored[key]) continue;
    const original = originalFor(session, prompts);
    if (!original) continue;
    const groupId = groupIdFor(key, session);
    addProject(requestFor(groupId ? JSON.stringify(["overall-request", groupId]) : key, { key, original, groupId }), session.project);
  }
  // 2. Groups whose conversations are no longer in the loaded window still show, from their saved anchor ask.
  for (const [groupId, group] of Object.entries(groups)) {
    const id = JSON.stringify(["overall-request", groupId]);
    if (requests.has(id) || !group?.anchorAsk || ignored[group.anchor] || sessionByConversation.get(group.anchor)) continue;
    requestFor(id, { key: isConversationKey(group.anchor) ? group.anchor : null, original: group.anchorAsk, groupId });
  }
  // 3. Attach agent work items to requests.
  for (const item of workItems) {
    const session = sessionsById.get(item.agentSessionId);
    const key = conversationKey(session);
    const ids = explicitIds.get(key);
    const explicitId = item.requestId ? String(item.requestId) : ids?.size === 1 ? [...ids][0] : null;
    if (!item.requestId && ids?.size > 1) {
      unlinkedWork.push({ ...item, reason: "multiple-explicit-requests-without-item-link" });
      continue;
    }
    let original = session ? originalFor(session, prompts) : null;
    const explicitText = isHumanActionRequest(item.requestText) ? requestText(item.requestText) : null;
    if (!original && explicitId && explicitText) {
      original = { text: explicitText, source: "explicit-work-state-request", sourceId: item.id, url: item.url, promptNumber: null, atEpoch: item.lastUpdateEpoch ?? null };
    }
    if (!original || (!key && !explicitId)) {
      unlinkedWork.push({ ...item, reason: key ? "no-substantive-human-request" : "no-confirmed-conversation-or-explicit-request" });
      continue;
    }
    if (!explicitId && key && ignored[key]) {
      unlinkedWork.push({ ...item, reason: "ignored-by-request-grouping" });
      continue;
    }
    const groupId = explicitId ? null : groupIdFor(key, session);
    const project = projectRoot(session?.project) ?? projectRoot(item.project);
    const id = explicitId
      ? JSON.stringify(project == null ? ["explicit-request", explicitId] : ["explicit-request", project, explicitId])
      : groupId
        ? JSON.stringify(["overall-request", groupId])
        : key;
    const request = requestFor(id, { key, original, groupId, explicit: explicitId, explicitText });
    addProject(request, session?.project);
    addProject(request, item.project);
    if (!request.agentIds.includes(item.agentId)) request.agentIds.push(item.agentId);
    request.items.push(item);
    request.updatedAtEpoch = Math.max(request.updatedAtEpoch, item.lastUpdateEpoch ?? 0);
  }

  // 4. Work product found in recorded calls/observations, attached to the one request of the conversation.
  const requestsByConversation = new Map();
  for (const r of requests.values()) for (const key of r.conversationKeys) {
    if (!requestsByConversation.has(key)) requestsByConversation.set(key, []);
    requestsByConversation.get(key).push(r);
  }
  const sessionsByMemory = new Map([...sessionsById.values()].filter((s) => s.memory_session_id).map((s) => [s.memory_session_id, s]));
  const productByRequest = new Map();
  const attach = (session, products) => {
    const list = requestsByConversation.get(conversationKey(session));
    if (list?.length !== 1 || !products.length) return;
    if (!productByRequest.has(list[0])) productByRequest.set(list[0], []);
    productByRequest.get(list[0]).push(...products);
  };
  for (const call of rows.productCalls ?? []) attach(sessionsById.get(call.session_db_id), productFromToolUse(call));
  for (const obs of rows.productObservations ?? []) attach(sessionsByMemory.get(obs.memory_session_id), productFromObservation(obs));

  const sessionIdsByConversation = new Map();
  for (const s of sessionsById.values()) {
    const key = conversationKey(s);
    if (key) sessionIdsByConversation.set(key, [...(sessionIdsByConversation.get(key) ?? []), s.id]);
  }
  const promptsBySession = new Map();
  for (const p of prompts) {
    if (!promptsBySession.has(p.session_db_id)) promptsBySession.set(p.session_db_id, []);
    promptsBySession.get(p.session_db_id).push(p);
  }

  for (const request of requests.values()) {
    request.workProduct = mergeWorkProduct([...(productByRequest.get(request) ?? []), ...request.items.flatMap((i) => i.workProduct ?? [])]).map((p) => ({
      ...p,
      fileUrl: productFileUrl(p),
      available: p.path ? !!existingProductFile(p) : true,
    }));
    const sessionIds = new Set(request.conversationKeys.flatMap((k) => sessionIdsByConversation.get(k) ?? []));
    const allPrompts = [...sessionIds].flatMap((id) => promptsBySession.get(id) ?? []);
    request.updatedAtEpoch = Math.max(request.updatedAtEpoch, request.original.atEpoch ?? 0, ...allPrompts.map((p) => p.created_at_epoch ?? 0));
    if (!request.agentIds.length) for (const agent of agents) if (sessionIds.has(agent.sessionId) && !request.agentIds.includes(agent.id)) request.agentIds.push(agent.id);

    request.scopeUpdates = allPrompts
      .filter((p) => !(request.original.source === "user-prompt" && p.id === request.original.sourceId) && requestText(p.prompt_text) && (request.original.promptNumber == null || p.prompt_number >= request.original.promptNumber))
      .sort((a, b) => (b.created_at_epoch ?? 0) - (a.created_at_epoch ?? 0) || b.prompt_number - a.prompt_number || b.id - a.id)
      .slice(0, 6)
      .reverse()
      .map((p) => ({ text: requestText(p.prompt_text, 500), sourceId: p.id, url: `/api/work-view/evidence/prompt/${p.id}`, promptNumber: p.prompt_number, atEpoch: p.created_at_epoch ?? null }));

    const streams = new Map();
    for (const item of request.items) {
      const id = item.listId ?? JSON.stringify(["agent-session", item.agentId]);
      if (!streams.has(id)) streams.set(id, { id, title: item.listName ?? item.title, agentIds: [], items: [] });
      const s = streams.get(id);
      if (!s.agentIds.includes(item.agentId)) s.agentIds.push(item.agentId);
      s.items.push(item);
    }
    request.workstreams = [...streams.values()];
    request.agentIds.sort((a, b) => Number(subagentIds.has(a)) - Number(subagentIds.has(b)));
    for (const s of request.workstreams) s.activity = activityFor(s.items, request.id, 20);
    request.activity = activityFor(request.items, request.id, 40);

    const newest = (field) =>
      request.items.map((item) => ({ item, record: item[field] })).filter(({ record }) => record).sort((a, b) => (b.record.atEpoch ?? 0) - (a.record.atEpoch ?? 0));
    const lifecycles = request.items
      .flatMap((item) => [
        ...(typeof item.requestStatus === "string" && item.requestStatus.trim()
          ? [{ status: item.requestStatus.trim(), explicit: true, field: "request_status", sourceId: item.id, url: item.url, atEpoch: item.requestStatusSource?.atEpoch ?? item.lastUpdateEpoch ?? null, sourceOrder: item.requestStatusSource?.sourceOrder ?? null, sourceRef: item.requestStatusSource?.sourceRef ?? null }]
          : []),
        ...(typeof item.requestComplete === "boolean"
          ? [{ status: item.requestComplete ? "done" : "open", complete: item.requestComplete, explicit: true, field: "request_complete", sourceId: item.id, url: item.url, atEpoch: item.requestCompleteSource?.atEpoch ?? item.lastUpdateEpoch ?? null, sourceOrder: item.requestCompleteSource?.sourceOrder ?? null, sourceRef: item.requestCompleteSource?.sourceRef ?? null }]
          : []),
      ])
      .sort((a, b) => (b.atEpoch ?? 0) - (a.atEpoch ?? 0) || compareSourceOrder(b.sourceOrder, a.sourceOrder) || +(b.field === "request_complete") - +(a.field === "request_complete"));
    request.lifecycle = lifecycles[0] ?? null;
    request.startedAtEpoch = request.original.atEpoch ?? null;
    request.progress = request.groupId ? (ledger?.progress?.[request.groupId] ?? null) : null;
    request.completedAtEpoch = request.lifecycle && (request.lifecycle.complete === true || COMPLETE_WORDS.includes(request.lifecycle.status.toLowerCase())) ? request.lifecycle.atEpoch : null;
    const by = newest("requestedBySource")[0];
    request.requestedBy = by?.item.requestedBy ?? null;
    request.requestedBySource = by?.record ?? null;
    const ship = newest("shipEstimateSource")[0];
    request.shipEstimate = ship?.item.shipEstimate ?? null;
    request.shipEstimateSource = ship?.record ?? null;
    const stage = newest("stageSource")[0];
    request.stageSourceText = stage?.item.stageSourceText ?? null;
    request.stageSource = stage?.record ?? null;

    const mergeShip = (bucket, uniqueField) => {
      const merged = new Map();
      for (const item of request.items) {
        for (const entry of item.afterShip?.[bucket] ?? []) {
          const key = JSON.stringify([entry.kind ?? bucket, entry[uniqueField]]);
          if (!merged.has(key)) merged.set(key, { ...entry, sourceRefs: [] });
          const target = merged.get(key);
          for (const ref of entry.sourceRefs ?? []) if (!target.sourceRefs.some((r) => r.kind === ref.kind && r.id === ref.id)) target.sourceRefs.push(ref);
        }
      }
      return [...merged.values()];
    };
    const resources = mergeShip("resources", "url");
    const classifications = mergeShip("classifications", "text");
    const notes = mergeShip("notes", "text");
    request.afterShip = resources.length || classifications.length || notes.length ? { resources, classifications, notes } : null;

    const cached = titleCache instanceof Map ? titleCache.get(request.id) : titleCache[request.id];
    const cachedTitle =
      typeof cached === "string"
        ? cached.trim()
        : cached && cached.source === request.original.source && cached.sourceId != null && String(cached.sourceId) === String(request.original.sourceId) && typeof cached.title === "string"
          ? cached.title.trim()
          : "";
    const groupTitle = request.groupId ? (groups[request.groupId]?.title?.trim() ?? "") : "";
    request.title = cachedTitle || groupTitle || titleFromRequest(request.explicitRequestText ?? request.original);
    request.titleSource = cachedTitle ? "title-cache" : groupTitle ? "request-group" : request.explicitRequestText ? "explicit-work-state-request" : "original-human-request";
    request.items.sort((a, b) => (b.lastUpdateEpoch ?? 0) - (a.lastUpdateEpoch ?? 0));
  }
  return { humanRequests: [...requests.values()].sort((a, b) => b.updatedAtEpoch - a.updatedAtEpoch), unlinkedWork };
}
