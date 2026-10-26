# 27 — Free versions of every paid feature

Date of research: 2026-10-26. Status: plan. Nothing in this file is built yet unless a task says `validated`.

Status update, 2026-10-26: T-119 (provider presets and fallback), T-120 (output language), T-121 (transcript
back-fill), T-122 (no project-folder writes) and T-123 (reversible dismiss) are `validated`; so are the one-UI tasks
T-134 to T-139. The rest of the table is still planned. See [tasks/TASKS.md](tasks/TASKS.md).

Status update, 2026-10-26 (sync): T-102 (replicated log with per-operation results), T-103 (tombstones, compaction
and purge), T-104 (device pairing, tokens and revoke) and T-108 (scoped tokens, quotas and audit log) are
`validated`. The design and behaviour are recorded in [29-sync.md](29-sync.md).

Status update, 2026-10-26 (E2EE): T-117 is `validated`. The optional end-to-end encryption mode for sync is
built and the scheme, key hierarchy, rotation, recovery and the exact list of what the server can still see are
in [29-sync.md](29-sync.md) §29.6. E2EE is off by default and per account; unencrypted accounts keep their old
behaviour, so "end-to-end encrypted" is only claimed for accounts that enable it.

Status update, 2026-10-26 (remote MCP): T-067 (MCP Streamable HTTP transport) and T-107 (the private remote MCP
endpoint) are `validated`. F8 is built: bearer tokens with an `mcp`/`read` scope get the read tools only, project
scope and a per-token rate limit apply, every call is audited, and `aletheia mcp-link create` prints the client
config. See [30-remote-mcp.md](30-remote-mcp.md).

Status update, 2026-10-26 (Hub login): T-110 is `validated`. F10 is built with one deviation from the A1 design:
login exchanges the sync account's admin token for the session cookie (no separate scrypt password, no TOTP yet).
Sessions are HttpOnly, SameSite=Strict, Secure-when-HTTPS, expire, and state-changing requests need the CSRF
header; failed logins lock out with back-off. Loopback-only servers keep today's behaviour.

Status update, 2026-10-26 (team mode): T-112 is `validated`. F12 is built as a self-hosted layer on Aletheia Sync:
named projects, members that are device tokens with `owner`/`editor`/`viewer` roles, opt-in per-project shares,
shared memory, a board of pins and decisions, a rule-based brief with source ids and ACL-scoped shared search.
Every ACL check is in the store, and a viewer, a cross-project read, a revoked member and a revoked token are each
tested. Not built: SSO, SCIM, compliance claims and server-readable team memory under E2EE. See
[31-team.md](31-team.md) and `test/team-mode.test.mjs`.

