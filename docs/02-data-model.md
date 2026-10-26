# 2. Data model

## 2.1 Tables read from `claude-mem.db`

Opened with `readonly: true`, `PRAGMA query_only = ON`, `busy_timeout = 1500`. Every SELECT goes through a
helper that turns "no such table" and "no such column" into an empty result, so an older database still
renders (and so a wrong column name fails silently, see finding F1).

| Table | Columns used | Used for |
|---|---|---|
| `sdk_sessions` | `id, content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, status, started_at_epoch, completed_at_epoch, cwd` | A **conversation** is `(platform_source, content_session_id)`. `memory_session_id` links to observations and summaries. |
| `user_prompts` | `id, session_db_id, prompt_number, prompt_text (first 1200 chars), created_at_epoch` | The human's asks. |
| `observations` | `id, memory_session_id, project, agent_id, agent_type, prompt_number, title, subtitle, type, files_modified, created_at_epoch` | Agent activity; files an observation modified (work product). |
| `session_summaries` | `id, memory_session_id, project, prompt_number, request, completed, next_steps, created_at_epoch` | A request's recorded outcome and next step. |
| `tool_uses` | `id, session_db_id, content_session_id, memory_session_id, project, platform_source, tool_name, tool_input, tool_response, prompt_number, agent_id, agent_type, cwd, created_at_epoch` | Work-state write attribution, subagent launches, commits, pushes, PRs, published documents. |
| `work_state_entries` | `id, project, list_name, fields (JSON), created_at_epoch, origin_device_id, origin_local_id, sync_rev` | The append-only log behind goals, rules, "agent finished", and agent-reported work items. |

`created_at_epoch` is milliseconds since 1970 everywhere.

### Bounds on every read

| Read | Bound |
|---|---|
| observations | newest 300 |
| session summaries | newest 100 |
| work-state write tool calls | newest 5000, only since the oldest of the 240 most recent work-state entries minus 5 s |
| sessions with a prompt in the last 14 days | 600, plus every session the ledger grouped |
| prompts of those sessions | newest 12000 |
| subagent launches (`Agent`/`Task` calls) | 2000 |
| work product calls and observations | 2000 each, since the same window start |
| work records shown | 240; recent activity 160 |

## 2.2 Work-state entries

An entry is `{project, list_name, fields}`. `fields.task` selects a **task** inside the list; without it the
fields apply to the **list** itself. Folding in order (by `created_at_epoch`, then device id, then
`origin_local_id`/`id` as BigInt): each field sets its value, and a `null` value deletes the field.
A task or list is **closed** when `fields.status` is `done` or `dropped` (case-insensitive).
A list is open when it has fields of its own (and is not closed) or any open task.

Reserved list names:

| List | Meaning | Written by |
|---|---|---|
| `owner-goals` | The current goals. One task per goal (`Priority: <title>` or `Open ask: <title>`). | `save_goals.py` |
| `owner-goals/<YYYY-MM-DD>` | A past month's goals (history). | `save_goals.py --start --end` |
| `my-rules` | Saved rule state. One task per rule, `Rule: <ruleId>`. | the Rules actions |
| `agent-lifecycle` | "This subagent finished". One task per agent. | a stop hook, or "Mark finished" |
| anything else | Work reported by agents (a plan, a checklist). | agents, via the `work_state_write` tool |

Task fields the view understands (first non-empty wins, in this order):

| Meaning | Field names |
|---|---|
| request text | `request`, `human_request`, `user_request` |
| next step | `next_step`, `nextStep`, `next`, `next_action`, `remaining`, `pending`, `then_run` |
| outcome | `outcome`, `result`, `completed`, `verified`, `verification` |
| progress note | `human_summary`, `summary`, `progress`, `phase`, `stage`, `status_note` |
| owner | `owner` |
| explicit request id | `request_id` (task, else list) |
| lifecycle | `request_status` (string), `request_complete` (boolean) |
| requester / ETA / stage | `requested_by`, `requester`, `human_requester` / `ship_estimate`, `eta`, `target_ship_at`, `due_at` / `stage`, `phase` |
| after ship | `docs_url`, `documentation_url`, `promo_url`, `announcement_url`; `classification`, `category`, `tags`; `post_ship`, `after_ship` |
| work product | `work_product(s)`, `deliverable(s)` (JSON list or object), any field ending `_url` |

## 2.3 The overlay (`<dataDir>/overlay.db`)

