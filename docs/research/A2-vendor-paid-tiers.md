# A2 — What paid tiers sell beyond the free open-source part

Date: 2026-10-26. Every price below was read from a URL in `A2-sources.tsv` on this date. Prices change; re-check before quoting.
Quotes are kept short. "UNVERIFIED" means the page could not be read, with the reason.

## Summary table

| Product | Plan | Price (2026-10-26) | Paid-only features | OSS gap | Source |
|---|---|---|---|---|---|
| mem0 | Hobby | Free; 10k add, 1k retrieval/mo, 1 project | none | OSS has no dashboard, orgs/projects, webhooks | mem0.ai/pricing |
| mem0 | Starter | $19/mo; 50k add, 5k retrieval | higher limits | same | mem0.ai/pricing |
| mem0 | Pro | $249/mo; 500k add, 50k retrieval | Graph memory, Dream consolidation, advanced analytics, multiproject, private Slack | OSS dropped queryable graph in v3; no decay, no temporal ranking, no Dream | mem0.ai/pricing; docs.mem0.ai/platform/platform-vs-oss |
| mem0 | Enterprise | custom | SLA, on-prem, audit logs, SSO, custom integrations | no audit/SSO in OSS | mem0.ai/pricing |
| Supermemory | Free | $0, $5 credits/mo | none | — | supermemory.ai/pricing |
| Supermemory | Pro | $19/mo, $20 credits, 3 seats | auto top-up, priority support | self-host binary lacks connectors, managed MCP, tuned extraction | supermemory.ai/pricing; /docs/deployment/self-hosting |
| Supermemory | Max | $100/mo, $130 credits | Gmail connector | same | supermemory.ai/pricing |
| Supermemory | Scale | $399/mo, $600 credits | PDF OCR extraction, S3 + web crawler connectors, unlimited seats, per-tag access, SOC 2/HIPAA BAA, self-hosted option | same | supermemory.ai/pricing |
| Supermemory | Enterprise | custom | SSO, air-gapped self-host, uptime SLA, dedicated infra, enterprise MCP | same | supermemory.ai/pricing |
| Zep | Flex | $125/mo, 50k credits, 600 req/min, 5 projects, 5 MCP seats | managed Context Graph, 1-day API logs | Community Edition deprecated; Graphiti is the OSS part | getzep.com/pricing; zep README |
| Zep | Flex Plus | $375/mo, 200k credits, 1,000 req/min | observations, custom extraction instructions, webhooks, analytics, 7-day API logs | same | getzep.com/pricing |
| Zep | Enterprise | custom | SOC 2 II, HIPAA BAA, audit logs, BYOK, BYOC/VPC, SLA, 1-year logs, EU DPA | same | getzep.com/pricing |
| Letta | Free | $0; limited agents (3 per docs text; "limited" in card), 5 MiB per memory repo | none | — | letta.com/pricing |
| Letta | Pro | $20/mo; up to 20 agents, 50 MiB per memory repo | remote sandboxes, Letta Auto quota | — | letta.com/pricing |
| Letta | API plan | $20/mo + $0.10/active agent/mo + $0.00015/sec tool run | unlimited agents, API keys | — | letta.com/pricing |
| Letta | Teams Pro | $20/seat/mo | shared agents, access control | — | letta.com/pricing |
| Letta | Enterprise | custom | RBAC, SAML/OIDC SSO, higher quotas | — | letta.com/pricing |
| Cognee | Free | $0, 1 workspace, 1M tokens | none | OSS runs full engine | cognee.ai/pricing |
| Cognee | Standard | $1.00/1M tokens + $5 per extra workspace | Slack, Notion, Linear, Google Drive connectors; code indexing | OSS lacks hosted connectors (page implies) | cognee.ai/pricing |
| Cognee | Enterprise | custom BYOC engagement | bi-temporal memory + conflict resolution, provenance, per-user personalization, SSO, governance, SLA | listed as Enterprise features | cognee.ai/pricing |
| Mastra | Starter | $0; 100k observability events, 24 CPU h, 15-day retention | none | framework Apache-2.0 | mastra.ai/pricing |
| Mastra | Teams | $250/mo; 1M events, 250 CPU h, 6-month retention | multiple teams, SSO, SOC 2 docs | `ee/` code is source-available, not open source | mastra.ai/pricing; LICENSE.md; ee/LICENSE |
| Mastra | Enterprise | custom | RBAC, audit logs, SLAs; self-hosted RBAC/SSO/IAM licence | same | mastra.ai/pricing |
| Memori | Open source | free, BYODB | none | no dashboards, audit, SSO in OSS tier list | memorilabs.ai/pricing |
| Memori | Cloud Free | $0; 5,000 created, 15,000 recalled | none | — | memorilabs.ai/pricing |
| Memori | Team | from $60K/yr | unlimited memories, memory pooling, ReBAC agent access control, observability dashboards, immutable audit log, SSO/SCIM | — | memorilabs.ai/pricing |
| Memori | Business | from $150K/yr | single-tenant managed cloud | — | memorilabs.ai/pricing |
| Memori | Enterprise | custom | VPC/on-prem, eval + holdout attribution, custom SLA | — | memorilabs.ai/pricing |
| Hindsight | Self-hosted | free, MIT, no limits | none | none stated; self-host lacks managed items below | vectorize.io/pricing |
| Hindsight | Cloud | pay as you go: Retain $10/1M tok, Recall $0.75/1M tok, Reflect $0.05/call, Iris Extract $7.50/1M tok, storage $0.25/1M tok/mo (after 30 days) | managed infra, autoscale, daily backups, dashboard + analytics, team collaboration, 99.9% SLA | self-host has none of these | vectorize.io/pricing |
| Hindsight | Enterprise | custom | BYOC/on-prem, SSO + MFA, Memory Defense, audit logs/webhooks/SIEM, GDPR controls, Memlake, 99.95% SLA | — | vectorize.io/pricing |
| Memvid | Free | $0; 50 MB, 1 memory | none | Apache-2.0 | docs.memvid.com capacity page |
| Memvid | Starter | $9.99/mo per docs (pricing page unreadable; search snippet said $59 — not fetched) | 25 GB, 5 memories | — | docs.memvid.com; pricing page UNVERIFIED |
| Memvid | Pro | $49.99/mo per docs (same conflict, $299 in snippet) | 125 GB, 10 memories | — | same |
| Memobase | cloud | UNVERIFIED: site and login URL return 404 | — | Apache-2.0 server | memobase README |
| MemOS | Free | $0; 50k add, 20k search/mo | none | — | memos.openmem.net/pricing |
| MemOS | Starter / Pro | listed $0 "free now" (original $19 / $286); 600k / 80M add per mo | KB 30/100, dedicated support (Pro) | self-host needs Neo4j + Qdrant | memos.openmem.net/pricing; README |
| MemOS | Enterprise | custom | private deployment, custom integration | — | memos.openmem.net/pricing |
| Engram | — | no paid tier found; Engram Cloud is self-hosted | none | none | engram README + cloud README |
| Context Mode | — | no paid tier; ELv2 forbids selling it as hosted service | none | none | README, LICENSE |
| agentmemory | — | no paid tier or cloud found | none | none | README, agent-memory.dev |
| Basic Memory | Team | $15/seat/mo (10+: $13, 20+: $12), 7-day trial | cloud sync, shared workspaces, roles, web/mobile access | OSS is AGPL-3.0, local only | basicmemory.com/pricing |
| Basic Memory | Business | $30/seat/mo | SSO/SAML, audit logs, admin controls, HIPAA infra, priority support | — | basicmemory.com/pricing |
| Basic Memory | Agent infra | custom credits | metered usage, on-prem | — | basicmemory.com/pricing |
| claude-mem | CMEM Pro | $30/mo, 30-day trial | hosted observer, cloud sync, private MCP link | local engine free | cmem.ai/pricing |
| claude-mem | Heavy / Max | $70 / $100 per mo | more usage; Max has billed overage | — | cmem.ai/pricing |
| claude-mem | TeamBrain | not priced; design-partner pilots | shared team memory | — | cmem.ai/pricing |
| TencentDB Agent Memory | — | no price found; MIT repo self-hosts Memory Hub | none found | none found | README |
| ChatGPT | Free/Go/Plus/Pro | UNVERIFIED: chatgpt.com and help.openai.com returned 403 | — | closed | — |
| Claude (app) | Free / Pro / Max / Team | Free $0; Pro $17 annual ($20 monthly); Max from $100; Team standard $20 annual ($25 monthly), premium $100 ($125) | memory is on all plans; Team/Enterprise owners must enable it | closed | claude.com/pricing; support.claude.com |
| Cursor | various | see note below | memory not documented; Team Rules on Teams/Enterprise | closed | cursor.com/pricing, /docs/context/memories |
| Windsurf | Free / Pro / Max / Teams | $0 / $20 / $200 / $80 + $40 per full seat | memories are local auto-generated; system-level rules for Enterprise | closed | windsurf.com/pricing; docs |
| GitHub Copilot | Free / Pro / Pro+ / Max | $0 / $10 / $39 / $100 per month (page also shows $15/$70/$200 in another block) | Copilot Memory needs a paid plan (public preview); org/enterprise admin policy | closed | github.com/features/copilot/plans; docs |
| Gemini | AI Pro / Ultra | UNVERIFIED: page served in Arabic, no readable price | memory "not available to everyone" | closed | Google help page |
| ByteRover | Free / Pro / Enterprise | $0 / $15 per mo (billed yearly) / custom | Free: 100 cloud-synced context files, team sharing. Pro: unlimited files. Enterprise: SOC 2, SSO/SAML, RBAC, on-prem | not checked | byterover.dev/pricing |
| Pieces | Pro / Enterprise | $18.99 / $22.99 per user per month | no free plan; org policy, approved providers, org-wide capture controls | closed | pieces.app/pricing |
| MemMachine | OSS / Pro / Enterprise | $0 / $79 per mo per project / custom | managed hosting, higher rate limits, premium integrations; Enterprise: VPC, SLA, SSO | OSS self-host | memmachine.ai/pricing |
| Graphlit | Hobby / Starter / Growth | $49 / $199 / $999 per mo + usage; winding down, signups closed | knowledge graph, MCP access, SLA (coming) | closed | graphlit.com/pricing |
| Backboard | Pro | $9/mo + usage; Free has $5 credit | memory, usage dashboard, budget alerts | closed | backboard.io/pricing |
| MemoryPlugin | Core | $89/yr shown (partial read) | 21+ tools, buckets | closed | memoryplugin.com/pricing |

