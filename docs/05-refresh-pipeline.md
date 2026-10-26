# 5. Refresh pipeline

Without the refresh, My Work shows one card per conversation, taken from your prompts. The refresh adds
**overall requests** (several conversations merged into one card), **progress reviews**, **goals**, **goal links**
and the **build story**. It is the only part that calls a language model.

> **Privacy.** The refresh sends your own prompts (goals step) and recorded activity (other steps: asks,
> observation titles) to the provider you choose. The original does the same automatically with the
> `claude`, `codex` or `gemini` CLI you are logged in to. Here it is off until you set `ALETHEIA_PROVIDER`.

## 5.1 Scheduling (`refresh/auto-refresh.mjs`)

Every `ALETHEIA_REFRESH_CHECK_MS` (10 min) and once at start:

1. Skip if disabled or if a refresh is running in this process.
2. If `refresh.json` says `running` and its pid is another live process, skip.
3. `refreshNeeds()`: `{due, ungrouped, goalsStale, unaligned, needed}`.
   - `ungrouped`: conversations active in the last 14 days that the ledger has not decided.
   - `due`: groups never reviewed, or active since their review, or whose conversations changed.
   - `goalsStale`: no saved goals, or saved goals older than 24 h.
   - `unaligned`: groups needing a goal-link decision.
4. If nothing is needed, write `refresh.json` as `idle` (or `failed` with "The previous refresh stopped before
   finishing." if it had been `running`). Otherwise run the job and write `ok` or `failed`.

`refresh.json` is also what the page shows as "extraction" progress (`step` is `goals`, `work` or `rules`).

## 5.2 The job (`refresh/orchestrator.mjs`)

Each model step asks for **one JSON object** and validates it with the same code the ledger CLI uses. On a
refusal it asks once more with `Your previous answer was refused: <reason>. Fix it and answer again.` After a
second refusal the raw answer is saved in `failed-answers/` and the job fails. Input files (the data the
model needs) are appended to the prompt as `--- <path> ---` blocks, because the model has no file tools.

| # | Step | Runs when | Model input | Model output | Effect |
|---|---|---|---|---|---|
| 1 | **goals** | `goalsStale` | `owner-goals` skill text + the owner's last 31 days of typed prompts (exported by `export_owner_prompts.py`) | first time: `{map, goals}`; update: the new `owner-goals.json`; no new prompts: no call | `save_goals.py` validates every quote against the real prompt at that minute and saves through `POST /api/work-state/entries` |
| 2 | **grouping** | `ungrouped > 0`, repeated per batch until none | one batch (<=20 conversations of ONE project root), that root's open requests, code-proposed links | `{groups:[{title, conversations (earliest first), links}], ignored:[{conversation, reason}]}` | `apply` -> `request-groups.json` |
| 3 | **review** | `due > 0`, 8 groups per call, calls in parallel | `show` output per group: every ask in full, observations, previous review, `reviewBasis` | `{reviews:[record-progress input...]}` | `record-progress` -> `progress/<group>.json` |
| 4 | **alignment** | `unaligned > 0` | `align-input`: current goals, groups to align | `{links:[{groupId, goal, evidence}], unaligned:[groupId]}` | `record-alignment` -> `alignment.json` |
| 5 | **story** | any review changed since the story | `story-input`: changed reviews, previous story, room left | `{narrative, preferences}` | `record-story` -> `story.json` |

Models per stage with `claude-cli`: grouping and alignment `haiku`, goals, review and story `sonnet`
(`STAGE_MODELS` in `providers.mjs`). With `openai`, the single configured model answers every stage.

Prompts are the original's two skill files, unchanged: `prompts/request-progress/SKILL.md` (sections 1-4) and
`prompts/owner-goals/SKILL.md`. The orchestrator prepends a preamble saying the run is read-only and
unattended, that there are no memory tools, and that the input files hold the evidence, then adds the
instruction for exactly one step and the JSON shape to reply with.

## 5.3 Validation rules (what the model must satisfy)

From `ledger/commands.mjs` (extracted unchanged) and `validateGroupingDecisions`:

- **Grouping**: `title` 1-120 chars; `conversations` valid keys, earliest first (the first anchors the group id);
  more than one conversation needs `links` that connect all of them to the anchor, each with a known `kind` and
  non-empty `evidence`, naming two or more of the group's own conversations; every conversation of a group is
  in one project root; every conversation asked about is decided exactly once; a conversation not asked about
  may appear only as an open request's anchor, listed first.
- **Progress**: group known; `reviewBasis` copied verbatim from `show` (`checkedThrough` date plus the
  conversations); `state` in the five states; `percent` integer 0-100; `shipped` needs `percent 100` and
  `shippedAt`, and only `shipped` may have `shippedAt`; dates ISO or null; at most 12 milestones and 10
  preferences; preference `kind` in `directive|correction|praise|frustration`; `outcome` per [02](02-data-model.md#25-the-ledger-ledgerdir).
- **Alignment**: every link's group exists and its `goal` equals a current goal's exact `goal` value; a group
  is not both linked and unaligned; every group `align-input` listed is decided.
- **Story**: `narrative` 1-12000 chars, at most 30 preferences, at most 3 quotes each.
- **Goals** (`save_goals.py`): each quote must equal the owner's words at that minute (quote marks and spacing
  normalised, `...` or `…` may skip words, pieces of 3+ characters); quotes older than the first prompt are
  dropped; an item with no quote left is dropped; two items cannot share a title.

## 5.4 The ledger CLI

`bun bin/ledger.mjs <command>` runs the same commands the orchestrator calls. Input is a JSON file path or `-`
for stdin; output is JSON on stdout; errors exit 1 with a message.

| Command | Purpose |
|---|---|
| `candidates [--days N] [--project root] [--brief]` | conversations in the window, with proposed links |
| `grouping-input [--days N] [--limit N]` | the next undecided batch |
| `apply <file>` | validate and save grouping decisions |
| `pending [--days N] [--limit N]` | groups due for review |
| `show <groupId>` | a group's full evidence and `reviewBasis` |
| `record-progress <file>` | save one review |
| `story-input` / `record-story <file>` | read changed reviews / save the story |
| `align-input` / `record-alignment <file>` | read groups to align / save links |
| `refresh-needs [--days N]` | what is due |

## 5.5 Providers (`refresh/providers.mjs`)

A provider is `async (prompt, {stage}) => text`.

- `claude-cli`: `claude -p --output-format json --no-session-persistence --tools "" --setting-sources "" --model <m>`
  with the prompt on stdin, `CLAUDE_MEM_INTERNAL=1` in the environment (so claude-mem hooks do not record the run),
  working directory the ledger directory, 5-minute timeout. No tools, no user settings, so hooks and
  instructions files cannot change the answer's format.
- `openai`: POST to `ALETHEIA_OPENAI_BASE_URL` with `response_format: json_object`, temperature 0.1.

Add another provider by returning a function from `makeProvider`.

## 5.6 Human copy (optional, separate)

`humancopy.mjs` writes a plain-language `title`, `summary`, `next` and `stage` per card, plus a title and
summary per workstream, from a fingerprinted input of at most 18000 characters. It needs
`ALETHEIA_OPENAI_API_KEY` and `ALETHEIA_OPENAI_MODEL`. Rules: quiet period 6 s (max wait 20 s) after a
change, at least 60 s between runs per card, retry after 60 s, concurrency 2, results cached by fingerprint in
`human-copy.json`. Output is validated for exact shape and length; unknown or missing workstream ids are
refused. Without a provider every card reports `humanCopy.state = "unavailable"` and the UI shows raw text.