Status update, 2026-10-26 (erasure): T-113 is `validated`. F14 is built for the local store, the device
replica/outbox and the sync hub: a report first, `--apply` exports a bundle, deletes the rows (with FTS, vectors,
keys, links, dismissals and review rows), asks the hub for a T-103 purge and writes an HMAC-SHA256 receipt that
lists counts and ids but never content. `aletheia erase verify` checks a receipt. An offline device's copy and
a compromised server are not covered; see [03-http-api.md](03-http-api.md#35-erasure-t-113).

## Decision

The owner decided on 2026-10-26 that every feature claude-mem, and any rival, sells in a paid tier is built into Aletheia
for free, self-hostable, with no account. Earlier documents marked cloud sync, the hosted server, TeamBrain and enterprise
controls `out-of-scope`. Those rows are corrected in [20](20-claude-mem-feature-matrix.md) and the work is phase **P6** in
[tasks/TASKS.md](tasks/TASKS.md).

Two limits on this promise, stated now so they are not found later:

1. **Certificates and support contracts cannot be shipped.** SOC 2, HIPAA BAAs and SLAs are things a company buys and
   signs. Aletheia offers the technical parts (local-only data, encryption, deletion, export, audit) and says so plainly.
2. **A feature is "planned" until a test passes.** The README and site must not say "supported" for any P6 item before its
   task is `validated`.

## Raw research (read these for the evidence)

| File | What it holds | Sources |
|---|---|---|
| [research/A1-claude-mem-paid.md](research/A1-claude-mem-paid.md) | 15 paid or hosted claude-mem features, how each works, free design for each | 76 dated URLs |
| [research/A2-vendor-paid-tiers.md](research/A2-vendor-paid-tiers.md) | paid tiers of 20+ other memory products, prices, limits, free-vs-paid gaps | 60 dated URLs |
| [research/A3-benchmarks.md](research/A3-benchmarks.md), [A3-new-competitors.md](research/A3-new-competitors.md) | competitors and published benchmarks | 77 dated URLs |
| [research/A4-claude-mem-prs.md](research/A4-claude-mem-prs.md) | what users ask for in claude-mem's pull requests | PR links |

## What claude-mem sells (verified 2026-10-26)

Source: https://cmem.ai/pricing, fetched 2026-10-26, and A1.

| Plan | Price | Notes |
|---|---|---|
| CMEM Pro | $30/month after a 30-day trial that needs a card | hosted observation, cloud sync, private MCP link |
| Heavy | $70/month | allowance amounts are shown only at checkout: UNVERIFIED |
| Max | $100/month plus billed overage | same |
| TeamBrain pilot | no public price | pilot capped at 8 teams per A1; server behaviour UNVERIFIED |

The local engine is open source and free. The paid part is the hosted service around it.

## What is open code and what is not (A1)

- **Open in claude-mem's repo:** the sync hub (`services/sync-api`, Bun plus Postgres), a Cloudflare Worker variant
  (`workers/sync-hub`), the hosted Postgres server, and the TeamBrain client. We can read their protocol directly.
- **Not open:** the cmem.ai web app (billing, login, dashboard, inference gateway, OAuth MCP server, TeamBrain server).
  Their behaviour is only known from docs and issues. Whatever A1 marked UNVERIFIED stays unverified.
- **Hosted observation is a normal LLM call.** The client points at `https://cmem.ai/api/inference/v1` with model
  `cmem-observer`. A maintainer said in issue 3763 (2026-09-12) the model is DeepSeek V4 Flash through OpenRouter. We do
  the same job with a local model or any OpenAI-compatible endpoint.

## Where claude-mem's paid tier is weak (our opening)

All from A1 with issue links there. These are the places to be better, each tied to a task.

| Weakness found | Evidence | Our answer | Task |
|---|---|---|---|
| One bad operation rejects a whole sync batch | read from `store.ts`, A1 F4 | per-operation accept or reject | T-102 |
| Payloads stored in clear text on the hub | no encryption found in hub files; not every client file was grepped | optional end-to-end encryption | T-117 |
| No retention or compaction; permanent stalls | schema says out of scope; issues 4086, 3964, 4191, 4198 | tombstones with compaction | T-103 |
| Setup scan posts the user's prompts to `POST /api/pro/intent` | A1 F3 | run goal extraction locally | T-116 |
| SSO, RBAC, DLP listed only as "reserved" | the cited docs page never mentions them | build last, after sync and teams | T-115 |

## The plan: one task per feature

Shared design first: **Aletheia Sync** (A1 section A). A replicated, append-only operation log between devices, with a
SQLite hub or a shared folder as transport, per-operation results, tombstones, device tokens. Most features sit on it.

| Paid feature | Where it is sold | Price (dated 2026-10-26) | Aletheia plan | Days (A1 estimate, not sourced) | Task |
|---|---|---|---|---|---|
| Plan, trial, allowance | cmem.ai | $30 / $70 / $100 + overage | local usage ledger and optional caps, no billing | 2 | T-109 |
| Hosted observation | CMEM Pro gateway | in Pro | server-side extraction worker, any model | 4 | T-106 |
| Hosted setup extraction | `/api/pro/intent` | not stated | My Work refresh on the user's own server | 1 | T-116 |
| Cloud sync | sync.cmem.ai | in Pro | Aletheia Sync | 9 | T-102 |
| Live updates | CMEM Pro | in Pro | WebSocket advisory frames | 1.5 | T-105 |
| Tombstones and deletes | CMEM Pro | in Pro | tombstones, compaction, purge | 3 | T-103 |
| Device identity and pairing | CMEM Pro, 64-device cap | in Pro | pair code, device tokens, revoke | 3 | T-104 |
| Private remote MCP | CMEM Pro | in Pro | Streamable HTTP MCP, bearer token, audit | 3 | T-107 |
| ChatGPT and Claude.ai connector | Pro plus the chat plan | in Pro | OAuth 2.1 with PKCE | 5 | T-111 |
| Cloud dashboard | CMEM Pro | in Pro (inferred) | remote login for the Hub | 2 | T-110 |
| Hosted server, keys, quotas, audit | open code; managed = Pro | self-host free | scoped tokens, quotas, audit on SQLite | 4 | T-108 |
| TeamBrain | cmem.ai pilot | no public price | team mode: shares, board, brief, search | 10 | T-112 |
| Enterprise (SSO, SCIM, RBAC, DLP) | reserved, not published | none | OIDC, SCIM, roles, redaction rules | 17 | T-115 |
| Deletion, export, erasure | free upstream | free | purge, export, receipt, crypto-erase | 2 | T-113 |
| Security feed and alerts | marketing page | not stated | alert rules and webhooks | 3 | T-114 |
| (ours) end-to-end encryption | none of them | n/a | encrypt before sync | 3 | T-117 |

Total about 70 developer days by A1's own estimate. Treat that as a rough size, not a promise.

## Paid features of other vendors, by category (A2)

These are the categories sold across mem0, Supermemory, Zep, Letta, Cognee, Mastra, Memori, Hindsight, Basic Memory and
others. Prices per vendor are in A2 with the page each came from.

| Category | Sold by (examples) | Free version here | Task or status |
|---|---|---|---|
| Hosted service, backups | most vendors | one local binary plus a documented backup command | T-113 |
| Cross-machine sync | claude-mem, Basic Memory, ByteRover | Aletheia Sync | T-102 |
| Team workspaces, roles | mem0, Zep, Letta, Memori | team mode | T-112, T-091 |
| Access control per scope | Supermemory, Memori, Letta | scoped tokens | T-108 |
| SSO, SAML, SCIM | mem0, Zep, Cognee, others | OIDC then SCIM | T-115 |
| Audit logs | mem0, Zep, Memori, Mastra | append-only audit table | T-108 |
| Dashboards, analytics | mem0, Zep, Hindsight | Hub pages | T-077 |
| Graph and entity memory | mem0 Pro, Zep, Cognee, Hindsight | entity and edge tables in SQLite | T-021, T-097 |
| Temporal reasoning, decay, consolidation | mem0, Zep, Hindsight | already in the pipeline | T-024, T-031 |
| Managed extraction | Supermemory, Zep, Cognee | bring-your-own-model extraction | T-106 |
| Connectors (Drive, Notion, Slack) | Supermemory, Cognee | local importers | not planned yet |
| Webhooks, batch ops | mem0, Zep | local API | T-114 |
| Compliance certificates | Supermemory, Zep, mem0 | cannot ship; technical controls only | see limits above |
| SLA and support | nearly all | cannot ship; publish an issue policy | n/a |
| Prompt-injection defence for memory | Hindsight Enterprise | quarantine and untrusted wrapper | T-011 |
| Team rules pushed to users | Cursor, Windsurf, Copilot | the rules hub (our core) | built |

## Build order

1. Capture and the pipeline finish first (current branch work). Sync needs schema v3 and the queue.
2. **T-102** sync core, then **T-103** tombstones and **T-104** devices. These three unlock everything else.
3. **T-106** server-side extraction worker and **T-109** usage caps (cheap, high value, removes the "uses my agent
   subscription" problem).
4. **T-107** remote MCP, **T-108** tokens and audit, **T-110** hub login, then **T-111** connectors.
5. **T-112** team mode, then **T-113**, **T-114**, **T-117**.
6. **T-115** enterprise last. The source says these may not exist as products.

## Unverified (full list in A1, A2 and tasks/unverified.md)

Allowance amounts per tier; which hub serves production; encryption at rest, retention and SLA; every TeamBrain server
behaviour; whether SSO, SCIM, RBAC or DLP exist as products; ChatGPT and Gemini plan prices; Memvid's live price (docs and a
search snippet disagree); Cursor's real pricing (the page fetched looked Grok-branded). Do not quote these.
