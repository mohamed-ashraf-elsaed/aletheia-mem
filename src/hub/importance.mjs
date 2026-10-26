// Importance is earned, not declared. The first version is a transparent weighted sum, stored with every input so
// a score can be explained. A pinned item always wins the user component and does not decay.
export const IMPORTANCE_VERSION = "importance-v1";
export const HALF_LIFE_DAYS = 90;
export const WEIGHTS = { type: 0.35, recency: 0.25, reinforcement: 0.2, provenance: 0.1, user: 0.1 };

export const TYPE_WEIGHTS = {
  decision: 1,
  gotcha: 1,
  bugfix: 0.9,
  feature: 0.8,
  discovery: 0.7,
  refactor: 0.6,
  summary: 0.6,
  change: 0.5,
  note: 0.4,
  event: 0.2,
};

const DAY_MS = 86_400_000;

export const typeWeight = (type) => TYPE_WEIGHTS[String(type ?? "").toLowerCase()] ?? 0.4;

/** Exponential decay with a 90-day half-life. A future timestamp does not score above 1. */
export function recency(createdAtEpoch, now = Date.now()) {
  const ageDays = Math.max(0, (now - Number(createdAtEpoch || 0)) / DAY_MS);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/**
 * Compute the score and every input. `reinforcement` is a count; it is capped at 5. `hasProvenance` is true when
 * the row has an episode or a linked fact. A pinned row gets user_signal 1 and keeps recency 1 (no decay).
 */
export function importanceFor({ type, createdAtEpoch, reinforcement = 0, hasProvenance = true, pinned = false, editedAtEpoch = null, now = Date.now() } = {}) {
  const components = {
    type_weight: typeWeight(type),
    recency: pinned ? 1 : recency(createdAtEpoch, now),
    reinforcement: Math.min(Math.max(Number(reinforcement) || 0, 0), 5) / 5,
    provenance_quality: hasProvenance ? 1 : 0.5,
    user_signal: pinned ? 1 : editedAtEpoch ? 0.8 : 0,
    pinned: !!pinned,
    formula: IMPORTANCE_VERSION,
    half_life_days: HALF_LIFE_DAYS,
    weights: WEIGHTS,
  };
  const score = WEIGHTS.type * components.type_weight
    + WEIGHTS.recency * components.recency
    + WEIGHTS.reinforcement * components.reinforcement
    + WEIGHTS.provenance * components.provenance_quality
    + WEIGHTS.user * components.user_signal;
  return { importance: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000, components };
}

/** Recompute every observation in a project (or all projects) and store the score plus its inputs. */
export function recomputeImportance(store, { project, now = Date.now(), limit = 50_000 } = {}) {
  const observations = store.listObservations({ project, limit: Math.min(Number(limit) || 50_000, 50_000) });
  let updated = 0;
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const observation of observations) {
      const linkedFacts = store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE observation_id = ?").get(observation.id).n;
      const linkedEpisodes = store.db.prepare("SELECT COUNT(*) AS n FROM memory_links WHERE from_type = 'observation' AND from_id = ? AND to_type = 'episode'").get(observation.id).n;
      const edited = Number.isFinite(observation.edited_at_epoch) ? observation.edited_at_epoch : null;
      const { importance, components } = importanceFor({
        type: observation.type,
        createdAtEpoch: observation.created_at_epoch,
        reinforcement: linkedFacts, // first proxy: facts attached to this observation; re-confirmation is not tracked yet
        hasProvenance: Boolean(observation.episode_id) || linkedEpisodes > 0 || linkedFacts > 0,
        pinned: !!observation.pinned,
        editedAtEpoch: edited,
        now,
      });
      store.db.prepare("UPDATE observations SET importance = ?, importance_components = ?, updated_at_epoch = ? WHERE id = ?")
        .run(importance, JSON.stringify(components), Date.now(), observation.id);
      updated++;
    }
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }
  return { updated, formula: IMPORTANCE_VERSION, weights: WEIGHTS, halfLifeDays: HALF_LIFE_DAYS };
}

/** Rank correlation used by the fixture test; ties get the average rank. */
export function spearman(a, b) {
  if (a.length !== b.length || !a.length) return 0;
  const ranks = (values) => {
    const order = values.map((value, index) => [value, index]).sort((x, y) => x[0] - y[0]);
    const out = new Array(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const rank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k][1]] = rank;
      i = j + 1;
    }
    return out;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (ra[i] - rb[i]) ** 2;
  return 1 - (6 * sum) / (n * (n * n - 1));
}
