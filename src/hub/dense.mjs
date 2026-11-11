// Dense (vector) channel for the server surfaces: /v1/search, MCP `search` and the dashboard search. The embedding
// runtime is the optional package @huggingface/transformers. It is loaded lazily, once per process, and every query
// runs under a time budget: when the package is missing, the model is still loading, or the embed call is slow, the
// surface answers from the keyword channels and says why in a note.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createEmbedder } from "./embed.mjs";

export const DENSE_BUDGET_MS = 1500;
const RETRY_MISSING_MS = 60_000;

export const MISSING_PACKAGE_NOTE = "Dense search is off: the optional package @huggingface/transformers is not installed (bun add @huggingface/transformers). These are keyword results.";
const NO_VECTORS_NOTE = "Dense search is available but no vectors are stored yet, so these are keyword results. Run `aletheia embed`, or let the server worker embed new facts.";

let loading = null;
let missingAt = 0;

const MISSING_ERROR = "Semantic search needs the optional package: bun add @huggingface/transformers";

/**
 * True when the package is on disk in a node_modules above this project or above ALETHEIA_TRANSFORMERS_FROM. Bun
 * installs a missing package from npm on import when no node_modules exists, which would be a network call nobody asked
 * for, so the server surfaces check the disk first and never trigger that install.
 */
export function packageInstalled() {
  const starts = [import.meta.dir, process.env.ALETHEIA_TRANSFORMERS_FROM].filter(Boolean);
  for (let dir of starts) {
    for (;;) {
      if (existsSync(join(dir, "node_modules", "@huggingface", "transformers", "package.json"))) return true;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return false;
}

/** The default embedder, loaded on first use only. A load that fails is retried after a minute, not on every query. */
export function sharedEmbedder() {
  if (process.env.ALETHEIA_DENSE === "0") return Promise.reject(new Error("Dense search is turned off by ALETHEIA_DENSE=0."));
  if (!loading) {
    if (missingAt && Date.now() - missingAt < RETRY_MISSING_MS) return Promise.reject(new Error(MISSING_ERROR));
    if (!packageInstalled()) {
      missingAt = Date.now();
      return Promise.reject(new Error(MISSING_ERROR));
    }
    loading = createEmbedder().catch((error) => {
      loading = null;
      missingAt = Date.now();
      throw error;
    });
  }
  return loading;
}

/** `source` is an embedder object, a function that returns one (or throws), or undefined for the shared embedder. */
const resolveSource = (source) => {
  if (source === undefined) return sharedEmbedder();
  if (typeof source === "function") return Promise.resolve().then(source);
  return Promise.resolve(source);
};

/** For the background worker: the embedder or null. Never throws, so a missing package is not an error every tick. */
export const workerEmbedder = (source) => async () => {
  try {
    return (await resolveSource(source)) ?? null;
  } catch {
    return null;
  }
};

export function hasVectors(store) {
  const row = store.db.prepare("SELECT EXISTS(SELECT 1 FROM fact_vectors) AS facts, EXISTS(SELECT 1 FROM memory_vectors) AS memories").get();
  return Boolean(row.facts || row.memories);
}

const missing = (error) => /optional package/.test(String(error?.message));
const withTimeout = (promise, ms) => {
  let timer;
  const budget = new Promise((resolve) => { timer = setTimeout(() => resolve(BUDGET), ms); });
  return Promise.race([promise, budget]).finally(() => clearTimeout(timer));
};
const BUDGET = Symbol("budget");

/**
 * Embed `query` for the hybrid ranking. Never throws. Returns `{ queryVec, dense, notice }`: `queryVec` is null whenever
 * the surface should answer from keywords; `dense.status` is "on", "off" or "fallback"; `notice` is the sentence a
 * caller shows when something is worth telling (package missing, still loading, no vectors, over budget), else null.
 */
export async function denseQuery({ store, query, embedder, budgetMs = Number(process.env.ALETHEIA_DENSE_BUDGET_MS) || DENSE_BUDGET_MS } = {}) {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  const off = (reason, notice) => ({ queryVec: null, dense: { status: "off", reason, ms: ms() }, notice });
  const fallback = (reason, notice, model = null) => ({ queryVec: null, dense: { status: "fallback", reason, ...(model ? { model } : {}), ms: ms() }, notice });
  const work = resolveSource(embedder);
  work.catch(() => {}); // a late failure after the budget is not an unhandled rejection
  let ready;
  try {
    ready = await withTimeout(work, budgetMs);
  } catch (error) {
    if (process.env.ALETHEIA_DENSE === "0") return off("disabled", null);
    if (missing(error)) return off("missing_package", MISSING_PACKAGE_NOTE);
    return fallback("load_failed", `Dense search failed to load (${String(error?.message ?? error).slice(0, 120)}). These are keyword results.`);
  }
  if (ready === BUDGET) return fallback("loading", `Dense search is still loading its model (over the ${budgetMs} ms budget). These are keyword results; try again shortly.`);
  if (!ready) return off("missing_package", MISSING_PACKAGE_NOTE);
  if (!hasVectors(store)) return off("no_vectors", NO_VECTORS_NOTE);
  try {
    const vec = await withTimeout(Promise.resolve().then(() => ready.embedQuery(query)), Math.max(budgetMs - ms(), 1));
    if (vec === BUDGET) return fallback("slow", `Embedding the query went over the ${budgetMs} ms budget. These are keyword results.`, ready.model);
    return { queryVec: vec, dense: { status: "on", model: ready.model ?? null, ms: ms() }, notice: null };
  } catch (error) {
    return fallback("embed_failed", `Embedding the query failed (${String(error?.message ?? error).slice(0, 120)}). These are keyword results.`, ready.model);
  }
}

/** The `channels` object of a REST reply: the keyword channels, plus the dense channel when it ran. */
export function denseChannels(dense, { notice = null } = {}) {
  const on = dense?.status === "on";
  return {
    facts: { lexical: true, keys: true, vector: on },
    episodes: { lexical: true, vector: on },
    fused: on ? "rrf" : "none",
    dense: dense ?? { status: "off" },
    ...(notice ? { notice } : {}),
  };
}
