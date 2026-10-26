# A1. claude-mem paid and hosted features, and a free self-hosted plan for each

Date: 2026-10-26. Research only. No code was changed.

How to read the citations. A tag like `[cloud-sync.md]` or `[repo store.ts]` is the last part of a URL in
`docs/_research/A1-sources.tsv`. `[issue 4191]` is `https://github.com/thedotmack/claude-mem/issues/4191`.
All repo facts are from a shallow clone of `thedotmack/claude-mem` at commit
`7325fb7818ff7426665d85922db642ec0931bdcd` (committed 2026-10-26, the head at read time). The clone is depth 1, so
per-file commit shas were not available; the head sha applies to every `repo` tag.
Quotes are under 25 words; everything else is paraphrased. "Effort days" are my own estimates for one developer who
knows the Aletheia code. They are not sourced.

## 0. What is paid, in one page

1. The local engine is free (Apache-2.0). Only "CMEM Pro" (a cmem.ai subscription) and TeamBrain are paid
   [cmem.ai home] [cmem.ai pricing] [repo license.md].
2. CMEM Pro bundles three things: hosted observation, cloud sync, and a private MCP link [cmem.ai pricing].
3. The sync hub, the Postgres "hosted server", and the TeamBrain client are in the open repo. The cmem.ai web app
   (billing, login, dashboard, inference gateway, OAuth MCP, content store, TeamBrain server) is **not** in the repo.
   Where this note says "closed", it means "not in the repo I read", and the facts come from client code,
   docs, one plan file and issue comments. The plan file says the cmem.ai app is a separate repo on Vercel, with a
   Supabase control plane and a Turbopuffer content store [repo 2026-07-22-cmem-launch.md]. That plan is dated
   2026-07-22 and may be out of date.
4. The repo's own IP-boundary file lists what stays private: hosted cloud, team sync, admin dashboard,
   SSO/SAML/SCIM, enterprise RBAC, audit log UI, DLP/policy engine, premium knowledge agents, managed evals
   [repo ip-boundary.md]. Nothing else about the enterprise items is public.
5. Correction to our own matrix: `docs/20-claude-mem-feature-matrix.md` rows F-T04 (SSO, RBAC, DLP) cite
   `hosted-server` as the source. That page does not mention SSO, RBAC or DLP [hosted-server.md]. The only source is
   `docs/ip-boundary.md` (a "reserved" list, not a feature description). Row F-T01 says the price is not stated; the
   pricing page now states it (section F1).

Not paid (so not in scope): quota fallback, multi-key rotation, local backups, local export/import, local knowledge
agents, auto-redaction, private tags [quota-fallback.md] [multi-key-rotation.md] [backups.md] [export-import.md]
[usage/knowledge-agents.md].

## A. Design core shared by many features: "Aletheia Sync"

Most sections below depend on this. It is written once here and referenced as **A-SYNC**.

**Facts about the claude-mem hub this is modeled on** (all [repo store.ts] [repo schema.ts] [repo index.ts]
[repo canonical-content.ts] unless noted):

- One ordered log per user. Tables: `sync_users` (epoch, head_seq, projected_seq), `sync_ops` (PK user_id+seq),
  `sync_entity_heads` (latest rev per entity), `sync_devices` (last_ack_seq). Ops are stored as one text `body` of
  canonical JSON plus a SHA-256 of that body.
- Each entity has a stable id built from a hash of (kind, origin device, origin local row id), and a revision
  number `entity_rev`. A push of a lower rev than the head is refused as `stale_revision`. The same rev with a
  different hash is refused as `revision_hash_conflict`. The same rev with the same hash is acked as a duplicate.
  A higher rev appends a new op.
- A refusal rejects the **whole batch** and rolls it back (code comment: "any refusal rolls back all of it").
- A delete is a normal op with `deleted: true`, a `deleted_at` time, a null payload, and a higher rev (a tombstone).
- Limits: 500 ops and 4,000,000 encoded bytes per request on the client, 8,000,000 bytes per push on the hub,
  256,000 bytes per op body, 500 ops per pull page, 64 devices per account [cloud-sync.md] [repo index.ts]
  [repo store.ts].
- The body is stored in clear text in the hub. I found no encryption of the payload in the hub or client code.
  (Absence in the files I read; I did not grep every file for crypto.)
- Schema file header says retention, rotation and compaction are out of scope [repo schema.ts].
- Pull is cursor-based, applied in one transaction with the cursor, with an echo guard (rows the device itself
  pushed are skipped, pulled rows are pre-stamped so they never re-upload) [repo SyncApply.ts].
- An epoch change (hub reset) makes the client reset its cursor to 0 and re-pull; apply is idempotent [repo SyncApply.ts].

**Aletheia Sync design** (zero npm dependencies, Bun, SQLite, to match Aletheia today per README):

Components
- `bin/aletheia-sync.mjs`: a Bun.serve process with `bun:sqlite` file `sync.db`. Runs standalone or is mounted by
  `aletheia-server` with a flag. Binds loopback by default. For remote use it must sit behind TLS (Caddy, Tailscale,
  Cloudflare Tunnel); it refuses a non-loopback bind unless `--behind-tls` is set.
- Client module in the hub (`src/hub/sync/`): outbox drain, pull apply, cursor, dead-letter.

Server tables (`sync.db`)
- `sync_account(id, name, epoch, head_seq INTEGER, created_at)`
- `sync_token(id, account_id, kind CHECK in ('device','read','admin'), token_sha256 BLOB UNIQUE, device_id,
  scopes, expires_at, revoked_at, last_used_at)`. Token = 32 random bytes, shown once, only the hash stored.
- `sync_device(account_id, device_id, name, last_ack_seq, last_seen, revoked_at, created_at)`, PK (account, device).
- `sync_op(account_id, seq INTEGER, entity_id, kind, origin_device_id, origin_local_id, entity_rev INTEGER,
  op_sha256, body BLOB, deleted INTEGER, deleted_at, server_ts)`, PK (account, seq), UNIQUE (account, entity_id, entity_rev).
- `sync_head(account_id, entity_id, entity_rev, op_sha256, deleted, seq)`, PK (account, entity_id).
- `sync_audit(id, account_id, token_id, action, detail, ts)`.
- Sequence numbers fit in SQLite's 64-bit integer. claude-mem uses decimal strings because of the JS number limit;
  Aletheia can send JSON integers, since 2^53 ops is not reachable.

Client columns (in `hub.db`): on each synced row `origin_device_id`, `origin_local_id`, `sync_rev`, `synced_at`;
tables `sync_outbox`, `sync_cursor(epoch, seq)`, `sync_dead_letter(reason, raw_body)`, `sync_state(key, value)`.

Protocol (all JSON, `Authorization: Bearer`, `X-Device-Id`, `X-Device-Name`)
- `POST /sync/v1/ops` `{protocol_version, ops:[{body, sha256}]}`, at most 500 ops, 4 MB. **Response is per op**:
  `{results:[{id, rev, status:'applied'|'duplicate'|'stale'|'conflict', seq}], head_seq}`. This differs from
  claude-mem, where one bad op rejects the batch, and users got stuck for days [issue 4086] [issue 3964].
