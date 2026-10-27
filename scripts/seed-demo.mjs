#!/usr/bin/env bun
// Fill a hub database with clearly fake demo data, for screenshots and performance checks.
//   bun scripts/seed-demo.mjs --data <dir> [--rows 120] [--empty] [--force]
// It writes only to <dir>/hub.db. It refuses to touch a database that already has rows unless that database was
// seeded by this script (it stores a "demo.seeded" setting) or --force is given. Nothing here is real: every project
// is named demo-*, every tool is "demo-seed", and the UI labels demo mode with ?demo=1.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { HubStore } from "../src/hub/store.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };

export const DEMO_PROJECTS = ["demo-shop", "demo-blog", "demo-api"];
const DAY = 86_400_000;
const LONG_TOKEN = "x".repeat(200);
const ARABIC = "هذا نص تجريبي طويل باللغة العربية لاختبار اتجاه الكتابة من اليمين إلى اليسار داخل البطاقات والقوائم وعناصر البحث دون كسر التخطيط";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = ["checkout retry", "cache warm-up", "migration order", "rate limits", "image resize", "login flow", "search index", "webhook signing", "queue backoff", "feature flags"];
const VERBS = ["uses", "prefers", "requires", "avoids", "retries", "caches", "logs"];
const OBJECTS = ["Postgres 16", "pnpm", "a 30 second timeout", "UTC timestamps", "two workers", "opaque ids", "a dry run first"];
const TYPES = ["bugfix", "feature", "refactor", "change", "discovery", "decision", "gotcha", "note"];
const KINDS = ["observation", "observation", "observation", "note", "prompt", "event"];

export function seed(dataDir, { rows = 120, empty = false, force = false } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const hub = new HubStore(join(dataDir, "hub.db"));
  const existing = hub.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n;
  if (existing > 0 && !hub.setting("demo.seeded", false) && !force) {
    hub.close();
    throw new Error(`${dataDir}/hub.db already has ${existing} rows and was not seeded by this script. Use an empty folder, or pass --force.`);
  }
  if (empty) { hub.setSetting("demo.seeded", true); hub.close(); return { memories: 0 }; }
  const rand = rng(20261027);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const now = Date.now();
  const insert = hub.db.transaction(() => {
    const memoryIds = [];
    for (let i = 0; i < rows; i += 1) {
      const project = DEMO_PROJECTS[i % DEMO_PROJECTS.length];
      const topic = pick(TOPICS);
      const kind = pick(KINDS);
      const special = i % 40 === 0 ? ARABIC : i % 53 === 0 ? `Unbroken token: ${LONG_TOKEN}` : "";
      const narrative = [
        `We looked at **${topic}** in ${project}. The team ${pick(VERBS)} ${pick(OBJECTS)}.`,
        i % 7 === 0 ? "```sh\nbun test --filter retry\n```" : "",
        i % 9 === 0 ? "- check the logs\n- run the migration\n- [x] update the docs" : "",
        i % 11 === 0 ? "| step | owner |\n|---|---|\n| deploy | demo |\n| verify | demo |" : "",
        i % 5 === 0 ? "More detail: the first attempt failed because the queue was full. The second used a longer backoff and a smaller batch. The third added a dead-letter table so nothing is lost. After a week the error rate fell and the on-call load fell with it." : "",
        special,
      ].filter(Boolean).join("\n\n");
      const added = hub.add({
        project, kind, type: kind === "observation" ? pick(TYPES) : "note", title: `${topic} (demo ${i + 1})`, narrative, tool: "demo-seed",
        sessionId: `demo-session-${i % 14}`, createdAtEpoch: now - Math.floor((i / rows) * 30 * DAY) - Math.floor(rand() * 3_600_000), pinned: i % 23 === 0, files: i % 3 === 0 ? [`src/${topic.split(" ")[0]}.mjs`, "test/demo.test.mjs"] : [],
      }, { actor: "demo", audit: false });
      memoryIds.push(added.id);
    }
    const factCount = Math.max(10, Math.round(rows / 3));
    const episodeIds = [];
    for (let i = 0; i < factCount; i += 1) {
      const project = DEMO_PROJECTS[i % DEMO_PROJECTS.length];
      const at = now - Math.floor((i / factCount) * 30 * DAY);
      const episode = hub.addEpisode({ project, tool: "demo-seed", sessionId: `demo-session-${i % 14}`, text: `Demo turn ${i}: the ${pick(TOPICS)} work ${pick(VERBS)} ${pick(OBJECTS)}.`, sourceRef: `demo:${i}`, createdAtEpoch: at });
      episodeIds.push(episode.id);
      const topic = pick(TOPICS);
      const object = pick(OBJECTS);
      const fact = hub.addFact({
        project, episodeId: episode.id, subject: topic, predicate: pick(VERBS), object: `${object} #${i}`, text: `The ${topic} work ${pick(VERBS)} ${object} (demo fact ${i + 1}).`,
        extractorMode: i % 4 === 0 ? "provider" : "rules", confidence: 0.5 + rand() * 0.5, recordedAtEpoch: at, status: i % 9 === 0 ? "superseded" : "active",
      }, { actor: "demo" });
      if (i % 6 === 0 && fact.created) hub.addReview({ itemType: "fact", itemId: fact.id, reason: "contradiction" });
      if (i % 17 === 5 && fact.created) hub.dismiss("fact", fact.id, { actor: "demo", reason: "demo noise" });
    }
    for (let i = 0; i < Math.max(8, Math.round(rows / 10)); i += 1) {
      hub.db.prepare("INSERT OR IGNORE INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch) VALUES (?,?,?,?,?,?,?,?)")
        .run(DEMO_PROJECTS[i % 3], `Demo rule ${i + 1}: run the tests before saying a task is done`, i % 2 ? "editing tests" : "", 0.55 + (i % 5) / 12, "prompt", i, i % 5 === 4 ? "dismissed" : "pending", now - i * 3_600_000);
    }
    for (let i = 0; i < Math.min(8, Math.round(rows / 15)); i += 1) hub.dismiss("memory", memoryIds[(i * 7) % memoryIds.length], { actor: "demo", reason: "demo duplicate" });
    for (let i = 0; i < Math.round(rows / 4); i += 1) hub.audit(i % 3 ? "ui" : "demo", i % 2 ? "memory.update" : "memory.pin", { id: i, note: "demo" });
    hub.setSetting("demo.seeded", true);
  });
  insert();
  const stats = {
    memories: hub.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n,
    facts: hub.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n,
    review: hub.db.prepare("SELECT COUNT(*) AS n FROM review_queue").get().n,
  };
  hub.optimizeFts?.();
  hub.close();
  return stats;
}

if (import.meta.main) {
  const data = value("data", null);
  if (!data) { console.error("Usage: bun scripts/seed-demo.mjs --data <dir> [--rows 120] [--empty] [--force]\nThere is no default: it never guesses a folder."); process.exit(2); }
  const dir = resolve(data);
  const home = process.env.HOME ? resolve(process.env.HOME) : "";
  if (home && [join(home, ".aletheia"), join(home, ".work-view-local"), join(home, ".claude-mem"), join(home, ".claude")].includes(dir) && !flag("force")) {
    console.error(`${dir} looks like a real data folder. Refusing. Use a temporary folder.`);
    process.exit(2);
  }
  try {
    const result = seed(dir, { rows: Number(value("rows", 120)) || 120, empty: flag("empty"), force: flag("force") });
    console.log(`seeded ${dir}/hub.db: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
