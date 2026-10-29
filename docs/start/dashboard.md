# The Aletheia dashboard: five tabs for memory, rules and tools

<!-- description: A tour of the Aletheia (aletheia-mem) dashboard: what Home, Activity, Knowledge, Rules and Connections show, and what you can change in each. -->
<!-- keywords: aletheia dashboard, ai memory dashboard, ai agent memory ui, aletheia rules page, manage claude code memory, aletheia hide memory -->

The Aletheia (aletheia-mem) dashboard is a web page that `aletheia-server` serves on your own machine, by default at `127.0.0.1:37790`. It has five tabs: Home, Activity, Knowledge, Rules and Connections. This page says what each tab is for and what a person can do in it.

The dashboard is plain HTML, CSS and JavaScript with no framework, no CDN and no outside font, so it works offline. It listens on loopback only. The tab names and controls below were checked in a real browser on 2026-10-29 against the current build.

## The header and the status bar

The header is on every tab. From left to right it holds:

- The five tabs.
- A **Project** drop-down. "All projects" is the default. Choose one project to filter every tab to it.
- A search box. Press `/` to jump to it. It lists quick matches as you type and can open the full search page in Knowledge.
- A theme switch with Auto, Dark and Light.
- A health dot for the server.

Under the header, a status bar shows nine small indicators plus Live (or Polling, when the live connection is not up): Server, Database, Search index, Vectors, Embedding model, Queue, Extractor, Capture and Sync. Hover or click one to see details and the command that fixes it. A new install shows Vectors and Embedding model as idle and Sync as off. That is normal, because vector search and sync are optional. If the server cannot be reached, a banner appears with a retry button.

Keyboard shortcuts: `Ctrl+K` (or `⌘K`) opens a command palette, `/` focuses search, `?` lists the shortcuts, and `g` then `h`, `w`, `m`, `r` or `t` jumps to Home, Activity, Knowledge, Rules or Connections. The `?` list still uses the older tab names Work, Memory and Tools.

## Home

Home is the default tab. It answers "what does Aletheia know about this project, what rules apply, and are my tools connected?" in plain words.

With **All projects** selected, you see:

- A "What is Aletheia?" panel that is open while you have fewer than 50 memories.
- **Your projects**: one tile per project with the number of things remembered and when it was last used. Temporary folders and projects with fewer than three memories are grouped under "other folders" and hidden by default.
- **Your rules** and **Connected tools**, described below.

Choose a project in the header, or click its tile, and Home shows four blocks:

- **What Aletheia knows about the project.** Decisions, fixes and notes, newest first, with pinned notes at the top. Each row has a **Hide** button. A hidden row leaves search and the context your tools receive, but it is not deleted. Bring it back from Knowledge, in the Hidden page. Under the list, **Read everything** opens Knowledge and **Search** focuses the search box. The box "Tell Aletheia something to remember" plus **Save note** saves a pinned note, which then appears at the start of every new session in that project.
- **What happened lately.** One line per finished session. A line appears after a session ends and the worker has built its summary.
- **Rules.** Each rule has an on/off switch and a label saying where it applies. The box "Add a rule, in your own words" has example chips you can click to start from. A checkbox limits the rule to the selected project. **Write rules into my tools** previews what would change in each connected tool's file. Only after you press the "Write to N files" button does it write. It rewrites only the block between Aletheia's own markers and backs up each changed file.
- **Connected tools.** Each tool shows On, Needs setup, Limited or Not installed. For a tool that needs setup, the card shows the command `aletheia install <tool> --write` with a **Copy** button.

Secrets and `<private>` text are handled before they reach any of this. [How Aletheia works](how-it-works.md) says where, and where not.

## Activity

Activity shows what your AI tools worked on. Its title line reads "What your AI tools worked on, one card per request."

- A strip at the top shows health, last capture, queued jobs, extraction mode, sessions in the window and how many items need you.
- **Requests** are cards. A request is a group of sessions in one project that share a goal and are close in time. The card shows a status (Working, Shipped, Waiting on you or Idle), its progress and expandable parts: how the request was worked out, what was done, and its sessions. Request grouping and progress are marked "estimated". **Dismiss** hides a card, and nothing is deleted. Open a session to see its summary, its timeline of prompts and tool events, and the facts extracted from it.
- **Needs you** lists review items, rule suggestions and recently hidden rows with Accept, Reject, Dismiss and Restore buttons.
- **Recent memory** lists current facts with their source and importance.
- **Goals** come from your own typed prompts. A topic counts as a goal when it repeats in at least two sessions.
- **Build story** shows counts, shipping velocity and corrections that repeat in your prompts.

