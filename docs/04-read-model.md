# 4. Read model

How `GET /api/work-view` is computed. Code is under `src/readmodel/`; names below match the files.

## 4.1 What counts as a human request (`text.mjs`)

`requestText(prompt, max=1200)`: take the text after a `# My request:` heading if present; remove
`<environment_context>`, `<instructions>`, `<system-reminder>`, `<turn_aborted>`, `<permissions>`,
`<collaboration_mode>`, `<skills_instructions>` blocks, `# AGENTS.md instructions` lines and
`<pasted_content>` tags; return `null` when the result is empty, starts with `# Files mentioned by the user:` or is
still a scaffolding tag; cut to `max` with an ellipsis.

`isHumanActionRequest(prompt)` is true when, after that cleanup and removing markdown marks, the text is **not**:
a "read AGENTS/CLAUDE/KICKOFF.md" instruction; a greeting or acknowledgement (`hi, thanks, ok, yes, no, sure,
continue, go ahead, keep going, resume, done`); an agent launcher (`You are Codex...`, `Available skills`,
`Environment context`); "make sure it works"; or "you can do tests" without an action verb, **and** it
contains `GOAL: ...`, an action verb or request phrase (`fix, build, add, can you, how do, not working...`),
an imperative opening (`<verb> the/this/my...`, verb not a function word), or, for non-ASCII text, two
letter runs, or, for plain ASCII, no function word but at least two 3+ letter words.

`originalFor(session, prompts)`: the conversation's first substantive ask. The session's initial prompt wins
when it is a real ask and no real `user_prompts` row has number 1; otherwise the earliest real prompt (by
`prompt_number`, then time, then id); otherwise the initial prompt. Result:
`{text, source: session-initial-request|user-prompt, sourceId, url, promptNumber, atEpoch}`.

`titleFromRequest`: the `GOAL:` line or first non-empty line, markdown links/bold/code unwrapped, first
sentence, at most 100 characters (cut at a space after character 60 when possible).

## 4.2 Work state fold (`work-state.mjs`)

See [02-data-model.md](02-data-model.md#22-work-state-entries). Output: `lists[]` (each with `tasks[]`,
`isOpen`, `status`, `updatedAt`), `events[]` newest first (each with `changes[]`, a `sourceOrder`
`[epoch, device, localId]`), `summary` counts, `projects[]`.

## 4.3 Agent view (`agent-view.mjs`)

`readActivityRows(db)` runs the bounded reads in [02](02-data-model.md#bounds-on-every-read) and also derives
a real project for sessions recorded in a scratch folder (`project.mjs`, 4.6).

`buildAgentView(workState, rows)`:

1. **Records.** Every task of every list except `owner-goals*`, `my-rules`, `agent-lifecycle`, plus every list
   with fields of its own. Newest 240.
2. **Attribution.** For each record, look at its work-state events newest first and find the **one**
   recorded `work_state_write` tool call that wrote the same `(project, list, fields)` within 5 seconds.
   That call names the session and agent; it is the entry's author. If the entry has an `owner` field and no
   call, it belongs to a `recorded-owner` agent; otherwise to `Unassigned work`.
3. **Work item** per record: title, status (`unknown` unless the task has one), `request` (explicit field,
   else the captured prompt, else the task label), `nextStep`, `outcome`, `progress`, `owner`, `requestId`,
   `requestStatus`/`requestComplete`, extras (requester, ETA, stage, after-ship, work product), the
   attribution, `sourceRefs`, and an evidence URL.
4. **Observations.** For each of the newest 300: find its agent (a session, plus `agent_id` for subagents).
   Top-level sessions get one `session-request` work row per `(session, prompt)` whose request text is the
   summary's request, else the prompt, else the initial prompt. Subagents get one row from their launch
   (`Agent`/`Task` call description or prompt) and their observations; the parent session also gets a row for
   the prompt the observation belongs to.
5. **Presence.** `finished` when a stop exists (work-state `agent-lifecycle`, or the launch call returned
   synchronously) at or after the last activity (any observation or any tool call by that agent); the
   agent's `session-request` rows then become `finished`. Else `recent` within 15 minutes, `quiet` after,
   `unknown` with no activity. `canMarkFinished` is true for an unfinished subagent.
6. Goals, history and rules are folded from the lists (4.5), then `buildRequests` (4.4).

## 4.4 Request projection (`projection.mjs`)

Cards are keyed three ways, in this priority:

1. **Explicit**: a work item carries `request_id` (or its conversation has exactly one) ->
   `["explicit-request", projectRoot, id]`.
2. **Overall request**: the ledger put the conversation in group `g` -> `["overall-request", g]`. A
   conversation only joins its group when its project root equals the group's root (a root that is `""`
   adopts the one root its members share; a saved bare root upgrades to a member key that extends it).
