# 3. HTTP API

Base: `http://127.0.0.1:<port>`. All JSON responses carry `Cache-Control: no-store`. Pages carry
`Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`.

## 3.1 Guards

| Guard | Applies to | Rule | Failure |
|---|---|---|---|
| **local only** | every `/api/*` route except `/health` | peer address is `127.0.0.1`, `::1` or `::ffff:127.0.0.1`; `Host` header names `127.0.0.1`, `localhost` or `::1`; none of `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Real-IP` present | `403 {"error":"Work view is available only on this computer."}` |
| **same-origin JSON** | every POST | `Sec-Fetch-Site` is not `cross-site`; `Origin` is absent or exactly this server's loopback origin (same port); `Content-Type` is `application/json` | `403 {"error":"Review changes must come from the local work viewer."}` |
| **file origin** | `GET /api/work-view/file/...` | not cross-site, not cross-origin | `403 {"error":"Recorded files open only from the local work viewer."}` |

The server also binds to `127.0.0.1` only. The Host check defeats DNS rebinding; the Origin check defeats a
web page POSTing to your local port.

Errors are `{"error": "<message>"}`. Validation errors are `400 {"error":"Invalid request body.","details":[{path,message}]}`.
An unknown route is `404` with an HTML `Cannot <METHOD> <path>` body, like Express.

## 3.2 Routes

### Static
| Route | Response |
|---|---|
| `GET /`, `/index.html` | the SPA shell (`public/index.html`) |
| `GET /work-view/*` | files from `public/` (`/work-view/assets/...`, `/work-view/favicon.png`) |
| `GET /health` | `{"status":"ok","timestamp":<ms>}` |

### `GET /api/work-view` — the snapshot
Returns the whole page state. Top-level fields, in order:

| Field | Type | Meaning |
|---|---|---|
| `version` | `1` | |
| `generatedAt` | ISO string | |
| `currentProject`, `currentProjectScope` | `""`, `[]` | Always empty in this design (no "current project" concept). |
| `agents` | `Agent[]` | Sessions and subagents with their work and recent activity. |
| `recentActivity` | `Activity[]` (<=160) | Newest first, each with `agentGroupId`. |
| `goals` | `Goals \| null` | Current goals; gains `alignedAt`. |
| `goalHistory` | `Goals[]` | Past months, newest first. |
| `rules`, `ruleScopes`, `rulesLearning` | | My Rules. |
| `humanRequests` | `Request[]` | One card per human request, newest first. |
| `unlinkedWork` | `Item[]` | Work items that could not be tied to a human request, each with `reason`. |
| `coverage` | object | Counts and limits (`workRows`, `workLimit`, `linkedWork`, `ownerWork`, `unattributedWork`, `observations`, `observationLimit`, `summaries`, `livePresenceAvailable:false`, `summaryMethod`, `fullHistoryUrl:"/viewer"`). |
| `revision` | string | `"<agentRevision>:<reviewDigest16>:<humanCopyRevision>"`. Changes whenever anything visible changes. |
| `teamMode` | boolean | `WORK_STATE_TEAM_MODE=1`. |
| `story` | `{reviews, story, groups} \| null` | Ledger progress reviews, the build story, group count. |
| `refresh` | object \| null | Contents of `refresh.json`. |
| `source` | object | `{kind, mode:"read-only-sqlite", connected, pollIntervalMs, lastCheckedAt, lastUpdatedAt, error, stale}`. |
| `copyRevision` | number | Human-copy revision. |
| `rulesFile` | `{path, instructionsPath, approvedCount, loadedInClaudeCode}` | Paths use `~`. |
| `setup` | `{scan, work, extraction}` | Onboarding scan state (idle), five most recent groups, refresh step. |

`Request` fields: `id, conversationKey, conversationKeys, original{text,source,sourceId,url,promptNumber,atEpoch}, explicitRequestText, scopeUpdates[], projects[], agentIds[], items[], workstreams[], updatedAtEpoch, explicitRequestId, groupId, workProduct[], activity[], lifecycle, startedAtEpoch, progress (Review|null), completedAtEpoch, requestedBy(+Source), shipEstimate(+Source), stageSourceText, stageSource, afterShip, title, titleSource, sourceContentHashes[], contentFingerprint, review{checked,checkedAtEpoch,actor,available}, humanCopy{state,...}, goals?[]`.
`titleSource` is one of `title-cache`, `request-group`, `explicit-work-state-request`, `original-human-request`.
`humanCopy.state` is `current`, `outdated`, `pending` or `unavailable`.

