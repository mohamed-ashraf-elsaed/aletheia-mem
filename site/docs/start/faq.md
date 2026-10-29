# Aletheia FAQ: memory, privacy, tools and limits

<!-- description: Short answers about Aletheia (aletheia-mem): cost, data location, privacy, which tools it connects to, deleting memory, offline use and its alpha status. -->
<!-- keywords: aletheia faq, ai agent memory faq, claude code memory questions, mcp memory server faq, aletheia privacy, aletheia vs claude-mem, aletheia alpha -->

Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. These answers are short and point to the page that has the detail. Command output was captured on 2026-10-29 with a temporary home folder, and paths that start with `...` stand for it.

### What is Aletheia?

Aletheia is a local memory and rules hub for AI coding tools. It keeps what your tools learn in one SQLite file on your machine. Any tool can read that file over MCP, REST or the `aletheia` command. It also writes your rules into each tool's own instruction file, such as `CLAUDE.md` and `AGENTS.md`. The package is `aletheia-mem`, and its status is alpha. [Introduction](introduction.md) has the full picture.

### Is Aletheia free?

Yes. It is licensed under Apache-2.0, needs no account and has no paid tier in this repository. If you choose to connect a model provider, that provider's own charges apply. Aletheia runs without one.

### Where does Aletheia store my data?

