# 32. Requests, goals, story and economics

Status: implemented, 2026-10-27. This page describes the code that exists: `src/hub/requests.mjs`,
`goals-rollup.mjs`, `artifacts.mjs`, `story.mjs`, `economics.mjs`, `rule-suggest.mjs`, `rules-decide.mjs`.
Every number comes from a stored row. An empty store returns empty arrays and `empty: true`; there are no
placeholder counts. The rule-based path needs no model. The Work and Memory tabs read these routes; the mapping is in
§32.11.

## 32.1 Requests (T-152)

A request is a group of sessions in one project that share a goal and are close in time. The goal is the owner's own
imperative prompt (`goals.imperativeTopic`); sessions with no imperative prompt share a `no-goal` key. Within a
(project, goal) group, sessions become separate requests when the gap since the previous session exceeds
`maxGapHours` (default 24).

Status is derived from rows, in this order:

| Status | Rule |
|---|---|
| `Working` | the latest session is not ended and its last activity is within `activeMinutes` (default 5) |
| `Shipped` | the latest session has a recorded session-end event |
| `Waiting on you` | not ended, and the latest activity is a prompt (the owner spoke last) |
| `Idle` | none of the above |

Each request also carries `stage` (the goal object), `startedAt`, `runningTimeMs`, session/prompt/tool counts and
`evidence` (session, prompt and tool ids). `requestDetail` adds `whereThisCameFrom`: sessions, the owner's prompts and
source facts.

Dismiss and restore write an id to `work.requests.dismissed` (settings); nothing is deleted.

## 32.2 Progress and ETA (T-166)

`progress` is the share of a request's sessions that ended or produced a summary, capped at 99 unless the request is
`Shipped` (then 100). `progressEvidence` lists the completed session ids, fact ids and summary ids.

`eta` is reported only when the request is not shipped, has at least two sessions with distinct starts, has at least
one completed session, and has remaining sessions. The pace is the mean gap between consecutive session starts.
Otherwise `eta` is `null` and `etaEvidence` is `null`.

## 32.3 What came out of it (T-167)

`artifacts.detectArtifacts` is conservative: a commit needs a `commit <sha>` lead-in, a full 40-hex sha, or a
bracketed `[branch sha]`; a PR needs a GitHub pull URL or `pull request #N`; a branch needs a `git push ... origin`
lead-in or a feat/fix/chore-style name. Each request carries `cameOutOfIt` (the findings, with `evidenceId`, `source`,
`sessionId` and `at`) and `outcome` counts.

## 32.4 Goals roll-up (T-168)

`proposeGoalsRollup` links each request to the goal whose topic key and project match. A goal is:

| Status | Rule |
|---|---|
| `Nothing on it` | no linked request |
| `Moving` | a linked request is Working, Waiting on you or Shipped |
| `Stalled` | linked requests exist, all idle |

