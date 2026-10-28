# 29. Aletheia Sync

Status: implemented, 2026-10-26. This page describes the code that exists.

Aletheia Sync is a free, self-hosted, dependency-free way to move memory between devices. It is an
append-only operation log with per-operation results, tombstones, device pairing, scoped tokens and an
optional end-to-end encryption mode (§29.6). Team mode builds on the same tokens and account: see
[31-team.md](31-team.md).

## 29.1 Protocol

All JSON over HTTP, authenticated with `Authorization: Bearer <token>` and `X-Device-Id`. The hub is a
single Bun process with a SQLite file (`sync.db`). Binds to loopback by default; a non-loopback bind needs
`--behind-tls` and a warning, because TLS must be handled by a reverse proxy or tunnel.

| Route | Method | Who | What |
|---|---|---|---|
| `/v1/sync/join` | POST | device | exchange a one-time pairing code for a device token |
| `/v1/sync/push` | POST | `sync`/`admin` | append ops, one result per op |
| `/v1/sync/pull` | GET | any valid token | ops with `seq > since`, cursor-resumable |
| `/v1/sync/snapshot` | GET | any valid token | self-contained heads for re-bootstrap |
| `/v1/sync/status` | GET | any valid token | epoch, head seq, device count |
| `/v1/sync/devices` | GET | `admin` | device registry |
| `/v1/sync/revoke` | POST | `admin` | revoke a device and its tokens |
| `/v1/sync/tokens` | GET/POST | `admin` | list or mint scoped tokens |
| `/v1/sync/compact` | POST | `admin` | run compaction |
| `/v1/sync/purge` | POST | `admin` | purge one entity everywhere |
| `/v1/sync/audit` | GET | `admin` | append-only audit log |
| `/v1/audit/export` | GET | `admin` | stream the audit log as JSONL (default) or CSV (`?from=&to=&format=`) |
| `/v1/sync/e2ee` | GET | any valid token | the account's wrapped E2EE keys (for a newly joined device) |

Push returns one result per op: `applied`, `duplicate`, or `rejected` with a reason. One bad op never
rejects the rest of the batch.

There is also a folder transport: `aletheia sync export <dir>` writes signed op files and
`aletheia sync import <dir>` reads them, for Git, Syncthing or Dropbox.

## 29.2 Data model

An operation:

```
{ device_id, seq, hlc, entity_type, entity_id, op, payload, supersedes, content_hash }
```

- `device_id`: the writing device.
- `seq`: monotonic per-device sequence. Idempotency key, unique per `(device_id, seq)`.
- `hlc`: a Lamport counter. Advances past everything the device has seen.
- `op`: `put`, `dismiss`, `restore`, or `delete`.
- `entity_id`: stable identity of the row being synced.
- `content_hash`: sha256 over the canonical (key-sorted) op, for integrity and replay detection.
- `payload`: redacted content for `put`; null otherwise.

Server tables: `sync_op` (the append-only log), `sync_head` (the winning state per entity, self-contained
with payload), `sync_device`, `sync_token`, `pair_code`, `sync_audit`, `sync_usage`.

Redaction runs on the device before any op leaves the machine. The same `redact.mjs` patterns used at
capture run again here.

## 29.3 Conflict rules

Total order is `(hlc, device_id)`. Higher `hlc` wins; equal `hlc` is broken by `device_id`, so two devices
that write offline converge to the same winner.

1. Facts are append-only: a `put` with a new `entity_id` coexists with older rows.
2. Edits (`put` on an existing `entity_id`) and dismissals (`dismiss`/`restore`) are last-writer-wins.
3. Deletes are tombstones, also last-writer-wins; the tombstone replaces the content.
4. Supersession links merge by union: the `supersedes` set is the union across every op that named it.

These rules are tested in `test/sync-core.test.mjs`.

## 29.4 Retention, compaction, purge and snapshot

Retention default: 30 days. `aletheia sync compact` drops the bodies of ops older than the window that every
non-revoked device has acked past and that a newer `put` or `delete` superseded. Head op bodies are kept, so
snapshot recovery always works. Tombstone and dismiss/restore heads keep their content bodies.

`aletheia sync purge <entity_id>` removes content everywhere and leaves only the tombstone.

An offline device older than the window must re-bootstrap from a snapshot: pull returns
`snapshot_required` when the cursor is behind the retained window, and `/v1/sync/snapshot` returns the
self-contained heads.

