// A synthetic claude-mem database with the real table shapes (observations has NO content_session_id,
// exactly like 15.2.0). Three Claude sessions in two projects, one subagent, a commit + push + PR, work-state
// entries with an explicit request id, and owner goals. No real data.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./temp-dirs.mjs";

const SCHEMA = `
CREATE TABLE sdk_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, content_session_id TEXT NOT NULL, memory_session_id TEXT UNIQUE, project TEXT NOT NULL,
  platform_source TEXT NOT NULL DEFAULT 'claude', user_prompt TEXT, started_at TEXT NOT NULL, started_at_epoch INTEGER NOT NULL, completed_at TEXT, completed_at_epoch INTEGER,
  status TEXT NOT NULL DEFAULT 'active', worker_port INTEGER, prompt_counter INTEGER DEFAULT 0, custom_title TEXT, observed_model TEXT, observed_billing TEXT, cwd TEXT, project_key_source TEXT);
CREATE TABLE user_prompts (id INTEGER PRIMARY KEY AUTOINCREMENT, session_db_id INTEGER, content_session_id TEXT NOT NULL, prompt_number INTEGER NOT NULL, prompt_text TEXT NOT NULL,
  created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL, synced_at INTEGER, origin_device_id TEXT, origin_local_id TEXT, sync_rev TEXT NOT NULL DEFAULT '1');
CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_session_id TEXT NOT NULL, project TEXT NOT NULL, text TEXT, type TEXT NOT NULL, title TEXT, subtitle TEXT,
  facts TEXT, narrative TEXT, concepts TEXT, files_read TEXT, files_modified TEXT, prompt_number INTEGER, created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL,
  merged_into_project TEXT, agent_type TEXT, agent_id TEXT);
CREATE TABLE session_summaries (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_session_id TEXT NOT NULL, project TEXT NOT NULL, request TEXT, investigated TEXT, learned TEXT,
  completed TEXT, next_steps TEXT, files_read TEXT, files_edited TEXT, notes TEXT, prompt_number INTEGER, created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL, merged_into_project TEXT);
CREATE TABLE tool_uses (id INTEGER PRIMARY KEY AUTOINCREMENT, tool_use_id TEXT NOT NULL, content_session_id TEXT NOT NULL, memory_session_id TEXT, session_db_id INTEGER, project TEXT NOT NULL,
  platform_source TEXT NOT NULL DEFAULT 'claude', tool_name TEXT NOT NULL, tool_input TEXT, tool_response TEXT, cwd TEXT, prompt_number INTEGER, agent_type TEXT, agent_id TEXT,
  observation_id INTEGER, created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL, UNIQUE(content_session_id, tool_use_id));
CREATE TABLE work_state_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, list_name TEXT NOT NULL, fields TEXT NOT NULL, created_at TEXT NOT NULL, created_at_epoch INTEGER NOT NULL,
  synced_at INTEGER, origin_device_id TEXT, origin_local_id TEXT, sync_rev TEXT NOT NULL DEFAULT '1');
`;

export const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const min = (m) => NOW - m * 60_000;

