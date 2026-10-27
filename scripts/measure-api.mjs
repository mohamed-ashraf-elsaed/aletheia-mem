#!/usr/bin/env bun
// Time the list routes the UI pages through, against a running server. Prints median and p95 in milliseconds.
//   bun scripts/measure-api.mjs [base-url] [requests]
// Use it on a server whose data folder holds only demo rows (see scripts/seed-demo.mjs). Read-only: GET requests and
// one POST to /v1/search, which does not write.
const base = process.argv[2] ?? "http://127.0.0.1:37891";
const runs = Number(process.argv[3] ?? 200);

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
async function time(label, make) {
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    const response = await make(i);
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(46)} median ${pct(times, 0.5).toFixed(1).padStart(6)} ms   p95 ${pct(times, 0.95).toFixed(1).padStart(6)} ms   (${runs} requests)`);
}

const total = (await (await fetch(`${base}/api/hub/memories?limit=1`)).json()).total;
console.log(`server ${base}: ${total} memories`);
const offsetFor = (i, size) => ((i * 7919) % Math.max(1, Math.floor(total / size))) * size;
await time("GET /api/hub/memories?limit=25 (random page)", (i) => fetch(`${base}/api/hub/memories?limit=25&offset=${offsetFor(i, 25)}`));
await time("GET /api/hub/memories?limit=100 (random page)", (i) => fetch(`${base}/api/hub/memories?limit=100&offset=${offsetFor(i, 100)}`));
await time("GET /api/hub/memories?q=retry&limit=25", () => fetch(`${base}/api/hub/memories?q=retry&limit=25`));
await time("GET /api/hub/memories?sort=oldest&since=… (date range)", () => fetch(`${base}/api/hub/memories?limit=25&sort=oldest&since=2026-10-01`));
await time("GET /api/hub/facts?limit=25 (random page)", (i) => fetch(`${base}/api/hub/facts?limit=25&offset=${offsetFor(i, 25)}`));
await time("GET /api/hub/review?status=pending&limit=10&dupes=0", () => fetch(`${base}/api/hub/review?status=pending&limit=10&dupes=0`));
await time("GET /api/hub/dismissed?limit=25", () => fetch(`${base}/api/hub/dismissed?limit=25`));
await time("GET /api/hub/audit?limit=25", () => fetch(`${base}/api/hub/audit?limit=25`));
await time("GET /v1/work/sessions?limit=10", () => fetch(`${base}/v1/work/sessions?limit=10`));
await time("GET /v1/work?sessions=1&facts=8&review=6", () => fetch(`${base}/v1/work?sessions=1&facts=8&review=6`));
await time("POST /v1/search (limit 25, paged)", () => fetch(`${base}/v1/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "checkout retry", limit: 25, offset: 0, paged: true }) }));
await time("GET /v1/health", () => fetch(`${base}/v1/health`));
