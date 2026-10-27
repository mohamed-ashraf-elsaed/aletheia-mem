#!/usr/bin/env bun
// Synthetic graph retrieval benchmark (T-048). No model, no network, FTS5 + in-memory entity keys only.
//   bun bench/graph-recall.mjs [--pairs 200] [--out /tmp/graph-recall.json]
// Each pair is a seed memory and an answer memory that share one project-scoped entity; the query matches the seed
// lexically and the answer only through the graph. Reports Recall@5 with the graph channel off and on.
import { writeFileSync } from "node:fs";
import { HubStore } from "../src/hub/store.mjs";
import { linkMemoryEntity } from "../src/hub/graph.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
const PAIRS = Number(args.pairs) || 200;
const OUT = args.out ?? null;

const store = new HubStore(":memory:");
const gold = [];
for (let i = 0; i < PAIRS; i++) {
  const seedMem = store.add({ project: "p", kind: "note", type: "note", title: `seed ${i}`, narrative: `seedword${i} topicword${i}`, tool: "graph-bench" }, { actor: "import" });
  const answerMem = store.add({ project: "p", kind: "note", type: "note", title: `answer ${i}`, narrative: `answerword${i} topicword${i}`, tool: "graph-bench" }, { actor: "import" });
  linkMemoryEntity(store, { memoryId: seedMem.id, entity: `topicword${i}` });
  linkMemoryEntity(store, { memoryId: answerMem.id, entity: `topicword${i}` });
  gold.push({ query: `seedword${i}`, answerId: answerMem.id });
}

const recall5 = (useGraph) => {
  let hits = 0;
  for (const g of gold) {
    const ids = store.ranked({ query: g.query, project: "p", limit: 5, graph: useGraph }).map((m) => m.id);
    if (ids.includes(g.answerId)) hits += 1;
  }
  return hits / gold.length;
};

const off = recall5(false);
const on = recall5(true);
console.log(`graph recall@5 off ${(off * 100).toFixed(1)}%  on ${(on * 100).toFixed(1)}%  (${gold.length} synthetic pairs)`);
const summary = {
  generatedAt: new Date().toISOString(),
  synthetic: true,
  pairs: gold.length,
  recall5_graph_off: Number((off * 100).toFixed(1)),
  recall5_graph_on: Number((on * 100).toFixed(1)),
  rise_points: Number(((on - off) * 100).toFixed(1)),
  command: `bun bench/graph-recall.mjs --pairs ${PAIRS}`,
  machine: "Linux, FTS5 + in-memory entity keys, no model, no network",
};
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
store.close();
