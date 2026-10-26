#!/usr/bin/env bun
// Retrieval benchmark on LoCoMo (snap-research/locomo, 10 long conversations, ~2000 questions with gold evidence ids).
// LLM-free: it measures only whether the memory layer surfaces the turns that contain the answer.
//
//   curl -o locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
//   ALETHEIA_TRANSFORMERS_FROM=/dir/with/node_modules bun bench/locomo-retrieval.mjs --data locomo10.json [--limit 3] [--out results.json]
//
// Strategies (same HubStore code the product runs):
//   and-prefix   the first shipped search: every word must match (as a prefix). Kept as the "before" baseline.
//   bm25         any content word may match, BM25 with stemming.
//   dense        cosine over bge-small-en-v1.5 vectors (local, quantised).
//   hybrid       bm25 + dense fused with reciprocal rank fusion.
//   hybrid+facts hybrid, plus extracted facts indexed as extra keys that point at the source turn
//                (LongMemEval's "fact-augmented key expansion"). Facts come from the dataset's own `observation` field.
// Not measured here: claude-mem's Chroma leg, any LLM-judged answer accuracy. See docs/14.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createEmbedder } from "../src/hub/embed.mjs";
import { createReranker } from "../src/hub/rerank.mjs";
import { extractFactsByRules, extractFactsWithProvider } from "../src/hub/facts.mjs";
import { openAiProvider } from "../src/refresh/providers.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { sha256 } from "../src/lib/util.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
const dataPath = args.data ?? "locomo10.json";
const dataRaw = readFileSync(dataPath);
const datasetSha256 = createHash("sha256").update(dataRaw).digest("hex");
const data = JSON.parse(dataRaw.toString("utf8")).slice(0, Number(args.limit) || 10);
const factsMode = ["none", "dataset", "rules", "provider"].includes(args.facts) ? args.facts : "dataset";
const KS = [1, 3, 5, 10, 15];
const cachePath = args.cache ?? "/tmp/locomo-emb-cache.json";
const cache = existsSync(cachePath) ? new Map(Object.entries(JSON.parse(readFileSync(cachePath, "utf8")))) : new Map();
const embedder = await createEmbedder();
const providerAsk = factsMode === "provider"
  ? openAiProvider({
    url: args.url ?? process.env.ALETHEIA_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1/chat/completions",
    model: args.model ?? process.env.ALETHEIA_OPENAI_MODEL ?? "",
    provider: "local",
    jsonMode: false,
    timeoutMs: Number(args["timeout-ms"]) || 15 * 60_000,
  })
  : null;
if (factsMode === "provider" && !(args.model ?? process.env.ALETHEIA_OPENAI_MODEL ?? "")) {
  throw new Error("--facts provider needs --model <name> (or ALETHEIA_OPENAI_MODEL).");
}
const reranker = args.rerank ? await createReranker({ model: typeof args.rerank === "string" ? args.rerank : undefined }) : null;
const key = (t) => sha256(`${embedder.model}\n${t}`).slice(0, 24);

async function embedAll(texts) {
  const need = [...new Set(texts)].filter((t) => !cache.has(key(t)));
  if (need.length) {
    const vecs = await embedder.embedDocs(need);
    need.forEach((t, i) => cache.set(key(t), Array.from(vecs[i])));
  }
  return texts.map((t) => Float32Array.from(cache.get(key(t))));
}

const evidenceIds = (ev) => [...new Set((ev ?? []).flatMap((e) => String(e).split(/[;,\s]+/)).filter((e) => /^D\d+:\d+$/.test(e)))];

function turnsOf(conv) {
  const out = [];
  for (const k of Object.keys(conv).filter((k) => /^session_\d+$/.test(k)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))) {
    const date = conv[`${k}_date_time`];
    for (const t of conv[k]) out.push({ id: t.dia_id, session: k, date, speaker: t.speaker, text: [t.text, t.blip_caption ? `(shared image: ${t.blip_caption})` : ""].filter(Boolean).join(" ") });
  }
  return out;
}

const results = {};
const bump = (name, cat, m) => {
  const r = (results[name] ??= { n: 0, ms: 0, tokens: 0, byCat: {} });
  const c = (r.byCat[cat] ??= { n: 0 });
  for (const target of [r, c]) {
    target.n++;
    for (const k of KS) { target[`R@${k}`] = (target[`R@${k}`] ?? 0) + m.recall[k]; target[`full@${k}`] = (target[`full@${k}`] ?? 0) + m.full[k]; }
    target.mrr = (target.mrr ?? 0) + m.mrr;
  }
  r.ms += m.ms;
  r.tokens += m.tokens;
};

