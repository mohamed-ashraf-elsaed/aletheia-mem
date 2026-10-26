# Security

Aletheia listens on `127.0.0.1` only and stores data in a local SQLite file. Secrets are redacted before storage,
but redaction is pattern-based and cannot be complete: do not rely on it for material you must never store.

Report a vulnerability through GitHub's private vulnerability reporting on this repository (Security tab), not a
public issue.
