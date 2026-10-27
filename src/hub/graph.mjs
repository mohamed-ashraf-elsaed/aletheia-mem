// Graph retrieval (T-048): start from the top lexical/dense memory ids and walk entity links to neighbours that share
// an entity. Memory↔entity edges are stored as `memory_keys` rows with owner_type='memory' and key_type='entity'; the
// walk is project-scoped so no row can cross a project, bounded by fan-out and a deadline, and returns a fourth ranked
// list that the caller fuses with RRF.

/**
 * Walk 1..maxHops from the seed memories over shared entities and return neighbour memory ids, best hop first.
 * A project is required: an entity name is only meaningful within a project, so an unscoped walk is refused.
 */
export function graphWalk(store, { seeds = [], project = null, maxHops = 2, maxFanOut = 20, maxMemories = 100, deadlineMs = 50 } = {}) {
  const out = { ids: [], trace: [] };
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
    if (Date.now() - started > deadlineMs) {
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
    const fresh = store.db
      .prepare(`SELECT DISTINCT m.id AS id FROM memory_keys k JOIN memories m ON m.id = k.owner_id
        WHERE k.owner_type = 'memory' AND k.key_type = 'entity' AND k.text IN (${placeholders(entities.length)}) AND m.project = ? ORDER BY m.id`)
      .all(...entities, project)
      .map((row) => Number(row.id))
      .filter((id) => !seen.has(id))
      .slice(0, maxFanOut);
    for (const id of fresh) seen.add(id);
    out.ids.push(...fresh);
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
