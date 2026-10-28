#!/usr/bin/env bun
// Answer-accuracy harness: a fixed reader and a blind judge across no-memory, full-context, retrieval and packed
// arms, with exact-match and judge-based scoring plus bootstrap confidence intervals. Offline by default.
//
//   bun bench/accuracy.mjs --provider openai --model gpt-4o-mini --data questions.json --out /tmp/accuracy.json
//   bun bench/accuracy.mjs --provider fake --data questions.json --dry-run
//
// The dataset is an argument, never downloaded: a JSON array of { id, question, answer, evidence: [string] }.
// Every arm makes two model calls per question (one reader, one judge); --dry-run prints the plan and stops.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { DEFAULT_LOCAL_URL, OPENAI_URL, OPENROUTER_URL, claudeCliProvider, fakeProvider, openAiProvider } from "../src/refresh/providers.mjs";
import { JUDGE_PROMPT_VERSION, READER_PROMPT_VERSION, hashPrompt, judgePrompt, parseJudgeVerdict, readerPrompt } from "./lib/judge.mjs";
import { bootstrapMeanCI, exactMatch } from "./lib/stats.mjs";

const HARNESS = "bench/accuracy.mjs";
const ARM_NAMES = ["no-memory", "full-context", "retrieval", "packed"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function makeProvider(kind, model, jsonMode) {
  if (kind === "fake") {
    return fakeProvider({ response: (_prompt, { stage }) => (stage === "judge" ? '{"correct": true}' : "synthetic answer") });
  }
  if (kind === "claude-cli") {
    return claudeCliProvider({ bin: process.env.ALETHEIA_CLAUDE_BIN ?? "claude", models: { reader: model, judge: model } });
  }
  if (!model) throw new Error(`provider "${kind}" needs --model <name> (or set ALETHEIA_OPENAI_MODEL).`);
  const url = kind === "openrouter" ? OPENROUTER_URL : kind === "openai" ? (process.env.ALETHEIA_OPENAI_BASE_URL ?? OPENAI_URL) : (process.env.ALETHEIA_LOCAL_BASE_URL ?? DEFAULT_LOCAL_URL);
  return openAiProvider({ url, apiKey: process.env.ALETHEIA_OPENAI_API_KEY ?? "", model, provider: kind, jsonMode });
}

function tokenize(text) {
  return String(text ?? "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function retrieve(question, corpus, k) {
  const questionTokens = new Set(tokenize(question));
  return corpus
    .map((text, index) => ({ text, index, score: tokenize(text).filter((token) => questionTokens.has(token)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, k)
    .map((entry) => entry.text);
}

function packEvidence(evidence, budget = 500) {
  const out = [];
  let used = 0;
  for (const text of evidence) {
    if (used + text.length > budget) break;
    out.push(text);
    used += text.length;
  }
  return out;
}

function armsFor(question, corpus) {
  const gold = Array.isArray(question.evidence) ? question.evidence.map(String) : [];
  const retrieved = retrieve(question.question, corpus, 3);
  return {
    "no-memory": [],
    "full-context": gold,
    retrieval: retrieved,
    packed: packEvidence(retrieved),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataPath = args.data;
  if (!dataPath) {
    console.error("accuracy: --data <path> is required (the dataset is an argument, never downloaded)");
    process.exit(2);
  }
  const raw = readFileSync(dataPath);
  const datasetSha256 = createHash("sha256").update(raw).digest("hex");
  let data;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    console.error("accuracy: --data is not a JSON file");
    process.exit(2);
  }
  if (!Array.isArray(data)) {
    console.error("accuracy: --data must be a JSON array of {id, question, answer, evidence}");
    process.exit(2);
  }
  const limit = args.limit !== undefined ? Number(args.limit) : data.length;
  if (!Number.isInteger(limit) || limit < 0) {
    console.error("accuracy: --limit must be a non-negative integer");
    process.exit(2);
  }
  const questions = data.slice(0, limit);
  const corpus = [...new Set(questions.flatMap((question) => (Array.isArray(question.evidence) ? question.evidence.map(String) : [])))];
  const provider = args.provider ?? "fake";
  const model = args.model ?? "";
  const totalModelCalls = questions.length * ARM_NAMES.length * 2;

  const plan = {
    harness: HARNESS,
    provider,
    model,
    dataset: resolve(dataPath),
    datasetSha256,
    questions: questions.length,
    arms: ARM_NAMES,
    callsPerArmPerQuestion: 2,
    totalModelCalls,
    readerPromptVersion: READER_PROMPT_VERSION,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
  };

  if (args["dry-run"]) {
    console.log("accuracy dry-run:");
    for (const [key, value] of Object.entries(plan)) console.log(`  ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    console.log(`  model calls: ${totalModelCalls} (${questions.length} questions x ${ARM_NAMES.length} arms x 2 reader+judge)`);
    return;
  }

  const readerAsk = makeProvider(provider, model, false);
  const judgeAsk = makeProvider(provider, model, true);

  const arms = {};
  for (const name of ARM_NAMES) arms[name] = { perQuestion: [], exact: null, judge: null };

  for (const question of questions) {
    const evidenceByArm = armsFor(question, corpus);
    for (const name of ARM_NAMES) {
      const evidence = evidenceByArm[name];
      const predicted = (await readerAsk(readerPrompt(question.question, evidence), { stage: "reader" })).trim();
      const judgeText = (await judgeAsk(judgePrompt(question.question, question.answer, predicted), { stage: "judge" })).trim();
      const judge = parseJudgeVerdict(judgeText);
      arms[name].perQuestion.push({
        id: question.id,
        question: question.question,
        gold: question.answer,
        predicted,
        exact: exactMatch(predicted, question.answer),
        judgeCorrect: judge.correct,
        evidenceCount: evidence.length,
      });
    }
  }

  for (const name of ARM_NAMES) {
    const rows = arms[name].perQuestion;
    const exactValues = rows.map((row) => (row.exact ? 1 : 0));
    const judgeValues = rows.filter((row) => typeof row.judgeCorrect === "boolean").map((row) => (row.judgeCorrect ? 1 : 0));
    arms[name].exact = bootstrapMeanCI(exactValues, { seed: 1 });
    arms[name].judge = bootstrapMeanCI(judgeValues, { seed: 1 });
  }

  const result = {
    ...plan,
    generatedAt: new Date().toISOString(),
    machine: hostname(),
    readerPromptSha256: hashPrompt(readerPrompt("Q", ["E"])),
    judgePromptSha256: hashPrompt(judgePrompt("Q", "G", "P")),
    arms,
  };

  if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 2));

  const pct = (ci) => (ci.mean === null ? "n/a" : `${(ci.mean * 100).toFixed(1)}% (n=${ci.n}, ci95 ${(ci.ci95[0] * 100).toFixed(1)}-${(ci.ci95[1] * 100).toFixed(1)})`);
  console.log(`accuracy: ${questions.length} questions, ${ARM_NAMES.length} arms, provider=${provider}, model=${model || "(default)"}`);
  for (const name of ARM_NAMES) console.log(`  ${name.padEnd(12)} exact ${pct(arms[name].exact)}   judge ${pct(arms[name].judge)}`);
}

if (import.meta.main) await main();