## Per-product notes

### mem0 (platform + OpenMemory)
- Plans and numbers are in the table. Source: mem0.ai/pricing. Compliance badges on the page: HIPAA Ready, SOC 2 Type I, GDPR Ready.
- Licence: Apache-2.0 per `docs/21` (not re-read this run). OpenMemory repo is MIT (GitHub API). OpenMemory price: none found; its README text returned nothing about price or storage (item 3 stays UNVERIFIED).
- OSS gap, from the vendor's own comparison page: OSS has no dashboard, no orgs/projects, no project event feed, no webhooks, no export jobs, no batch update/delete, no feedback, no summaries, no custom categories. v3 removed the queryable graph from OSS. Decay, temporal reasoning and Dream are platform-only. Support is the same on both until you need an SLA.
- Complaints: no pricing thread found. Related: graph removal from OSS is visible in https://github.com/mem0ai/mem0/issues/6895 (a docs-drift issue, not a price complaint).

### Supermemory
- Credit-based. Self-host is on Scale and up per pricing page FAQ. Rate card: memory $5/1M SM tokens plain text; SuperRAG $1/1M; search $5/1M queries.
- Self-host doc lists four platform-only items: connectors (Drive, Notion, Gmail, OneDrive sync), managed MCP, tuned extraction, managed scale.
- Licence MIT (GitHub API, `docs/21`). Graph: pricing page says a "memory graph per user"; item 4 is partly resolved (graph claimed, store type not documented).
- Complaint: https://github.com/supermemoryai/supermemory/issues/1140 says the pricing page showed no figures at the time. The page now shows figures.