export function makeFixture() {
  const dir = tempDir("work-view-fixture-");
  const dbPath = join(dir, "claude-mem.db");
  const db = new Database(dbPath, { create: true });
  db.exec(SCHEMA);
  const iso = (e) => new Date(e).toISOString();
  const session = (cs, ms, project, prompt, startedMin, status = "active") =>
    db.prepare("INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, user_prompt, started_at, started_at_epoch, status, custom_title) VALUES (?,?,?,?,?,?,?,?)")
      .run(cs, ms, project, prompt, iso(min(startedMin)), min(startedMin), status, null).lastInsertRowid;
  const prompt = (sid, cs, n, text, atMin) =>
    db.prepare("INSERT INTO user_prompts (session_db_id, content_session_id, prompt_number, prompt_text, created_at, created_at_epoch) VALUES (?,?,?,?,?,?)").run(sid, cs, n, text, iso(min(atMin)), min(atMin));
  const obs = (ms, project, n, title, atMin, extra = {}) =>
    db.prepare("INSERT INTO observations (memory_session_id, project, type, title, subtitle, prompt_number, created_at, created_at_epoch, files_modified, agent_id, agent_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(ms, project, "change", title, extra.subtitle ?? null, n, iso(min(atMin)), min(atMin), extra.files ?? null, extra.agentId ?? null, extra.agentType ?? null);
  const tool = (sid, cs, ms, project, name, input, response, n, atMin, extra = {}) =>
    db.prepare("INSERT INTO tool_uses (tool_use_id, content_session_id, memory_session_id, session_db_id, project, tool_name, tool_input, tool_response, prompt_number, agent_id, created_at, created_at_epoch) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(`tu_${Math.random().toString(36).slice(2)}`, cs, ms, sid, project, name, JSON.stringify(input), typeof response === "string" ? response : JSON.stringify(response), n, extra.agentId ?? null, iso(min(atMin)), min(atMin));
  const ws = (project, list, fields, atMin) =>
    db.prepare("INSERT INTO work_state_entries (project, list_name, fields, created_at, created_at_epoch) VALUES (?,?,?,?,?)").run(project, list, JSON.stringify(fields), iso(min(atMin)), min(atMin));

  // Session A: a checkout feature in "shop", with a subagent, a commit, a push and a PR.
  const a = session("cs-A", "ms-A", "shop", "Build a retry button on the checkout page so failed payments can be retried", 300);
  prompt(a, "cs-A", 1, "Build a retry button on the checkout page so failed payments can be retried", 300);
  prompt(a, "cs-A", 2, "also make sure the button is disabled while a retry is in flight", 240);
  obs("ms-A", "shop", 1, "Added RetryButton component", 290, { subtitle: "checkout/RetryButton.tsx" });
  obs("ms-A", "shop", 2, "Disabled state while retrying", 230);
  db.prepare("INSERT INTO session_summaries (memory_session_id, project, request, completed, next_steps, prompt_number, created_at, created_at_epoch) VALUES (?,?,?,?,?,?,?,?)")
    .run("ms-A", "shop", "Build a retry button on the checkout page", "RetryButton shipped behind a flag", "Add analytics for retries", 1, iso(min(220)), min(220));
  // subagent launched from session A prompt 1
  tool(a, "cs-A", "ms-A", "shop", "Agent", { description: "Write RetryButton tests", prompt: "Write tests for RetryButton" }, { agentId: "agent-1", status: "completed", isAsync: false }, 1, 280);
  obs("ms-A", "shop", 1, "RetryButton tests written", 270, { agentId: "agent-1", agentType: "general-purpose" });
  tool(a, "cs-A", "ms-A", "shop", "Bash", { command: 'git commit -m "feat(checkout): add retry button"' }, "[feat/retry-button abc1234] feat(checkout): add retry button\n 2 files changed", 1, 250);
  tool(a, "cs-A", "ms-A", "shop", "Bash", { command: "git push -u origin feat/retry-button" }, "To github.com:acme/shop.git\n * [new branch]      feat/retry-button -> feat/retry-button", 1, 249);
  tool(a, "cs-A", "ms-A", "shop", "Bash", { command: 'gh pr create --title "Add retry button" --body x' }, "https://github.com/acme/shop/pull/42", 1, 248);

  // Session B: continuation of the same overall request, same project.
  const b = session("cs-B", "ms-B", "shop", "continue the retry button work: add analytics events", 120);
  prompt(b, "cs-B", 1, "continue the retry button work: add analytics events", 120);
  obs("ms-B", "shop", 1, "Analytics events for retry", 110);

  // Session C: another project; reports work through work-state with an explicit request id.
  const c = session("cs-C", "ms-C", "docs", "Rewrite the onboarding guide so a new hire can finish setup alone", 200);
  prompt(c, "cs-C", 1, "Rewrite the onboarding guide so a new hire can finish setup alone", 200);
  tool(c, "cs-C", "ms-C", "docs", "mcp__plugin_claude-mem_mcp-search__work_state_write", { list: "onboarding", fields: { task: "Draft guide", status: "doing", request_id: "REQ-7", request: "Rewrite the onboarding guide so a new hire can finish setup alone" } }, "ok", 1, 190);
  ws("docs", "onboarding", { task: "Draft guide", status: "doing", request_id: "REQ-7", request: "Rewrite the onboarding guide so a new hire can finish setup alone", next_step: "Review with Sam", docs_url: "https://example.com/docs/onboarding" }, 320);
  ws("docs", "onboarding", { task: "Draft guide", status: "done", outcome: "Guide published" }, 310);

  // Owner goals (current list) for goal rendering.
  ws("home", "owner-goals", { human_summary: "Ship checkout reliability.", generated_at: "2026-10-25T10:00:00.000Z", window_days: 31, source_prompt_count: 3, status: "open" }, 330);
  ws("home", "owner-goals", { task: "Priority: Reliable checkout", status: "todo", goal_kind: "priority", rank: 1, title: "Reliable checkout", product: "shop", latest_at: "2026-10-25 09:00", times_asked: 2, snapshot: "2026-10-25T10:00:00.000Z", evidence: "2026-10-25 09:00 | make checkout reliable" }, 330);

  db.close();
  return { dir, dbPath, makeDir: (name) => { const p = join(dir, name); mkdirSync(p, { recursive: true }); return p; } };
}
