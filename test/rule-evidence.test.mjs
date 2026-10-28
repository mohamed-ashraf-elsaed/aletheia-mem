// Rules carry their dates, evidence and a computed re-check flag. The flag is never a deletion: a flagged rule stays
// enabled and keeps syncing. Covers the migration, evidence from an approved suggestion, each stale reason, confirm,
// filters, the diff between the store and each tool's file, the HTTP routes, the MCP tools and the CLI.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { callTool } from "../src/hub/mcp.mjs";
import { describeRules, ruleStaleness } from "../src/hub/rule-evidence.mjs";
import { diffRules } from "../src/hub/rule-diff.mjs";
import { lintRules } from "../src/hub/rule-lint.mjs";
import { suggestRules } from "../src/hub/rule-suggest.mjs";
import { decideSuggestion } from "../src/hub/rules-decide.mjs";
import { renderRules, syncTool } from "../src/hub/rules-sync.mjs";
import { readSettings, validateSetting, writeSettings } from "../src/hub/settings.mjs";
import { MARK_BEGIN, MARK_END } from "../src/hub/tools.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const DAY = 86_400_000;
const fresh = () => new HubStore(":memory:");
/** Move a rule's dates into the past so staleness can be tested without waiting. */
function age(store, id, { createdDaysAgo, confirmedDaysAgo = createdDaysAgo }) {
  const now = Date.now();
  store.db.prepare("UPDATE rules SET created_at_epoch = ?, last_confirmed_epoch = ? WHERE id = ?").run(now - createdDaysAgo * DAY, now - confirmedDaysAgo * DAY, id);
}
function addFact(store, { subject = "api", predicate = "uses", object, recordedDaysAgo = 1, text = null }) {
  const episode = store.addEpisode({ project: "p", tool: "t", text: `episode ${subject} ${object}`, sourceRef: `ref:${subject}:${object}` });
  return store.addFact({ project: "p", episodeId: episode.id, subject, predicate, object, text: text ?? `${subject} ${predicate} ${object}`, recordedAtEpoch: Date.now() - recordedDaysAgo * DAY, validFromEpoch: Date.now() - recordedDaysAgo * DAY }).id;
}
const codes = (result) => result.reasons.map((reason) => reason.code);

