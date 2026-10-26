# Security

Aletheia listens on `127.0.0.1` only by default and stores data in a local SQLite file. Secrets are redacted before
storage, but redaction is pattern-based and cannot be complete: do not rely on it for material you must never store.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab). No email address is published for
this project, so that is the reporting channel. Include the version or commit, the command, and the smallest
reproduction with secrets removed. Do not open a public issue with the details.

There is no formal response-time promise. A fix is committed with a test when one is possible.

## Scope

In scope: the local server, CLI, MCP server, hooks, installers, rules sync, sync hub, remote MCP endpoint, and the
Docker files. Out of scope: a host application's own handling of the payloads it sends, and a reverse proxy or tunnel
that you place in front of the sync hub.
