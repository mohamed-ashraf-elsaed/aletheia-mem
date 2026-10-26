// The refresh: goals -> grouping -> reviews -> alignment -> story. Each step asks a model for ONE JSON object,
// validates it with the ledger's own validators (the same code the CLI uses), and writes ledger files.
// Port of the original refresh-task.ts (rYe). Differences are listed in docs/08-findings.md.
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configureLedger, runCli, readGoals } from "../ledger/commands.mjs";

const REVIEW_BATCH = 8;
const DAY_WINDOW = 31;

const pad = (n) => String(n).padStart(2, "0");
const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localMinute = (ms) => { const d = new Date(ms); return `${localDay(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** JSON between the first "{" and the last "}" of a model answer. */
export function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("The answer held no JSON object.");
  return JSON.parse(text.slice(start, end + 1));
}

/** The saved goals as the owner-goals.json shape the skill uses. */
function goalsAsJson(goals) {
  const pick = (kind) => goals.goals.filter((g) => g.kind === kind).map((g) => ({ rank: g.rank, title: g.title, product: g.product, latest_at: g.latestAt, times_asked: g.timesAsked, evidence: g.evidence }));
  return { generated_at: goals.generatedAt, window_days: DAY_WINDOW, human_summary: goals.summary, priorities: pick("priority"), open_asks: pick("open-ask") };
}

/** Validate that a grouping answer decides every conversation asked about, and only those. */
export function validateGroupingDecisions(decisions, input) {
  const asked = new Set(input.conversations.map((c) => c.conversationKey));
  const anchors = new Set(input.openRequests.map((r) => r.anchor));
  const decided = new Set();
  for (const [g, group] of (Array.isArray(decisions?.groups) ? decisions.groups : []).entries()) {
    for (const [c, key] of (Array.isArray(group?.conversations) ? group.conversations : []).entries()) {
      if (asked.has(key)) { decided.add(key); continue; }
      if (!(c === 0 && anchors.has(key))) throw new TypeError(`groups[${g}] lists ${key}, which was not asked about. Continue an open request by listing its anchor first, then only the new conversations.`);
    }
  }
  for (const [i, item] of (Array.isArray(decisions?.ignored) ? decisions.ignored : []).entries()) {
    if (!asked.has(item?.conversation)) throw new TypeError(`ignored[${i}] names a conversation that was not asked about.`);
    decided.add(item.conversation);
  }
  const missing = [...asked].filter((k) => !decided.has(k));
  if (missing.length) throw new TypeError(`Decide every conversation asked about; missing ${missing.join(", ")}.`);
  return decisions;
}

function runPython(args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${args[0].split("/").pop()} exited ${code}: ${`${out}\n${err}`.trim().slice(-800)}`))));
  });
}