In `~/.aletheia/hub.db`, a SQLite file on your machine. Set `ALETHEIA_DATA_DIR` to use another folder. Aletheia sets the folder to mode 0700 and the database to 0600. [Installation](installation.md#where-the-data-lives) lists the files.

### Does Aletheia send my data anywhere?

Not by default. The server listens on `127.0.0.1`, hooks make no network call, and there is no telemetry. Data leaves your machine only through things you turn on:

- A model provider. The fact-extraction prompt sends redacted `summary` and `note` text. The dashboard's "Compress now" button sends the stored text of recent prompts and events.
- A sync hub, a remote MCP link or an alert webhook.

One caution applies to a git clone. `aletheia compress`, `aletheia embed` and `aletheia search --semantic` import an optional vector package. In a clone, Bun's auto-install may download it. In a test, `aletheia compress` from a clone with an empty Bun cache added about 502 MB to that cache, while an npm-installed copy downloaded nothing. [Installation](installation.md#install-from-git) has the details.

### What is the difference between Aletheia and claude-mem?

claude-mem describes itself as a "Persistent memory compression system for Claude Code" (https://docs.claude-mem.ai/introduction, fetched 2026-10-29). Aletheia is a separate project. It is not affiliated with claude-mem or Anthropic. Aletheia keeps one store that several hosts share and writes your rules into each host's instruction file. It can read a claude-mem database read-only with `aletheia import claude-mem`. [Aletheia vs claude-mem](../compare/aletheia-vs-claude-mem.md) compares the two with sources and dates, and [Migrate from claude-mem](../guides/migrate-from-claude-mem.md) shows the import.

### Can I use Aletheia with Claude Code?

The real CLI listed the Aletheia MCP server on 2026-10-27 for Claude Code 2.1.312. Hooks ran in real sessions of Claude Code (two days of use), one user on one machine. Run `aletheia install claude-code` for a dry run. See [Claude Code](../tools/claude-code.md).

### Can I use Aletheia with Cursor?

Cursor: config written from docs, not tested on a real install. No hook ran in Cursor. See [Cursor](../tools/cursor.md).

### Can I use Aletheia with Codex CLI?

The real CLI listed the Aletheia MCP server on 2026-10-27 for Codex 0.130.0. Hooks ran in one interactive session of Codex CLI, one user on one machine. See [Codex CLI](../tools/codex.md).

### Can I use Aletheia with Gemini CLI?

Gemini CLI: config written from docs, not tested on a real install. No hook ran in Gemini CLI. See [Gemini CLI](../tools/gemini-cli.md).

### Can I use Aletheia with Windsurf?

Windsurf: config written from docs, not tested on a real install. No hook ran in Windsurf. See [Windsurf](../tools/windsurf.md).

### Can I use Aletheia with OpenCode, Command Code or other tools?

The real CLI listed the Aletheia MCP server on 2026-10-27 for Command Code 1.88.1 and OpenCode 1.18.33. Hooks ran in one short session of Command Code, one user on one machine. No hook ran in OpenCode, which gets MCP and rules only. Any tool that speaks MCP or can call the REST API or the command line can read the same store. See the [Tools overview](../tools/overview.md) and [other tools](../tools/other-tools.md).

### Do I need an API key or a model?

No. The default is `ALETHEIA_PROVIDER=none`, and the server prints `extraction: worker on (rule-based)`. The rule extractor keeps only plain "subject verb object" sentences, so it finds fewer facts than a model would. In the project's benchmark, the rule extractor did not reproduce the gain that dataset-supplied facts gave. You can add a provider later, such as `claude-cli` or an OpenAI-compatible endpoint. See [Model providers](../guides/model-providers.md).

### How do I stop Aletheia from remembering something?

Wrap the text in `<private>` tags. The text between the tags is replaced with `[private]` and is not stored:

```text
$ aletheia save "Use key sk-abcdefghijklmnopqrstuvwx1234 for staging <private>hidden</private> done" --project demo
Saved as #11.
$ aletheia search "staging" --project demo
#11 2026-10-29 [note] Use key [redacted:api-key] for staging [private] done (demo, cli)
```

That works in the hooks, `aletheia save`, `aletheia capture`, the MCP `save_memory` tool and the transcript back-fill. It does not work for notes typed into the dashboard or sent to the REST API. In a test, those two routes stored a fake key and a `<private>` block as sent.

To stop capture for a whole project, set `ALETHEIA_EXCLUDED_PROJECTS` to the project name in the environment of the tool that runs the hooks. In a test, a hook for an excluded project exited 0 and stored nothing. To stop capture for a whole tool, uninstall its hooks. [Privacy and redaction](../concepts/privacy.md) has the rest.

### How do I delete memory?

There are two ways. **Dismiss** hides a memory, fact or other item from search and from the context your tools receive. It is reversible:

```text
$ aletheia dismiss 1 --reason "wrong"
Dismissed memory #1. Restore with: aletheia restore memory:1
$ aletheia restore 1
Restored memory #1.
```

In the dashboard the buttons are Hide (on Home) and Dismiss (in Knowledge), and the Hidden page restores items.

**Erase** deletes. It reports first and changes nothing until you add `--apply`:

```text
$ aletheia erase --id 3
Erasure report for ids memory:3

  memories              1  ids 3
  ...
Nothing was deleted. Add --apply to erase, export first with --export <file>.
Report only. Add --apply to erase.
```

With `--apply`, Aletheia first writes a pre-erase export. That is a bundle of the project's memories, or of every memory, with events, when you gave no `--project`. It then deletes the rows, purges matching sync entities and writes a signed receipt. Check a receipt with `aletheia erase verify <receipt.json>`. The pre-erase export still contains the erased text, so delete or move it yourself if you want the text gone.

### How do I move my memory to another machine?

Export a bundle, copy it, and import it:

```bash
aletheia export --out aletheia-backup.jsonl        # on the old machine
aletheia import bundle aletheia-backup.jsonl       # on the new machine
```

```text
{
  "memories": { "added": 7, "skipped": 0 },
  "rules": { "added": 1, "skipped": 0 },
  "errors": []
}
```

The bundle holds memories and rules, not the separate facts table. Events are left out unless you pass `--events`. Memory ids can differ on the new machine. Importing the same bundle twice adds nothing the second time. Optional self-hosted sync can keep two machines in step, but it has not been tested across two real machines. See [Back up, export and import](../guides/backup-export-import.md).

### Does Aletheia work on Windows?

CI runs the test suite on Windows (GitHub's windows-latest runner, Bun 1.3.10). Two hook checks (Windsurf and Gemini CLI) are skipped there, and no real tool was tried on Windows. So Windows is tested in CI only. `aletheia service` does not support Windows. It prints that auto-start is not supported and suggests Task Scheduler.

### Is Aletheia fast?

Searches are local SQLite queries. At 50,000 synthetic rows, keyword search p95 is 32.7 ms when scoped to one project and 58.6 ms across all projects. These numbers are measured-by-us on Linux with `bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --seed 1`, and the README records them. The 50 ms target is met for project-scoped search only. The numbers are retrieval latency on made-up data. [Benchmarks](../project/benchmarks.md) lists every run with its date and command.

### Is answer accuracy measured?

No. The published benchmarks measure retrieval: whether the gold evidence is in the top five results (Recall@5). They do not measure whether a model's answer was correct. The repository has an answer-accuracy harness, `bench/accuracy.mjs`, but it has not been run, and it would make model calls.

### How do I uninstall the hooks?

Run the dry run, then apply it:

```bash
aletheia uninstall claude-code
aletheia uninstall claude-code --write
```

Only the entries listed in the install manifest are removed, and each changed file is backed up first. Repeat for each tool. `aletheia install --verify` reports whether the recorded install still matches. [Installation](installation.md#uninstall-aletheia) shows the output.

### What does the name Aletheia mean?

The project's landing page writes it as `ἀλήθεια · a-lethe · "un-forgetting"` and calls the project "un-forgetting for AI tools". The idea is that your tools forget between sessions, and Aletheia keeps what they learned.

### How do I report a bug?

Open an issue at https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues. Include the output of `aletheia --version`, the tool and its version, the command you ran, what happened, and the output of `aletheia doctor` with secrets removed. A report from a real install of a tool is the most useful kind. For a security problem, use GitHub's private vulnerability reporting on the repository instead of a public issue.

### Is Aletheia production ready?

No. It is alpha software. The memory engine and the installers work in tests. Real-tool checks cover one user on one machine, and no hook has run in Cursor, Gemini CLI, Windsurf or OpenCode. Answer accuracy is not measured. Sync and end-to-end encryption were tested only with temporary folders and a loopback hub. [Status and limits](../project/status-and-limits.md) is the full list.

### How does Aletheia handle conflicting facts?

A newer fact about the same subject and predicate with a different object closes the older fact. The older fact is kept as history, not deleted, and `aletheia search --history` can show it. If two conflicting facts start at the same time, both lose 0.1 confidence and the pair goes to the review queue, which is the "Needs a look" page in Knowledge. You decide. [Facts and contradictions](../33-facts.md) has the rules.

### Can several tools share one memory?

Yes. Every connected tool reads and writes the same `hub.db`, and each row records which tool wrote it. A search in one project returns rows from any tool. Rules can be limited to certain tools. A tool shares memory only once it is connected, and what has been checked on a real install is listed in the answers above.

### Does Aletheia work offline?

Yes, for the server, the hooks, the command line, the dashboard, keyword search and rule-based extraction. None of them needs the network. You need the network to install the package, to use a remote model provider (a local one such as Ollama on loopback does not need it), to run sync, and to download the optional vector package and its model.

### Does Aletheia need Node.js?

No. It runs on Bun 1.1 or newer. The commands start with `#!/usr/bin/env bun`, so Bun must be on your `PATH` even if you install with npm.

### How do I check that capture is working?

Run `aletheia doctor`. It checks the server, the hooks for each tool, the spool, file permissions, the last capture time, the queue and the database. The same checks appear in the dashboard under Connections, in Health checks. After you send one prompt in a connected tool, Home and Knowledge should show a new memory.

## Next steps

- [Introduction](introduction.md) - what Aletheia is and is not.
- [Installation](installation.md) - install, update and remove it.
- [Troubleshooting](../guides/troubleshooting.md) - when something does not work.
- [Status and limits](../project/status-and-limits.md) - what is verified and what is not.