describe("evidence storage and the migration", () => {
  test("the migration is idempotent and keeps old rules working with empty evidence", () => {
    const dir = tempDir("aletheia-ruleev-");
    const path = join(dir, "old.db");
    const first = new HubStore(path);
    const ruleId = first.rules.add({ then: "Use tabs" }).id;
    // Turn it back into a database from before evidence existed.
    first.db.exec("DROP TABLE rule_evidence");
    first.db.exec("ALTER TABLE rules DROP COLUMN last_confirmed_epoch");
    first.db.prepare("DELETE FROM settings WHERE key = 'schema.rule_evidence'").run();
    const created = first.db.prepare("SELECT created_at_epoch FROM rules WHERE id = ?").get(ruleId).created_at_epoch;
    first.close();

    const reopened = new HubStore(path);
    expect(reopened.rules.get(ruleId).lastConfirmedEpoch).toBe(created);
    expect(reopened.rules.evidence(ruleId)).toEqual([]);
    expect(reopened.ensureRuleEvidence()).toBe(false);
    const described = describeRules(reopened).find((rule) => rule.id === ruleId);
    expect(described.evidence).toEqual([]);
    expect(described.stale).toBe(false);
    reopened.rules.confirm(ruleId, { actor: "test" });
    reopened.close();

    const again = new HubStore(path);
    expect(again.db.prepare("SELECT COUNT(*) AS n FROM rules").get().n).toBe(1);
    expect(again.rules.get(ruleId).lastConfirmedEpoch).toBeGreaterThanOrEqual(created);
    again.close();
  });

  test("an approved suggestion copies its source ids and quotes as evidence", () => {
    const store = fresh();
    const memory = store.add({ project: "shop", kind: "prompt", type: "note", title: "Use pnpm, not npm.", narrative: "Use pnpm, not npm.", sessionId: "s1", tool: "claude-code" });
    suggestRules(store, { project: "shop" });
    const suggestion = store.db.prepare("SELECT id FROM rule_suggestions").get();
    const result = decideSuggestion(store, suggestion.id, { action: "approve" });
    const evidence = store.rules.evidence(result.ruleId);
    expect(evidence.map((row) => `${row.kind}:${row.id}`).sort()).toEqual([`memory:${memory.id}`, `suggestion:${suggestion.id}`].sort());
    const quote = evidence.find((row) => row.kind === "memory");
    expect(quote.quote).toContain("pnpm");
    expect(quote.session_id).toBe("s1");
    expect(quote.at_epoch).toBeGreaterThan(0);
    const view = describeRules(store).find((rule) => rule.id === result.ruleId);
    expect(view.source).toBe("suggested");
    expect(view.evidence.length).toBe(2);
    store.close();
  });

  test("add accepts evidence ids, rejects unknown kinds, and a duplicate add keeps one rule", () => {
    const store = fresh();
    const memory = store.add({ project: "p", kind: "note", title: "m", narrative: "n" });
    const added = store.rules.add({ then: "Keep functions small", evidence: [{ kind: "memory", id: memory.id }] });
    expect(store.rules.evidence(added.id)[0]).toMatchObject({ kind: "memory", id: memory.id });
    const again = store.rules.add({ then: "Keep functions small", evidence: [{ kind: "memory", id: memory.id }] });
    expect(again).toEqual({ id: added.id, created: false });
    expect(store.rules.evidence(added.id).length).toBe(1);
    expect(() => store.rules.add({ then: "Other rule", evidence: [{ kind: "tweet", id: 1 }] })).toThrow(RangeError);
    store.close();
  });

  test("evidence quotes are redacted", () => {
    const store = fresh();
    const added = store.rules.add({ then: "Do not paste keys", evidence: [{ kind: "memory", id: 1, atEpoch: Date.now(), quote: `use sk-ant-${"a".repeat(30)} here` }] });
    const view = describeRules(store).find((rule) => rule.id === added.id);
    expect(JSON.stringify(view.evidence)).not.toContain("sk-ant-aaaa");
    store.close();
  });
});

