// Graph retrieval and its production channel. The walk starts from top lexical/dense memory ids and
// follows memory↔entity edges (memory_keys with owner_type='memory', key_type='entity') to neighbours that share an
// entity. The walk is project-scoped, bounded by fan-out and a deadline, and returns a fourth ranked list plus the
// provenance (which entity led to each neighbour). An entity page resolves the entity's aliases, facts and links.

export const GRAPH_ENABLED_KEY = "graph.enabled";

/**
 * Walk 1..maxHops from the seed memories over shared entities. A project is required: an entity name is only
 * meaningful within a project. Returns { ids, trace, provenance } where provenance maps a neighbour id to the
 * entities that led to it.
 */
export function graphWalk(store, { seeds = [], project = null, maxHops = 2, maxFanOut = 20, maxMemories = 100, deadlineMs = 50 } = {}) {
  const out = { ids: [], trace: [], provenance: {} };
  if (!project) {
    out.trace.push("graph: project required");
    return out;
  }
  let current = [...new Set((seeds ?? []).map(Number).filter(Number.isSafeInteger))].slice(0, maxFanOut);
  if (!current.length) {
    out.trace.push("graph: no seeds");
    return out;
  }
  const started = Date.now();
  const seen = new Set(current);
  const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");

  for (let hop = 1; hop <= maxHops; hop++) {
    if (Date.now() - started >= deadlineMs) {
      out.trace.push(`graph: timeout at hop ${hop}`);
      break;
    }
    const entities = [...new Set(store.db
      .prepare(`SELECT DISTINCT k.text AS entity FROM memory_keys k JOIN memories m ON m.id = k.owner_id
        WHERE k.owner_type = 'memory' AND k.key_type = 'entity' AND k.owner_id IN (${placeholders(current.length)}) AND m.project = ?`)
      .all(...current, project)
      .map((row) => row.entity))]
      .slice(0, maxFanOut);
    if (!entities.length) break;
    const rows = store.db
      .prepare(`SELECT DISTINCT k.text AS entity, m.id AS id FROM memory_keys k JOIN memories m ON m.id = k.owner_id
        WHERE k.owner_type = 'memory' AND k.key_type = 'entity' AND k.text IN (${placeholders(entities.length)}) AND m.project = ? ORDER BY m.id`)
      .all(...entities, project);
    const freshByEntity = new Map();
    for (const row of rows) {
      const id = Number(row.id);
      if (seen.has(id)) continue;
      if (!freshByEntity.has(id)) freshByEntity.set(id, []);
      freshByEntity.get(id).push(row.entity);
    }
    const fresh = [...freshByEntity.keys()].slice(0, maxFanOut);
    for (const id of fresh) {
      seen.add(id);
      (out.provenance[id] ??= []).push(...freshByEntity.get(id));
      out.ids.push(id);
    }
    out.trace.push(`hop ${hop}: ${entities.length} entities -> ${fresh.length} memories`);
    current = fresh;
  }
  out.ids = [...new Set(out.ids)].slice(0, maxMemories);
  return out;
}

/** Add one project-scoped memory→entity edge. Idempotent: the same name for the same memory is stored once. */
export function linkMemoryEntity(store, { memoryId, entity, source = "graph" }) {
  store.addKey({ ownerType: "memory", ownerId: Number(memoryId), keyType: "entity", text: entity, source });
}

/** True when the production graph channel is turned on. Off by default until it has been measured. */
export function graphEnabled(store) {
  return store.setting(GRAPH_ENABLED_KEY, false) === true;
}

/**
 * An entity page: the entity, its aliases, the facts it appears in, and the memories linked to it through the graph.
 * Every returned fact and memory id is a real row; an unknown id returns { found: false }.
 */
export function entityPage(store, { id }) {
  const entity = store.db.prepare("SELECT * FROM entities WHERE id = ?").get(Number(id));
  if (!entity) return { found: false };
  const aliases = store.db.prepare("SELECT alias, confidence FROM entity_aliases WHERE entity_id = ? ORDER BY confidence DESC").all(entity.id);
  const facts = store.db.prepare("SELECT f.* FROM fact_entities fe JOIN facts f ON f.id = fe.fact_id WHERE fe.entity_id = ? ORDER BY f.recorded_at_epoch DESC").all(entity.id);
  const memoryIds = store.db.prepare("SELECT DISTINCT k.owner_id AS id FROM memory_keys k WHERE k.owner_type = 'memory' AND k.key_type = 'entity' AND k.text = ? ORDER BY k.owner_id").all(entity.canonical_name).map((row) => Number(row.id));
  const memories = memoryIds.length ? store.db.prepare(`SELECT * FROM memories WHERE id IN (${memoryIds.map(() => "?").join(",")})`).all(...memoryIds) : [];
  return { found: true, entity, aliases, facts, memories };
}
