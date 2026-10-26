# Contributing

Aletheia is small on purpose. Before you open a pull request:

1. Run `bun test`. All tests must pass.
2. Add a test that fails without your change. A bug fix without a test is not finished.
3. Keep it dependency-free. A new runtime dependency needs a reason in the pull request.
4. State what you measured. Claims about speed or recall need the command and its output.

The most useful contribution right now is a **report from a real install** of a tool we only wrote a config for
(Cursor, Gemini CLI, Codex CLI, Windsurf, OpenCode, Claude Code): did `aletheia connect <tool> --write` work, and
did the tool then see the memory? Open an issue with the tool, its version and the result.

Open items are in [docs/17-tech-tasks.md](docs/17-tech-tasks.md).