`Agent` fields: `id, kind (session|recorded-owner|unassigned), label, platformSource, agentId, agentType, sessionId, contentSessionId, sessionTitle, recordedSessionStatus, project, projects, inCurrentScope, identityEvidence, presence{status: recent|quiet|unknown|finished, isLive, evidence, lastActivityAt, finishedAt?}, isSubagent, launch, work[], activity[] (<=8), counts{work,open,done}, canMarkFinished`.
`presence.status` is `recent` when the last activity is within 15 minutes, else `quiet`; `finished` when a stop was recorded at or after the last activity.

### `GET /api/work-view/events` — server-sent events
Headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`. Frames:

```
retry: 1000

event: work-view
data: <full snapshot JSON>

event: heartbeat
data: {"at":"<ISO>","source":{...}}
```

`work-view` is sent on connect and whenever `[revision, source.connected, source.error, setup]` changes
(polled every `ALETHEIA_POLL_MS`). `heartbeat` every 15 s. The original also sends `setup-scan`, `setup-state`
and `setup-import` while its onboarding runs; the clone never does.

### `GET /api/work-view/evidence/:kind/:id`
`kind` is `work-state`, `observation`, `prompt`, `summary`, `session` or `tool-use`; `id` a positive integer.
Returns `{kind, ...row}` (columns in [02](02-data-model.md)), `404 {"error":"Recorded evidence not found."}`,
or `400 {"error":"Invalid id"}`. Tool input and response are cut to 4000 characters.

### `GET /api/work-view/file/:kind/:id/:index`
Serves a deliverable file recorded in an observation (`files_modified[index]`) or a work-state entry
(`work_product` list item `index`). Only when the path is absolute, has no `..`, has an allowed extension
(images, video, pdf, docx, pptx, key, xlsx, csv, html) and exists as a regular file.
Headers: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox allow-scripts`.

### `POST /api/work-view/review`
Body `{requestId: string(1..2000), expectedFingerprint: 64 hex, checked: boolean}` (no other keys).
`200` returns the new snapshot.
`404` unknown request. `409 {error, snapshot}` when the fingerprint is stale ("This work changed...") or when
checking a request not reported complete. `503` when the source is disconnected or review storage is down.

A request is **reported complete** when its review shows `percent == 100` (and, if an explicit lifecycle
exists, the review was checked at or after it), or its explicit lifecycle says `complete: true` or a status in
`done, completed, complete, shipped, delivered, needs-review, review, in-review, awaiting-review, ready-for-review`.

### `POST /api/work-view/rules`
Body `{action, ruleId?, rule?}`; `rule` is `{scopeTier: everywhere|project|situation, scopeName (<=80), when (<=300), then (1..600, trimmed)}`.

| action | needs | effect |
|---|---|---|
| `add` | `rule` | new owner rule `own_<hex>`, status `on` |
| `edit` | `ruleId`, `rule` | change scope, when, then |
| `approve` | `ruleId` (`rule` optional) | learned -> approved, status `on` |
| `turn-on`, `turn-off` | `ruleId` | only for rules with status `on` or `off` (else 409) |
| `replace` | `ruleId`, `rule` | new rule; old gets status `replaced`, `replacedBy`, `replacedAt` |
| `dismiss` | `ruleId` | status `dismissed` (an owner rule then disappears) |
| `restore-suggestion` | `ruleId` | only `pref_*` rules (else 409): blanks the saved fields so the suggestion shows again |

A project or situation rule needs a non-blank `scopeName` (400). An unknown rule is 404.
`200` returns the snapshot, after rewriting `MY-RULES.md` and notifying event clients.

### `POST /api/work-view/agents/mark-finished`
Body `{agentGroupId}`. Only for a subagent (`isSubagent`, with `agentId` and `contentSessionId`) that
`canMarkFinished`; else `409`. Appends an `agent-lifecycle` entry with `stop_source: "owner-marked-finished"`.

### `POST /api/work-view/rules/load-in-claude-code`
Rewrites `MY-RULES.md` and, unless a line equal to `@<rules path>` already exists, appends that line to the
instructions file (adding a newline first when the file does not end in one). Idempotent. Returns the snapshot.

