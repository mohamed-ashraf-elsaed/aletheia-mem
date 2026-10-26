// The ledger: files the LLM refresh writes under <ledgerDir>. The server only reads them.
//   request-groups.json       which conversations form which overall request (group)
//   progress/g_<12hex>.json   one review per group
//   story.json                the build story and learned preferences
//   alignment.json            which goals each group serves
//   refresh.json              status of the last refresh
//   agent-written-prompts.json  prompt ids an agent wrote (excluded from "owner" prompts)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../lib/util.mjs";

export const emptyGroups = () => ({ version: 1, updatedAt: null, conversations: {}, groups: {}, ignored: {} });
export const AGENT_PROMPTS_FILE = "agent-written-prompts.json";

export function readLedger(dir) {
  const groups = readJson(join(dir, "request-groups.json"), emptyGroups());
  const progress = {};
  let files = [];
  try {
    files = readdirSync(join(dir, "progress")).filter((f) => /^g_[0-9a-f]{12}\.json$/.test(f));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files) {
    const review = readJson(join(dir, "progress", file), null);
    if (review?.groupId && groups.groups[review.groupId]) progress[review.groupId] = { ...review, title: groups.groups[review.groupId].title };
  }
  return {
    groups,
    progress,
    story: readJson(join(dir, "story.json"), null),
    alignment: readJson(join(dir, "alignment.json"), null),
    refresh: readJson(join(dir, "refresh.json"), null),
    agentWrittenPromptIds: new Set(readJson(join(dir, AGENT_PROMPTS_FILE), { promptIds: [] }).promptIds ?? []),
  };
}

/** Cheap change detector: mtime+size of every ledger file. */
export function ledgerSignature(dir) {
  return ["request-groups.json", "progress", "story.json", "alignment.json", "refresh.json"]
    .map((name) => {
      try {
        const s = statSync(join(dir, name));
        return `${s.mtimeMs}:${s.size}`;
      } catch {
        return "missing";
      }
    })
    .join("|");
}