3. **Conversation**: otherwise the conversation key.

Steps: (1) one request per conversation that has an `originalFor` and is neither explicit nor ignored by the
ledger; (2) groups whose conversations are outside the loaded window still appear from their saved
`anchorAsk`; (3) each work item attaches to its request, or to `unlinkedWork` with a reason
(`multiple-explicit-requests-without-item-link`, `no-substantive-human-request`,
`no-confirmed-conversation-or-explicit-request`, `ignored-by-request-grouping`); (4) work product from tool
calls and observations attaches to a conversation's request only when that conversation has exactly one.

Per request, then:

- `original`: the earliest of the computed ask and the group's `anchorAsk`.
- `scopeUpdates`: up to 6 later real prompts of its conversations (oldest first), the original excluded.
- `workstreams`: its items grouped by list (or by agent), each with up to 20 activity rows; `activity`: up to 40.
- `lifecycle`: the newest explicit `request_status`/`request_complete` among items (ties broken by source order,
  `request_complete` first). `completedAtEpoch` when it says done.
- `progress`: the group's ledger review, else `null`.
- `requestedBy`, `shipEstimate`, `stageSourceText`: newest non-empty across items. `afterShip`: merged and
  de-duplicated.
- `title`: title cache, else the group's title, else `titleFromRequest`.
- `updatedAtEpoch`: max of item updates, the original, and every prompt in its conversations.

## 4.5 Rules, goals {#rules}

**Goals** (`goals.mjs`): the open `owner-goals` list. Each open task is a goal: `kind` `open-ask` if
`goal_kind == "open-ask"` else `priority`; `rank`, `title`, `product`, `latestAt`, `timesAsked`; `evidence` parsed
from `YYYY-MM-DD HH:MM | quote` lines. Sorted by rank, then title. Past months: lists named
`owner-goals/<date>` that are not dropped and have items, newest `periodStart` first.

**Rules** (`rules.mjs`): start from the build story's preferences, each a suggestion
`{ruleId: pref_<hash>, setBy:"learned", status:"suggested", scope: everywhere}`. Overlay each saved
`Rule: <id>` task (later entries win). A rule is hidden when `then` is empty or it is an owner rule that was
dismissed. Scopes are `everywhere` first, then `project`, then `situation`, by name. `rulesLearning`
`{preferencesFound, newSuggestions, reviewsRead, writtenAt}`.

**MY-RULES.md**: only rules with status `on` set by `owner` or `approved`, grouped by scope
(`## Everywhere`, `## In <project>`, `## <situation>`). Within a group owner rules first, then by weight
`timesSeen / (1 + daysSinceLastSeen / 7)`. A line is `- <then>` or `- When <when>: <then lower-cased first letter>`.

## 4.6 Project keys (`project.mjs`)

A project key is `<repo>` or `<parent>/<worktree>`. From a path: the git top-level directory name; for a
worktree `<parent repo>/<worktree dir>`; for a submodule `<parent>/<relative path>`. When a session's stored
project is an agent scratch folder (temp dir, `Documents/Codex/<date>`), the key is derived from the paths its
tool calls touched: the repository holding the most of them (never `~/.claude`, `~/.codex`, `~/.gemini`,
`~/.claude-mem`, `~/.cursor`).

Simplification: the original also supports git-remote naming and glob "environments". The clone uses paths only.

## 4.7 Work product (`work-product.mjs`)

| Source | Produces |
|---|---|
| Bash `gh pr create` | `pull-request` with the printed or hinted PR URL and `--title` |
| Bash `git commit` | `commit` (sha, branch, subject) from `[branch sha] subject` output, `ok <sha>` or a `<sha> <subject>` line |
| Bash `git push` | `branch` (repo from `To <url>` when it is `https://github.com/..` or `git@github.com:..`) |
| Bash `git checkout -b` / `switch -c` | `branch` |
| `Artifact`, Notion/Claude Docs/ChatGPT page creation, deployment tools | the first non-API URL in the response, kind from the URL or tool |
| observation `files_modified` | files with an allowed extension, served through `/api/work-view/file/...` |
| work-state fields | links and files per [02](02-data-model.md#22-work-state-entries) |

Merged by `commit:<7 chars>` / `branch:<name>` / URL, newest wins, 60 at most; commits and branches inherit a
repo from a matching push.

## 4.8 Fingerprint and evidence hashes

`sourceContentHashes`: every raw row a request cites (original, scope updates, items, summaries, activity) is
fetched with the evidence query and hashed `sha256(JSON(row))`. `contentFingerprint` is `sha256` over
`id, original, explicitRequestText, scopeUpdates, title, projects, agentIds, items, lifecycle, afterShip,
shipEstimate, stageSourceText, sourceContentHashes` with object keys sorted. Editing any cited row, adding an
item or changing the title changes the fingerprint and clears the "checked" mark.