describe("staleness reasons", () => {
  test("(a) an evidence fact that was superseded flags the rule", () => {
    const store = fresh();
    const fact = addFact(store, { object: "REST", recordedDaysAgo: 20 });
    const rule = store.rules.add({ then: "Call the api over REST", evidence: [{ kind: "fact", id: fact }] }).id;
    age(store, rule, { createdDaysAgo: 10 });
    expect(describeRules(store).find((r) => r.id === rule).stale).toBe(false);
    store.closeFact(fact, { validToEpoch: Date.now() - DAY, status: "superseded" });
    const flagged = describeRules(store).find((r) => r.id === rule);
    expect(flagged.stale).toBe(true);
    expect(codes(flagged)).toEqual(["evidence_fact_superseded"]);
    expect(flagged.reasons[0].evidence).toEqual({ kind: "fact", id: fact });
    expect(flagged.reasons[0].message).toContain(`#${fact}`);
    store.close();
  });

  test("(a) an evidence fact whose valid_to passed flags the rule as expired", () => {
    const store = fresh();
    const fact = addFact(store, { object: "gRPC", recordedDaysAgo: 30 });
    store.db.prepare("UPDATE facts SET valid_to_epoch = ? WHERE id = ?").run(Date.now() - 2 * DAY, fact);
    const rule = store.rules.add({ then: "Call the api over gRPC", evidence: [{ kind: "fact", id: fact }] }).id;
    age(store, rule, { createdDaysAgo: 10 });
    expect(codes(describeRules(store).find((r) => r.id === rule))).toEqual(["evidence_fact_expired"]);
    store.close();
  });

  test("(b) a dismissed evidence memory flags the rule; restoring it clears the flag", () => {
    const store = fresh();
    const memory = store.add({ project: "p", kind: "note", title: "Prefer tabs", narrative: "We prefer tabs" });
    const rule = store.rules.add({ then: "Indent with tabs", evidence: [{ kind: "memory", id: memory.id }] }).id;
    age(store, rule, { createdDaysAgo: 10 });
    store.dismiss("memory", memory.id, { actor: "test" });
    expect(codes(describeRules(store).find((r) => r.id === rule))).toEqual(["evidence_memory_dismissed"]);
    store.restore("memory", memory.id, { actor: "test" });
    expect(describeRules(store).find((r) => r.id === rule).stale).toBe(false);
    store.close();
  });

  test("(c) a newer fact on the same subject and predicate flags the rule", () => {
    const store = fresh();
    const old = addFact(store, { subject: "db", predicate: "is", object: "MySQL", recordedDaysAgo: 40 });
    const rule = store.rules.add({ then: "Write MySQL-compatible SQL", evidence: [{ kind: "fact", id: old }] }).id;
    age(store, rule, { createdDaysAgo: 30 });
    expect(describeRules(store).find((r) => r.id === rule).stale).toBe(false);
    const newer = addFact(store, { subject: "db", predicate: "is", object: "Postgres", recordedDaysAgo: 2 });
    const flagged = describeRules(store).find((r) => r.id === rule);
    expect(codes(flagged)).toEqual(["newer_fact"]);
    expect(flagged.reasons[0].message).toContain(`#${newer}`);
    store.close();
  });

  test("(d) no confirmation inside the review window flags a rule with no evidence; nothing else does", () => {
    const store = fresh();
    const quiet = store.rules.add({ then: "Be concise" }).id;
    const old = store.rules.add({ then: "Answer in English" }).id;
    age(store, quiet, { createdDaysAgo: 30 });
    age(store, old, { createdDaysAgo: 120 });
    const rows = describeRules(store);
    expect(rows.find((r) => r.id === quiet).stale).toBe(false);
    const flagged = rows.find((r) => r.id === old);
    expect(codes(flagged)).toEqual(["review_overdue"]);
    expect(flagged.age_days).toBe(120);
    expect(flagged.last_confirmed_epoch).toBeLessThan(Date.now() - 119 * DAY);
    store.close();
  });

  test("the review window is the rules.reviewDays setting, validated to 7..730", () => {
    const store = fresh();
    expect(readSettings(store).find((s) => s.key === "rules.reviewDays").value).toBe(90);
    expect(validateSetting("rules.reviewDays", 6).ok).toBe(false);
    expect(validateSetting("rules.reviewDays", 731).ok).toBe(false);
    expect(validateSetting("rules.reviewDays", 1.5).ok).toBe(false);
    expect(validateSetting("rules.reviewDays", 30).ok).toBe(true);
    const id = store.rules.add({ then: "Be concise" }).id;
    age(store, id, { createdDaysAgo: 45 });
    expect(describeRules(store)[0].stale).toBe(false);
    expect(writeSettings(store, { "rules.reviewDays": 30 }).errors).toEqual([]);
    expect(describeRules(store)[0].stale).toBe(true);
    expect(writeSettings(store, { "rules.reviewDays": 2 }).errors.length).toBe(1);
    store.close();
  });

  test("a stale rule stays enabled and still appears in sync output; nothing deletes it", () => {
    const store = fresh();
    const id = store.rules.add({ then: "Always run the linter" }).id;
    age(store, id, { createdDaysAgo: 200 });
    const rule = describeRules(store)[0];
    expect(rule.stale).toBe(true);
    expect(rule.enabled).toBe(true);
    expect(renderRules(store.rules.list(), "claude-code").markdown).toContain("Always run the linter");
    const dir = tempDir("aletheia-rulesync-");
    const result = syncTool(describeRules(store), "agents-md", { scope: "project", projectDir: dir, home: dir, dryRun: false });
    expect(readFileSync(result.path, "utf8")).toContain("Always run the linter");
    expect(store.rules.get(id).enabled).toBe(true);
    store.close();
  });

  test("confirm clears the overdue reason and an evidence change that predates it, and writes an audit row", () => {
    const store = fresh();
    const fact = addFact(store, { object: "REST", recordedDaysAgo: 150 });
    const id = store.rules.add({ then: "Call the api over REST", evidence: [{ kind: "fact", id: fact }] }).id;
    age(store, id, { createdDaysAgo: 120 });
    store.closeFact(fact, { validToEpoch: Date.now() - DAY, status: "superseded" });
    expect(codes(describeRules(store)[0]).sort()).toEqual(["evidence_fact_superseded", "review_overdue"]);
    const done = store.rules.confirm(id, { actor: "test" });
    expect(done.previousConfirmedEpoch).toBeLessThan(Date.now() - 100 * DAY);
    const after = describeRules(store)[0];
    expect(after.stale).toBe(false); // the supersede happened before this confirmation, so it no longer counts
    store.close();
  });
});

