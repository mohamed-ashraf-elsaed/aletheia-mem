# How Aletheia works: capture, redact, store, compress, recall

<!-- description: How Aletheia (aletheia-mem) turns hook events into memory: capture, redaction, SQLite storage, queued fact extraction and session-start context. -->
<!-- keywords: how aletheia works, ai agent memory pipeline, claude code hooks memory, fail-open hooks, memory redaction, rule-based fact extraction, session start context -->

Aletheia (aletheia-mem) captures what happens in an AI coding session through the tool's hooks, redacts secrets, stores the text in SQLite, compresses finished sessions into facts and a summary through a background queue, and returns a short context block at the start of the next session. This page follows one session through those steps.

Outputs below come from runs on 2026-10-29 against a temporary home folder and data directory, using the Claude Code hook adapter with recorded payloads. Paths that start with `...` stand for the temporary folder. No real Claude Code session was involved in these runs.

## The pipeline at a glance

```text
host hook -> aletheia hook -> redact -> hub.db -> queue -> facts and summary -> context
```

Each step runs in one of three places:

| Step | Runs in | Needs the server |
|---|---|---|
| Capture, redact, store | A short-lived `aletheia hook <tool> <event>` process started by the host | No |
| Queue and compress | The queue worker inside `aletheia-server`, or `aletheia compress` | Only for the automatic worker |
| Recall | A `SessionStart` hook, the MCP server, or `aletheia context` | No |

The hook opens `hub.db` itself. It does not call the server. The server adds the dashboard, the REST API and the background worker.

## Step 1: Capture

You connect a host with `aletheia install <tool> --write`. That adds hook entries to the host's config. Each entry runs a command like `bun <data dir>/aletheia.bundle.mjs hook claude-code UserPromptSubmit`, and the host sends one JSON payload on stdin.

For Claude Code, the adapter in [`src/hub/hooks/claude-code.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/hooks/claude-code.mjs) handles five events:

- `UserPromptSubmit` stores a `prompt` memory. The title is the first 120 characters. The text is capped at 8,000 characters.
- `PostToolUse` stores an `event` memory with the tool name and a short description as the title. The input and output are capped at 1,500 characters. Tools such as `TodoWrite`, `TaskCreate`, `TaskUpdate` and `ToolSearch` are skipped.
- `Stop` and `SessionEnd` store a `summary` memory from the assistant's last message (capped at 4,000 characters), queue the session for compression and mark the session ended.
- `SessionStart` stores nothing. It returns context. A resumed session gets none, because the host already has the conversation.

The project key comes from the payload's `cwd`. The hook walks up to the git root and uses the folder name. A git worktree becomes `parent/worktree`. With no git folder, it uses the folder name. Projects listed in `ALETHEIA_EXCLUDED_PROJECTS` are skipped before anything is written. In a test, a hook run with `ALETHEIA_EXCLUDED_PROJECTS=shop` exited 0 and stored nothing.

The other five hosts have their own adapters with their own event names. [Hooks](../reference/hooks.md) lists them. What has been checked on a real install is in the [Tools overview](../tools/overview.md).

## Step 2: Redact before storing

Redaction is a plain function in [`src/hub/redact.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/redact.mjs). It runs in this order:

1. Text between `<private>` and `</private>` is replaced with `[private]`. The content is not stored.
2. Known secret shapes are replaced with a marker: Anthropic, OpenAI-style and Stripe keys, GitLab, npm and GitHub tokens, JWTs, AWS key ids, Slack tokens, Google API keys and PEM private keys.
3. Passwords inside URLs, `Authorization: Bearer` values, and `password`, `secret`, `token` or `api_key` assignments with a value of six or more characters are replaced with `[redacted]`.

This payload carries a fake key and a private block:

```bash
printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"s1","cwd":"'$PWD'","prompt":"Deploy to staging with token sk-abcdefghijklmnopqrstuvwx1234 and <private>customer list: Acme</private> then run the tests"}' \
  | aletheia hook claude-code UserPromptSubmit
aletheia search "staging" --project shop
```

```text
#4 2026-10-29 [note] Deploy to staging with token [redacted:api-key] and [private] then run the tests (shop, claude-code)
```

Redaction is pattern-based. It cannot catch a secret that looks like ordinary text.

Redaction runs in the store itself, so every write path is covered: the hooks, `aletheia save` and `aletheia capture`, the MCP `save_memory` tool, the REST API (`POST /v1/memories` and `POST /v1/events`), the dashboard (New note, Save note), edits, the transcript back-fill and imports. Versions before this change did not redact REST and dashboard notes, edits and imports; run `aletheia scrub` once to redact rows an older version stored. The fact-extraction prompt redacts each episode again before it goes to a model, and each fact is redacted again before it is stored.

## Step 3: Store in SQLite

The memory goes into `hub.db` as a row in the `memories` table with a project, a kind (`prompt`, `event`, `observation`, `summary` or `note`), a type, a title, the text, the tool, the session id and a content hash. A row with the same project, kind, title and text as an existing row is not stored twice. SQLite FTS5 indexes the text, so keyword search works at once. [Memory model](../concepts/memory-model.md) describes the kinds and types.

## Fail-open hooks and the spool

A hook runs in the host's hot path, so it must never block it:

- It always exits 0. Any internal error is swallowed.
- A watchdog ends the process after 150 ms, whatever it is doing.
- It makes no network call and no model call.
- It sets a 50 ms SQLite busy timeout.
- If it cannot open or write the database, it appends the already-redacted item to `spool/hook-spool.jsonl` in the data directory (file mode 0600). The next hook that reaches the database replays the spool first.

