// Merging one project into another moves every project-scoped table in one transaction, collapses rows that
// already exist under the target, and writes one audit entry. `aletheia projects fold-worktrees` folds worktree
// fragments into their main project: a dry run by default, worktree keys only, submodules only when named.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { planFold, planProjectMerge, projectCounts, projectTables } from "../src/hub/projects.mjs";
import { makeRepos } from "./git-repos.mjs";
import { tempDir } from "./temp-dirs.mjs";

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const CLI = join(import.meta.dir, "..", "bin", "aletheia.mjs");

/** The same content in every project-scoped table. Seeded under both projects, it is the duplicate set. */
function seedShared(store, project) {
  const memory = store.add({ project, title: "Shared decision", narrative: "use UTC everywhere", type: "decision", tool: "claude-code", files: [`src/${project}-time.mjs`], createdAtEpoch: NOW });
  const episode = store.addEpisode({ project, text: "we agreed to use UTC", tool: "claude-code", sessionId: "s1", createdAtEpoch: NOW });
  const observation = store.addObservation({ project, type: "decision", title: "Use UTC", narrative: "all times are UTC", episodeId: episode.id, createdAtEpoch: NOW }, { actor: "import" });
  const fact = store.addFact({ project, subject: "app", predicate: "uses", object: "UTC", text: "The app uses UTC.", episodeId: episode.id, observationId: observation.id }, { actor: "import" });
  const entity = Number(store.db.prepare("INSERT INTO entities (project, name, canonical_name, type, created_at_epoch) VALUES (?, 'UTC', 'utc', 'concept', ?)").run(project, NOW).lastInsertRowid);
  store.db.prepare("INSERT INTO entity_aliases (alias, entity_id) VALUES (?, ?)").run(`utc-${project}`, entity);
  store.db.prepare("INSERT INTO fact_entities (fact_id, entity_id, role) VALUES (?, ?, 'object')").run(fact.id, entity);
  store.db.prepare("INSERT INTO summaries (project, scope, period_start_epoch, period_end_epoch, text, source_ids, created_at_epoch) VALUES (?, 'project', ?, ?, 'UTC week', '[]', ?)").run(project, NOW - 1000, NOW, NOW);
  const suggestion = Number(store.db.prepare("INSERT INTO rule_suggestions (project, text, created_at_epoch, times_seen, latest_at_epoch) VALUES (?, 'Always store times in UTC', ?, 2, ?)").run(project, NOW, NOW).lastInsertRowid);
  store.db.prepare("INSERT INTO rule_suggestion_quotes (suggestion_id, project, text, at_epoch) VALUES (?, ?, 'use UTC please', ?)").run(suggestion, project, NOW);
  store.markSessionEnded(project, "s1", { now: NOW });
  return { memory: memory.id, episode: episode.id, observation: observation.id, fact: fact.id, entity, suggestion };
}

/** Rows only the worktree has, several of which point at the worktree's duplicate rows. */
function seedWorktreeOnly(store, project, shared) {
  const memory = store.add({ project, title: "Only in worktree", narrative: "the retry queue drains on start", tool: "claude-code", createdAtEpoch: NOW });
  const episode = store.addEpisode({ project, text: "worktree only turn", tool: "claude-code", sessionId: "s2", createdAtEpoch: NOW });
  const observation = store.addObservation({ project, type: "discovery", title: "Queue drains on start", narrative: "seen in the worktree", episodeId: shared.episode, createdAtEpoch: NOW }, { actor: "import" });
  const fact = store.addFact({ project, subject: "queue", predicate: "drains on", object: "start", text: "The queue drains on start.", episodeId: shared.episode, observationId: shared.observation }, { actor: "import" });
  const entity = Number(store.db.prepare("INSERT INTO entities (project, name, canonical_name, type, created_at_epoch) VALUES (?, 'Redis', 'redis', 'service', ?)").run(project, NOW).lastInsertRowid);
  store.db.prepare("INSERT INTO fact_entities (fact_id, entity_id, role) VALUES (?, ?, 'object')").run(fact.id, shared.entity);
  store.db.prepare("INSERT INTO summaries (project, scope, period_start_epoch, period_end_epoch, text, source_ids, created_at_epoch) VALUES (?, 'project', ?, ?, 'Queue week', '[]', ?)").run(project, NOW - 1000, NOW, NOW);
  store.db.prepare("INSERT INTO rule_suggestion_quotes (suggestion_id, project, text, at_epoch) VALUES (?, ?, 'UTC in the worktree too', ?)").run(shared.suggestion, project, NOW);
  const suggestion = Number(store.db.prepare("INSERT INTO rule_suggestions (project, text, created_at_epoch, times_seen, latest_at_epoch) VALUES (?, 'Never force-push', ?, 1, ?)").run(project, NOW, NOW).lastInsertRowid);
  store.db.prepare("INSERT INTO rule_suggestion_quotes (suggestion_id, project, text, at_epoch) VALUES (?, ?, 'do not force-push', ?)").run(suggestion, project, NOW);
  store.markSessionEnded(project, "s2", { now: NOW });
  store.addKey({ ownerType: "fact", ownerId: shared.fact, keyType: "topic", text: "time zone" });
  store.dismiss("fact", shared.fact, { now: NOW });
  store.dismiss("memory", memory.id, { now: NOW });
  const rule = store.rules.add({ then: "Store times in UTC" });
  store.db.prepare("INSERT INTO rule_evidence (rule_id, kind, ref_id, at_epoch) VALUES (?, 'memory', ?, ?)").run(rule.id, shared.memory, NOW);
  return { memory: memory.id, episode: episode.id, observation: observation.id, fact: fact.id, entity, suggestion };
}