The page refreshes every 10 seconds while it is visible, and at once when something changes. [Requests and goals](../32-requests.md) has the rules behind the cards. On an empty store, a "Get your first memory in three steps" guide shows the install command for your tool.

## Knowledge

Knowledge is the store itself: every memory and fact Aletheia has, in one place that all your tools read. Five counters sit at the top: Memories, Facts, Pinned, To review and Hidden. Two buttons sit beside the title:

- **New note** opens a form with a title, text, a project and a type. A note is saved as a memory. The form says Markdown works.
- **Import and export** opens a drawer. It exports a `.jsonl` bundle or Markdown, imports a bundle, imports from claude-mem when its database exists, and has a **Compress now** button that needs a model provider.

Below the counters are six pages:

- **Memories.** Filter by words, type, kind, scope and pinned, and sort by pinned first, newest, oldest or title. Each memory has **Pin**, **Edit** and **Dismiss**. Dismiss, Pin and similar actions change the screen first and show an Undo for eight seconds.
- **Facts.** Short statements pulled from your sessions. Switch between Current, History and Dismissed. History shows facts that a newer fact replaced.
- **Needs a look.** Items that need your decision: two facts that disagree, and near-duplicate memories. You can Accept, Reject, Merge or Keep both. Merging cannot be undone from this page.
- **Hidden.** Everything you dismissed, with a **Restore** button.
- **Savings.** An estimate of the tokens a later session would read from the context block.
- **Search.** Facts come first, then raw memories, with matches highlighted. You can search this project or all projects, and include fact history.

## Rules

Rules are how you want every AI tool to work. The tab lede says: write a rule once, then write it into each tool's file. **Add a rule** opens a form with what the tool should do, an optional "when", and where it applies: everywhere, one project or one situation. Pages:

- **Rules.** Filter by All, On, Off or Re-check. Each rule has **Confirm**, **Turn off** or **Turn on**, **Edit** and **Replace**, and **Retire** when it is stale. A rule is turned off, not deleted, and a replaced rule is kept and marked.
- **Suggestions.** Rules Aletheia proposes when you correct a tool the same way several times. **Run learning now** refreshes them. Nothing is applied until you **Approve**. You can Edit before approving or Reject.
- **Write to tools.** Pick tools and a scope (global or a project folder). **Preview changes** shows what would change. **Write files** asks you to confirm, keeps a backup and changes only the managed block.
- **Import.** Read the rules a tool's file already holds into Aletheia: choose the tool and a project folder.

## Connections

Connections shows which tools are connected and how your memory is shared. Pages:

- **Tools.** One card per host with "detected" or "not detected", the hook count (installed over expected), the last capture time, and how many items wait in the spool. It lists copyable commands to install, uninstall, check, add the MCP server and run each hook. Install and uninstall stay on the command line. The card shows the commands. It does not run them.
- **Devices.** Paired devices for sync, a pairing code and a revoke button.
- **Remote access.** Private MCP links with a scope, and a revoke button.
- **Alerts** and **Team.** Alert rules and their deliveries, and team mode.
- **Health checks.** The same checks as `aletheia doctor`, with a **Run again** button.
- **History.** An audit log of every change made from the dashboard, the command line or a tool.
- **What tools receive.** The exact session-start block for the selected project, as plain text. It is the block described in [Session-start context](../concepts/session-context.md).
- **Settings.** Editable settings, saved in the hub. The API key field is masked.

## Try the dashboard with demo data

The repository has a script that fills a data directory with made-up memories. Run it from a git clone, with a temporary home and port:

```bash
export HOME=$(mktemp -d)
bun scripts/seed-demo.mjs --data /tmp/aletheia-demo --rows 150
ALETHEIA_DATA_DIR=/tmp/aletheia-demo ALETHEIA_PORT=37997 bun bin/aletheia-server.mjs
```

```text
seeded .../hub.db: {"memories":150,"facts":50,"review":9}
```

Open http://127.0.0.1:37997/?demo=1. The `?demo=1` part shows a banner that says the data is made up and came from `scripts/seed-demo.mjs`.

## Next steps

- [Quickstart](quickstart.md) - put your first memories in and open the dashboard.
- [Write rules once](../guides/write-rules-once.md) - the Rules tab and `aletheia rules sync` side by side.
- [Session-start context](../concepts/session-context.md) - what the "What tools receive" page shows.
- [Frontend internals](../06-frontend.md) - the files and routes behind the pages.
- [Troubleshooting](../guides/troubleshooting.md) - what to do when a status indicator is not ok.
