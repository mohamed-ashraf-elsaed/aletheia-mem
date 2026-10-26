// Product search: facts, episodes, keys and optional dense channels, fused with reciprocal rank fusion. Kept async
// because a dense query needs an embedding call; when no runtime is present the same function answers from keyword
// channels alone and says so in `channels`.
import { rrf, topKByVector, unpackVector } from "./retrieval.mjs";

export const FUSION = { factWeight: 1, episodeWeight: 0.9 };

/** [{id, vec}] for facts that already have a vector. */
export function factVectorRows(store) {
  return store.db.prepare("SELECT fact_id AS id, vec FROM fact_vectors").all().map((row) => ({ id: row.id, vec: unpackVector(row.vec) }));
}

/** Embed facts that have no `fact_vectors` row yet. `embedder` = {model, embedDocs}. Returns how many were written. */
export async function embedMissingFacts(store, embedder, { limit = 5000, batch = 64 } = {}) {
  if (!embedder) return 0;
  const todo = store.db
    .prepare("SELECT f.id, f.text FROM facts f LEFT JOIN fact_vectors v ON v.fact_id = f.id WHERE v.fact_id IS NULL ORDER BY f.id LIMIT ?")
    .all(Math.min(Number(limit) || 5000, 50_000));
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch);
    const vecs = await embedder.embedDocs(part.map((fact) => fact.text));
    store.db.exec("BEGIN");
    try {
      part.forEach((fact, j) => store.setFactVector(fact.id, embedder.model, vecs[j]));
      store.db.exec("COMMIT");
    } catch (error) {
      try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
  }
  return todo.length;
}

/**
 * Search facts and episodes together. `channels` records what actually ran: lexical always when the query has a
 * term, vector only when a query vector was produced and at least one row has a vector. `explain` is part of every
 * result so a caller can state why a hit appeared.
 */
export async function searchMemory({ store, query, project, limit = 20, scope = "current", includeHistory = false, asOf = null, embedder = null } = {}) {
  let queryVec = null;
  if (embedder) {
    try {
      queryVec = await embedder.embedQuery(query);
    } catch {
      queryVec = null;
    }
  }
  const factVectors = queryVec ? factVectorRows(store).length : 0;
  const episodeVectors = queryVec ? store.vectorRows({ project, scope }).length : 0;
  const facts = store.searchFacts({ query, project, limit, includeHistory, asOf, queryVec, scope });
  const episodes = store.ranked({ query, project, limit, queryVec, includeHistory, scope });
  const channels = {
    facts: { lexical: true, keys: true, vector: factVectors > 0 },
    episodes: { lexical: true, vector: episodeVectors > 0 },
    factVectorRows: factVectors,
    episodeVectorRows: episodeVectors,
    fused: "rrf",
  };
  if (includeHistory) channels.history = true;
  if (asOf != null) channels.asOf = asOf;
  if (scope === "all") channels.scope = "all";

  const fused = rrf([
    facts.map((fact) => `fact:${fact.id}`),
    episodes.map((memory) => `memory:${memory.id}`),
  ], { weights: [FUSION.factWeight, FUSION.episodeWeight] });
  const factById = new Map(facts.map((fact) => [`fact:${fact.id}`, fact]));
  const episodeById = new Map(episodes.map((memory) => [`memory:${memory.id}`, { ...memory, kind: "memory", at: new Date(memory.created_at_epoch).toISOString(), source: { type: "memory", id: memory.id } }]));
  const results = fused
    .map((entry) => factById.get(entry.id) ?? episodeById.get(entry.id))
    .filter(Boolean)
    .slice(0, Math.min(Math.max(Number(limit) || 20, 1), 200));
  return { results, channels };
}

export const formatChannels = (channels) => {
  const on = (value) => (value ? "on" : "off");
  const parts = [
    `facts lexical=${on(channels.facts?.lexical)} keys=${on(channels.facts?.keys)} vectors=${on(channels.facts?.vector)}`,
    `episodes lexical=${on(channels.episodes?.lexical)} vectors=${on(channels.episodes?.vector)}`,
    `fusion=${channels.fused}`,
  ];
  if (channels.history) parts.push("history=on");
  if (channels.scope) parts.push(`scope=${channels.scope}`);
  return `channels: ${parts.join("; ")}`;
};
