# Aletheia status and limits: alpha, what is verified and what is not

<!-- description: Aletheia is alpha. This page lists what tests cover, what ran on real tools, what is unverified, platform status and how to report from a real install. -->
<!-- keywords: aletheia status, aletheia alpha, aletheia limitations, is aletheia production ready, aletheia platform support, aletheia licence -->

Aletheia (aletheia-mem) is alpha software: a free, local memory and rules hub for AI coding tools. The memory engine and the installers work in tests. A small number of real-tool checks have been done, by one user on one machine, and this page lists them in fixed wording so that nothing reads stronger than what was checked.

## Status in one paragraph

Aletheia is alpha. Expect rough edges, changes between 0.1.x releases and gaps in what has been tried on real tools. CI runs the test suite on Linux, macOS and Windows. Hooks have run in real sessions of three hosts, and the real CLI listed the MCP server for four. That evidence is thin. Answer accuracy is not measured. Benchmarks are retrieval only.

## What the tests cover

Run the whole suite with:

```bash
bun test
```

Tests are the main evidence for the memory engine and the installers. In particular:

- The MCP server was run against the official MCP SDK client for protocol versions 2025-11-25 down to 2024-11-05.
- Each installer is tested against fixtures in a temporary home directory. Each installed hook command is run end to end with a recorded payload.
- Rules files for Claude Code, Command Code, Codex CLI, Gemini CLI, Cursor, Windsurf, OpenCode, Copilot and Aider are written and checked in temporary folders. The table is in [`docs/verification/rules-targets.md`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/verification/rules-targets.md). The Copilot and Aider formats were not re-checked against those tools' documentation.
- The Claude Desktop MCP config is merge-tested against a fixture. It has not been opened in the app.

A fixture test proves the file is well formed. It does not prove the real tool accepts it.

## What ran on real tools

These sentences are the only claims made about real tools:

- MCP server listed by the real CLI on 2026-10-27: Claude Code 2.1.312, Command Code 1.88.1, Codex 0.130.0, OpenCode 1.18.33.
- Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.
- Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode.

In those sessions prompts and tool events were captured, secrets were redacted and the checker found no leaks. "Works with" is not claimed for any tool.

`aletheia install --list` prints the same status for every host. On 2026-10-29 it printed:

| Host | Level | Verification | Hook events installed |
|---|---|---|---|
| claude-code | full | mcp-verified | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | mcp-verified | SessionStart, PostToolUse, Stop |
| cursor | full | from-docs-only | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | mcp-verified | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | from-docs-only | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | from-docs-only | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | mcp-verified | none (MCP and rules only) |

`mcp-verified` means the real CLI listed the server. `from-docs-only` means the format came from the host's documentation and was tested against fixtures. See [Tools overview](../tools/overview.md) for each host.

## What is not verified

- Cursor, Gemini CLI and Windsurf have not been tried on a real install. No hook has run inside Cursor, Gemini CLI, Windsurf or OpenCode.
- Answer accuracy is not measured. Recall@5 is retrieval, not whether an answer was correct. There is no published reader-and-judge result.
- The 1B-model extraction run failed. Facts from Aletheia's own extractor were measured with the rule extractor only. See [Benchmarks](benchmarks.md).
- Sync and end-to-end encryption are tested with temporary data directories and a loopback hub. No real tunnel and no second host were used. See [Sync](../29-sync.md).
- End-to-end encryption covers payloads, not metadata such as device id, operation kind, entity id, timing or ciphertext size.
- Remote MCP delegates TLS to a reverse proxy or tunnel. OAuth is not built. See [Remote MCP](../30-remote-mcp.md).
- The graph retrieval channel is off by default. It was tested on a synthetic set and not on real data.
- The ten README translations are machine-translated. No native speaker has reviewed them.
- At 50,000 synthetic rows, keyword search p95 is 32.7 ms for one project and 58.6 ms across all projects. These numbers are synthetic and come from one Linux machine.

## Platform status

Aletheia needs Bun 1.1 or newer. The CLI runs on Bun, not Node.

| Platform | What is checked | What is not |
|---|---|---|
| Linux | The test suite, the install smoke test and the regression gate run in CI | Real-tool checks were done on one machine |
| macOS | The test suite and the install smoke test run in CI | The README records no real-tool trial on macOS |
| Windows | The test suite runs in CI | No real tool was tried. Several checks are skipped |

CI uses the GitHub `ubuntu-latest`, `macos-latest` and `windows-latest` runners with Bun 1.3.10 ([workflow](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/.github/workflows/test.yml)). The regression gate runs on Linux only. `aletheia service install`, which sets up auto-start, is for Linux and macOS only, as its help text says.

The test files skip these checks on Windows, because they need a POSIX shell for hook commands or POSIX file modes (found by searching the test files for `skipIf(process.platform === "win32")` on 2026-10-29):

- the end-to-end install, hook, server, spool, doctor and uninstall test
- the end-to-end capture test for every full-capability host
- the memory pipeline test
- the test that no file is written into a project folder
- the hook-execution checks for Gemini CLI and Windsurf
- one temporary-folder cleanup check
- four file-permission checks

The README gives a shorter summary of these skips. This page follows the test files.

## Roadmap

No roadmap is published in the repository. The `[Unreleased]` section of the [CHANGELOG](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md) was empty on 2026-10-29. Open work is in the [issue tracker](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues). The gaps listed above are known gaps, not promises.

## Report from a real install

The most useful contribution is a report from a real install of a host that has only a config written from docs. The [contributing guide](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CONTRIBUTING.md) asks for an issue with:

1. The tool and its version.
2. The command you ran, for example `aletheia connect cursor --write` or `aletheia install cursor --write`.
3. What the tool did: did it list the MCP server, did a hook run, did the next session get memory back.

Run a dry run first. Without `--write` the command prints every file it would change and writes nothing. `aletheia doctor` prints server, hook and spool checks. Attach its output with secrets removed.

For Claude Code, Codex CLI and Command Code, the maintainer script `bun scripts/hook-check.mjs <data-dir> --tool <name>` opens the hub database read-only. It scans for redaction leaks and prints PASS or FAIL for each expected hook event. Use the "New host" issue form to ask for a host that is not listed.

## Licence and NOTICE

Aletheia is licensed under Apache-2.0 ([LICENSE](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/LICENSE)). It has no required runtime dependencies. [NOTICE.md](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/NOTICE.md) lists the files taken from claude-mem 15.2.0, which is also Apache-2.0, and the change made to each. Aletheia is not affiliated with or endorsed by the claude-mem authors or Anthropic.

## Changes between versions

Every release is recorded in the [CHANGELOG](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md).

## Next steps

- [Tools overview](../tools/overview.md) - the verification status of each host.
- [Benchmarks](benchmarks.md) - every command behind the published numbers.
- [Privacy and redaction](../concepts/privacy.md) - what is redacted before anything is stored.
- [Aletheia and claude-mem](../compare/aletheia-vs-claude-mem.md) - a fair comparison with the closest project.