describe("confirm", () => {
  test("writes an audit row, is repeatable, leaves the rule untouched, and restore puts the date back", () => {
    const store = fresh();
    const id = store.rules.add({ then: "Be concise", when: "answering" }).id;
    age(store, id, { createdDaysAgo: 120 });
    const before = store.rules.get(id);
    const first = store.rules.confirm(id, { actor: "mcp" });
    expect(first.lastConfirmedEpoch).toBeGreaterThan(Date.now() - 5000);
    store.rules.confirm(id, { actor: "mcp" });
    const after = store.rules.get(id);
    expect({ ...after, lastConfirmedEpoch: 0 }).toEqual({ ...before, lastConfirmedEpoch: 0 });
    expect(describeRules(store)[0].stale).toBe(false);
    const rows = store.auditLog(20).filter((row) => row.action === "rule.confirm");
    expect(rows.length).toBe(2);
    expect(rows[0].actor).toBe("mcp");
    expect(rows[0].detail.id).toBe(id);
    store.rules.confirm(id, { actor: "ui", restore: before.lastConfirmedEpoch });
    expect(store.rules.get(id).lastConfirmedEpoch).toBe(before.lastConfirmedEpoch);
    expect(describeRules(store)[0].stale).toBe(true);
    expect(store.rules.confirm("nope")).toBeNull();
    store.close();
  });
});

describe("filters and lint", () => {
  test("stale and older-than filters", () => {
    const store = fresh();
    const a = store.rules.add({ then: "Rule a" }).id;
    const b = store.rules.add({ then: "Rule b" }).id;
    const c = store.rules.add({ then: "Rule c" }).id;
    age(store, a, { createdDaysAgo: 200 });
    age(store, b, { createdDaysAgo: 40 });
    expect(describeRules(store, { stale: true }).map((r) => r.id)).toEqual([a]);
    expect(describeRules(store, { olderThanDays: 30 }).map((r) => r.id).sort()).toEqual([a, b].sort());
    expect(describeRules(store, { olderThanDays: 100 }).map((r) => r.id)).toEqual([a]);
    expect(describeRules(store, {}).length).toBe(3);
    expect(c).toBeTruthy();
    store.close();
  });

  test("lint reports a stale rule as a warning with a confirm-or-retire hint", () => {
    const store = fresh();
    const id = store.rules.add({ then: "Use two-space indentation" }).id;
    age(store, id, { createdDaysAgo: 200 });
    const result = lintRules({ rules: describeRules(store) });
    const finding = result.findings.find((row) => row.code === "stale_rule");
    expect(finding.ruleId).toBe(id);
    expect(finding.severity).toBe("warning");
    expect(finding.fix).toContain("confirm");
    expect(finding.fix).toContain("retire");
    store.close();
  });

  test("staleness is a pure read: calling it changes nothing", () => {
    const store = fresh();
    const id = store.rules.add({ then: "Be brief" }).id;
    age(store, id, { createdDaysAgo: 200 });
    const snapshot = () => Buffer.from(store.db.serialize()).toString("base64");
    const before = snapshot();
    describeRules(store);
    ruleStaleness(store, store.rules.get(id), []);
    expect(snapshot()).toBe(before);
    store.close();
  });
});