### Zep
- Credit model: 1 credit per 350 bytes of episode; reads, storage, users unmetered. Free trial: 10,000 credits per month.
- OSS gap: Community Edition is unsupported (README, blog). Open source effort moved to Graphiti. Blog says repo stays Apache-2.0 without updates.
- Complaint: none found as a thread. The deprecation blog is the vendor's own account of why the open-core model was dropped.

### Letta Cloud
- Free plan says "limited agents" in the card and "limited to 3 stateful agents" in prose. Pro 20 agents. Memory repository storage caps: 5 MiB free, 50 MiB Pro.
- Paid-only: remote sandboxes, Letta Auto quota, shared agents and ACL (Teams), RBAC and SAML/OIDC SSO (Enterprise).
- OSS gap: not determined. Docs list a "Docker" entry under Deprecated; self-hosting overview page 404ed at the URL I tried.

### Cognee Cloud
- Free forever with 1M tokens; Standard is flat $1 per 1M tokens. Cloud runs on gpt-oss-120b, per page.
- Page says OSS runs "the full memory engine" locally. Cloud-only items: data-source integrations, code indexing, in-app support. Enterprise-only: bi-temporal memory, provenance, SSO, governance.

### Mastra Cloud / memory
- Platform meters include "Memory Token Usage" (100k then $10/1M on Starter) and retrieval storage ($20/GB beyond 250 MB).
- Licence resolved: Apache-2.0 plus `ee/` directories under a source-available enterprise licence with no production use (item 22). Self-hosted enterprise features: RBAC, SSO, IAM, network policy, flat annual fee.