function score(ranked, gold, turnById, tokK = 5) {
  const recall = {}, full = {};
  for (const k of KS) {
    const top = new Set(ranked.slice(0, k));
    const hit = gold.filter((g) => top.has(g)).length;
    recall[k] = hit / gold.length;
    full[k] = hit === gold.length ? 1 : 0;
  }
  const first = ranked.findIndex((id) => gold.includes(id));
  const tokens = Math.round(ranked.slice(0, tokK).reduce((s, id) => s + (turnById.get(id)?.length ?? 0), 0) / 4);
  return { recall, full, mrr: first < 0 ? 0 : 1 / (first + 1), tokens };
}

const keep = [];
const pending = [];
let questions = 0;
for (const sample of data) {
  const turns = turnsOf(sample.conversation);
  const turnById = new Map(turns.map((t) => [t.id, `${t.speaker}: ${t.text}`]));
  const store = new HubStore(":memory:");
  if (args.maxterms) store.termOptions.max = Number(args.maxterms);
  if (args.maxshare) store.termOptions.maxShare = Number(args.maxshare);
  const idToTurn = new Map(); // memory id -> dia id
  const texts = [];
  for (const t of turns) {
    const body = `[${t.date}] ${t.speaker}: ${t.text}`;
    const r = store.add({ project: sample.sample_id, kind: "observation", type: "note", title: `${t.speaker}: ${t.text}`.slice(0, 380), narrative: `${body} #${t.id}`, tool: "locomo", origin: t.id, createdAtEpoch: 1 });
    idToTurn.set(r.id, t.id);
    texts.push({ id: r.id, text: body });
  }
  // Fact-augmented keys: `dataset` uses the benchmark's own observations, `rules` uses our rule extractor,
  // `provider` asks a local OpenAI-compatible endpoint. Every fact points at the turn it came from.
  const factRows = [];
  const seenFacts = new Set();
  const addFactRow = (text, diaId, tool) => {
    if (!text || !diaId || seenFacts.has(text.toLowerCase())) return;
    seenFacts.add(text.toLowerCase());
    const speaker = turns.find((t) => t.id === diaId)?.speaker ?? "fact";
    const r = store.add({ project: sample.sample_id, kind: "summary", type: "note", title: `FACT ${text}`.slice(0, 380), narrative: `${speaker}: ${text} #${diaId}`, tool, origin: diaId, createdAtEpoch: 1 });
    if (r.created) { idToTurn.set(r.id, diaId); factRows.push({ id: r.id, text: `${speaker}: ${text}` }); }
  };
  if (factsMode === "dataset") {
    for (const [sess, perSpeaker] of Object.entries(sample.observation ?? {})) {
      for (const [speaker, facts] of Object.entries(perSpeaker)) {
        for (const [fact, diaId] of facts) {
          const ids = evidenceIds([diaId]);
          if (!ids.length) continue;
          addFactRow(fact, ids[0], "locomo-facts");
        }
      }
    }
  } else if (factsMode === "rules") {
    for (const [index, turn] of turns.entries()) {
      const result = extractFactsByRules([{ episodeId: index, text: turn.text, createdAtEpoch: 1, tool: "locomo", kind: "message" }]);
      for (const fact of result.facts) addFactRow(fact.text, turn.id, "aletheia-rules");
    }
  } else if (factsMode === "provider") {
    const windowSize = Number(args.window) || 20;
    for (let start = 0; start < turns.length; start += windowSize) {
      const slice = turns.slice(start, start + windowSize);
      const window = slice.map((turn, offset) => ({ episodeId: start + offset, text: turn.text, createdAtEpoch: 1, tool: "locomo", kind: "message" }));
      const result = await extractFactsWithProvider({ window, project: sample.sample_id, ask: providerAsk });
      for (const fact of result.facts) {
        const turn = turns[Number(fact.episodeIds[0])];
        if (turn) addFactRow(fact.text, turn.id, "aletheia-provider");
      }
      if ((start / windowSize) % 10 === 0) console.error(`  provider: ${start + slice.length}/${turns.length} turns, ${factRows.length} fact(s)`);
    }
  }
  console.error(`  ${sample.sample_id}: ${turns.length} turns, ${factRows.length} ${factsMode} fact(s)`);
  const all = [...texts, ...factRows];
  const vecs = await embedAll(all.map((x) => x.text));
  all.forEach((x, i) => store.setVector(x.id, embedder.model, vecs[i]));
  const memText = new Map(all.map((x) => [x.id, x.text]));
  const turnIndex = new Map(turns.map((t, i) => [t.id, i]));

  const dedupe = (memIds) => [...new Set(memIds.map((m) => idToTurn.get(m)).filter(Boolean))];
  for (const qa of sample.qa) {
    const gold = evidenceIds(qa.evidence);
    if (!gold.length || qa.category === 5) continue;
    questions++;
    const qv = await embedder.embedQuery(qa.question);
    const timed = (fn) => { const t0 = performance.now(); const ids = fn(); return { ids, ms: performance.now() - t0 }; };
    const runs = {
      "and-prefix": timed(() => dedupe(store.list({ q: qa.question, project: sample.sample_id, kind: "observation", limit: 50 }).items.map((m) => m.id))),
      bm25: timed(() => dedupe(store.ranked({ query: qa.question, project: sample.sample_id, kind: "observation", limit: 50 }).map((m) => m.id))),
      dense: timed(() => dedupe(store.ranked({ query: "", project: sample.sample_id, kind: "observation", limit: 50, queryVec: qv }).map((m) => m.id))),
      hybrid: timed(() => dedupe(store.ranked({ query: qa.question, project: sample.sample_id, kind: "observation", limit: 50, queryVec: qv }).map((m) => m.id))),
      "hybrid+facts": timed(() => dedupe(store.ranked({ query: qa.question, project: sample.sample_id, limit: 100, queryVec: qv }).map((m) => m.id))),
    };
    if (reranker) {
      // Candidates are collected now (SQLite) and reranked after every conversation is done. Using SQLite after the
      // cross-encoder ran gave wrong results in the same process (Bun 1.3.10 + onnxruntime), so the two never interleave.
      const cands = store.ranked({ query: qa.question, project: sample.sample_id, limit: 30, queryVec: qv });
      pending.push({ qa, gold, cands: cands.map((m) => ({ turn: idToTurn.get(m.id), text: memText.get(m.id) ?? m.title })), turns, turnIndex, turnById });
    }
    for (const [name, run] of Object.entries(runs)) bump(name, qa.category, { ...score(run.ids, gold, turnById, run.windowTokens ? 15 : 5), ms: run.ms });
  }
  keep.push(store); // not closed: closing an in-memory store while the ONNX runtime is active crashed the next one (Bun 1.3.10)
  console.error(`  ${sample.sample_id}: ${turns.length} turns, ${factRows.length} facts, ${questions} questions so far`);
}
if (reranker) {
  for (const p of pending) {
    const t2 = performance.now();
    const scores = await reranker.score(p.qa.question, p.cands.map((c) => c.text));
    const order = p.cands.map((c, i) => ({ c, s: scores[i] })).sort((a, b) => b.s - a.s).map((x) => x.c.turn).filter(Boolean);
    const ranked = [...new Set(order)];
    const ms = performance.now() - t2;
    bump("hybrid+facts+rerank", p.qa.category, { ...score(ranked, p.gold, p.turnById), ms });
    // window: the same ranking, but each of the top 5 hits also brings its neighbouring turns (costs tokens)
    const windowed = [];
    for (const id of ranked.slice(0, 5)) { const i = p.turnIndex.get(id); for (const j of [i, i - 1, i + 1]) { const tid = p.turns[j]?.id; if (tid && !windowed.includes(tid)) windowed.push(tid); } }
    bump("+window(top5 +-1)", p.qa.category, { ...score(windowed, p.gold, p.turnById, 15), ms });
  }
}
writeFileSync(cachePath, JSON.stringify(Object.fromEntries(cache)));