It adds `aggregateProgress` (mean of the linked requests' progress), `requests`, request counts and
`whatCameOutOfIt` (merged artifacts). `noGoal` holds requests serving none of the goals. `openAsks` splits non-shipped
goals into `beingWorked` (Moving) and `nothingWorking` (Stalled or no request).

## 32.5 Build story (T-169)

`buildStory` returns counts (shipped, working, waiting on you, idle), a velocity object with `perWeek` (ISO week ->
shipped count from stored dates), `averageDaysToShip`, and `learned`: repeated corrections in the owner's prompts,
grouped by rule text with `timesSeen`, `latestAt` and dated quotes.

## 32.6 Context economics (T-170)

`economics` lists context memories (kind observation, summary or note) with `readTokens` from one documented counter,
`estimateTokens: ceil(text.length / 4)`. Per-observation `workTokens` is `null`, labelled "usage is recorded per
extraction call, not per observation". Totals take work tokens from `fact_usage` input + output, or `null` with
"no usage record". Savings is only computed when work tokens exist and exceed zero.

## 32.7 Rule strength and decide flow (T-171, T-172)

Each suggestion stores `times_seen`, `latest_at_epoch` and dated rows in `rule_suggestion_quotes`. Strength is
documented in code: `Light` at 1-2, `Steady` at 3-4, `Strong` at 5+. `listSuggestions` returns `timesSeen`,
`strength`, `latestAt`, `quotes` and `moreQuotes` (quotes beyond the first two).

The decide flow approves, edits-then-approves or rejects a suggestion, returns decided counts, toggles an active rule
on or off, records the last learning run, and records `replaced_by` / `replaced_at_epoch` when one rule replaces
another. Nothing here deletes a suggestion or a rule.

## 32.8 Query params (T-173)

`GET /v1/work/requests` accepts `filter` (`all`, `needs-you`, `shipped`), `sort` (`needs-you`, `newest`,
`most-progress`) and `group` (`agent`, `tool`). `counts` always describes the whole set: `all`, `needsYou`, `shipped`,
`working`, `idle`, `waitingOnYou`, `total`. `group` returns `groups` buckets keyed by the request's latest tool.

## 32.9 Routes

| Route | Method | What |
|---|---|---|
| `/v1/work/requests` | GET | the request list; `?project=&filter=&sort=&group=&maxGapHours=&activeMinutes=&limit=` |
| `/v1/work/requests/:id` | GET | one request plus `whereThisCameFrom`; 404 for an unknown or dismissed id |
| `/api/hub/requests/:id` | POST | `{action: "dismiss" \| "restore"}` (reversible) |
| `/v1/work/goals` | GET | the goals roll-up |
| `/v1/work/story` | GET | counts, velocity and learned habits |
| `/v1/context/economics` | GET | per-observation read tokens and work tokens |
| `/api/hub/rule-suggestions` | GET | suggestions with strength, quotes, decided counts |
| `/api/hub/rule-suggestions/:id` | POST | `{action: "approve" \| "edit" \| "reject" \| "restore", text?}` |
| `/api/hub/rules/:id/toggle` | POST | `{enabled: boolean}` |
| `/api/hub/rules/:id/replace` | POST | `{then, when?, scopeTier?, scopeName?}` |
| `/api/hub/rules/learning-run` | GET, POST | read, or run `suggestRules` and record the run |

CLI: `aletheia context economics [--project p] [--limit n]`.

## 32.10 Real sample (seeded temp database, 2026-10-27)

The seed has five requests in project `shop`: one Working, one Shipped (with a commit, PR and branch), one Idle and two
Waiting on you. `GET /v1/work/requests?project=shop` (abbreviated):

```json
{
  "project": "shop",
  "filter": "all",
  "sort": "newest",
  "group": null,
  "counts": { "all": 5, "needsYou": 2, "shipped": 1, "working": 1, "idle": 1, "waitingOnYou": 2, "total": 5 },
  "requests": [
    {
      "id": "02a99a159fe3462b", "project": "shop", "tool": "claude-code",
      "goalKey": "build retry button", "status": "Shipped", "progress": 100, "eta": null,
      "cameOutOfIt": [
        { "kind": "pull", "value": "#42", "number": 42, "url": "https://github.com/acme/shop/pull/42", "evidenceId": 4, "sessionId": "s1" },
        { "kind": "commit", "value": "abc1234", "sha": "abc1234", "evidenceId": 2, "sessionId": "s1" },
        { "kind": "branch", "value": "feat/retry-button", "name": "feat/retry-button", "evidenceId": 3, "sessionId": "s1" }
      ],
      "outcome": { "commits": 1, "pulls": 1, "branches": 1 }
    }
  ],
  "empty": false
}
```

`GET /v1/work/requests/:id` adds `whereThisCameFrom.sessions[]`, each with `prompts[]` and `facts[]` (ids and times).

`GET /v1/work/goals?project=shop` (abbreviated):

```json
{
  "goals": [
    { "object": "onboarding guide", "status": "Moving", "aggregateProgress": 0, "requestCount": 1 },
    { "object": "retry button checkout", "status": "Moving", "aggregateProgress": 100, "requestCount": 1 },
    { "object": "retry latency", "status": "Stalled", "aggregateProgress": 0, "requestCount": 1 }
  ],
  "noGoal": { "count": 2 },
  "openAsks": { "total": 2, "beingWorked": [ { "object": "onboarding guide" } ], "nothingWorking": [ { "object": "retry latency" } ] }
}
```

`GET /v1/work/story?project=shop`:

```json
{
  "counts": { "shipped": 1, "working": 1, "waitingOnYou": 2, "idle": 1, "total": 5 },
  "velocity": { "totalShipped": 1, "averageDaysToShip": 0, "perWeek": [ { "week": "2026-W44", "shipped": 1 } ] },
  "learned": [
    { "text": "Use pnpm, not npm", "timesSeen": 2, "latestAt": "2026-10-26T11:15:00.000Z",
      "quotes": [ { "text": "Use pnpm, not npm.", "at": "2026-10-26T10:35:00.000Z" } ] }
  ]
}
```

`GET /v1/context/economics?project=shop` (abbreviated):

```json
{
  "counter": "estimateTokens: ceil(text.length / 4)",
  "observations": [
    { "id": 17, "kind": "observation", "readTokens": 28, "workTokens": null, "workTokensSource": "usage is recorded per extraction call, not per observation" }
  ],
  "totals": { "observations": 2, "readTokens": 45, "workTokens": 1500, "workTokensSource": "fact_usage input + output tokens", "savingsPercent": 97 }
}
```

`GET /api/hub/rule-suggestions?project=shop` (abbreviated):

```json
{
  "total": 1, "decided": 0, "pending": 1,
  "items": [
    { "id": 1, "text": "Use pnpm, not npm", "timesSeen": 2, "strength": "Light",
      "latestAt": "2026-10-26T11:15:00.000Z", "moreQuotes": 0,
      "quotes": [ { "text": "No, use pnpm instead of npm.", "at": "2026-10-26T11:15:00.000Z", "sessionId": "s2" } ] }
  ]
}
```

`GET /api/hub/rules/learning-run`:

```json
{ "learningRun": { "at": "2026-10-27T10:10:44.419Z", "found": 2, "proposed": 1, "errors": 0 } }
```

`GET /v1/work/requests?project=shop&filter=needs-you&sort=most-progress&group=tool` (abbreviated):

```json
{
  "filter": "needs-you", "sort": "most-progress", "group": "tool",
  "requests": [ { "id": "c7f3fad4a28d22a2", "status": "Waiting on you", "progress": 0 } ],
  "groups": [ { "key": "claude-code", "count": 1 }, { "key": "codex", "count": 1 } ]
}
```

## 32.11 UI wiring (T-218 to T-222)

The UI is wired; no new tab was added. The existing modules changed shape:

| Route | Where it appears |
|---|---|
| `GET /v1/work/requests` | Work tab, Requests section: filter, sort and group controls, one card per request |
| `GET /v1/work/requests/:id` | `#/work/request/<id>`: where this came from, with links to the session page |
| `POST /api/hub/requests/:id` | Work tab: Dismiss with Undo; dismissed requests have Restore |
| `GET /v1/work/goals` | Work tab, Goals section: roll-up, open asks and the no-goal bucket |
| `GET /v1/work/story` | Work tab, Build story section |
| `GET /v1/context/economics` | Memory tab, Economics page |
| `GET`/`POST /api/hub/rules/learning-run` | Rules tab, Suggested page: last run and Run learning now |
| `POST /api/hub/rule-suggestions/:id` | Rules tab: Approve, Edit, Reject and Restore |
| `POST /api/hub/rules/:id/toggle` | Rules tab: Turn on or off, optimistic with Undo |
| `POST /api/hub/rules/:id/replace` | Rules tab: Replace, which says the old rule is kept |

Progress, ETA, request grouping, goal progress, rule strength and read tokens carry an "estimated" link to
[section 32.12](#3212-what-is-not-done). The request route has no
`offset`, so the Work tab offers a page size and the server's counts, not a pager that would repeat the same rows.

## 32.12 What is not done

- **A model-written story.** The build story is rule-based. No model was run, so no prose quality is claimed.
- **Measured thresholds.** Request grouping (the 24 h gap), progress, ETA pace, goal progress, rule strength bands
  and read tokens are chosen rules, not measured against owner behaviour. Every page that prints one labels it
  "estimated" and links here.
- **Per-observation work tokens.** The usage ledger is per extraction call, so per-observation work tokens are `null`.

## 32.13 Sources

- The modules named at the top of this page and their tests in `test/`. No external URL was fetched for this page.