### Memori
- Pricing is annual and enterprise-shaped; no monthly self-serve paid tier. Free cloud: 5,000 memories created and 15,000 recalled.
- Licence resolved: Apache-2.0 (LICENSE file read). README says Advanced Augmentation is free for developers.
- Production plans share: memory pooling, ReBAC access control, dashboards, immutable audit log, SSO/SCIM. These are the clearest example of "team + audit" being the paywall.

### Hindsight
- Free self-host is MIT, "no usage limits, no telemetry" per pricing FAQ. Cloud gets $5 credit on GitHub sign-up (docs home).
- Paid-only: managed ops, backups, dashboard/analytics, team collaboration, SLA; Enterprise: SSO, MFA, audit/SIEM, "Memory Defense", Memlake for large stores.
- Self-host resource needs (item 23) remain UNVERIFIED; not measured.

### Memvid
- Pricing page is JS-rendered; docs give $9.99 and $49.99. A web search summary (not a fetched page) said the live page shows $59 and $299. Treat price as UNVERIFIED and conflicting.
- Plans meter storage and number of memory files, not features. Tickets sync from an API key.

### Memobase
- Cannot resolve. Site root and login both 404. Docs site loads but no pricing text was found. README says a free tier exists. Licence Apache-2.0.

### MemOS
- Cloud tiers list "Free Now" on Starter and Pro with a struck-through original price; limits are API-call counts and knowledge-base counts. Self-host needs Neo4j + Qdrant; a local SQLite plugin is free.

### Engram, Context Mode, agentmemory, TencentDB Agent Memory
- No paid tier found for any. Engram: local SQLite plus self-hosted Engram Cloud (Postgres, dashboard, project-scoped sync, Git Sync). Context Mode: "no account, no cloud"; licence ELv2 (resolves item 22) forbids offering it as a hosted service. agentmemory: no cloud; comparison table says its cloud pricing is "not stated". TencentDB: MIT licence (resolves item 22), Docker-compose starts memory core, hub and proxy locally; Memory Hub has private/team/restricted ACLs and roles. Item 6 (local mode) is resolved: it can run locally. Price remains none found; site page was JS-rendered.

### Basic Memory
- AGPL-3.0 OSS. Paid cloud adds sync, shared workspaces, roles; Business adds SSO, audit, HIPAA infra. Matches the $15 README claim in `docs/21` (resolved).

### claude-mem
- Resolves item 21: CMEM Pro $30/mo with 30-day trial; tiers $70 and $100; TeamBrain unpriced, design-partner only.

### Built-in memory in tools
- Claude: memory on by default on Free, Pro and Max; Team/Enterprise owners enable it, off per member until turned on. Memory is stored as topics and is separate per project. No price tied to memory.
- ChatGPT: UNVERIFIED (403 on both pages).
- Cursor: pricing page as served is Grok-branded (xAI-style plans: Plus $8, Premium $30, Super $100, Ultra $200, Teams from $30 per user). I did not confirm this is the intended Cursor pricing; treat with caution. The memories docs URL now serves a Rules page with no memory feature; Team Rules (dashboard-managed) need Teams or Enterprise. Item 8 resolved: no documented auto-memory store.
- Windsurf (now Devin): memories are auto-generated and local; the docs say rules are version-controlled and shareable. Teams $80 + $40 per full seat; Enterprise adds SAML/OIDC, VPC, teamspace isolation.
- Copilot: Memory is public preview, available on all paid plans, repo-level and user-level facts, unused entries deleted after 28 days, admins can view/delete on Business/Enterprise. Resolves item 10. Page shows two price sets; I record the one next to the plan cards.
- Gemini: UNVERIFIED price. Help page says memory features are not available to everyone.

### Others found
ByteRover (cloud-synced context files, SOC 2/SSO on Enterprise), Pieces (no free plan), MemMachine (OSS + $79 managed), Graphlit (winding down), Backboard ($9 + usage), MemoryPlugin (partial). Complaint evidence for these: none found.

