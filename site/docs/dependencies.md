# Dependencies

Aletheia has no required runtime dependencies. It uses the Bun standard library and Bun's built-in SQLite
binding only. The audit that enforces this is `scripts/audit-deps.mjs`:

```bash
bun scripts/audit-deps.mjs
```

The command fails when a required dependency is added without a written reason in the script's allowlist, or
when a listed licence is copyleft. Run it in CI and before a release.

## devDependencies

None. The project has no build step and no test-only packages; the test suite runs with `bun test` alone.

## Vendored code

Everything below is copied or derived from **claude-mem** 15.2.0, licensed under Apache-2.0. Attribution and
the exact change for each file is in [NOTICE.md](../NOTICE.md).

| Path | Licence | Origin |
|---|---|---|
| `public/work.html`, `public/assets/` | Apache-2.0 | claude-mem 15.2.0 (optional legacy viewer) |
| `prompts/request-progress/SKILL.md`, `prompts/owner-goals/SKILL.md` | Apache-2.0 | claude-mem 15.2.0 |
| `vendor/owner-goals/` | Apache-2.0 | claude-mem 15.2.0 |
| `src/ledger/commands.mjs` | Apache-2.0 | claude-mem 15.2.0 (derived) |

This project's own code is also Apache-2.0, per [LICENSE](../LICENSE).
