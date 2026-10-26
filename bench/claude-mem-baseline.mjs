#!/usr/bin/env bun
// The same LoCoMo retrieval benchmark, run against a REAL claude-mem worker (its FTS + Chroma hybrid as shipped),
// so "better than claude-mem" is a measurement and not a claim.
//
// Run the worker ISOLATED (own data dir, own port) so your real memory is untouched:
//   CLAUDE_MEM_DATA_DIR=/tmp/cm-iso CLAUDE_MEM_WORKER_PORT=37795 CLAUDE_MEM_TELEMETRY=0 \
//     bun ~/.claude/plugins/cache/thedotmack/claude-mem/<ver>/scripts/worker-service.cjs --daemon
//   bun bench/claude-mem-baseline.mjs --data locomo10.json --port 37795 [--limit N] [--out file]
//
// Ingest: each dialog turn is saved with POST /api/memory/save (project = conversation id, metadata.dia = turn id).
// Query: GET /api/search?query=<question>&project=<conversation>&limit=10&format=json, observations in returned order.
// Caveat: claude-mem is built to ingest through its LLM observer; raw saves are the closest LLM-free equivalent.
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
const base = `http://127.0.0.1:${args.port ?? 37795}`;
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const data = JSON.parse(readFileSync(args.data ?? "locomo10.json", "utf8")).filter((s) => !only || only.has(s.sample_id)).slice(0, Number(args.limit) || 10);
const KS = [1, 3, 5, 10];
const concurrency = Number(args.concurrency) || 4;
const STOP = new Set("a about after again all also am an and any are as at be because been before being both but by can could did do does doing for from had has have he her him his how i if in into is it its just me more most my no not of on or other our out over she so some such than that the their them then there these they this those to too under up very was we were what when where which who why will with would you your".split(" "));
const keywordQuery = (q) => [...new Set((q.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)))].join(" ");

const evidenceIds = (ev) => [...new Set((ev ?? []).flatMap((e) => String(e).split(/[;,\s]+/)).filter((e) => /^D\d+:\d+$/.test(e)))];
const post = (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

function turnsOf(conv) {
  const out = [];
  for (const k of Object.keys(conv).filter((k) => /^session_\d+$/.test(k)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))) {
    for (const t of conv[k]) out.push({ id: t.dia_id, date: conv[`${k}_date_time`], speaker: t.speaker, text: [t.text, t.blip_caption ? `(shared image: ${t.blip_caption})` : ""].filter(Boolean).join(" ") });
  }
  return out;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const item = items[i++]; await fn(item); } }));
}

const acc = { n: 0, ms: 0, empty: 0, tokens: 0, byCat: {} };
for (const k of KS) { acc[`R@${k}`] = 0; acc[`full@${k}`] = 0; }
acc.mrr = 0;
let questions = 0;

for (const sample of data) {
  const turns = turnsOf(sample.conversation);
  const t0 = Date.now();
  let saved = 0;
  if (!args["skip-ingest"]) await pool(turns, concurrency, async (t) => {
    const body = `[${t.date}] ${t.speaker}: ${t.text}`;
    const r = await post("/api/memory/save", { text: body, title: `${t.speaker}: ${t.text}`.slice(0, 380), project: sample.sample_id, metadata: { dia: t.id } });
    if (!r.success) throw new Error(`save failed: ${JSON.stringify(r)}`);
    saved++;
  });
  if (args.facts && !args["skip-ingest"]) {
    // Give claude-mem the same extracted facts the "hybrid+facts" arm gets: each fact saved as a memory pointing at its source turn.
    const facts = [];
    for (const perSpeaker of Object.values(sample.observation ?? {})) for (const [speaker, list] of Object.entries(perSpeaker)) for (const [fact, dia] of list) { const id = evidenceIds([dia])[0]; if (id) facts.push({ speaker, fact, id }); }
    await pool(facts, concurrency, async (f) => { await post("/api/memory/save", { text: `${f.speaker}: ${f.fact}`, title: `FACT ${f.fact}`.slice(0, 380), project: sample.sample_id, metadata: { dia: f.id } }); });
    console.error(`  ${sample.sample_id}: also saved ${facts.length} facts`);
  }
  console.error(`  ${sample.sample_id}: saved ${saved} turns in ${((Date.now() - t0) / 1000).toFixed(0)}s; waiting for vector index`);
  if (!args["skip-ingest"]) await new Promise((r) => setTimeout(r, Number(args.settle) || 15_000));
  if (args["ingest-only"]) continue;
  const turnById = new Map(turns.map((t) => [t.id, `${t.speaker}: ${t.text}`]));
  const qas = sample.qa.filter((qa) => evidenceIds(qa.evidence).length && qa.category !== 5);
  questions += qas.length;
  await pool(qas, Number(args.qconc) || 1, async (qa) => {
    const gold = evidenceIds(qa.evidence);
    const t1 = performance.now();
    const res = await (await fetch(`${base}/api/search?${new URLSearchParams({ query: args.keywords ? keywordQuery(qa.question) : qa.question, project: sample.sample_id, limit: "10", format: "json" })}`)).json();
    const ms = performance.now() - t1;
    const ranked = [...new Set((res.observations ?? []).map((o) => { try { return JSON.parse(o.metadata ?? "{}").dia; } catch { return null; } }).filter(Boolean))];
    if (!ranked.length) acc.empty++;
    const cat = (acc.byCat[qa.category] ??= { n: 0, "R@5": 0 });
    acc.n++; cat.n++; acc.ms += ms;
    for (const k of KS) {
      const top = new Set(ranked.slice(0, k));
      const hit = gold.filter((g) => top.has(g)).length;
      acc[`R@${k}`] += hit / gold.length;
      acc[`full@${k}`] += hit === gold.length ? 1 : 0;
      if (k === 5) cat["R@5"] += hit / gold.length;
    }
    const first = ranked.findIndex((id) => gold.includes(id));
    acc.mrr += first < 0 ? 0 : 1 / (first + 1);
    acc.tokens += Math.round(ranked.slice(0, 5).reduce((s, id) => s + (turnById.get(id)?.length ?? 0), 0) / 4);
  });
  console.error(`  ${sample.sample_id}: ${acc.n} questions scored so far`);
}

const pct = (x, n) => ((100 * x) / n).toFixed(1).padStart(5);
console.log(`\nclaude-mem (as shipped, isolated worker) on LoCoMo: ${acc.n} questions, ${data.length} conversations; ${acc.empty} returned no results`);
console.log(`${"strategy".padEnd(14)} ${KS.map((k) => `R@${k}`.padStart(6)).join("")}  ${KS.map((k) => `all@${k}`.padStart(7)).join("")}   MRR  tok@5  ms/q`);
console.log(`${"claude-mem".padEnd(14)} ${KS.map((k) => pct(acc[`R@${k}`], acc.n).padStart(6)).join("")}  ${KS.map((k) => pct(acc[`full@${k}`], acc.n).padStart(7)).join("")}  ${(acc.mrr / acc.n).toFixed(3)}  ${String(Math.round(acc.tokens / acc.n)).padStart(5)} ${(acc.ms / acc.n).toFixed(2).padStart(5)}`);
console.log(`Recall@5 by category: ${Object.entries(acc.byCat).map(([c, v]) => `cat${c}(n=${v.n}) ${pct(v["R@5"], v.n)}`).join("  ")}`);
if (args.out) writeFileSync(args.out, JSON.stringify({ questions: acc.n, ...acc }, null, 2));