- `GET /sync/v1/changes?since=&limit=500` returns `{epoch, head_seq, ops, has_more}`.
- `GET /sync/v1/status` returns epoch, head, device count, accepted kinds.
- `GET /sync/v1/ws`: advisory channel (see F5).
- Retry rules on client: backoff 30 s doubling to 10 min with jitter; `Retry-After` is a hard floor; new local writes
  never trigger a flush while a retry timer is armed [issue 4231]. When sync is off, nothing is queued
  [issue 4228].

Conflict rules (explicit, because claude-mem's are only in code)
1. Per entity, `sync_rev` only goes up. Higher wins.
2. Lower rev: server answers `stale`; the client drops its op and pulls.
3. Same rev, same hash: `duplicate` (idempotent ack).
4. Same rev, different hash: `conflict`, this one op only. The client dead-letters it with the reason and
   `aletheia sync rebase` re-stamps the row at rev = max seen + 1 and re-queues it.
5. A tombstone is a higher rev with `deleted=1`. A tombstone beats an edit of the same or lower rev. An edit with a
   higher rev than the tombstone is refused (`stale` against a tombstone head) so deletes cannot be silently undone
   by an offline device; recreating content makes a new entity id.
6. Two devices editing the same entity at the same rev: first write wins on the server; the loser gets `conflict`
   and rebases on top. Last writer by log order wins thereafter. (claude-mem says titles converge by "hub-log order"
   [repo SyncApply.ts]; this keeps the same idea.)

Retention (claude-mem has none, so this is new)
- Compaction: when every non-revoked device has `last_ack_seq` at or above seq N, op bodies superseded by a newer rev of
  the same entity and older than 30 days are dropped, keeping the head op.
- Tombstone heads are kept until min(last_ack_seq) passes them and 90 days have elapsed, then dropped.
- A device whose cursor is older than the oldest kept seq gets `410 cursor_too_old` and does a snapshot pull
  (`GET /sync/v1/snapshot`, heads only).

Security model
- TLS for any remote use. 256-bit random tokens, hashed at rest, constant-time compare, per-token rate limit,
  per-kind scope (`device` can push and pull, `read` can only call recall endpoints, `admin` can mint and revoke).
- Revoking a device token stops pushes at once; the account can rotate the epoch to evict a stolen replica's trust.
- No third-party verify call (claude-mem's hub calls cmem.ai on each new token, cached 900 s [repo auth.ts]). The
  self-hosted hub is its own authority.

Optional end-to-end encryption (`--e2ee`, off by default)
- Client encrypts the op `payload` with AES-256-GCM (WebCrypto, no dependency). Associated data =
  `account_id|entity_id|entity_rev|kind`, so ciphertext cannot be moved to another entity or rev.
- Data key (DK): 32 random bytes made at setup. Stored wrapped twice: by a key derived from the owner's passphrase
  (`node:crypto` scrypt), and by a printed recovery key. New devices join by entering the passphrase or scanning a
  one-time enrollment code that carries the wrapped DK.
- The server sees: entity id, kind, rev, deleted flag, sizes, timestamps, device ids. It cannot see text, titles,
  project names or tags. `op_sha256` is over the ciphertext.
- What you lose: server-side search, server-run observation, remote MCP recall, ChatGPT recall, the web dashboard,
  TeamBrain brief/search. Each device keeps a full local replica, so local search still works. A server that must
  recall can run in an explicit "unlock" mode that holds DK in memory after the owner enters the passphrase.
- Failure modes: lost passphrase and recovery key means the data is unrecoverable (this is the point); changing DK
  means re-encrypting every op and starting a new epoch.

Failure modes (whole A-SYNC)
| Failure | Behavior |
|---|---|
| Server down or 5xx | Rows stay in outbox, backoff, no write blocked |
| 429 | Honor Retry-After as floor |
| Crash between apply and cursor | Same transaction, so both or neither |
| Duplicate or replayed push | Idempotent by (entity_id, rev, hash) |
| Reordered pulls | Apply only if rev is higher than local |
| Poison op | Dead-lettered alone, rest drains |
| Hub restore from old backup | Epoch changes; clients re-pull and re-queue native rows |
| Device removed | Token revoked; compaction no longer waits for it |
| Disk full on hub | 507 on push; clients keep queue |
| Clock skew | Ordering uses seq and rev, never timestamps |

Test plan (A-SYNC)
- Unit: canonical JSON and hash vectors; each of the 6 conflict rules; per-op result codes.
- Property test: 2 to 5 simulated devices, random edits and deletes, random offline periods, random duplication and
  reordering; assert all replicas converge to the same row set.
- Fault injection: kill the client between apply and cursor commit; 429 and 503 with and without Retry-After;
  half-written responses.
- Poison and rebase: force a hash conflict, check only that op is dead-lettered, run `sync rebase`, check drain.
- Compaction: delete on A, device B offline 100 days, check 410 then snapshot recovery.
- Security: bad token, revoked token, wrong account, oversize body, token in logs scan.
- E2EE: wrong key, tampered ciphertext, swapped entity id (AAD must fail), recovery key flow.
- Load: 100k ops push and pull, memory and time budget.

Effort (A-SYNC core, F4 below): server 4 d, client outbox/apply/cursor 5 d, conflict + rebase + dead-letter 2 d,
tests 3 d = 14 d. Splits into F4 (9 d), F5, F6, F7 below to avoid double counting.

---

## F1. CMEM Pro plan, trial, tiers, allowance and billing

**What it does.** A monthly subscription that unlocks hosted observation, cloud sync and the private MCP link.

**How it works.** Account sign-in is GitHub or Google OAuth on cmem.ai [cmem.ai connect]. Paid plans are billed
through Stripe [cmem.ai terms]. The installer starts a device-code pairing with `POST https://cmem.ai/api/installer/oauth/start`
(body has source, device name, install state, and an optional numbers-only usage summary of the last 28 days) and
polls `https://cmem.ai/api/pro/trial/poll`. On `ready` it receives `setup_token`, `user_id`, `hub_url`, and a
`memory_key` (prefix `cm_pro_`) [cmem-pro-headless.md] [repo cmem-pro-costs.ts]. The client treats the plan as
event-driven: a gateway rejection (`subscription_inactive`, `allowance_exhausted`, `key_invalid`) sets a fallback
marker, and trial dates are never used as the switch [repo cmem-gateway.ts]. A lapsed token on the sync hub returns
401 or 403 and the client pauses sync and re-checks hourly [changelog 13.26.1] [repo auth.ts].

**Price and limits** (as of 2026-10-26, [cmem.ai pricing]):
- CMEM Pro $30/month, Heavy $70/month, CMEM Max $100/month with billed overage above its allowance and a "safety
  ceiling". Each tier has "included usage"; automatic upgrade can move a subscription up when the allowance is used.
- 30 day free trial. A card is required; prepaid cards are not eligible. Billing can start at day 30 or when included
  usage is spent, whichever comes first.
- Included allowance amounts, overage rate and ceiling: UNVERIFIED (the page says they are shown at checkout, which needs login).

**User complaints.** The README said "no card required" while the pricing FAQ says a card is required, and privacy
statements conflict with default telemetry [issue 4605]. Users asked what powers the hosted observer [issue 3763].

**Not documented / UNVERIFIED.** Allowance units (tokens? requests? dollars?), overage rate, refund terms, what happens to
data after cancellation (the privacy page covers only account deletion [cmem.ai privacy]), the Stripe plan structure,
and how "usage" is measured. `/pro` returned only nav text to my fetch [cmem.ai pro].

**Aletheia plan.** Not needed as billing. What users actually want from it is cost control. Build:
(a) a local usage ledger for every model call (tokens, cost, model, feature) with a monthly cap that pauses the
observer and says so; (b) on the self-hosted server, the same optional guards the hosted server has: per-key
requests/minute, monthly request cap, monthly token cap that blocks writes only and never reads [hosted-server.md].
Tables: `usage_event(id, token_id, kind, quantity, meta, ts)`, `rate_counter(token_id, window_start, count)`.
Failure mode: a broken counter must fail open (hosted server also fails open [hosted-server.md]).
Test plan: cap reached blocks write, read still works; counter failure does not block; month rollover in UTC.
**Effort: 2 days.** Depends on: F11 for the server surface; local ledger can ship alone.

---

## F2. Hosted observation ("cmem-observer")

**What it does.** Turns captured agent activity into observations on cmem.ai's servers, so the user's own model plan
is not used for memory generation. The site says the effect on total token use depends on the workflow and that
search and other calls still use the user's own plan [cmem.ai pricing] [cmem.ai dreaming].

**How it works.** The worker talks to cmem.ai through its ordinary OpenRouter-style client: provider `openrouter`,
base URL `https://cmem.ai/api/inference/v1`, model `cmem-observer`, API key `cm_pro_...` (a 24 or 32 hex char key
with that prefix) [cmem-pro-headless.md] [repo cmem-gateway.ts]. The client appends `/chat/completions` to a base URL
[repo openrouter-base-url.ts, seen by grep]. A `cm_pro_` key is only ever sent to the gateway, and the gateway only
gets a `cm_pro_` key [repo cmem-gateway.ts]. Terminal gateway codes: `subscription_inactive`, `allowance_exhausted`
(also for paid accounts at their cap), `key_invalid`; on any of these the worker stores a fallback timestamp and
the gateway's message and falls back to the user's Anthropic plan [repo cmem-gateway.ts] [cmem-pro-headless.md].
Model: a maintainer said on 2026-09-12 that the hosted observer runs DeepSeek V4 Flash (pinned to
`deepseek-v4-flash-0731`) through OpenRouter, chosen by the server, subject to change [issue 3763].
The observation prompt, modes and parsing are in the open client, not at the gateway: the gateway looks like a
metered OpenAI-compatible proxy (the `cmem-observer` name routes to the model).

**Price and limits.** Included in CMEM Pro, with the tier allowances in F1 [cmem.ai pricing].

**User complaints.** Cost question: "which model?" [issue 3763]. Observer quality and cost on the user's own plan
(not specific to hosted) in [issue 3848] (title only read; body not read). Quota cooldown loses observations if the
worker restarts [issue 4580] (title only read).

**UNVERIFIED.** Gateway code (closed). Rate limits, timeouts, retention of prompts sent to the gateway, whether
prompts are logged, and the allowance meter.

**Aletheia plan.** Aletheia already has `compress` with providers `claude-cli` and any OpenAI-compatible endpoint
(README). Free self-hosted equivalent = run it as a **server-side observer service**:
- Endpoint `POST /v1/events?generate=true` stores a raw event and enqueues a job; the HTTP path never waits on the model
  (same rule as hosted server [hosted-server.md]).
- Table `observer_job(id, event_ids, status, attempts, lease_owner, lease_until, error, created_at)`. A worker loop
  in the same Bun process takes a job with a lease; a result is written only if the worker still owns the lease
  (this fencing rule is how claude-mem avoids a reclaimed attempt overwriting a newer one [hosted-server.md]).
- Provider chain in config: primary (local Ollama or any OpenAI-compatible URL, including OpenRouter with the user's
  own key), then fallback. Same shape as claude-mem's gateway so any `openai`-style client works. Recommended default
  class: a small, cheap model, as the hosted one is.
- Secrets never leave: auto-redaction and `<private>` removal run before the job is stored (Aletheia already does).
- Failure modes: model down (retry with backoff, then park the job visibly), poison event (dead-letter), worker
  crash (lease expires, job retried), duplicate observation (content hash dedupe).
- Test plan: lease expiry race, crash during model call, fallback switch, redaction before queue, 10k-event backlog.
**Effort: 4 days.** Depends on: F7 only for remote hooks (token auth); local single-user mode has no dependency.

---

## F3. Hosted "setup extraction" for My Work (goals, request groups, rules)

**What it does.** During setup, uploads the user's own prompts to cmem.ai once so the cloud builds the goals, request
groups and preference rules shown in My Work. The code calls it "subsidized extraction" [repo hosted-intent.ts].

**How it works.** `POST {origin}/api/pro/intent`, JSON body `{ownerPrompts, improveProduct, timezoneOffsetMinutes}`,
gzip, at most 2 MiB before and after compression. Headers: `X-Intent-Install-Id`, `X-Intent-Token`, and, when signed
in, `Authorization: Bearer` plus `X-User-Id`. No client retry, because a lost reply may have used the install's one
run. The answer is validated against a schema (goals with 2 to 4 quotes, up to 30 rules, groups, cost, model)
and saved to the local ledger; a pending-save file lets a cut-off save replay [repo hosted-intent.ts].

**Price and limits.** Not stated anywhere I read. Per-install or per-account run limit is implied
("may not be repeatable") but not documented. UNVERIFIED.

**Complaints.** None found.

**UNVERIFIED.** The cloud prompt, model, retention of uploaded prompts, and the "improve product" consent use.

**Aletheia plan.** README says Aletheia's My Work refresh already runs grouping, reviews, goals and story with the
user's own provider. Free equivalent: keep that local, add a "run on my server" option that posts the same job to the
user's Aletheia server so a phone-only or CI user can trigger it. Keep the 2 MiB cap and gzip. No new feature beyond
a job type in `observer_job`. Test: oversized input refused before upload, replay after cut-off.
**Effort: 1 day.** Depends on: F2.

---

## F4. Cloud sync (SyncHub): the replicated log

**What it does.** Copies observations, session summaries and prompts between a user's devices. Work state (to-do lists)
is documented as syncing "when the hub supports it". Also carries three mutation kinds: session title, prompt-to-session
repair, project remap [cloud-sync.md] [repo canonical-content.ts].

**How it works technically.**
- Hub URL is `https://sync.cmem.ai`, written by the installer; source is stated to be `services/sync-api/`
  [cloud-sync.md]. That service is Bun plus Postgres (`postgres` driver) with deploy config for Fly and a
  Neon-style `DATABASE_URL` [repo fly.toml] [repo .env.example]. A second implementation for Cloudflare Workers with a
  Durable Object exists in `workers/sync-hub/` [repo kill-switch.ts]. Which one serves production today is UNVERIFIED:
  the docs name `services/sync-api`, one 2026-09 issue shows a `workers.dev` hub URL [issue 4191], and a maintainer
  said in October that the production hub does not return device names and that part is not in the repo [issue 4841].
- Auth: `Authorization: Bearer <sync token>` and `X-User-Id`. The hub verifies the token against
  `https://cmem.ai/api/pro/sync/verify`, checks the returned user id equals the header, and caches an accepted verdict
  in memory for 900 s [repo auth.ts] [repo fly.toml].
- Push lane: every synced table has `synced_at` (NULL = not yet in the log); a debounced flusher (about 1.5 s after
  the last write, 0.25 s with live updates) drains `WHERE synced_at IS NULL AND origin_device_id IS NULL`. Up to
  500 ops or 4,000,000 bytes per request, 256,000 bytes per body, 30 s request timeout (90 s for content push),
  retries with backoff 30 s to 10 min [cloud-sync.md] [repo CloudSync.ts]. A row is stamped as synced only if the
  response proves an exact match of (id, kind, rev, hash) for every pushed op and a projection checkpoint covers them
  [repo CloudSync.ts].
- The hub appends first, then forwards the ops to the cmem.ai app ("projection", page of 100 ops or 4 MB, 45 s
  timeout) and returns 200 only when the projection checkpoint has caught up [repo projection.ts] [repo projection-protocol.ts]
  [repo index.ts]. The client enforces `head_seq <= projected_seq` on a push response [issue 4198]. This couples every
  push to the closed app being up.
- Pull lane: `GET /v1/sync/changes?since=<seq>&limit=<=500`. Session start pulls first (bounded to 1.5 s). Then poll every
  30 s when active, 5 min idle, off after an hour [cloud-sync.md].
- Wire body: `{body_schema_version, deleted, deleted_at, entity_rev, id, kind, mutation, origin_device_id,
  origin_local_id, payload, payload_schema_version, payload_sha256}` with sorted keys; the observation payload has
  21 allowed fields (agent, concepts, facts, narrative, files, project, text, title, type ...). Unknown fields are
  refused [repo canonical-content.ts].
- Pre-existing local rows are **not uploaded**; only rows written after connect [cloud-sync.md] [issue 3763].

**Price and limits.** Part of CMEM Pro (F1). Limits listed above; 64 devices per account; prompt text over 200 KB
uploads as its first 200 KB plus a note [cloud-sync.md]. The Worker variant's code comment estimates about
$0.03 per user per month in poll mode [repo kill-switch.ts] (author's estimate, not a price).

**User complaints** (all issue links):
- Push permanently rejected because the hub's projection lagged: [issue 4191] (a 33 hour 500/429 outage in one
  reporter's logs, still open) and [issue 4198] (projected_seq stuck at 0 while head grew, still open).
- One conflicting entity rejected a whole batch after two machines' databases were merged by hand; no rebase tool;
  [issue 4086] (closed).
- Stale device-id ops at the head of the outbox blocked sync for 23 hours [issue 3964] (fixed in #3973).
- Retry storm: new writes ignored the backoff and hit 429 [issue 4231] (fixed).
- Outbox grew 1.2 GB when sync was off [issue 4228] (fixed).
- No backfill of old memories [issue 3444] (closed, folded into a plan issue).
- Work state never synced because the production hub did not list it [issue 4842].
- Privacy: sync uploads narratives and full prompt text [cloud-sync.md].

**UNVERIFIED.** Encryption at rest or in transit beyond HTTPS, data residency, retention, backups of the hub,
SLA (the terms say "as is" [cmem.ai terms]), exact projector code, whether `services/sync-api` equals production.

**Aletheia plan.** Build A-SYNC (section A) with these differences from claude-mem: no projection step coupled to the
push (the hub's own SQLite is the store, so there is no second system to lag); per-op results; backfill command;
rebase command; bounded outbox; device names returned by the server.
- Components: sync server, client drain/apply, CLI `aletheia sync init|status|backfill|rebase|devices|revoke`.
- Tables/protocol/security/failures/tests: section A.
- Which Aletheia rows sync: memories, rules, notes, work state, summaries, prompts; per-project opt-out; `<private>`
  and redaction already applied before the row exists.
**Effort: 9 days** (server 3, client 4, CLI and status 1, tests in A 1 extra). Depends on: nothing external.
Needed by: F5, F6, F7, F8, F10, F12, F14.

---

## F5. Live updates (WebSocket speed layer)

**What it does.** Another device's push makes this device pull within about a second instead of waiting for a poll
[cloud-sync.md].

**How it works.** The worker joins a private channel; the server sends a tiny "log moved forward" frame
`{type:'advance', epoch, head_seq}` (or `{type:'op', ...}` with ops in the hub variant). It is advisory: any anomaly
closes it and falls back to HTTP pull; the data never travels only through it. `CLAUDE_MEM_CLOUD_SYNC_WS=false`
turns it off. The Fly hub exposes `GET /v1/sync/ws` and answers a text `ping` with `pong` [repo index.ts]
[repo store.ts fan-out] [repo SyncClient.ts]. If the server does not offer it, the client re-checks hourly.
The Worker variant has a kill switch that sets poll mode when cost rises [repo kill-switch.ts].

**Price.** Included in Pro. **Complaints.** None specific found.
**UNVERIFIED.** The older Supabase Realtime path used by the cmem.ai dashboard (the plan file mentions replacing a
Supabase Realtime SSE stream) [repo 2026-07-22-cmem-launch.md].

**Aletheia plan.** `Bun.serve` has built-in WebSocket support, so no dependency. `GET /sync/v1/ws` with token
auth; server keeps a map of sockets per account; after a commit it sends `{type:'advance', epoch, head}` to every
socket except the pusher's device. Client: on frame, if epoch matches and head > cursor, pull. Ping every 25 s,
close on unknown frame. Cap sockets per account (for example 64, same as devices).
Failure modes: dropped socket (reconnect with backoff, poll covers), epoch change (full re-pull), proxy that blocks
upgrades (poll only). Tests: advance frame triggers pull, malformed frame falls back, no data in frames.
**Effort: 1.5 days.** Depends on: F4.

---

## F6. Tombstones, deletes and mutation convergence

**What it does.** A delete on one device removes the row everywhere; title, prompt-to-session and project remaps
converge on all devices.

**How it works.** `queueDelete` computes rev = max(local sync_rev, hub head rev, pending outbox revs) + 1, builds a
`deleted:true` op with null payload, removes older unsent snapshots of that entity from the outbox, inserts the
tombstone, and deletes the local row, all in one transaction. The tombstone stays in the outbox until the hub's
projection acks it [repo CloudSync.ts]. On the hub it is an ordinary append with `deleted=1` and a head row
[repo store.ts] [repo schema.ts]. Apply side: a row op applies only if its rev is higher than the local row's rev;
mutation ops apply if rev >= target; titles use log order plus "parking" until the session exists
[repo SyncApply.ts]. Status shows `pending.tombstones` [cloud-sync.md].
Hosted-server deletion is separate: `DELETE /v1/memories/:id` and `DELETE /v1/projects/:id/memory`, both audited
[hosted-server.md].

**Price.** Included in Pro. **Complaints.** A local delete did not remove the vector copy in a local index
[issue 4805] (title only read, local Chroma, not sync).

**UNVERIFIED.** How long the hub keeps tombstones (no retention code in the schema file [repo schema.ts]), and whether
the cmem.ai content store removes deleted rows from search.

**Aletheia plan.** Conflict rule 5 and the retention rules in section A. Add a per-device "forget" that writes a tombstone
and also deletes derived rows (FTS, vectors). Add `aletheia sync purge --project X` (writes tombstones for all rows of a
project) and `--all` (writes a tombstone per row then sets a "forget-after" marker; server compaction removes bodies).
For E2EE accounts, "crypto-erase" is deleting the key; say so in the UI.
Failure modes: offline device re-uploads a row someone deleted (blocked by rule 5), tombstone dropped too early (rule:
keep until min ack), delete races an edit at the same rev (conflict, tombstone rebase wins on retry).
Tests: A deletes while B edits offline; B reconnects; row stays deleted. Compaction safe-point test.
**Effort: 3 days.** Depends on: F4.

---

## F7. Device identity, registry, pairing and token lifecycle

**What it does.** Names each machine, limits devices, lets a new machine join, and revokes access.

**How it works.** Settings `CLAUDE_MEM_CLOUD_SYNC_DEVICE_ID` (a UUID the worker mints on first start; "don't edit it")
and `_DEVICE_NAME` (hostname) [cloud-sync.md]. The hub stores `sync_devices(user_id, device_id, name, last_ack_seq,
last_seen)`; the 65th new device gets `409 device_limit_exceeded`; the device id must equal `X-Device-Id` (the hub
refuses ops whose `origin_device_id` differs) [repo store.ts] [repo schema.ts]. Pairing is the installer flow in F1
(device code, browser approval) [cmem-pro-headless.md]. Settings are written to `~/.claude-mem/settings.json` mode 0600.
Token rotation and account-level revoke live in the closed app: the privacy page says the MCP link can be reissued
[cmem.ai privacy].

**Price.** Included in Pro. 64 devices.

**Complaints.** Minting a new device id left hash-locked ops in the outbox and blocked sync [issue 3964].
Users cannot see which machine a synced memory came from, and the production hub does not return device names
[issue 4841].

**UNVERIFIED.** Token lifetime, rotation rules, how the web UI revokes a device.

**Aletheia plan.** `aletheia sync pair` on the server prints a short one-time code (8 chars, 10 minute life, single use)
and the server URL. New device runs `aletheia sync join <url> <code>`; server issues a device token and records the
device. Tables `sync_token`, `sync_device` (section A), plus `pair_code(code_sha256, account_id, expires_at, used_at)`.
Device list shows name, last seen, last ack, pending lag. `revoke` is immediate. Origin device name stored with each row
locally so search and context can show `[laptop]` (the feature users asked for in [issue 4841]). Never rewrite ops
when the device id changes: new id only for new rows, and the outbox keeps its original origin id (this avoids [issue 3964]).
Security: code is brute-force limited (5 tries then burn), TLS required, tokens hashed.
Tests: expired code, reused code, 65th device, revoke while a push is in flight.
**Effort: 3 days.** Depends on: F4.

---

## F8. Private MCP link (remote MCP recall)

**What it does.** Gives any MCP client read access to cloud memory through a URL and credential.

**How it works.** Two surfaces:
1. The open hosted server exposes `/v1/mcp`, a stateless streamable-HTTP MCP server, read-only, authenticated by the
   same bearer key as the REST routes (scope `memories:read`). Tools: `search`, `timeline`, `get_observations`,
   `context`, `recent`. Mutating tools are absent on purpose. Every read writes an `observation.read` row to `audit_log`.
   `POST /v1/keys` (needs write scope) mints a read-only key and returns a ready `claude mcp add --transport http ...`
   command; `GET /v1/connect` returns the command with a placeholder. Keys are stored as SHA-256 hashes
   [hosted-server.md] [repo postgres schema.ts].
2. The cmem.ai product link `https://cmem.ai/api/mcp` is gated by OAuth: the protected-resource metadata lists scopes
   `read:memory` and `spend:inference`, and an unauthenticated call returns 401 `invalid_token`
   [cmem.ai .well-known] [cmem.ai api/mcp]. The privacy page calls the link "a personal, secret URL" that grants read
   access to synced memory and can be reissued [cmem.ai privacy]. Tool names in the ChatGPT guide are
   `memory_search`, `timeline`, `get_observations`, `get_summaries` (and optional `dumb_search`) [cmem.ai chatgpt-install.md].

**Price.** Included in Pro [cmem.ai pricing]. **Complaints.** The first-key bootstrap in the hosted server needs a web
dashboard that did not exist yet, a stated "rough edge" [hosted-server.md].
**UNVERIFIED.** Whether the product link is a URL-embedded secret or a header token for clients that are not OAuth,
rate limits, how reads of a link are logged for the user.

**Aletheia plan.** Aletheia's MCP server is stdio only (README). Add an HTTP transport at `POST /mcp` on the sync/hub
server:
- Auth: `Authorization: Bearer <read token>` (not a secret in the URL, since URLs leak into logs and history; claude-mem's
  privacy page itself says to treat the link like a password).
- Tools: same names Aletheia has plus `recent`; no write tools on a `read` token. A separate `write` scope can enable
  `save_memory` if the owner wants.
- Table `mcp_read_log(id, token_id, tool, args_hash, ts)` (the audit rows claude-mem keeps).
- Per-token rate limit and monthly cap (F1). Project scope per token (`project_id` null = all).
- Stateless: one MCP server per request, so no sticky sessions.
- Failure modes: token revoked mid-call (reject next call), huge `get_observations` (cap ids and size, mark shortening
  as hosted server does), E2EE accounts (needs unlock mode, see section A).
- Tests: official MCP SDK client against the HTTP transport; read token cannot write; revoked token; audit row per call.
**Effort: 3 days.** Depends on: F4 (data), F7 (tokens), F11 (rate/audit).

---

## F9. ChatGPT and Claude.ai connector (OAuth custom MCP)

**What it does.** Lets ChatGPT (web, Developer mode) search and read synced memory, read-only. It does not capture
ChatGPT chats [cmem.ai chatgpt].

**How it works.** In ChatGPT the user adds a custom connection named CMEM with MCP URL `https://cmem.ai/api/mcp` and
authentication OAuth, leaves client credentials empty, signs in to cmem.ai and approves access; access can be revoked at
`https://cmem.ai/connect` under Connected apps [cmem.ai chatgpt-install.md]. Requires Pro or trial and Developer mode.
OAuth metadata names scopes `read:memory` and `spend:inference` [cmem.ai .well-known]. My Work's "Connect Claude.ai /
ChatGPT" buttons just open this cloud setup [usage/my-work.md]. Installation from ChatGPT's directory is "planned"
[cmem.ai chatgpt].

**Price.** Included in Pro; needs a ChatGPT plan with custom connectors (their plan limits apply).
**Complaints.** None found.
**UNVERIFIED.** The authorization server's endpoints, whether it uses dynamic client registration, token lifetime, and
what `spend:inference` allows.

**Aletheia plan.** A small OAuth 2.1 authorization server on the same process (the "empty client credentials" setup
in the cmem guide implies a public client or dynamic registration; exact ChatGPT requirements are UNVERIFIED, so
build to the MCP authorization spec and test against ChatGPT):
- `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` (metadata).
- `/oauth/register` (dynamic client registration), `/oauth/authorize` (owner logs in with the server password or a passkey,
  sees a consent page showing scope and client name), `/oauth/token` (authorization code with PKCE, refresh tokens).
- Scopes: `read:memory` only for ChatGPT.
- Tables: `oauth_client`, `oauth_code(code_sha256, client_id, challenge, expires_at, used_at)`, `oauth_token` (reuse `sync_token`
  with kind `oauth`), `oauth_consent`.
- Needs a public HTTPS URL: document Cloudflare Tunnel or Tailscale Funnel. Without it ChatGPT cannot reach the server.
- Security: PKCE required, exact redirect URI match, codes single use and 60 s, tokens hashed, consent screen, revoke list in
  the UI, rate limits on `/oauth/token`.
- Failure modes: expired refresh (client re-auth), redirect mismatch, tunnel down (connector shows error).
- Tests: scripted PKCE flow, replayed code, wrong verifier, revoked client, manual test in ChatGPT Developer mode (cannot be
  automated; mark NOT TESTED until done).
**Effort: 5 days.** Depends on: F8, F10 (owner login).

---

## F10. Cloud dashboard (cmem.ai/dashboard) and Connect page

**What it does.** A web view of synced memories, devices and connections. The ChatGPT guide tells users to confirm "a new
memory appears in the dashboard" [cmem.ai chatgpt-install.md]; the plan file says the dashboard, MCP, timeline, devices and
stats all read from the cloud content store [repo 2026-07-22-cmem-launch.md].

**How it works.** Closed. Sign-in is GitHub or Google OAuth [cmem.ai dashboard (redirect to login)]. UNVERIFIED: pages,
features, whether it shows device names, search, delete.

**Price.** Included in Pro (inferred; no page says so directly).
**Aletheia plan.** The Memory Hub UI (`/hub`) already exists. Serve it remotely:
- Owner login: server password (scrypt hash) plus optional TOTP; session cookie `HttpOnly; Secure; SameSite=Strict`,
  CSRF token on writes; lockout after 5 failures.
- Tables `owner(id, password_hash, totp_secret_enc)`, `session(id_sha256, owner_id, expires_at)`.
- Devices and tokens page (F7), connections page (F9), sync status page (lag, dead-letter count, last error).
- Failure modes: lost password (CLI reset on the host), cookie theft (short life, rotate on login).
- Tests: CSRF, session fixation, lockout, all `/hub` writes require a session when `--remote` is on.
**Effort: 2 days.** Depends on: F4, F7.

---

## F11. Hosted server (Postgres + queue): API keys, scopes, quotas, metering, audit, deletion, vector search

**What it does.** A multi-tenant HTTP service (`/v1`) with team and project scoping, plus a BullMQ generation worker
[hosted-server.md]. This is open source (Apache-2.0) but the docs call it a beta with no polished dashboard or
self-serve signup.

**How it works technically.**
- Storage: Postgres tables `teams`, `projects`, `team_members(role)`, `api_keys(key_hash UNIQUE, team_id, project_id, actor_id,
  scopes JSONB, revoked_at, expires_at)`, `audit_log(actor_id, api_key_id, action, resource_type, resource_id, details)`,
  `server_sessions`, `agent_events`, `observation_generation_jobs`, `observations(content, tsvector)`, `usage_events`,
  `rate_limit_counters`, `observation_embeddings(vector)` [repo postgres schema.ts].
- Auth: `CLAUDE_MEM_AUTH_MODE=api-key`, bearer key, scopes `memories:read` and `memories:write`; keys SHA-256 hashed; the raw
  `cm_...` shown once [hosted-server.md] [repo postgres-auth.ts].
- Guards (opt-in env vars, all fail open): `CLAUDE_MEM_RATE_LIMIT_PER_MIN` (per key, 429 plus Retry-After),
  `CLAUDE_MEM_MONTHLY_REQUEST_CAP` (per team, 402), `CLAUDE_MEM_MONTHLY_TOKEN_CAP` (writes only), `CLAUDE_MEM_USAGE_METERING=1`;
  `GET /v1/usage` [hosted-server.md].
- Deletion: `DELETE /v1/memories/:id`, `DELETE /v1/projects/:projectId/memory` (one transaction; keeps the project shell); both audited.
- Generation: `POST /v1/events?generate=&wait=`; BullMQ worker with `claude`, `gemini`, `openrouter`, or `custom` providers; lease
  ownership checks; `CLAUDE_MEM_SERVER_GENERATION_CONCURRENCY` (max 64) per lane.
- Search: Postgres full-text (bm25 with pg_textsearch, else ts_rank) fused with pgvector; four embedding models; about 28 KB per
  observation of vector storage [hosted-server.md].
- Docker Compose image is 650 MB (Postgres 17 + pgvector + pg_textsearch) [hosted-server.md].
- Endpoint list (about 25 routes) is in [hosted-server.md].

**Price.** Self-host free (open code). The managed version is CMEM Pro. No separate price.

**User complaints.** `npx claude-mem install --runtime server` help text reads as self-hosted but the flow needed cmem.ai
OAuth and the compose file was missing [issue 4131]. First-key bootstrap needs a dashboard [hosted-server.md].

**UNVERIFIED.** Whether the cmem.ai production service is this server; the docs and issues suggest the product runs on the sync
hub plus the closed app instead. Production scale numbers.

**Aletheia plan.** Do not copy Postgres and Redis; Aletheia is zero-dependency. A single-process Bun server on SQLite covers the
single-user and small-team case (SQLite WAL handles thousands of writes per second; claim not measured here, test it).
- Reuse `/v1/*` routes Aletheia already has. Add token scopes `memories:read|write`, project scope per token, and the three guards.
- Tables: `sync_token` (A), `usage_event`, `rate_counter`, `audit_log` (Aletheia's Activity table extended with token id, action,
  resource, details).
- Provide an optional "Postgres adapter" only if a real user needs it (rule: an abstraction needs a second concrete use today).
- Vector search: Aletheia already has retrieval and reranking per README; keep in SQLite.
- Failure modes: guard store error fails open; quota exceeded returns 402 for writes only; delete is one transaction.
- Tests: scopes, project isolation (token for project A cannot read B), rate limit, caps, delete cascade, audit row per action.
**Effort: 4 days.** Depends on: F4 (tokens), F2 (generation).

---

## F12. TeamBrain (shared work board, brief and team search)

**What it does.** A shared workspace beside My Work: shared task lists with member and project attribution, linked findings,
a "brief" injected at session start, and search over the team's shared observations. Each member chooses what to share and
which projects; joining shares nothing by itself; owners handle billing and invites [usage/teambrain.md] [cmem.ai teambrain].

**How it works.** Client calls to the cmem.ai TeamBrain API, signed with the member's sync token and user id as
`Authorization: Bearer` and `X-User-Id`; redirects are not followed [repo teambrain.ts]:
- `GET /api/teambrain/brief?project=` returns `{team, text}` (text capped and relayed as information, not instructions).
- `POST /api/teambrain/search` `{query, limit?}` returns `{results, text}`.
- `GET /api/teambrain/cli/status` lists the account's teams with `role`, `broadcasting`, `projects`, `seats_used`, `seat_limit`.
- `GET /api/teambrain/cli/board?team_id=` returns `lists` (user, project, name, state, tasks) and `findings`.
- `POST /api/teambrain/cli/membership` (start, change or stop sharing projects), `POST /api/teambrain/cli/leave`
  (TeamBrain removes what that member shared).
Join: `npx claude-mem teambrain join '<invite-link>'`: browser sign-in, device approval, choose projects; an empty project list
means none, not all [usage/teambrain.md] [repo teambrain command]. One install can only sync as one account.
The local panel is read-only (no assignment or replies).

**Price.** No public price. A pilot cohort of 8 teams (2 enrolled when fetched); seats, scope and price are agreed on a
fit call; applying does not start a subscription [cmem.ai pricing] [cmem.ai design-partners]. The design-partner page says shared
team memory and access controls are "in development", so parts may not be shipped [cmem.ai design-partners].
**Complaints.** None found in issues.
**UNVERIFIED.** All server behavior: how the brief is built, how findings link, consent filtering, seat enforcement, price,
what "removes what that member shared" deletes, retention.

**Aletheia plan (self-hosted team mode).**
- Server tables: `team(id, name)`, `member(team_id, user_id, role)`, `invite(token_sha256, team_id, role, expires_at, max_uses,
  used)`, `share(team_id, user_id, project, since)`, `shared_memory(team_id, project, memory_id, owner_id, origin_op)`,
  `work_list(team_id, owner_id, project, name, state, updated_at)`, `work_task(...)`.
- Sharing is **opt-in per member per project** and is a copy by reference of rows the member already syncs; `leave` writes
  tombstones for that member's shared rows and removes shares (rule: consent filter at read time and at write time).
- Endpoints mirror the shapes above (so the same client UX works): `brief`, `search`, `board`, `membership`, `leave`.
- Brief builder: top N shared observations touching the project in the last 14 days, plus open shared tasks, capped at a
  character budget, labeled as information.
- Review queue (matrix F-T06): an optional `proposed` state where a member's memory becomes visible only after an owner
  approves it.
- Security: per-team row isolation in every query (team id is part of every key), tokens are per user, invites are single-use
  and expire, no cross-team search.
- E2EE note: team brief/search need server-readable text; use per-team keys, or run team mode non-E2EE (document the choice).
- Failure modes: member removed while a pull is running (revoke then re-check on next page), a member shares a project then
  changes their mind (tombstones), invite reuse.
- Tests: tenant isolation fuzz (random cross-team reads must fail), consent filter, leave removes shared rows, invite expiry.
**Effort: 10 days.** Depends on: F4, F6, F7, F11.

---

## F13. Enterprise features (reserved; not shipped publicly)

The repo lists these as reserved commercial/private: admin dashboard, SSO/SAML/SCIM, enterprise RBAC, enterprise audit log UI,
DLP/policy engine, premium knowledge agents, managed evals, customer deployment tooling, enterprise observability, support/SLA
workflows, private customer connectors [repo ip-boundary.md]. The license page says Server v0.1 does not ship them [repo license.md].
The server-architecture note describes the open parts that a compliance audit would use: an identity triad
(`api_key_id`, `actor_id`, `request_id`) on every event, scope checks that refuse cross-tenant work, and an audit chain
[repo server-architecture-and-team-vision.md].

**Price.** None published. UNVERIFIED that any of these exist as a product. I found no docs page, no pricing line and no issue about
SSO, SAML, SCIM, RBAC UI or DLP on cmem.ai. Treat them as a roadmap list.
**How they work.** UNVERIFIED (not documented).
**Complaints.** None.

**Aletheia plan, by item** (build only when a user asks; each is independent):
| Item | Free self-hosted design | Effort days |
|---|---|---|
| SSO (OIDC) | Generic OIDC login: discovery document, authorization code + PKCE, verify ID token signature with WebCrypto, map `email` claim to `member`. Table `identity_provider(issuer, client_id, secret_enc, allowed_domains)`. | 4 |
| SAML | Skip unless asked; XML signature checks need care and are easy to get wrong. Prefer OIDC; recommend an identity proxy (Authelia, Keycloak) in front. | 0 (documented) |
| SCIM | `/scim/v2/Users` and `/Groups` create, patch, deactivate; deactivation revokes tokens and sessions. Table `scim_token`. | 4 |
| RBAC | Roles `owner`, `admin`, `member`, `viewer` as a permission matrix in code; `role` already exists in `team_members` in the open server schema [repo postgres schema.ts]. Enforce in one middleware. | 3 |
| Audit log UI | Aletheia's Activity view plus filters (actor, action, resource, date), CSV export, append-only (no delete route), optional hash chain: `entry_hash = sha256(prev_hash + row)`. | 2 |
| DLP / policy | Policy rules table `(id, match regex or label, action 'redact'|'block'|'flag', scope)`; run at ingest next to existing redaction; block returns 422 and is audited; test corpus of secrets and PII. | 4 |
| Premium knowledge agents | Local knowledge agents are free upstream [usage/knowledge-agents.md]; Aletheia: build corpus tool (matrix F-X12, T-046). | counted elsewhere |
| Managed evals | Aletheia's benchmark plan docs/18 already exists; no hosted piece. | 0 |
Failure modes common to all: a policy rule that over-redacts (dry-run mode first), IdP outage (keep an owner break-glass password),
SCIM deactivate not revoking sessions. Tests: each as a conformance script; break-glass login; chain verification detects an edit.
**Total effort for items built: 17 days** (4+4+3+2+4). Depends on: F11, F10, F12.

---

## F14. Account deletion, data erasure and export

**What it does.** "Delete account & data" erases the cloud account and the cloud data for it "across our systems"; it does not
touch local databases. Billing records are kept for tax and legal reasons; analytics deletion is queued and finishes within days
[cmem.ai privacy]. The hosted server has per-memory and per-project purge with audit rows [hosted-server.md]. Cloud sync is not a
backup: local snapshots are a separate free feature [usage/backups.md]. The privacy page says no memory content is used to train
models and no data is sold [cmem.ai privacy].

**Price.** Free. **Complaints.** Privacy copy conflicts with default telemetry [issue 4605].
**UNVERIFIED.** How deletion reaches Turbopuffer, Supabase and Stripe, backup retention, deletion time for content.

**Aletheia plan.** `aletheia sync purge --project|--all` and "delete account" on the server: write tombstones, then run
compaction with zero grace for that account, `VACUUM`, delete audit rows after a configurable period, and print a receipt (counts
per table, like hosted-server's per-table `counts`). Export first: the existing bundle export. With E2EE, crypto-erase by deleting
wrapped keys. Failure modes: replicas on offline devices still hold data (say so; revoke tokens and tell the user to wipe them).
Tests: counts match, no rows remain, `VACUUM` ran, tokens revoked.
**Effort: 2 days.** Depends on: F4, F6.

---

## F15. Security activity feed and alerts (marketing page)

**What it does.** The security page describes a shared activity log across connected agents and "alerts" that attach memory history
(task, instruction, what happened) to the user's own security checks [cmem.ai security].

**How it works.** Not described. The page says CMEM keeps history and "your connected services check for problems and deliver
alerts". UNVERIFIED that a product feature exists; no docs page, price or repo code found for it.

**Price.** Not stated.
**Aletheia plan.** Activity log is already in the Hub. Add `alert_rule(id, match, channel)` and a webhook (ntfy, Slack, email via SMTP)
fired from the audit stream, with the memory context attached (last instruction, last N events). Dry-run and test button. Failure modes:
webhook down (queue and retry, show in UI), alert storm (rate limit per rule).
Tests: rule fires once, retry on 5xx, rate limit.
**Effort: 3 days.** Depends on: F11 (audit).

---

## Summary table

Effort is my estimate in developer days. "Plan" refers to the section above.

| Feature | Paid where | Price (dated 2026-10-26) | Aletheia plan | Effort days | Depends on |
|---|---|---|---|---|---|
| F1 Pro plan, tiers, allowance | cmem.ai (Stripe) | $30 Pro, $70 Heavy, $100 Max + overage; 30 day trial; allowance amounts UNVERIFIED | Local usage ledger + caps, no billing | 2 | F11 (server part) |
| F2 Hosted observation | CMEM Pro gateway `/api/inference/v1` | in Pro tiers | Server-side observer queue, any OpenAI-compatible model | 4 | F7 (remote only) |
| F3 Hosted setup extraction | CMEM Pro `/api/pro/intent` | not stated | Run My Work refresh on own server | 1 | F2 |
| F4 Cloud sync core | CMEM Pro, sync.cmem.ai | in Pro | A-SYNC: SQLite hub, per-op results, rebase, backfill | 9 | none |
| F5 Live updates | CMEM Pro | in Pro | Bun WebSocket advisory frames | 1.5 | F4 |
| F6 Tombstones and deletes | CMEM Pro | in Pro | Tombstones + compaction + purge | 3 | F4 |
| F7 Devices, pairing, tokens | CMEM Pro (64 device cap) | in Pro | Pair code, device tokens, revoke, device names | 3 | F4 |
| F8 Private MCP link | CMEM Pro | in Pro | HTTP MCP, bearer read token, audit | 3 | F4, F7, F11 |
| F9 ChatGPT / Claude.ai connector | CMEM Pro (+ ChatGPT plan) | in Pro | OAuth 2.1 server with PKCE, consent | 5 | F8, F10 |
| F10 Cloud dashboard | CMEM Pro | in Pro (inferred) | Remote login for `/hub`, sessions, TOTP | 2 | F4, F7 |
| F11 Hosted server (Postgres, keys, quotas, audit) | Open source; managed = Pro | self-host free | Scoped tokens, guards, audit on SQLite | 4 | F4, F2 |
| F12 TeamBrain | cmem.ai pilot | no public price | Team mode: shares, board, brief, search, review | 10 | F4, F6, F7, F11 |
| F13 Enterprise (SSO, SCIM, RBAC, audit UI, DLP) | Reserved, not published | none | OIDC, SCIM, RBAC, audit chain, DLP rules | 17 | F10, F11, F12 |
| F14 Deletion and export | Free upstream | free | Purge, compaction, receipt, crypto-erase | 2 | F4, F6 |
| F15 Security feed and alerts | marketing page only | not stated | Alert rules + webhooks | 3 | F11 |
| **Total** | | | | **69.5** | |

Suggested order: F4, F7, F6, F11 (a working private sync, 19 days), then F8, F5, F10, F14, then F2/F3, then F9, F12, F15, and F13
items on request.

## UNVERIFIED list (all of it)

1. Included allowance amounts, overage rate and safety ceiling for Pro, Heavy, Max (shown only at checkout, login needed).
2. Content of `cmem.ai/pro`, `/connect`, `/dashboard`, `/teambrain/start` (empty to fetch or behind login).
3. Gateway internals: rate limits, prompt retention or logging, how usage is metered; the model is known only from one maintainer
   comment of 2026-09-12 [issue 3763] and may change.
4. Which hub implementation serves production (`services/sync-api` on Fly, `workers/sync-hub` on Cloudflare, or a Supabase forward
   mode named in `fly.toml`).
5. The cmem.ai projector, Turbopuffer content store, Supabase control plane and dashboard code (not in repo; only a 2026-07-22 plan
   mentions them).
6. Encryption at rest, data residency, backups, retention and SLA for cloud data (not documented; terms say "as is").
7. Tombstone retention on the hub (no retention or compaction in the schema file).
8. TeamBrain server behavior, seat price, consent rules, and what "leave" removes. Design-partner page says shared memory and access
   controls are in development.
9. Existence, behavior and price of SSO/SAML/SCIM, RBAC, audit log UI, DLP/policy engine, admin dashboard (only a reserved list).
10. Mechanism of the security-page alerts.
11. OAuth authorization server details for the ChatGPT connector (endpoints, dynamic registration, token lifetime, `spend:inference`).
12. Whether the product MCP link is a URL-embedded secret or a header token for non-OAuth clients.
13. Issue bodies I did not read, only titles: [issue 3848], [issue 4580], [issue 4805].
14. I did not grep every client file for crypto; "payload not encrypted" is from the hub and canonical-content files and the docs.
15. Reaction counts: `gh search` sorted by reactions but I did not read the counts; issues were chosen by that order and by topic.
16. The SQLite throughput claim in F11 is not measured.