describe("divergence between tools", () => {
  test("lists store-only, file-only and differing rules with file and line", () => {
    const store = fresh();
    store.rules.add({ then: "Always run the tests before committing" });
    store.rules.add({ then: "Use pnpm instead of npm" });
    store.rules.add({ then: "Write commit messages in plain English" });
    const dir = tempDir("aletheia-ruledif-");
    const synced = syncTool(store.rules.list(), "agents-md", { scope: "project", projectDir: dir, home: dir, dryRun: false });
    const original = readFileSync(synced.path, "utf8");
    expect(diffRules({ rules: store.rules.list(), files: [{ path: synced.path, tool: "agents-md" }] }).outOfSync).toBe(0);
    const edited = original
      .replace("Use pnpm instead of npm", "Use pnpm, never npm")
      .replace("- Write commit messages in plain English\n", "")
      .replace("<!-- aletheia:rules:end -->", "- Prefer small pull requests\n<!-- aletheia:rules:end -->");
    writeFileSync(synced.path, edited);
    const before = readFileSync(synced.path, "utf8");
    const report = diffRules({ rules: store.rules.list(), files: [{ path: synced.path, tool: "agents-md" }] });
    expect(report.outOfSync).toBe(1);
    const file = report.files[0];
    expect(file.onlyInStore.map((row) => row.text)).toEqual(["Write commit messages in plain English"]);
    expect(file.onlyInFile.map((row) => row.text)).toEqual(["Prefer small pull requests"]);
    expect(file.differs.length).toBe(1);
    expect(file.differs[0].file).toBe("Use pnpm, never npm");
    // Line numbers point at the right line of the file.
    const lines = before.split("\n");
    expect(lines[file.differs[0].line - 1]).toContain("Use pnpm, never npm");
    expect(lines[file.onlyInFile[0].line - 1]).toContain("Prefer small pull requests");
    expect(readFileSync(synced.path, "utf8")).toBe(before); // read-only
    store.close();
  });

  test("a file with no managed block is not compared", () => {
    const dir = tempDir("aletheia-ruledif-");
    const path = join(dir, "AGENTS.md");
    writeFileSync(path, "# My own notes\n- not managed\n");
    const report = diffRules({ rules: [], files: [{ path, tool: "agents-md" }] });
    expect(report.files[0].managed).toBe(false);
    expect(report.outOfSync).toBe(0);
  });
});