### `POST /api/work-state/entries`
Used by `save_goals.py`. Body `{cwd: string, list: string(1..200), fields: object}`. `fields` has at least
one key; values are string, boolean, finite number or `null`; keys non-empty; at most 2000 characters as JSON.
`list = "my-rules"` is refused (`403`). Plain-text reply `Saved to "<list>" in <project>.` where `<project>`
is the project key of `cwd`. The clone writes to the overlay store.

### Setup
`GET /api/setup/state` always returns `{status:"complete", ...}`. `GET /api/setup/scan` returns the idle scan
state. Every `POST /api/setup/*` returns `404 {"error":"Account setup is not part of aletheia-mem."}`. The
original's onboarding (choice of local or hosted memory, checkout, history import) is account and billing
flow with no meaning here.

## 3.3 Behaviour not guaranteed identical

The exact wording of validation errors (the original uses zod) and the 404 HTML body are reproduced from
observation, not from source.

## 3.4 Team mode

Team routes serve the same store as [31-team.md](31-team.md). `/v1/team/*` needs `Authorization: Bearer <sync token>`;
a read needs any valid token and a write needs `sync` or `admin`. `/api/hub/team/*` is the guarded local Hub route
and acts as the local operator. Bodies are JSON; `team_id` accepts a numeric id or the team name.

| Route | Method | Who | What |
|---|---|---|---|
| `/v1/team` | GET | member | the caller's teams, role and projects |
| `/v1/team` | POST | valid token | create a team; the caller becomes its owner (`{name}`) |
| `/v1/team/projects` | GET | member | named projects (`?team_id=`) |
| `/v1/team/projects` | POST | owner | add `{team_id, project}` |
| `/v1/team/members` | GET | owner | members, roles, projects and revoked state |
| `/v1/team/members` | POST | owner | `{team_id, name, role, projects[], token_id?}`; mints a sync token when `token_id` is absent and returns it once |
| `/v1/team/members/revoke` | POST | owner | `{team_id, member_id}`; also revokes that member's sync token |
| `/v1/team/shares` | POST | owner | `{team_id, member_id, projects[]}` replaces a member's project shares |
| `/v1/team/board` | GET | member | pins and decisions (`?team_id=&project=`) |
| `/v1/team/board` | POST | editor/owner | `{team_id, project, kind: "pin"\|"decision", text}` |
| `/v1/team/memory` | POST | editor/owner | `{team_id, project, kind?, title?, text, source_type?, source_id?}` |
| `/v1/team/brief` | GET | member | `{team, project, text, facts[], decisions[], sourceIds[]}` (`?team_id=&project=&days=&maxChars=`) |
| `/v1/team/search` | POST | member | `{team_id, query, project?, limit?}`; results respect project ACLs |
| `/v1/team/leave` | POST | member | tombstones the caller's shared rows, removes its shares and revokes its token |
| `/v1/team/audit` | GET | owner | append-only team actions (`?team_id=&limit=`) |

Failures: `401` for a missing, revoked or expired token (`member_revoked`, `token_revoked`); `403` for the wrong
role or a project the member does not share (`viewer_read_only`, `project_forbidden`, `not_member`); `404` for an
unknown team, member or project; `400` for a duplicate team name, the last owner, or a malformed body.

The store check is the gate: `TeamStore.authorize()` runs for the HTTP route, the CLI and a direct store call.
A route cannot bypass it, and a test calls the store directly to prove that.

## 3.5 Erasure

These routes are the guarded local UI/admin path. The CLI is `aletheia erase ...`; both call the same modules.

| Route | Method | What |
|---|---|---|
| `/api/hub/erasure/report` | POST | `{project?, ids?: ["memory:12"], before?}` returns `{plan}` with counts and ids. Reads only; deletes nothing. |
| `/api/hub/erasure/apply` | POST | the same selector plus optional `export_path` and `receipt_path`; writes a pre-erase bundle, deletes the rows, purges the matching sync entities and writes an HMAC-signed receipt |
| `/api/hub/erasure/verify` | POST | `{receipt: <object>}`; `200 {ok:true}` or `400 {ok:false, reason}` |