## 29.5 Security model

- Tokens are 256-bit random values, stored only as sha256, compared in constant time, revocable.
- Scopes: `sync` (push and pull), `read` (pull only), `mcp` (read tools), `admin` (mint, revoke, audit).
  Each token is limited to named projects (empty = all). The `mcp` scope also unlocks the private remote MCP
  endpoint (docs/30), and an `admin` token is the Hub login password when the server is not loopback-only
.
- Unknown, revoked or expired token: 401. Valid token with the wrong scope: 403.
- Pairing codes: 8 characters, 10-minute life, single use, 5 failed attempts per minute.
- Per-token ops/day and bytes/day quotas are local settings, off by default. A write quota never blocks reads.
- The audit table is append-only and stores ids and counts, never payloads or secrets.
- The hub binds to loopback by default.

### Audit export

`GET /v1/audit/export` (admin token) and `aletheia audit export` read that same table and render it as JSONL
(default) or CSV, with an inclusive `?from=`/`?to=` date range (epoch ms or ISO). Each row carries the action,
the actor (token id or device id), the target (`detail`) and the timestamp, and never a payload or a secret.
The export is tested loopback-only in `test/audit-export.test.mjs`; TLS is delegated to a reverse proxy or
tunnel, and no real remote client has been run against it.

## 29.6 End-to-end encryption (optional)

Status: implemented, 2026-10-26. Optional per account, off by default; unencrypted accounts behave exactly as
before. Tested by `test/sync-e2ee.test.mjs`.

### Key hierarchy

- **Data key (DK)**: one random 256-bit key per account, generated with `crypto.getRandomValues`. It encrypts
  every `put` payload on the device. Rotation replaces it; the account keeps a numbered list of keys and every
  ciphertext names its key id (`kid`).
- **Key-encryption key (KEK)**: `scrypt(passphrase, salt, 32)`. New accounts use N=2^17 (131072), r=8, p=1,
  the current OWASP Password Storage Cheat Sheet minimum for scrypt (fetched 2026-10-26; N=2^17, r=8, p=1).
  The salt is 16 random bytes, stored with the wrapped key.
- **Per-key KDF parameters**: each `sync_e2ee_key` row stores its own `kdf` and `params`, so an account
  created with the old N=16384 default still unlocks. `aletheia sync upgrade-kdf --passphrase <p>` re-wraps
  every data key under the current default without touching op ciphertext (the data keys do not change).
  Unlock reads the parameters from the record, never from a compile-time constant.
- **Wrapped DK**: AES-256-GCM(KEK, DK) with a random 96-bit nonce. Only the wrapped form is stored on the
  server, one row per `kid`.
- **Recovery key**: the DK itself. `aletheia sync export-recovery-key` writes the device's keyring to a file
  with mode 0600. There is no escrow and no way to recover without the passphrase or this file.

### What is encrypted and what is not

Encrypted on the device, before the op enters the outbox: the whole `payload` of a `put` (titles, text,
project names, tags — everything inside the payload object). The ciphertext is an envelope
`{ "@e2ee": 1, v: 1, kid, nonce, ct }` (AES-256-GCM, random 96-bit nonce per message, never reused).
`content_hash` is computed over the op with the ciphertext, so the server's dedupe and integrity checks run
on ciphertext.

Not encrypted, and visible to the server: `device_id`, `seq`, `hlc`, `entity_type`, `entity_id`, the op kind
(`put`/`dismiss`/`restore`/`delete`), `supersedes`, the ciphertext size, the server-side timestamp, the
per-op result code, device names, token ids and the audit rows (which already never carry payloads).

Associated data: AES-GCM authenticates the ciphertext against the canonical op minus `payload` and
`content_hash` — so ciphertext cannot be moved to another device, seq, entity, kind or hlc without failing
the GCM tag.

### Enabling, new devices, rotation, recovery

- `aletheia sync enable-e2ee --passphrase <p>` (on the hub machine) generates the DK, wraps it and stores the
  wrapped key. Future ops are encrypted; old plaintext ops stay readable and stay on the server until
  `aletheia sync purge-plaintext`, which prints exactly what it will do and only re-encrypts with `--apply`.
