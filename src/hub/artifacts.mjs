// "What came out of it": detect commit shas, PR URLs/numbers and branch references in stored tool events.
// The detector is conservative: a commit needs a `commit <sha>` lead-in, a full 40-hex sha, or a bracketed
// `[branch sha]` shape; a PR needs a github pull URL or "pull request #N"; a branch needs a `git push ... origin`
// lead-in or a feat/fix/chore-style name. Each finding keeps the tool-event id it came from.
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);

const FULL_SHA = /\b([0-9a-f]{40})\b/gi;
const COMMIT_WORD = /\bcommit\s+([0-9a-f]{7,40})\b/gi;
const BRACKETED = /\[([^\]]*?)\s+([0-9a-f]{7,40})\]/gi;
const PR_URL = /\bhttps?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)\b/gi;
const PR_NUMBER = /\b(?:pull request|pr)\s*#?(\d+)\b/gi;
const PUSH_BRANCH = /\bgit\s+push[^\n]*\borigin\s+([^\s]+)/gi;
const BRANCH_NAME = /\b(?:feat(?:ure)?|fix|bugfix|chore|docs|refactor|release|hotfix)\/[\w./-]+/gi;

/** Pure detection: return the commit, pull and branch references in one block of tool-event text. */
export function detectArtifacts(text) {
  const body = String(text ?? "");
  const out = [];
  const push = (item) => {
    if (!out.some((other) => other.kind === item.kind && other.value === item.value)) out.push(item);
  };
  for (const match of body.matchAll(PR_URL)) push({ kind: "pull", value: `#${match[1]}`, number: Number(match[1]), url: match[0] });
  for (const match of body.matchAll(FULL_SHA)) push({ kind: "commit", value: match[1], sha: match[1] });
  for (const match of body.matchAll(COMMIT_WORD)) push({ kind: "commit", value: match[1], sha: match[1] });
  for (const match of body.matchAll(BRACKETED)) {
    push({ kind: "commit", value: match[2], sha: match[2] });
    const name = match[1].trim();
    if (name) push({ kind: "branch", value: name, name });
  }
  for (const match of body.matchAll(PUSH_BRANCH)) push({ kind: "branch", value: match[1], name: match[1] });
  for (const match of body.matchAll(BRANCH_NAME)) push({ kind: "branch", value: match[0], name: match[0] });
  for (const match of body.matchAll(PR_NUMBER)) {
    push({ kind: "pull", value: `#${match[1]}`, number: Number(match[1]) });
  }
  return out;
}

/** Scan the tool events of the given sessions and return the artifacts, each with its evidence id and time. */
export function cameOutOfIt(store, { project, sessionIds = [] }) {
  const ids = sessionIds.map(String).filter(Boolean);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const memories = store.db
    .prepare(`SELECT id, coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at, session_id FROM memories
      WHERE project = ? AND kind = 'event' AND session_id IN (${placeholders})`)
    .all(project, ...ids);
  const episodes = store.db
    .prepare(`SELECT id, text, created_at_epoch AS at, session_id FROM episodes
      WHERE project = ? AND (role = 'tool' OR kind = 'event') AND session_id IN (${placeholders})`)
    .all(project, ...ids);
  const rows = [
    ...memories.map((row) => ({ ...row, source: "memory" })),
    ...episodes.map((row) => ({ ...row, source: "episode" })),
  ];
  const out = [];
  for (const row of rows) {
    for (const artifact of detectArtifacts(row.text)) {
      out.push({
        kind: artifact.kind,
        value: artifact.value,
        ...(artifact.sha ? { sha: artifact.sha } : {}),
        ...(artifact.name ? { name: artifact.name } : {}),
        ...(artifact.number != null ? { number: artifact.number } : {}),
        ...(artifact.url ? { url: artifact.url } : {}),
        at: iso(row.at),
        evidenceId: row.id,
        source: row.source,
        sessionId: row.session_id,
      });
    }
  }
  return out;
}