`before` is an epoch or an ISO date and means `created_at_epoch < before`. `ids` accepts `12` (memory #12) or
`memory:12`, `fact:12`, `observation:12`, `episode:12`. A plan follows provenance: a memory's episode, its
observation, the facts on that observation/episode, and the summaries, keys, links, dismissals and review rows
that point at them. `apply` removes the hub rows and their FTS entries, the vectors, the device replica/outbox
when one is local, and asks the sync store for a purge, which drops every op body and leaves a tombstone
with a null payload. The receipt records counts and ids, never text; it is signed with
`HMAC-SHA256` over the key-sorted body with the local key at `~/.aletheia/erasure.key` (mode 0600).

An erasure of an offline device's copy is not possible from here: revoke its token and wipe the device. An
E2EE account cannot be matched by project or content id, so pass the entity ids explicitly or purge on the
device that holds the key.

## 3.6 Alerts

The guarded local UI/admin path. The CLI is `aletheia alerts ...`. Events: `device.paired`, `token.revoked`,
`quota.hit`, `sync.error`, `extraction.failed`, `queue.depth`. A rule either appends one JSON line to a local
file or POSTs to a webhook. A webhook body is signed with `X-Aletheia-Signature: sha256=<hex>` (HMAC-SHA256 over
the exact body) when the rule has a secret.

| Route | Method | What |
|---|---|---|
| `/api/hub/alerts/rules` | GET | every rule; the secret is reported only as `hasSecret` |
| `/api/hub/alerts/rules` | POST | add a rule: `{name, event, target: "webhook"\|"file", url?, path?, secret?, countThreshold?, minValue?, windowS?, rateLimitS?, allowPrivate?, enabled?}` |
| `/api/hub/alerts/rules/:id` | PATCH | update any of those fields |
| `/api/hub/alerts/rules/:id` | DELETE | remove one rule |
| `/api/hub/alerts/feed` | GET | deliveries, newest first (`?limit=`) |
| `/api/hub/alerts/test` | POST | `{id}` queues one test delivery for that rule and delivers what is due |
| `/api/hub/alerts/run` | POST | deliver every due row once |
| `/api/hub/alerts/check` | POST | read queue depth and extraction failures, emit those events, queue matches |

Delivery rules: `countThreshold` N waits for N events in `windowS`; `minValue` gates a numeric event such as
`queue.depth`; `rateLimitS` allows one delivery per rule per window. A 2xx is final; 5xx/429, a timeout or a
network error retries with exponential backoff (1 s, 2 s, 4 s, ..., capped at 60 s) up to five attempts; other
4xx and a refused target fail immediately. A webhook target that resolves to a private, loopback or link-local
address is refused unless the rule sets `allowPrivate`. A name that does not resolve is refused (fail closed).
`sync.error` fires from the sync server's 500 path; `device.paired` from a successful join; `token.revoked` from
`/v1/sync/revoke`; `quota.hit` when a push hits a quota; `extraction.failed` and `queue.depth` from the
extraction worker. An alert store or delivery failure never takes the server or the queue down.

## 3.7 Requests, goals, story and economics

The universal `/v1` API also answers the Work views. These routes are read-only except for dismiss/restore and the
rule decide actions. Every number comes from a stored row; an empty store returns empty arrays and `empty: true`.
Full field descriptions and real samples are in [32-requests.md](32-requests.md).

| Route | Method | What |
|---|---|---|
| `/v1/work/requests` | GET | request list; `?project=&filter=all\|needs-you\|shipped&sort=needs-you\|newest\|most-progress&group=agent\|tool` |
| `/v1/work/requests/:id` | GET | one request plus where it came from (sessions, prompts, facts) |
| `/v1/work/story` | GET | shipped / working / waiting counts, shipping velocity, learned habits |
| `/v1/work/goals` | GET | goal roll-up: Stalled / Moving / Nothing on it, aggregate progress, no-goal bucket, open asks |
| `/v1/context/economics` | GET | per-observation read tokens and work tokens |
| `/api/hub/requests/:id` | POST | `{action: "dismiss" \| "restore"}` |
| `/api/hub/rule-suggestions` | GET | suggestions with strength, dated quotes and decided counts |
| `/api/hub/rule-suggestions/:id` | POST | `{action: "approve" \| "edit" \| "reject" \| "restore", text?}` |
| `/api/hub/rules/:id/toggle` | POST | `{enabled: boolean}` |
| `/api/hub/rules/:id/replace` | POST | `{then, when?, scopeTier?, scopeName?}`; the old rule gets `replacedBy` and `replacedAtEpoch` |
| `/api/hub/rules/learning-run` | GET, POST | read the last learning run, or run `suggestRules` and record it |
| `/api/hub/rules` | GET | every rule with `createdAtEpoch`, `source`, `evidence`, `last_confirmed_epoch`, `age_days`, `stale` and `reasons`; `?stale=1` keeps flagged rules, `?older_than_days=N` keeps rules last confirmed more than N days ago |
| `/api/hub/rules` | POST | add a rule; optional `evidence: [{kind: "memory" \| "fact", id}]` (ids must exist) |
| `/api/hub/rules/:id/confirm` | POST | "this rule is still right": sets `last_confirmed_epoch` to now and writes an audit row; `{restore: epoch}` puts an earlier date back (the Undo) |
| `/api/hub/rules/diff` | GET | per tool file, rules only in the store, only in the file, or worded differently, with file and line; `?tools=a,b&projectDir=/abs/path`; read-only |

The CLI equivalents: `aletheia context economics [--project p] [--limit n]` and `aletheia rules suggest`.

### Session start context format

`/v1/context`, `/api/hub/context`, `aletheia context`, the `session_start_context` MCP tool and the SessionStart
hook all return the same context block. Its shape is controlled by the Hub setting `context.format`:

| Value | Shape |
|---|---|
| `index` (default) | Pinned and recent memories as one compact line each (id, time, type marker, title <= 100 chars, no narrative), grouped by day and first file; then session requests, active facts and rules. A legend, a fetch-more hint and a measured context-economics line close the block. |
| `classic` | The previous flat list: one line per memory with a date, type and a 160-character narrative snippet, then facts and rules. |

The setting is stored in the Hub settings table (`context.format`, value `"index"` or `"classic"`). The untrusted
wrapper, pinned-first order, the active-facts section, flagged-rule notes and the `maxChars` cut are the same in both
formats.

The active-facts section is further controlled by `context.facts` (`"auto"` default, `"on"`, or `"off"`), stored
under `ui.settings.context.facts`. `auto` lists only pinned, provider-extracted, or confidence ≥ 0.6 facts; `on`
keeps the historical behaviour; `off` hides the section.

### Rule dates, evidence and the re-check flag

Every rule keeps the date it was made, its source, the memories and facts it rests on (its evidence) and the date it
was last confirmed. A rule approved from a suggestion copies the suggestion's source ids and dated quotes as its
evidence; a rule added through the API or the `add_rule` MCP tool may name evidence ids. A rule made before this
existed has no evidence and keeps working.

A rule is flagged for re-check when any of these holds. The flag is computed on every read and is **a flag, never a
deletion**: a flagged rule stays enabled, keeps syncing and is never edited or removed. A synced rules file and the session context append `[re-check: <reasons> Verify before applying.]` to a flagged rule, so an agent that receives the rule also receives the warning. Confirming the rule removes the note on the next sync.

| Code | When |
|---|---|
| `evidence_fact_superseded` | an evidence fact was superseded or closed after the rule was last confirmed |
| `evidence_fact_expired` | an evidence fact's `valid_to` or expiry passed after the rule was last confirmed |
| `evidence_memory_dismissed` | an evidence memory was dismissed after the rule was last confirmed |
| `newer_fact` | a newer active fact states a different object for the same project, subject and predicate as an evidence fact |
| `review_overdue` | no confirmation for more than the review window: setting `rules.reviewDays`, 7 to 730, default 90 |

A rule with no evidence can only be flagged by `review_overdue`. Each reason is `{code, message, evidence?}`. Confirming
a rule (`POST /api/hub/rules/:id/confirm`, `aletheia rules confirm <id>`, or the `confirm_rule` MCP tool) sets
`last_confirmed_epoch` to now, so a change that happened before it no longer counts. To stop following a rule, use
the existing turn-off route (`aletheia rules retire <id>` does the same): the rule is kept, not deleted.

`?older_than_days=N` also works on `GET /api/hub/memories` and in the `POST /v1/search` body (and as `older_than_days`
in the `search` MCP tool), so pruning old memories is a query. Memory rows already carry their date, `tool`,
`session_id`, `origin` and `files`.




