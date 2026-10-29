# 1. Architecture

## What the original is

claude-mem is a memory plugin for coding agents. Its worker (`scripts/worker-service.cjs`, a 4.2 MB Bun
bundle) records every prompt, tool call, observation and session summary into
`~/.claude-mem/claude-mem.db`, and serves several web pages. "My Work" is the page at `/`: a React
single-page app (Vite build in `ui/work-view/`) over a small JSON and server-sent-events API.

The worker listens on `37700 + (uid % 100)`. That is why this machine's instance is on `37700`
(uid 1000). The default `37777` appears only in help text.

Everything the page shows comes from three places:

| Source | Written by | Read by the page through |
|---|---|---|
| `claude-mem.db` tables `sdk_sessions`, `user_prompts`, `observations`, `session_summaries`, `tool_uses`, `work_state_entries` | claude-mem's hooks and the model it runs | `GET /api/work-view` |
| The **ledger**, files in `~/.claude-mem/work-view/` | an LLM "refresh" that runs inside the worker | `GET /api/work-view` |
| Small stores the page itself writes: review marks, saved rules, "agent finished" marks | the worker, on POSTs from the page | `GET /api/work-view` |

The page never calls anything else for its main view. It downloads one JSON document, the
**snapshot**, and then keeps it fresh over one event stream.

## Components of the clone

```
                      browser (public/ = original SPA)
                         |  GET /  GET /work-view/assets/*
                         |  GET /api/work-view     POST review | rules | mark-finished
                         |  GET /api/work-view/events   (SSE: work-view, heartbeat)
                         v
 +--------------------------- Bun process: bin/aletheia-server.mjs ------------------------------+
 |  server.mjs   routing, static files, guards (localhost only, same-origin JSON POSTs)    |
 |      |                                                                                  |
 |  app.mjs  WorkViewService --- snapshot() ---------------------------------------------+ |
 |      |        |  actions: review, saveRule, markAgentFinished, loadRulesInClaudeCode   | |
 |      |        |  SSE clients, 1 s change poll, 15 s heartbeat                          | |
 |      |        v                                                                        | |
 |      |   source.mjs SourceReader                                                       | |
 |      |        |  change detection -> rebuild only when something changed               | |
 |      |        |-- foldWorkState (readmodel/work-state.mjs)                             | |
 |      |        |-- readActivityRows + buildAgentView (readmodel/agent-view.mjs)         | |
 |      |        |-- buildRequests (readmodel/projection.mjs)  <- ledger (ledger/read.mjs)| |
 |      |        '-- hash of cited evidence rows                                          | |
 |      |-- humancopy.mjs   optional card text from an OpenAI-compatible model           | |
 |      '-- store/  overlay.db (own work-state log)   reviews.db (checked marks)         | |
 |                                                                                       | |
 |  refresh/auto-refresh.mjs  every 10 min: refreshNeeds() -> run job -> refresh.json    | |
 |      '-- orchestrator.mjs  goals -> grouping -> reviews -> alignment -> story          | |
 |            |-- providers.mjs  claude CLI | OpenAI-compatible HTTP                      | |
 |            |-- ledger/commands.mjs  validators + file writers (the original's CLI)     | |
 |            '-- vendor/owner-goals/*.py  export prompts, save goals                      | |
 +---------------------------------------------------------------------------------------+
        |                                  |                          |
 claude-mem.db (read-only)       <ledgerDir>/ (read + write)    <dataDir>/ (read + write)
```

## One snapshot, step by step

`WorkViewService.snapshot()` (called per request and per poll):

1. `SourceReader.read()` computes cheap signatures: work-state head (count, max id, overlay head),
   activity head (max id and count of five tables, `PRAGMA data_version`), ledger file mtimes. If none
   changed, it returns the cached view.
2. If they changed, inside one read transaction it re-folds work state (when that changed), runs
   `readActivityRows` (bounded SQL), builds the agent view,
   and hashes every raw row each request cites.
3. `goalLinks()` attaches, to each request, the goals the alignment step linked it to.
4. The service adds, per request, a content fingerprint and the review state (checked or not).
5. `HumanCopy.observe()` annotates each request with `humanCopy` and queues generation if a provider is
   configured.
6. It adds `rulesFile` (path, approved count, loaded flag), `setup`, and the composite `revision`
   `"<agentRevision>:<digest of reviews>:<humanCopy revision>"`.

The event stream sends a full snapshot on connect and again whenever `revision`, `source.connected`,
`source.error` or `setup` change. A heartbeat every 15 s carries `{at, source}`.

## Why a clone and not the original

The original is wired into the worker: its routes, its database manager, its cloud sync and its onboarding.
The clone keeps the **contract** and replaces the wiring:

- It never writes to `claude-mem.db`. Entries the original appends there (rules, "agent finished", saved
  goals) go to the clone's own `overlay.db`, folded in with the source entries.
- It has no account, cloud sync, or onboarding. `/api/setup/state` always reports `complete`.
- The refresh gives the model its evidence inline and needs no tools, so any chat model works.

## Process model

One Bun process. Timers: change poll (only while a page is open), heartbeat (same), human-copy pump (1 s),
refresh check (10 min). The refresh runs inside the same process and shells out to `python3` (goal export
and save) and to the `claude` CLI when that provider is chosen. A refresh is single-flight: `refresh.json`
records `state: running` and the pid, and another process refuses to start while that pid lives.