This run points the hook at a database path that does not exist:

```bash
printf '%s' '{"hook_event_name":"UserPromptSubmit","session_id":"s3","cwd":"'$PWD'","prompt":"remember that the cache TTL is 60 seconds"}' \
  | ALETHEIA_HUB_DB=/nonexistent/hub.db aletheia hook claude-code UserPromptSubmit
echo $?
cat spool/hook-spool.jsonl
```

```text
0
{"kind":"memory","memory":{"project":"shop","tool":"claude-code","sessionId":"s3","kind":"prompt","type":"note","title":"remember that the cache TTL is 60 seconds","narrative":"remember that the cache TTL is 60 seconds"},"at":1793304017358}
```

The next hook, with the database reachable again, emptied the spool folder, and the first prompt appeared in search:

```text
#9 2026-10-29 [note] remember that the cache TTL is 60 seconds (shop, claude-code)
```

`aletheia doctor` reports the spool state and the last capture time.

## Step 4: Queue-based compression

Raw prompts and tool events are cheap and noisy. Compression turns finished sessions into facts and a summary. It never runs inside a hook, because a hook has no time budget for it.

1. The `Stop` hook adds the session to a small queue. It does not extract anything.
2. The queue worker, a background task of `aletheia-server` that ticks every two seconds, turns each entry into a job row of type `extract_session`.
3. The worker claims one job at a time with a 60 second lease. If the process dies, the lease expires and the job is claimable again. A failed job is retried with exponential backoff (1 s, 2 s, 4 s, up to a 60 s cap) for at most five attempts.
4. A job reads the project's or session's `summary` and `note` memories that have not been extracted yet. Prompts and events are not fact sources, because they hold requests and raw tool output.
5. It splits that text into windows (20 items and 12,000 characters by default), extracts facts from each window, stores them, builds a session summary and a project summary, and merges near-duplicate observations at a similarity of 0.92 or higher.

You can also drain the queue by hand with `aletheia compress`, or keep a worker running without the server with `aletheia compress --daemon`.

This run sends a `PostToolUse` event and a `Stop` event, then reads the rows. Right after `Stop`, the summary row holds the pasted assistant message. A few seconds later the worker has replaced it:

```text
after Stop:    6|summary|Session summary: The shop service uses SQLite for storage. T...
after worker:  6|summary|Session summary: - shop service uses SQLite for storage
fact:          1|active|0.45|rules|shop service uses SQLite for storage
job:           1|extract_session|done|1
```

The summary row keeps its id, and the original message stays as an episode. When a session yields no fact, the pasted message stays in the summary row. Here the rule extractor accepted one of the two sentences, so the generated summary holds one line.

### Rule-based or provider extraction

By default `ALETHEIA_PROVIDER` is `none`, and the server prints `extraction: worker on (rule-based)`. The rule extractor is deterministic and runs with no model. It splits text into sentences and keeps only a plain "subject verb object" sentence with a verb such as `uses`, `is`, `requires`, `stores` or `must`. It drops instructions, sentences that start with a pronoun, and lines that look like input, output, errors or diffs. It then applies a quality gate and keeps at most five facts per window. Each rule-extracted fact starts at confidence 0.55 and loses 0.1 when it has no date, so it is stored at 0.45. A wrong fact is worse than no fact, so it stays quiet.

When you set a provider, the same job sends each window to a model with the `facts-v1` prompt:

- The episode text is redacted again and cut to 2,000 characters per episode before it goes into the prompt.
- The answer is validated and capped. A malformed answer is rejected and recorded. A provider error makes the queue retry the job.
- Only `summary` and `note` text is sent, not raw prompts or events.

Providers include `claude-cli` and OpenAI-compatible endpoints, and `ALETHEIA_PROVIDERS` takes an ordered fallback list. [Model providers](../guides/model-providers.md) has the setup. The dashboard's "Compress now" button is a separate, optional step. It needs a provider, and it asks the model to turn recent prompts and events into up to five observations.

### Conflicting facts

A newer fact with the same subject and predicate but a different object closes the older one. The older fact is kept as history, not deleted. When two such facts have the same start time, both lose 0.1 confidence and the item lands in the review queue for you to decide. [Facts and contradictions](../33-facts.md) has the rules.

## Step 5: Recall

At the start of a session, the `SessionStart` hook opens the store and prints a JSON object with the context in `hookSpecificOutput.additionalContext`. The same block comes from `aletheia context` and the MCP `session_start_context` tool.

The block lists pinned memories, recent memories grouped by day, the last few session requests, facts, and your enabled rules for that tool. A hook caps it at 6,000 characters. The whole block is wrapped in an `<aletheia-memory>` tag with a notice that it is data, not instructions, and any copy of that tag inside a memory is neutralised.

In the default `auto` mode the Facts section lists only provider-extracted facts, facts at confidence 0.6 or higher, and facts tied to a pinned observation. Facts from the rule extractor sit at 0.45, so they stay out of the block. In the run above, the context after the `Stop` hook had no Facts section.

After the first block, a model can ask for more through the MCP tools `search`, `timeline` and `get_observations`. [Session-start context](../concepts/session-context.md) and [Search](../concepts/search.md) go deeper.

## Next steps

- [Quickstart](quickstart.md) - run the commands yourself in ten minutes.
- [Privacy and redaction](../concepts/privacy.md) - what is stored, what is removed, what leaves the machine.
- [Hooks](../reference/hooks.md) - the events each host sends and what each one stores.
- [Facts and contradictions](../33-facts.md) - the quality gate and how conflicts resolve.
- [Architecture](../01-architecture.md) - an internals page that describes the older Work-view service, not this pipeline.