Same shape as `work_state_entries` (`id, project, list_name, fields, created_at, created_at_epoch`).
Ids are stored as `OVERLAY_ID_BASE + rowid` with `OVERLAY_ID_BASE = 2^40`, so they never collide with source
ids, still sort after them, and evidence lookups can route by id (`>= 2^40` goes to the overlay).
Source rows and overlay rows are folded together.

## 2.4 The review store (`<dataDir>/work-view-reviews.db`)

```sql
CREATE TABLE work_view_reviews (
  request_id TEXT PRIMARY KEY,
  content_fingerprint TEXT NOT NULL,
  checked_at_epoch INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK (actor = 'local-user'));
```

A card is "checked" only while the stored fingerprint equals the card's current fingerprint. Any change to
the work it cites un-checks it.

## 2.5 The ledger (`<ledgerDir>/`)

All JSON, mode 0600, written atomically (temp file then rename). Formats are the original's exactly.

```
request-groups.json            { version:1, updatedAt, conversations:{<convKey>: groupId}, groups:{<groupId>: Group}, ignored:{<convKey>: reason} }
progress/g_<12hex>.json        Review (one per group)
story.json                     { narrative, preferences:[{preference, kind, supportCount, quotes:[{quote, at}]}], writtenAt }
alignment.json                 { links:{<groupId>:[{goal, evidence}]}, unaligned:[groupId], basis:{<groupId>: hash16}, goals:[goalKey], alignedAt }
refresh.json                   { state, reason, agent, startedAt, finishedAt, needs, result, error, nextAt, steps:[{step, agent, startedAt, finishedAt, groups?}], pid? }
agent-written-prompts.json     { promptIds:[...], updatedAt }   (optional; prompts an agent wrote)
owner-goals/<YYYY-MM-DD>/      scratch for the goals step (owner-prompts.md, owner-map.md, owner-goals.json)
agent-runs/<hex>/              scratch for one refresh run, removed when it ends
failed-answers/                raw model answers that failed validation twice
```

`Group` = `{ title (<=120), anchor (convKey), projectRoot, links:[Link], decidedAt, anchorAsk }`.
`Link` = `{ kind: shared-work-list|shared-request-id|agent-judgment, conversations:[>=2 of the group's], evidence }`.
`Review` = `{ groupId, state: shipped|in-progress|stalled|abandoned|unknown, percent 0-100, startedAt, shippedAt, lastActivityAt, summary (<=280), narrative (<=1200), milestones (<=12 of {at,text<=200,evidence[]}), preferences (<=10 of {kind,preference<=200,quote<=300,at}), outcome|null, evidence (<=20), reviewedThrough, reviewedConversations, checkedAt, changedAt, readings (<=20 of {at,percent}) }`.
`outcome` = `{ landed:{text<=400,at,evidence}, usage:{level in-use|some-use|no-evidence|unknown,text,evidence}, value:{level high|medium|low|unclear,text,evidence}, regressions (<=10 of {text,at,fixedBy,evidence}), changes (<=12 of {what,why,at,evidence}) }`.

### Identifiers

| Id | Form |
|---|---|
| conversation key | `JSON.stringify(["conversation", platform_source, content_session_id])` |
| group id | `"g_" + sha256(anchorConversationKey).slice(0,12)` (stable when later conversations join) |
| request id | `["overall-request", groupId]`, or the conversation key, or `["explicit-request", <root>, <request_id>]` |
| request key (one prompt) | `["request", platform, String(sessionDbId), promptNumber]` |
| agent id | `["session", platform, String(sessionDbId), agentId|"unidentified"]`; others `["owner"|"unassigned", project, owner, agentId]` |
| work-state list id | `[lowercase(project), listName]`; task id `[listId, taskName]` |
| rule id | owner rules `own_<12hex>`; learned rules `pref_<sha256(preference).slice(0,12)>` |
| project root | the project key before its first `/` (so worktrees of one repo share requests) |

### Alignment basis

`alignment.basis[groupId]` is `sha256(JSON{groupId,title,firstAsk[:400],state,percent,summary, conversations(sorted)}).slice(0,16)`.
A group is "unaligned" (due) when it has no recorded decision, when its basis changed, when a link points at a
goal that no longer exists, or when the goal set changed.

## 2.6 Other files

| File | Content |
|---|---|
| `<dataDir>/MY-RULES.md` | The approved rules as markdown, rewritten after every rule action. |
| `<dataDir>/human-copy.json` | `{version:1, entries:{<requestId>:{fingerprint, copy, generatedAt, model, usage}}}`. |
| `<dataDir>/human-copy-usage.jsonl` | One line per model call. |