const pct = (x, n) => (n ? ((100 * x) / n).toFixed(1).padStart(5) : "  n/a");
const names = Object.keys(results);
console.log(`\nLoCoMo retrieval: ${questions} questions (categories 1-4, with gold evidence) over ${data.length} conversations`);
console.log(`facts ${factsMode}; dataset sha256 ${datasetSha256}`);
console.log(`model ${embedder.model} (${embedder.dim} dims)\n`);
console.log(`${"strategy".padEnd(14)} ${KS.map((k) => `R@${k}`.padStart(6)).join("")}  ${KS.map((k) => `all@${k}`.padStart(7)).join("")}   MRR  tok@5  ms/q`);
for (const n of names) {
  const r = results[n];
  console.log(`${n.padEnd(14)} ${KS.map((k) => pct(r[`R@${k}`], r.n).padStart(6)).join("")}  ${KS.map((k) => pct(r[`full@${k}`], r.n).padStart(7)).join("")}  ${(r.mrr / r.n).toFixed(3)}  ${String(Math.round(r.tokens / r.n)).padStart(5)} ${(r.ms / r.n).toFixed(2).padStart(5)}`);
}
console.log("\nRecall@5 by LoCoMo category number:");
const cats = [...new Set(names.flatMap((n) => Object.keys(results[n].byCat)))].sort();
console.log(`${"strategy".padEnd(14)} ${cats.map((c) => `cat${c}(n=${results[names[0]].byCat[c]?.n})`.padStart(12)).join("")}`);
for (const n of names) console.log(`${n.padEnd(14)} ${cats.map((c) => pct(results[n].byCat[c]?.["R@5"], results[n].byCat[c]?.n).padStart(12)).join("")}`);
if (args.out) writeFileSync(args.out, JSON.stringify({
  questions,
  conversations: data.length,
  model: embedder.model,
  dim: embedder.dim,
  factsMode,
  dataset: dataPath,
  datasetSha256,
  generatedAt: new Date().toISOString(),
  rerank: Boolean(reranker),
  results,
}, null, 2));
