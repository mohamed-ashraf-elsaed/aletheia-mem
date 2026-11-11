// Belief tracking: a contested belief (same subject and predicate, different object) is never collapsed; both
// sides stay visible. The entity summary lists them.

/**
 * Active facts grouped by (subject, predicate) that disagree on the object. Every group keeps both sides; a group with
 * a single object is a settled belief and is excluded.
 */
export function contestedFacts(store, { project = null, subject = null, predicate = null, limit = 100 } = {}) {
  const where = ["f.status = 'active'"];
  const params = [];
  if (project) { where.push("f.project = ?"); params.push(project); }
  if (subject) { where.push("f.subject = ?"); params.push(subject); }
  if (predicate) { where.push("f.predicate = ?"); params.push(predicate); }
  const facts = store.db
    .prepare(`SELECT * FROM facts f WHERE ${where.join(" AND ")} ORDER BY f.recorded_at_epoch DESC, f.id DESC`)
    .all(...params);
  const groups = new Map();
  for (const fact of facts) {
    const key = `${fact.subject}\u0000${fact.predicate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }
  return [...groups.values()].filter((group) => new Set(group.map((fact) => fact.object)).size > 1).slice(0, Math.min(Number(limit) || 100, 1000));
}