describe("HTTP, MCP and CLI", () => {
  const fx = makeFixture();
  const root = join(import.meta.dir, "..");
  let temp;
  let dbPath;
  let dataDir;
  let proj;
  let app;
  let base;
  let ids;
  const send = (path, body, method = "POST") => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  const cli = async (args) => {
    const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root,
      env: { ...process.env, HOME: temp, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath },
    });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, exitCode };
  };

  beforeAll(() => {
    temp = tempDir("aletheia-rulehttp-");
    dbPath = join(temp, "hub.db");
    dataDir = join(temp, "data");
    proj = join(temp, "proj");
    mkdirSync(proj);
    const store = new HubStore(dbPath);
    const now = Date.now();
    const oldMemory = store.add({ project: "shop", kind: "note", type: "decision", title: "Old decision", narrative: "decided long ago", tool: "claude-code", sessionId: "sess-old", origin: "hook:stop", files: ["src/a.mjs", "src/b.mjs"], createdAtEpoch: now - 200 * DAY });
    const newMemory = store.add({ project: "shop", kind: "note", type: "decision", title: "New decision", narrative: "decided today", tool: "codex", createdAtEpoch: now });
    const fact = addFact(store, { object: "REST", recordedDaysAgo: 30 });
    const stale = store.rules.add({ then: "Always run the linter" }).id;
    age(store, stale, { createdDaysAgo: 150 });
    const factRule = store.rules.add({ then: "Call the api over REST", evidence: [{ kind: "fact", id: fact }] }).id;
    age(store, factRule, { createdDaysAgo: 10 });
    store.closeFact(fact, { validToEpoch: now - DAY, status: "superseded" });
    const fresh1 = store.rules.add({ then: "Prefer short answers" }).id;
    syncTool(store.rules.list(), "agents-md", { scope: "project", projectDir: proj, home: temp, dryRun: false });
    ids = { stale, factRule, fresh: fresh1, oldMemory: oldMemory.id, newMemory: newMemory.id, fact };
    store.close();
    const cfg = loadConfig({
      port: 0, sourceDb: fx.dbPath, dataDir, hubDb: dbPath,
      overlayDb: join(temp, "overlay.db"), reviewDb: join(temp, "review.db"), ledgerDir: join(temp, "ledger"),
      humanCopyCache: join(temp, "hc.json"), rulesFile: join(temp, "RULES.md"), claudeInstructionsFile: join(temp, "CLAUDE.md"),
      provider: "none", extra: { home: temp },
    });
    app = startServer(cfg);
    base = `http://127.0.0.1:${app.server.port}`;
  });
  afterAll(() => app.stop());

  test("GET rules carries dates, evidence, last_confirmed_epoch, stale and reasons", async () => {
    const { rules, reviewDays } = await get("/api/hub/rules");
    expect(reviewDays).toBe(90);
    const flagged = rules.find((rule) => rule.id === ids.factRule);
    expect(flagged.stale).toBe(true);
    expect(flagged.reasons[0].code).toBe("evidence_fact_superseded");
    expect(flagged.evidence[0]).toMatchObject({ kind: "fact", id: ids.fact });
    expect(typeof flagged.last_confirmed_epoch).toBe("number");
    expect(typeof flagged.createdAtEpoch).toBe("number");
    expect(flagged.source).toBe("you");
    expect(flagged.enabled).toBe(true);
    expect(rules.find((rule) => rule.id === ids.fresh).stale).toBe(false);
  });

  test("?stale=1 and ?older_than_days=N filter", async () => {
    const stale = (await get("/api/hub/rules?stale=1")).rules.map((rule) => rule.id).sort();
    expect(stale).toEqual([ids.stale, ids.factRule].sort());
    const old = (await get("/api/hub/rules?older_than_days=100")).rules.map((rule) => rule.id);
    expect(old).toEqual([ids.stale]);
  });

  test("POST rules accepts evidence ids and rejects ones that do not exist", async () => {
    const good = await send("/api/hub/rules", { then: "Cite the decision", evidence: [{ kind: "memory", id: ids.newMemory }] });
    expect(good.status).toBe(201);
    const body = await good.json();
    expect(body.rule.evidence[0]).toMatchObject({ kind: "memory", id: ids.newMemory });
    const bad = await send("/api/hub/rules", { then: "Another", evidence: [{ kind: "memory", id: 999999 }] });
    expect(bad.status).toBe(400);
  });

  test("POST confirm clears the flag, writes an audit row, and 404s for a ghost", async () => {
    const res = await send(`/api/hub/rules/${ids.stale}/confirm`, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule.stale).toBe(false);
    expect(body.previousConfirmedEpoch).toBeLessThan(Date.now() - 100 * DAY);
    const audit = await get("/api/hub/audit?action=rule.confirm");
    expect(JSON.stringify(audit)).toContain(ids.stale);
    const undo = await (await send(`/api/hub/rules/${ids.stale}/confirm`, { restore: body.previousConfirmedEpoch })).json();
    expect(undo.rule.stale).toBe(true);
    expect((await send("/api/hub/rules/ghost/confirm", {})).status).toBe(404);
  });

  test("GET rules/diff lists differences and never writes", async () => {
    const file = join(proj, "AGENTS.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("Prefer short answers", "Prefer very short answers"));
    const before = readFileSync(file, "utf8");
    const report = await get(`/api/hub/rules/diff?tools=agents-md&projectDir=${encodeURIComponent(proj)}`);
    expect(report.outOfSync).toBe(1);
    expect(report.files[0].differs[0]).toMatchObject({ id: ids.fresh });
    expect(report.files[0].differs[0].line).toBeGreaterThan(0);
    expect(readFileSync(file, "utf8")).toBe(before);
    expect((await fetch(`${base}/api/hub/rules/diff?tools=nope`)).status).toBe(400);
    writeFileSync(file, readFileSync(file, "utf8").replace("Prefer very short answers", "Prefer short answers"));
  });

  test("memory list filters by older_than_days and shows date, source and files", async () => {
    const old = await get("/api/hub/memories?project=shop&older_than_days=100");
    expect(old.items.map((m) => m.id)).toEqual([ids.oldMemory]);
    expect(old.items[0]).toMatchObject({ tool: "claude-code", session_id: "sess-old", origin: "hook:stop", files: ["src/a.mjs", "src/b.mjs"] });
    expect(typeof old.items[0].created_at_epoch).toBe("number");
    const all = await get("/api/hub/memories?project=shop");
    expect(all.total).toBe(2);
    const searched = await (await send("/v1/search", { query: "decision", project: "shop", older_than_days: 100 })).json();
    expect(searched.results.map((m) => m.id)).toEqual([ids.oldMemory]);
  });

  test("MCP list_rules prints date, source and a re-check marker; confirm_rule clears it", () => {
    const store = new HubStore(dbPath);
    const ctx = { store, tool: "claude-code", cwd: proj };
    const listed = callTool("list_rules", {}, ctx).content[0].text;
    const line = listed.split("\n").find((row) => row.includes("Call the api over REST"));
    expect(line).toMatch(/added \d{4}-\d{2}-\d{2}/);
    expect(line).toContain("source: you");
    expect(line).toContain("[re-check:");
    expect(listed.split("\n").find((row) => row.includes("Prefer short answers"))).not.toContain("[re-check");
    const confirmed = callTool("confirm_rule", { id: ids.factRule }, ctx);
    expect(confirmed.isError).toBeFalsy();
    expect(confirmed.content[0].text).toContain("Confirmed rule");
    expect(callTool("list_rules", {}, ctx).content[0].text.split("\n").find((row) => row.includes("Call the api over REST"))).not.toContain("[re-check");
    expect(callTool("confirm_rule", { id: "r_missing" }, ctx).isError).toBe(true);
    expect(callTool("confirm_rule", {}, ctx).isError).toBe(true);
    expect(store.rules.get(ids.factRule).enabled).toBe(true);
    store.close();
  });

  test("MCP add_rule stores evidence ids; get_observations shows source and files; search takes older_than_days", () => {
    const store = new HubStore(dbPath);
    const ctx = { store, tool: "codex", cwd: proj };
    const added = callTool("add_rule", { then: "Review old decisions yearly", evidence_memory_ids: [ids.oldMemory], evidence_fact_ids: [ids.fact] }, ctx);
    expect(added.isError).toBeFalsy();
    const rule = describeRules(store).find((r) => r.then === "Review old decisions yearly");
    expect(rule.evidence.map((row) => row.kind).sort()).toEqual(["fact", "memory"]);
    expect(rule.source).toBe("codex");
    expect(callTool("add_rule", { then: "Bad evidence", evidence_memory_ids: [987654] }, ctx).isError).toBe(true);
    const full = callTool("get_observations", { ids: [ids.oldMemory] }, ctx).content[0].text;
    expect(full).toContain("claude-code");
    expect(full).toContain("session sess-old");
    expect(full).toContain("origin hook:stop");
    expect(full).toContain("Files: src/a.mjs, src/b.mjs");
    expect(full).toMatch(/\d{4}-\d{2}-\d{2}T/);
    const searched = callTool("search", { query: "decision", older_than_days: 100 }, ctx).content[0].text;
    expect(searched).toContain(`#${ids.oldMemory}`);
    expect(searched).not.toContain(`#${ids.newMemory}`);
    store.close();
  });

  test("CLI rules confirm, list --stale, diff and lint", async () => {
    const stale = await cli(["rules", "list", "--stale"]);
    expect(stale.exitCode).toBe(0);
    expect(stale.stdout).toContain("Always run the linter");
    expect(stale.stdout).toContain("[re-check:");
    expect(stale.stdout).not.toContain("Prefer short answers");

    const lint = await cli(["rules", "lint", "--dir", proj, "--tools", "agents-md", "--json"]);
    const findings = JSON.parse(lint.stdout).findings;
    const hit = findings.find((row) => row.code === "stale_rule" && row.ruleId === ids.stale);
    expect(hit.severity).toBe("warning");
    expect(hit.fix).toContain("confirm");

    const diffClean = await cli(["rules", "diff", "--dir", proj, "--tools", "agents-md"]);
    expect(diffClean.stdout).toContain("Review old decisions yearly");

    const confirm = await cli(["rules", "confirm", ids.stale]);
    expect(confirm.exitCode).toBe(0);
    expect(confirm.stdout).toContain(`Confirmed ${ids.stale}`);
    const after = await cli(["rules", "list", "--stale"]);
    expect(after.stdout).not.toContain("Always run the linter");
    expect((await cli(["rules", "confirm", "r_nope"])).exitCode).toBe(1);

    const json = JSON.parse((await cli(["rules", "diff", "--dir", proj, "--tools", "agents-md", "--json"])).stdout);
    expect(json.outOfSync).toBe(1);
    expect(json.files[0].onlyInStore.map((row) => row.text)).toContain("Review old decisions yearly");

    const retire = await cli(["rules", "retire", ids.factRule]);
    expect(retire.stdout).toContain("not deleted");
    const store = new HubStore(dbPath);
    expect(store.rules.get(ids.factRule).enabled).toBe(false);
    store.close();
  });

  test("no secrets appear in the new outputs", async () => {
    const store = new HubStore(dbPath);
    store.rules.add({ then: "Quote the source", evidence: [{ kind: "memory", id: ids.newMemory, quote: `token sk-ant-${"b".repeat(30)}` }] });
    store.close();
    const body = JSON.stringify(await get("/api/hub/rules"));
    expect(body).not.toContain("sk-ant-bbbb");
  });
});

