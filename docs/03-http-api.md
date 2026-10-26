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
| `GET /work-view/*` | files from `public/` (`/work-view/assets/...`, `/work-view/favicon.svg`) |
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
| `rules`, `ruleScopes`, `rulesLearning` | | My Rules ([04](04-read-model.md#rules)). |
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
observation, not from source. See [08-findings.md](08-findings.md).