const countPrompts = (path) => (existsSync(path) ? (readFileSync(path, "utf8").match(/^## /gm) ?? []).length : 0);

/**
 * Build a refresh job.
 *   needs      {due, ungrouped, goalsStale, unaligned, needed}  (from refreshNeeds)
 *   ask        async (prompt, {stage}) => text
 */
export function createRefreshJob({ config, needs, ask, now = Date.now }) {
  configureLedger({ overlayDb: config.overlayDb });
  const ledgerDir = config.ledgerDir;
  const skillsDir = config.promptsDir;
  const progressSkill = readFileSync(join(skillsDir, "request-progress", "SKILL.md"), "utf8").replaceAll("${CLAUDE_SKILL_DIR}", join(skillsDir, "request-progress"));
  const goalsSkill = readFileSync(join(skillsDir, "owner-goals", "SKILL.md"), "utf8").replaceAll("${CLAUDE_SKILL_DIR}", join(skillsDir, "owner-goals"));
  const goalsFolder = join(ledgerDir, "owner-goals", localDay(now()));
  const steps = [];
  const openDb = () => new Database(config.sourceDb, { readonly: true, create: false });
  let saved = null;
  let sinceMinute = null;
  let startedIso = new Date(now()).toISOString();
  let exported = null;

  const PREAMBLE =
    "You are running in a read-only sandbox for an automatic refresh: you cannot run commands that write or save. Nobody is watching, so never ask a question. You have no memory tools: the input files hold the evidence (each conversation's asks and observations). Where the skill says to search memory, use them instead.";

  async function prepare() {
    const db = openDb();
    try { saved = readGoals(db); } finally { db.close(); }
    sinceMinute = saved.goals.length && Number.isFinite(Date.parse(saved.generatedAt ?? "")) ? localMinute(Date.parse(saved.generatedAt)) : null;
    startedIso = new Date(now()).toISOString();
    mkdirSync(goalsFolder, { recursive: true });
    const scriptsDir = config.vendorDir;
    await runPython(
      [join(scriptsDir, "owner-goals", "export_owner_prompts.py"), "--out", goalsFolder, "--days", String(DAY_WINDOW), ...(sinceMinute ? ["--since", sinceMinute] : [])],
      { cwd: config.dataDir, env: { ...process.env, CLAUDE_MEM_INTERNAL: "1" } },
    );
    exported = { ownerPrompts: countPrompts(join(goalsFolder, "owner-prompts.md")), newPrompts: countPrompts(join(goalsFolder, "new-owner-prompts.md")) };
  }

  async function run() {
    const runDir = join(ledgerDir, "agent-runs", randomBytes(6).toString("hex"));
    mkdirSync(runDir, { recursive: true });
    let counter = 0;
    const inline = new Map(); // path -> contents, supplied to the model because it has no file tools
    if (needs.goalsStale) for (const name of ["owner-prompts.md", "new-owner-prompts.md"]) {
      const p = join(goalsFolder, name);
      if (existsSync(p)) inline.set(p, readFileSync(p, "utf8"));
    }
    const askWithInputs = (prompt, stage) => {
      const files = [...inline].filter(([p]) => prompt.includes(p));
      return ask(files.length ? `${prompt}\n\nThe following input files are supplied inline; no file tools are available:\n${files.map(([p, text]) => `--- ${p} ---\n${text}`).join("\n\n")}` : prompt, { stage });
    };
    const stash = (label, value) => {
      const path = join(runDir, `${++counter}-${label}.json`);
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      writeFileSync(path, text, { mode: 0o600 });
      inline.set(path, text);
      return path;
    };
    const cli = (argv, value) => {
      let out;
      const db = openDb();
      try {
        runCli(value === undefined ? argv : [...argv, stash(argv[0], value)], { dir: ledgerDir, database: db, now: now(), print: (v) => { out = v; } });
      } finally { db.close(); }
      return out;
    };
    const timed = async (step, fn, extra = {}) => {
      const startedAt = new Date(now()).toISOString();
      try { return await fn(); } finally { steps.push({ step, agent: config.provider, startedAt, finishedAt: new Date(now()).toISOString(), ...extra }); }
    };
    /** Ask, validate, and on refusal ask once more with the refusal quoted. Raw failures are kept for inspection. */
    const decide = (stage, prompt, handle) => timed(stage, async () => {
      let refusal = null;
      let answer = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        answer = await askWithInputs(refusal ? `${prompt}\n\nYour previous answer was refused: ${refusal}\nFix it and answer again.` : prompt, stage);
        try { return await handle(extractJson(answer)); } catch (error) { refusal = error instanceof Error ? error.message : String(error); }
      }
      mkdirSync(join(ledgerDir, "failed-answers"), { recursive: true });
      const path = join(ledgerDir, "failed-answers", `${new Date(now()).toISOString().replaceAll(":", "-")}-${stage}-${config.provider}.txt`);
      writeFileSync(path, answer, { mode: 0o600 });
      throw new Error(`${stage} (raw answer: ${path}): ${refusal}`);
    });

    try {
      const notes = [];
      // 1. Goals
      if (needs.goalsStale) {
        if (!saved || !exported) throw new Error("The owner prompts were not prepared.");
        const goalsJson = join(goalsFolder, "owner-goals.json");
        const promptsMd = join(goalsFolder, "owner-prompts.md");
        const savedMap = saved.mapPath && existsSync(saved.mapPath) ? saved.mapPath : null;
        const save = async (goals, mapPath) => {
          writeFileSync(goalsJson, JSON.stringify({ ...goals, source_prompt_count: exported.ownerPrompts }, null, 2), { mode: 0o600 });
          await runPython(
            [join(config.vendorDir, "owner-goals", "save_goals.py"), "--goals", goalsJson, "--prompts", promptsMd, ...(mapPath ? ["--map", mapPath] : []), ...(sinceMinute ? ["--carried-before", sinceMinute] : [])],
            { cwd: config.dataDir, env: { ...process.env, CLAUDE_MEM_INTERNAL: "1", CLAUDE_MEM_WORKER_PORT: String(config.port), CLAUDE_MEM_WORKER_HOST: "127.0.0.1" } },
          );
        };
        if (!exported.ownerPrompts) {
          await save({ generated_at: startedIso, window_days: DAY_WINDOW, human_summary: "No owner prompts in this window.", priorities: [], open_asks: [] }, null);
          notes.push("goals empty");
        } else if (!sinceMinute) {
          await decide("goals", [goalsSkill, "---", PREAMBLE, `Step 1 is done: the owner's prompts are in ${promptsMd}. Do step 2 yourself (no subagent). Instead of writing owner-map.md and owner-goals.json, reply with only one JSON object: {"map": "<the owner-map.md markdown>", "goals": <the owner-goals.json object>}. The worker saves it with step 3.`].join("\n\n"), async (answer) => {
            if (typeof answer.map !== "string" || !answer.goals || typeof answer.goals !== "object") throw new Error('Answer needs "map" (markdown) and "goals" (object).');
            writeFileSync(join(goalsFolder, "owner-map.md"), answer.map, { mode: 0o600 });
            await save({ ...answer.goals, generated_at: startedIso }, join(goalsFolder, "owner-map.md"));
          });
          notes.push("goals mapped");
        } else if (!exported.newPrompts) {
          await save({ ...goalsAsJson(saved), generated_at: startedIso }, savedMap);
          notes.push("goals unchanged");
        } else {
          const previous = stash("previous-owner-goals", goalsAsJson(saved));
          await decide("goals", [goalsSkill, "---", PREAMBLE, `Do "Update the saved goals" yourself (no subagent). The saved goals are in ${previous}; the ${exported.newPrompts} prompts the owner typed since they were saved are in ${join(goalsFolder, "new-owner-prompts.md")}. Reply with only the updated owner-goals.json object. The worker saves it with step 3.`].join("\n\n"), (answer) => save({ ...answer, generated_at: startedIso }, savedMap));
          notes.push("goals updated");
        }
      }
      // 2. Grouping, batch by batch until the ledger has decided every conversation
      let grouped = 0;
      for (let input = cli(["grouping-input", "--days", "14"]); input.conversations.length; input = cli(["grouping-input", "--days", "14"])) {
        await decide("grouping", [progressSkill, "---", PREAMBLE, `Do only section 1 (grouping) for this one batch of new conversations, the \`grouping-input\` output (also saved in ${stash("grouping-input", input)}):\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``, `Decide each of these ${input.conversations.length} conversations exactly once, in "groups" or "ignored": ${input.conversations.map((c) => c.conversationKey).join(", ")}. Reply with only the decisions JSON that \`apply\` takes ({"groups": [...], "ignored": [...]}), deciding every conversation in the batch and nothing else.`].join("\n\n"), (answer) => cli(["apply"], validateGroupingDecisions(answer, input)));
        grouped += input.conversations.length;
      }
      if (grouped) notes.push(`${grouped} new conversations grouped`);
      // 3. Reviews, 8 groups per request, in parallel
      const due = cli(["pending", "--days", "14", "--limit", "1000000"]).groups;
      let reviewed = 0;
      const reviewBatch = async (batch) => {
        let shown = batch.map((g) => cli(["show", g.groupId]));
        let refused = [];
        for (let attempt = 0; attempt < 2 && shown.length; attempt++) {
          const answer = await askWithInputs([progressSkill, "---", PREAMBLE, `Do only section 2's review for the groups whose \`show\` output is in ${stash("show", shown)}: decide each one from the evidence as the reviewer task describes (amend the previous review for a group in "amend" mode). Reply with only {"reviews": [<one record-progress input per group, with reviewBasis copied verbatim from its show output>]}.`, refused.length ? `Your previous answer was refused for these groups:\n${refused.join("\n")}\nFix them and answer again for those groups only.` : ""].join("\n\n"), "review");
          let reviews = [];
          try { const parsed = extractJson(answer); reviews = Array.isArray(parsed.reviews) ? parsed.reviews : []; } catch {}
          refused = [];
          const recorded = new Set();
          for (const review of reviews) {
            try { cli(["record-progress"], review); recorded.add(String(review.groupId)); reviewed++; } catch (error) { refused.push(`${review.groupId}: ${error instanceof Error ? error.message : String(error)}`); }
          }
          shown = shown.filter((s) => !recorded.has(s.groupId));
          for (const s of shown) if (!refused.some((r) => r.startsWith(`${s.groupId}:`))) refused.push(`${s.groupId}: no review was given.`);
        }
        if (shown.length) throw new Error(`reviews: ${refused.join("; ").slice(0, 500)}`);
      };
      const batches = [];
      for (let i = 0; i < due.length; i += REVIEW_BATCH) batches.push(due.slice(i, i + REVIEW_BATCH));
      const failures = (await Promise.allSettled(batches.map((b) => timed("review", () => reviewBatch(b), { groups: b.length })))).filter((r) => r.status === "rejected");
      if (failures.length) throw failures[0].reason;
      if (reviewed) notes.push(`${reviewed} requests reviewed`);
      // 4. Alignment
      const align = cli(["align-input"]);
      if (align.groups.length) {
        const result = await decide("alignment", [progressSkill, "---", PREAMBLE, `Do only section 3 (link each request to the goals it serves) for the groups in this \`align-input\` output (also saved in ${stash("align-input", align)}):\n\n\`\`\`json\n${JSON.stringify(align, null, 2)}\n\`\`\``, `Decide each of these ${align.groups.length} groups, in "links" or "unaligned": ${align.groups.map((g) => g.groupId).join(", ")}. Reply with only the JSON that \`record-alignment\` takes ({"links": [...], "unaligned": [...]}); every listed group must appear in one of them.`].join("\n\n"), (answer) => cli(["record-alignment"], answer));
        notes.push(`${result.aligned} linked to goals`);
      }
      // 5. Story
      const story = cli(["story-input"]);
      if (story.reviews.length) {
        await decide("story", [progressSkill, "---", PREAMBLE, `Do only section 4 (${story.update ? "update" : "write"} the build story). The \`story-input\` output is in ${stash("story-input", story)}. Reply with only the JSON that \`record-story\` takes ({"narrative": "...", "preferences": [...]}).`].join("\n\n"), (answer) => cli(["record-story"], answer));
        notes.push(story.update ? "story updated" : "story written");
      }
      return notes.length ? `${notes.join(", ")}.` : "Nothing was due.";
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  }

  return { steps, prepare: needs.goalsStale ? prepare : undefined, run };
}