- A new device joins with the ordinary pairing code, then runs
  `aletheia sync unlock-e2ee --passphrase <p>`: it fetches the wrapped keys over `/v1/sync/e2ee` and unwraps
  them locally. The device stores the data keys in its own local sync DB — the device already holds the full
  plaintext replica, so this adds no new local exposure.
- `aletheia sync rotate-key --passphrase <p>`: new DK, new `kid`; new ops use it, old ciphertext stays
  decryptable with the old key. `aletheia sync change-passphrase --old a --new b` re-wraps the current DK.
  `aletheia sync upgrade-kdf --passphrase <p>` re-wraps every data key under the current scrypt default
  (N=2^17) without touching op ciphertext; run it once after an upgrade to move old keys to the new cost.
- Losing the passphrase and the recovery file means the ciphertext is unrecoverable. That is the point, and
  it is not recoverable by us.

### What a compromised server can and cannot do

Can see: the metadata list above, ciphertext, sizes, timing. Cannot see: payload plaintext, without the
passphrase or a recovery key file. Cannot move ciphertext between entities (AAD fails). Can still drop,
reorder or refuse ops — there is no hash chain across the log — and can DoS the account; the client keeps its
outbox and full local replica either way.

### What is not covered

- Server-side search, server-run extraction, and the remote MCP read tools over an E2EE account would need
  the plaintext. Aletheia does not build an "unlock" mode; with E2EE on, use the device's local search.
- E2EE does not hide the fact that two entities share a `device_id` or that ops happen at certain times.

## 29.7 Threat list and what is NOT covered

| Threat | Covered |
|---|---|
| One bad op rejects a batch | yes: per-op results |
| Replay or duplicate push | yes: `(device_id, seq)` idempotency |
| Secret in the log, audit or wire | yes: redaction before send, audits hold no payloads |
| Lost ack mid-push | yes: outbox survives, re-push is idempotent |
| Revoked device still writes | yes: 401 on the next call |
| Eavesdropping on remote traffic | NOT covered here: TLS is delegated to a reverse proxy or tunnel |
| Hub reading plaintext payloads | covered when E2EE is on (§29.6); plaintext accounts keep the old behaviour |
| Compromised hub tampering with history | NOT covered here: there is no hash chain across the log |
| A device with an old cursor | covered: `snapshot_required` and snapshot re-bootstrap |

Do not claim "end-to-end encrypted" for plaintext accounts. E2EE covers what §29.6 says and nothing more.

## 29.8 Failure modes

| Failure | Behaviour |
|---|---|
| Hub down or 5xx | ops stay in the outbox; push/pull are retried |
| Crash between apply and cursor | same transaction; both or neither |
| Reordered pulls | only a higher `hlc` wins; order does not change the replica |
| Poison op | rejected alone, the rest of the batch drains |
| Disk full | push returns an error; the client keeps the outbox |

## 29.9 Running two machines

On the hub machine:

```bash
bun bin/aletheia-sync.mjs --port 37791 --db ~/.aletheia/sync.db
aletheia sync pair --db ~/.aletheia/sync.db
```

On the device:

```bash
aletheia sync join http://<hub-host>:37791 <code> --name laptop
aletheia sync run
```

For a remote hub, the hub must be reachable over TLS. A Cloudflare Tunnel example (no vendor lock — any
reverse proxy or Tailscale works):

```bash
cloudflared tunnel --url http://127.0.0.1:37791
aletheia sync join https://<assigned-host>.trycloudflare.com <code>
```

The tunnel only forwards TLS to the loopback hub. Aletheia itself does not depend on the tunnel provider.

## 29.10 Comparison with claude-mem's sync

claude-mem's hub appends to a per-user log and refuses the whole batch when any op is refused ("any refusal
rolls back all of it", `store.ts`). Users got stuck for days on a stale or conflicting op: issue 4086 and
issue 3964. Aletheia answers per op, so one bad op never blocks the rest.

claude-mem couples every push to its closed "projection" catching up (`projected_seq`), which caused
33-hour 500/429 outages (issue 4191) and a stuck `projected_seq` (issue 4198). Aletheia's hub is its own
store, so there is no second system to lag.

claude-mem stores op bodies in clear text on the hub; the schema file says retention, rotation and
compaction are out of scope. Aletheia runs redaction before send, adds tombstones with compaction and purge,
keeps payloads off the audit table, and offers the optional E2EE mode in §29.6 for accounts that enable it.

## 29.11 Sources

- The sync tests in `test/`.