describe("a flagged rule carries its re-check note into synced files and session context", () => {
  function overdueRule(store) {
    const rule = store.rules.add({ then: "Use tabs", when: "", scopeTier: "everywhere", scopeName: "Everywhere", source: "you" });
    age(store, rule.id, { createdDaysAgo: 200 });
    return rule.id;
  }

  test("renderRules appends the reason and 'Verify before applying.' to a flagged rule and nothing to a fresh one", () => {
    const store = fresh();
    overdueRule(store);
    store.rules.add({ then: "Run the tests", when: "", scopeTier: "everywhere", scopeName: "Everywhere", source: "you" });
    const { markdown, count } = renderRules(describeRules(store), "codex");
    expect(count).toBe(2);
    expect(markdown).toMatch(/- Use tabs \[re-check: Not confirmed for \d+ days .* Verify before applying\.\]/);
    expect(markdown).toContain("- Run the tests\n");
  });

  test("session context carries the same note, and the flagged rule is still delivered", () => {
    const store = fresh();
    overdueRule(store);
    const context = store.context({ project: "p" });
    expect(context).toContain("- Use tabs [re-check:");
    expect(context).toContain("Verify before applying.]");
  });

  test("the note is not part of the rule when a file is read back, and confirming removes it", () => {
    const store = fresh();
    const id = overdueRule(store);
    const { markdown } = renderRules(describeRules(store), "codex");
    const dir = tempDir("aletheia-recheck-");
    const file = join(dir, "AGENTS.md");
    writeFileSync(file, `${MARK_BEGIN}\n${markdown}${MARK_END}\n`);
    const diff = diffRules({ rules: store.rules.list(), files: [{ path: file, tool: "codex", scope: "project" }] });
    expect(diff.files[0].managed).toBe(true);
    expect(diff.files[0].inSync).toBe(true);
    store.rules.confirm(id);
    expect(renderRules(describeRules(store), "codex").markdown).not.toContain("re-check");
  });
});
