# 10. Rebuild guide

How to build this from nothing, in the order that keeps every step testable. Each step names the file, what
it must do, and the check that tells you it is right. The finished code is the reference; this is the path.

## Step 0. Inspect the original

```bash
ss -ltnp | grep bun                                  # find the worker port
curl -s localhost:<port>/ | head                     # index.html -> /work-view/assets/index-*.js
curl -s localhost:<port>/api/work-view | jq 'keys'   # the snapshot contract
ls ~/.claude/plugins/cache/thedotmack/claude-mem/*/   # scripts/, skills/, ui/work-view/
```

Useful facts: `ui/work-view/` is the whole front end; `scripts/worker-service.cjs.map` lists the original source
file names (no embedded source) and lets you slice the minified bundle per module;
`skills/request-progress/scripts/request-groups.mjs` is unminified and holds the ledger logic.

## Step 1. Skeleton and static serving

`bin/aletheia-server.mjs`, `src/config.mjs`, `src/server.mjs`: `Bun.serve` on `127.0.0.1`, serve `public/` (copy
`ui/work-view/*`), `/` returns `index.html`, `/work-view/*` returns files. *Check:* the page loads and
shows an error banner (no API yet).

## Step 2. Guards

`src/http/guards.mjs`: loopback peer, loopback `Host`, no proxy headers; POST needs same-origin JSON.
*Check:* spoofed `Host` over a raw socket gets 403 (`test/server.test.mjs`).

## Step 3. Read model, bottom up

Build and test each in isolation:

1. `readmodel/text.mjs`: request text cleaning, `isHumanActionRequest`, title, keys, `originalFor`.
2. `readmodel/work-state.mjs`: the fold. *Check:* null deletes, done closes, list vs task fields.
3. `readmodel/work-product.mjs`: parse git/PR output and tool calls.
4. `readmodel/project.mjs`: project keys, scratch-folder derivation.
5. `readmodel/rules.mjs`, `goals.mjs`, `lifecycle.mjs`: folded lists to rules, goals, stops.
6. `ledger/read.mjs`: read ledger files (start with an empty ledger).
7. `readmodel/agent-view.mjs` then `projection.mjs`: the big two. Port query by query, with the same
   limits and ordering; keep the "missing column gives empty" helper while comparing with the original, then
   fix F1.
8. `store/reviews.mjs` and the content fingerprint.

*Check:* run the original and your server on the same database and use `scripts/diff-against-live.mjs`
until the diff is empty (use `ALETHEIA_BUG_COMPAT=1` while the original has F1).

## Step 4. Source reader and snapshot

`source.mjs`: open read-only, signatures for change detection, fold + view + evidence hashes inside one
transaction, `goalLinks`. `app.mjs`: fingerprint and review per card, `rulesFile`, `setup`, composite revision.
*Check:* top-level key order equals the original's.

## Step 5. Actions

`app.mjs` (`review`, `saveRule`, `markAgentFinished`, `loadRulesInClaudeCode`), `store/overlay.mjs` (own
work-state log, ids offset by 2^40), `http/validate.mjs`. *Check:* the lifecycle tests in
`test/server.test.mjs`, including the 409 cases.

## Step 6. Events

SSE in `app.mjs`: `retry: 1000`, snapshot on connect, publish when `[revision, connected, error, setup]`
changes, heartbeat 15 s. *Check:* the page's "Live updates" dot is green and a saved rule appears without reload.

## Step 7. Evidence and files

`readmodel/evidence.mjs` and the `file` route. *Check:* every URL in a snapshot resolves (200 or a clean 404).

## Step 8. Ledger writer

`ledger/commands.mjs`: extract from `request-groups.mjs` the validators and writers; keep file formats
identical so the original can read what you write and the reverse. *Check:* `bin/ledger.mjs` commands round
trip (`test/refresh.test.mjs`).

## Step 9. Refresh

`refresh/orchestrator.mjs`: the five steps and the retry rule. `refresh/providers.mjs`: one function per
model backend. `refresh/auto-refresh.mjs`: the scheduler and `refresh.json` states. `POST /api/work-state/entries`
so the vendored `save_goals.py` works unchanged. *Check:* fake-model end-to-end test, then
`scripts/smoke-refresh.mjs` with a real model on synthetic data.

## Step 10. Optional: human copy

`humancopy.mjs`: bounded input, fingerprint, validated output, cache. Without a provider it must still report
`unavailable`.

## Design rules to keep

- Never write to the source database. Put your own writes in a store you own and fold them in.
- Everything the page shows must be derivable from rows, ledger files and your own stores. No hidden state.
- A reviewer's "checked" mark is bound to a content fingerprint, so changed work is never silently approved.
- A model's output is data: validate it with strict shape and length rules, and retry once with the refusal quoted.
- Keep the refresh optional and off by default; it sends prompts to a model.