### Complaints, overall
Searches of GitHub issues for mem0, Zep, Letta, Cognee, Basic Memory and claude-mem found no pricing or limit complaint threads. Hacker News search returned unrelated results except Cursor pricing-change thread titles (not opened). The only dated pushback found is the Supermemory issue above. Say "no complaint evidence found", not "no complaints".

## Paid-feature categories (deduplicated)

| Category | Sold by | How Aletheia could offer it free |
|---|---|---|
| Hosted/managed service, autoscale, backups | mem0, Supermemory, Zep, Hindsight, MemOS, Memori, MemMachine, Basic Memory, claude-mem | Single binary plus documented backup command; no hosting needed. |
| Cross-machine sync | claude-mem, Basic Memory, ByteRover, Engram (self-hosted) | Self-hosted sync server or Git-based export, like Engram Git Sync. |
| Team workspaces, shared memory, roles | mem0 (orgs/projects), Zep, Basic Memory, Letta Teams, Memori (pooling), ByteRover, Hindsight, TencentDB (free) | Namespaces with per-key roles in the local server; TencentDB shows it can be free. |
| Access control (ACL/ReBAC, per-tag access) | Supermemory, Memori, Letta, Mastra | Per-scope tokens with read/write rules. |
| SSO/SAML/SCIM | mem0, Supermemory, Zep, Letta, Basic Memory, Memori, Mastra, Hindsight, Cognee, ByteRover | OIDC login in front of the self-hosted server; SCIM later. |
| Audit logs, API logs, event feed | mem0, Zep, Memori, Basic Memory, Mastra, Hindsight | Append-only audit table with export; no tier gate. |
| Dashboards and analytics | mem0, Zep, Memori, Hindsight, Engram Cloud (free), Backboard | Local web viewer with usage and recall stats. |
| Graph / entity memory | mem0 (Pro), Zep, Supermemory, Cognee, Hindsight | Entity and edge tables in SQLite; no graph database. |
| Temporal reasoning, decay, consolidation ("Dream") | mem0, Cognee, Zep, Hindsight | Scheduled local job for merge, supersede and decay. |
| Managed or tuned extraction (LLM extraction, PDF OCR) | Supermemory, Zep (custom instructions), Hindsight (Iris), Cognee | Bring-your-own-model extraction with editable prompts; optional local OCR. |
| Connectors (Drive, Notion, Slack, Gmail, S3, crawler) | Supermemory, Cognee | Plugin-style importers run locally on schedule. |
| Webhooks, export jobs, batch ops, feedback | mem0, Zep, Hindsight | Ship them in the local API. |
| Compliance (SOC 2, HIPAA BAA, GDPR DPA) | Supermemory, Zep, mem0, Basic Memory, Hindsight | Cannot ship a certificate; offer local-only data, encryption at rest, deletion and export. |
| SLA, priority and dedicated support | nearly all | Not offerable free; publish a clear issue policy. |
| BYOC / VPC / on-prem | Zep, Cognee, Hindsight, Memori, Mastra, MemMachine, Supermemory | Already the default for a self-hosted tool; document it. |
| Higher limits and quotas | mem0, Supermemory, Zep, Letta, Memvid, MemOS | No metering in the free local tool. |
| Prompt-injection / poisoning defence ("Memory Defense") | Hindsight Enterprise | Input scanning and quarantine for captured memories. |
| Team rules/instructions pushed to all users | Cursor Team Rules, Windsurf system rules, Copilot admin policy | Rules hub with a shared, versioned rules repo. This is Aletheia's core. |

## Observations for the owner
- The paid line sits at sync, teams, SSO, audit and managed ops almost everywhere (matches `docs/21` row 5).
- Free-to-self-host has shrunk: mem0 removed OSS graph; Zep dropped Community Edition; Mastra moved auth/RBAC into a source-available `ee/` licence. Aletheia should keep these in the free tree under an OSI licence.
- Free examples to copy: Engram self-hosted cloud, TencentDB Memory Hub (team ACLs and roles), Hindsight (everything but ops).

## Still UNVERIFIED after this run
ChatGPT plan prices (403), Gemini plan price (Arabic page), Memvid live price (JS page; docs say $9.99/$49.99), Memobase cloud (404), TencentDB Agent Memory hosted price (JS page), OpenMemory price and storage, Hindsight self-host footprint, Zep/Letta/Cognee user complaints, Cursor pricing page authenticity (Grok-branded content).
