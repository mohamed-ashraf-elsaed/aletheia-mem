// The pinned reader and judge prompts for the answer-accuracy harness. The judge is blind: it never sees the
// system name, only the question, the reference answer and the predicted answer. The version string and the
// sha256 of each prompt are recorded in every results file so a rerun can be compared to the same protocol.
import { createHash } from "node:crypto";

export const READER_PROMPT_VERSION = "reader-v1";
export const JUDGE_PROMPT_VERSION = "judge-v1";

export function readerPrompt(question, evidence = []) {
  const lines = (Array.isArray(evidence) ? evidence : []).map((entry) => String(entry)).filter(Boolean);
  const evidenceText = lines.length ? lines.map((line, index) => `${index + 1}. ${line}`).join("\n") : "(no evidence)";
  return [
    'Answer the question using only the evidence below. If the evidence does not contain the answer, say "not in evidence". Keep the answer to one short sentence.',
    "",
    "Evidence:",
    evidenceText,
    "",
    `Question: ${question}`,
    "",
    "Answer:",
  ].join("\n");
}

export function judgePrompt(question, referenceAnswer, predictedAnswer) {
  return [
    'Grade the predicted answer against the reference answer. The predicted answer is correct when it gives the same answer as the reference, ignoring wording, spelling and punctuation. Reply with exactly one JSON object and nothing else: {"correct": true} or {"correct": false}.',
    "",
    `Question: ${question}`,
    `Reference answer: ${referenceAnswer}`,
    `Predicted answer: ${predictedAnswer}`,
  ].join("\n");
}

export function hashPrompt(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export function parseJudgeVerdict(text) {
  const raw = String(text ?? "").trim();
  try {
    const doc = JSON.parse(raw);
    if (typeof doc.correct === "boolean") return { correct: doc.correct, raw };
  } catch {
    // not JSON
  }
  const match = /"correct"\s*:\s*(true|false)/i.exec(raw);
  if (match) return { correct: match[1].toLowerCase() === "true", raw };
  return { correct: null, raw };
}
