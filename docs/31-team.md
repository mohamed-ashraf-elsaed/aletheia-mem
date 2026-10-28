# 31. Team mode

Status: implemented and tested, 2026-10-26. This page describes what the code does. It does not claim
SSO, SCIM, compliance certificates or an SLA; none of those are built.

Team mode is a small layer on top of Aletheia Sync ([29-sync.md](29-sync.md)). It stores named projects, members,
shared entries, a board and a brief in `team.db`, a separate SQLite file next to `sync.db`. Every route and CLI
command reads that store; the store makes the access decision.

## 31.1 Model

| Table | Holds |
|---|---|
| `team` | one row per team, scoped to a sync account |
| `team_project` | the named projects that belong to a team |
| `team_member` | a member: one sync device token plus a role (`owner`, `editor`, `viewer`) |
| `team_share` | the projects a non-owner member may read and write |
| `team_entry` | shared memory (`memory`, `fact`, `note`) and board entries (`pin`, `decision`) with author and time |
| `team_audit` | append-only team actions; ids and counts, never entry text |

A member is a device token from the sync account; the raw token is shown once when the member is
created. A team is isolated by `account_id`. Joining a team shares nothing: a member sees only the projects in
`team_share`. For an owner, the project list is the team's projects.

## 31.2 Roles

| Action | owner | editor | viewer |
|---|---|---|---|
| read a shared project | yes | assigned projects | assigned projects |
| write shared memory or a board entry | yes | assigned projects | no (403) |
| add projects, members, shares; revoke; read the member list | yes | no | no |
| leave the team | yes | yes | yes |

`authorize()` in `src/hub/team.mjs` is the single check. The HTTP routes call it, and so does every CLI and test
call; a route cannot be the only gate. A revoked member gets `401 member_revoked`; a token revoked in the sync
store gets `401 token_revoked`; the wrong project gets `403 project_forbidden`.

## 31.3 Shared memory, board, brief and search

- **Shared memory** is a copy written into `team_entry`; it is not a live view of the hub store. Writing the same
  text twice creates two rows; there is no dedupe at this layer.
- **The board** is `kind = pin` or `kind = decision`. Every entry carries the member id, the author name and the
  creation time.
- **The brief** is built by a rule: decisions first, then facts shared in the last 14 days (configurable), each
  line naming `team-entry#<id>` and the source (`fact#<id>`, `memory#<id>` or nothing). It says "No model" in its
  own text and is cut to a character budget. No model is called and no network request is made.
- **Shared search** uses the FTS5 index over `team_entry` and filters by the member's projects. A member of
  project A cannot see project B, and a member of team A cannot see team B.

## 31.4 Routes and commands

`/v1/team/*` needs a sync bearer token. `/api/hub/team/*` is the guarded local UI route and acts as the local
operator. The full table is in [03-http-api.md](03-http-api.md#34-team-mode). The CLI mirrors it under
`aletheia team ...`; `--token-id <id>` acts as that member, and the default is the local operator.

## 31.5 Threat list and what is not covered

| Threat | Covered |
|---|---|
| A viewer writes | yes: store check, tested |
| A member reads a project they do not share | yes: store check on every read, tested |
| A member reads another team | yes: team id and account id are part of every query, tested |
| A revoked member keeps access | yes: next call fails, tested |
| A token revoked elsewhere keeps team access | yes: the token is re-checked, tested |
| A member leaves and its shared rows stay visible | yes: rows are tombstoned and shares removed, tested |
| One team's search returns another team's rows | yes: `team_id` is in the query, tested |
| A local UI user reads every team | yes by design: the `/api/hub` session is the operator. It is not a member-only path |
| A stolen device token reads its assigned projects | **NOT covered**: the token is the identity. Revoke it |
| E2EE team memory | **NOT covered**: a shared brief and shared search need server-readable text. Team mode runs on a plaintext sync account |
| A removed member's offline replica | **NOT covered**: the device keeps its local copy. Revoke the token and wipe the device |
| SSO, SCIM, compliance, audit export | **NOT built** and no certificate is claimed |

## 31.6 Failure modes

| Failure | Behaviour |
|---|---|
| Member revoked during a pull | the next team call fails; the sync pull answers 401 on the next call |
| Project removed while a member is reading | the share remains but the project is no longer in `team_project`; reads answer 403 |
| Duplicate team name in one account | `400`; names are unique per account |
| Last owner revoked | `400`; a team always keeps one active owner |
| A member leaves | their shared rows are tombstoned and their shares are deleted; the member row is revoked |
| Brief too long | cut at `maxChars` (default 2000) and ends with `…` |

## 31.7 Evidence

`test/team-mode.test.mjs` covers the store checks, cross-project and cross-team reads, token and member
revocation, the board author/time, the brief's source ids, search ACLs, leave tombstones and the HTTP route
behaviour. The task file carries the real command output. Nothing here was measured on two real machines.