function seededStore(path = ":memory:") {
  const store = new HubStore(path);
  store.db.exec("CREATE TABLE custom_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, body TEXT NOT NULL)");
  const a = seedShared(store, "shop");
  const bShared = seedShared(store, "shop/feature-abc123");
  const b = seedWorktreeOnly(store, "shop/feature-abc123", bShared);
  store.db.prepare("INSERT INTO custom_notes (project, body) VALUES (?, 'a table added later')").run("shop/feature-abc123");
  return { store, a, bShared, b };
}

const countsUnder = (store, project) => Object.fromEntries(projectTables(store.db).map((table) => [table, store.db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE project = ?`).get(project).n]));
const everyRowCount = (store) => Object.fromEntries(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND sql NOT LIKE 'CREATE VIRTUAL%'").all().map(({ name }) => [name, store.db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));

const EXPECTED = {
  memories: { moved: 1, dropped: 1 },
  episodes: { moved: 1, dropped: 1 },
  observations: { moved: 1, dropped: 1 },
  facts: { moved: 1, dropped: 1 },
  entities: { moved: 1, dropped: 1 },
  summaries: { moved: 1, dropped: 1 },
  rule_suggestions: { moved: 1, dropped: 1 },
  rule_suggestion_quotes: { moved: 2, dropped: 1 },
  session_end: { moved: 1, dropped: 1 },
  custom_notes: { moved: 1, dropped: 0 },
};

describe("project-scoped tables", () => {
  test("are found from the schema, not from a fixed list", () => {
    const { store } = seededStore();
    const tables = projectTables(store.db);
    for (const table of ["memories", "episodes", "observations", "facts", "entities", "summaries", "rule_suggestions", "rule_suggestion_quotes", "session_end", "custom_notes"]) {
      expect(tables).toContain(table);
    }
    for (const [table, n] of Object.entries(countsUnder(store, "shop/feature-abc123"))) expect([table, n > 0]).toEqual([table, true]);
    store.close();
  });
});

describe("mergeProjects", () => {
  test("moves every project-scoped table, collapses duplicates and keeps references", () => {
    const { store, a, bShared, b } = seededStore();
    const auditBefore = store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'project.merge'").get().n;
    const result = store.mergeProjects("shop/feature-abc123", "shop", { actor: "test" });

    expect(result.tables).toEqual(EXPECTED);
    expect(result.moved).toBe(11);
    expect(result.dropped).toBe(9);
    for (const [table, n] of Object.entries(countsUnder(store, "shop/feature-abc123"))) expect([table, n]).toEqual([table, 0]);

    // nothing dangles, nothing failed a constraint, and both full-text indexes still match their tables
    expect(store.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(store.db.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
    store.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('integrity-check')");
    store.db.exec("INSERT INTO facts_fts(facts_fts) VALUES('integrity-check')");
    expect(store.db.prepare("SELECT m.title, m.project FROM memories_fts f JOIN memories m ON m.id = f.rowid WHERE memories_fts MATCH 'retry'").all()).toEqual([{ title: "Only in worktree", project: "shop" }]);
    expect(store.db.prepare("SELECT f.project FROM facts_fts x JOIN facts f ON f.id = x.rowid WHERE facts_fts MATCH 'drains'").all()).toEqual([{ project: "shop" }]);

    // references to a dropped duplicate now point at the row that already existed under the target
    expect(store.getFact(b.fact)).toMatchObject({ project: "shop", episode_id: a.episode, observation_id: a.observation });
    expect(store.getObservation(b.observation)).toMatchObject({ project: "shop", episode_id: a.episode });
    expect(store.db.prepare("SELECT to_id FROM memory_links WHERE from_type = 'observation' AND from_id = ? AND to_type = 'episode'").all(b.observation)).toEqual([{ to_id: a.episode }]);
    expect(store.db.prepare("SELECT entity_id FROM fact_entities WHERE fact_id = ?").all(b.fact)).toEqual([{ entity_id: a.entity }]);
    expect(store.db.prepare("SELECT alias FROM entity_aliases WHERE entity_id = ? ORDER BY alias").all(a.entity).map((r) => r.alias)).toEqual(["utc-shop", "utc-shop/feature-abc123"]);
    expect(store.db.prepare("SELECT owner_id FROM memory_keys WHERE owner_type = 'fact' AND text = 'time zone'").get().owner_id).toBe(a.fact);
    expect(store.db.prepare("SELECT ref_id FROM rule_evidence WHERE kind = 'memory'").get().ref_id).toBe(a.memory);
    expect(store.db.prepare("SELECT path FROM memory_files WHERE memory_id = ? ORDER BY path").all(a.memory).map((r) => r.path)).toEqual(["src/shop-time.mjs", "src/shop/feature-abc123-time.mjs"]);
    const suggestion = store.db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(a.suggestion);
    expect(suggestion.times_seen).toBe(4);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM rule_suggestion_quotes WHERE suggestion_id = ?").get(a.suggestion).n).toBe(2);
    expect(store.isDismissed("memory", b.memory)).toBe(true);
    expect(store.isDismissed("fact", bShared.fact)).toBe(false);
    expect(store.isDismissed("fact", a.fact)).toBe(false);
    for (const type of ["memory", "fact", "episode", "observation"]) {
      const table = HubStore.DISMISSIBLE[type];
      expect(store.db.prepare(`SELECT COUNT(*) AS n FROM dismissals d WHERE item_type = ? AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.id = d.item_id)`).get(type).n).toBe(0);
    }

    // hashes that include the project were recomputed: the same content under the target is recognised
    expect(store.add({ project: "shop", title: "Only in worktree", narrative: "the retry queue drains on start", tool: "claude-code" }).created).toBe(false);
    expect(store.addObservation({ project: "shop", type: "discovery", title: "Queue drains on start", narrative: "seen in the worktree" }).created).toBe(false);
    expect(store.addFact({ project: "shop", subject: "queue", predicate: "drains on", object: "start", text: "x", episodeId: a.episode }).created).toBe(false);
    expect(store.addEpisode({ project: "shop", text: "worktree only turn" }).created).toBe(false);

    const audits = store.db.prepare("SELECT actor, detail FROM audit WHERE action = 'project.merge'").all();
    expect(audits.length).toBe(auditBefore + 1);
    expect(audits.at(-1).actor).toBe("test");
    expect(JSON.parse(audits.at(-1).detail)).toEqual({ from: "shop/feature-abc123", into: "shop", moved: 11, dropped: 9, tables: EXPECTED });
    store.close();
  });

  test("the plan counts exactly what the merge does and writes nothing", () => {
    const { store } = seededStore();
    const before = everyRowCount(store);
    const changes = store.db.prepare("SELECT total_changes() AS n").get().n;
    const plan = planProjectMerge(store, "shop/feature-abc123", "shop");
    expect(store.db.prepare("SELECT total_changes() AS n").get().n).toBe(changes);
    expect(everyRowCount(store)).toEqual(before);
    expect(plan.tables).toEqual(EXPECTED);
    expect(store.mergeProjects("shop/feature-abc123", "shop").tables).toEqual(plan.tables);
    store.close();
  });

  test("a conflict it cannot resolve rolls the whole merge back", () => {
    const { store } = seededStore();
    store.db.exec("CREATE TABLE pinned_keys (project TEXT NOT NULL, k TEXT NOT NULL, UNIQUE(project, k))");
    store.db.prepare("INSERT INTO pinned_keys (project, k) VALUES ('shop', 'x'), ('shop/feature-abc123', 'x')").run();
    const before = everyRowCount(store);
    const under = countsUnder(store, "shop/feature-abc123");
    expect(() => store.mergeProjects("shop/feature-abc123", "shop")).toThrow(/pinned_keys/);
    expect(everyRowCount(store)).toEqual(before);
    expect(countsUnder(store, "shop/feature-abc123")).toEqual(under);
    expect(store.db.inTransaction).toBe(false);
    store.close();
  });

  test("refuses two equal or empty names", () => {
    const store = new HubStore(":memory:");
    expect(() => store.mergeProjects("a", "a")).toThrow();
    expect(() => store.mergeProjects("", "a")).toThrow();
    store.close();
  });
});

describe("aletheia projects", () => {
  const seedKeys = (store) => {
    for (const project of ["shop", "shop/feature-abc123", "shop/shop-hotfix", "shop/agent-a61eb72a195c718be", "shop/round14-gate", "shop/vendor/lib", "shop/deps-c0ffee", "ghost/feature-abc123", "other"]) {
      store.add({ project, title: `memory in ${project}`, narrative: "n", tool: "claude-code", createdAtEpoch: NOW });
    }
    store.addEpisode({ project: "shop/feature-abc123", text: "an episode in the worktree", createdAtEpoch: NOW });
    store.add({ project: "shop/feature-abc123", title: "memory in shop", narrative: "n", tool: "claude-code", createdAtEpoch: NOW });
  };

  test("projectCounts lists every key with per-table counts", () => {
    const store = new HubStore(":memory:");
    seedKeys(store);
    const rows = projectCounts(store);
    expect(rows.map((r) => r.name)).toEqual(["ghost/feature-abc123", "other", "shop", "shop/agent-a61eb72a195c718be", "shop/deps-c0ffee", "shop/feature-abc123", "shop/round14-gate", "shop/shop-hotfix", "shop/vendor/lib"]);
    expect(rows.find((r) => r.name === "shop/feature-abc123").counts).toMatchObject({ memories: 2, episodes: 1 });
    store.close();
  });

  test("planFold picks worktree keys only; older names and submodules need --include", () => {
    const repos = makeRepos();
    const store = new HubStore(":memory:");
    seedKeys(store);
    const plan = planFold(store, { repos: [repos.shop] });
    expect(plan.folds.map((f) => [f.from, f.into])).toEqual([
      ["shop/agent-a61eb72a195c718be", "shop"],
      ["shop/feature-abc123", "shop"],
      ["shop/shop-hotfix", "shop"],
    ]);
    expect(plan.folds.find((f) => f.from === "shop/feature-abc123").tables).toMatchObject({ memories: { moved: 1, dropped: 1 }, episodes: { moved: 1, dropped: 0 } });
    expect(Object.fromEntries(plan.skipped.map((s) => [s.key, s.reason]))).toEqual({
      "ghost/feature-abc123": "parent-missing",
      "shop/deps-c0ffee": "submodule",
      "shop/round14-gate": "not-a-worktree-name",
      "shop/vendor/lib": "submodule",
    });
    const named = planFold(store, { repos: [repos.shop], include: ["shop/round14-gate", "shop/vendor/lib"] });
    expect(named.folds.map((f) => f.from)).toEqual(["shop/agent-a61eb72a195c718be", "shop/feature-abc123", "shop/round14-gate", "shop/shop-hotfix", "shop/vendor/lib"]);
    // without the repo on disk, only the name patterns apply
    const blind = planFold(store, {}).folds.map((f) => f.from);
    expect(blind).toContain("shop/agent-a61eb72a195c718be");
    expect(blind).toContain("shop/feature-abc123");
    expect(blind).not.toContain("shop/shop-hotfix");
    expect(blind).not.toContain("shop/round14-gate");
    store.close();
  });

  test("fold-worktrees writes nothing without --write and folds only worktree keys with it", () => {
    const repos = makeRepos();
    const dataDir = tempDir("aletheia-fold-");
    const hubDb = join(dataDir, "hub.db");
    const seed = new HubStore(hubDb);
    seedKeys(seed);
    seed.close();
    const env = { ...process.env, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: hubDb };
    delete env.ALETHEIA_WORKTREE_PROJECTS;
    const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repos.inner, env, encoding: "utf8" });
    const snapshot = () => {
      const store = new HubStore(hubDb);
      const value = { rows: everyRowCount(store), projects: projectCounts(store).map((r) => r.name) };
      store.close();
      return value;
    };

    const listed = cli("projects");
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("shop/feature-abc123");
    expect(listed.stdout).toMatch(/memories/);

    const before = snapshot();
    const dry = cli("projects", "fold-worktrees");
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("shop/feature-abc123 -> shop");
    expect(dry.stdout).toContain("memories: move 1, drop 1 duplicate");
    expect(dry.stdout).toContain("shop/round14-gate");
    expect(dry.stdout).toContain("Dry run: nothing was written.");
    expect(snapshot()).toEqual(before);

    const wrote = cli("projects", "fold-worktrees", "--write");
    expect(wrote.status).toBe(0);
    expect(wrote.stdout).toContain("Folded 3 key(s)");
    expect(snapshot().projects).toEqual(["ghost/feature-abc123", "other", "shop", "shop/deps-c0ffee", "shop/round14-gate", "shop/vendor/lib"]);

    const included = cli("projects", "fold-worktrees", "--write", "--include", "shop/round14-gate");
    expect(included.status).toBe(0);
    expect(snapshot().projects).toEqual(["ghost/feature-abc123", "other", "shop", "shop/deps-c0ffee", "shop/vendor/lib"]);
  });
});
