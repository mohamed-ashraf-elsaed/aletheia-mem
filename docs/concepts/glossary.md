# Aletheia glossary: terms used in the documentation

<!-- description: Plain definitions of the terms used in the Aletheia docs: memory, observation, fact, episode, rule, hook, host, hub, spool, redaction, FTS5, MCP and more. -->
<!-- keywords: aletheia glossary, memory vs observation vs fact, what is a hook, what is a spool, mcp definition, fts5 keyword search, redaction, ai coding memory terms -->

This glossary defines the words Aletheia (aletheia-mem) uses in its documentation and in its dashboard. Each term has one definition, and the terms are in alphabetical order.

## Terms

### Aletheia
The free, local memory and rules hub for AI coding tools. The npm package is `aletheia-mem` and the command is `aletheia`.

### Audit log
The `audit` table in `hub.db`. It records which actor did what, such as adding a memory, dismissing a fact or syncing rules.

### Bundle
The portable export format: a JSON Lines file that starts with a manifest line (`aletheia-bundle`, version 1) and then holds one line per memory or rule. `aletheia import bundle` reads it back. Importing the same bundle twice adds nothing the second time.

### Compression
The step that turns raw captured activity into durable records. `aletheia compress` runs it by draining the extraction queue.

### Confidence
A number from 0 to 1 on a fact that says how sure the extractor was. The rule extractor scores its facts 0.45 or 0.55. The `facts.minConfidence` setting is a floor, 0.4 by default.

### Dismiss
Hide a memory, episode, observation or fact from search and context without deleting it. `aletheia restore` brings it back. See [Memory model](../concepts/memory-model.md#dismiss-and-restore).

### E2EE
Optional end-to-end encryption for Aletheia Sync. Payloads are encrypted on the device before they are sent, so the hub holds ciphertext. Metadata such as device id, operation kind, entity id, timing and size is not hidden.

### Embedding
A list of numbers that stands for the meaning of a text. The default model gives 384 numbers per text. Aletheia stores them in `memory_vectors` and `fact_vectors` and compares them by cosine similarity.

### Entity
A named thing inside a project, such as a person, service, file, repo, library, concept or organisation. Extraction finds entities in facts and keeps their aliases.

### Episode
One raw turn or tool step, kept as source text and never edited. Every fact points to the episode it came from.

### Erase
Delete rows for good with `aletheia erase`. It writes a pre-erase export and a signed receipt that lists counts and ids. See [Privacy and redaction](../concepts/privacy.md#erase-data-with-a-receipt).

### Export
Write memories and rules to a file with `aletheia export`, as a bundle or as Markdown. Events are left out unless you pass `--events`.

### Extraction
The step that reads summaries and notes and stores up to five facts per window. A rule-based extractor runs by default. A model provider runs instead when you configure one. It runs in `aletheia compress` or in the server's background worker, never inside a hook.

### Fact
One statement with a subject, a predicate and an object, plus valid dates, a confidence and the episode it came from. A newer fact on the same subject and predicate replaces the older one. See [Memory model](../concepts/memory-model.md#how-facts-replace-or-conflict).

### Fail-open
A hook design where any internal failure ends with exit status 0 and no output, so the host keeps working.

### FTS5
SQLite's full-text search module. Aletheia uses it with BM25 ranking and the `porter unicode61` tokenizer for keyword search over memories and facts.

### Hook
A command that a host runs at a point in its life cycle, such as session start, prompt, tool use or stop. Aletheia's hooks capture activity and inject the session-start context.

### Host
The AI coding tool that runs hooks and reads rules files, for example Claude Code or Codex CLI.

### Hub
The Aletheia store and server: `hub.db` plus the loopback HTTP server, the CLI and the MCP server that read it.

### Hybrid search
Keyword search and embedding search merged with reciprocal rank fusion. It needs the optional embedding runtime. See [Search](../concepts/search.md#semantic-and-hybrid-search).

### Importance
A score from 0 to 1 on an observation. It is a weighted sum of type, recency, reinforcement, provenance and user signal, stored with its inputs.

### Managed block
The region between `<!-- aletheia:rules:begin -->` and `<!-- aletheia:rules:end -->` in a tool's rules file. Aletheia rewrites only that region and leaves the rest of the file alone.

### MCP
Model Context Protocol, the protocol a host uses to call tools on a server. Aletheia ships an MCP server with tools such as `search`, `timeline` and `get_observations`. It runs over stdio, and over HTTP through the sync hub.

### Memory
One record in the `memories` table. Its kind is observation, summary, prompt, note or event.

### Note
A memory of kind `note`: text a person saved with `aletheia save`, the MCP `save_memory` tool or the dashboard.

### Observation
A durable record of something learned or done, such as a decision, a gotcha or a bug fix. In the `memories` table it has kind `observation`. The `observations` table holds derived records that carry an importance score.

### Pin
Mark a memory so it always appears under Pinned in the session-start context and sorts first in lists.

### Private tag
The `<private>...</private>` markup you put around text that must not be stored. Aletheia replaces the block with `[private]` before it stores the text. The closing tag is required.

### Project
The unit that memories belong to. A project key is the repository folder name, or `<repo>/<worktree>` for a git worktree.

### Promote
Make a memory, episode, observation or fact global, so that every project's search and context include it. `aletheia promote` does it.

### Provider
The model service you configure for extraction: `local`, `openai`, `openrouter` or `claude-cli`. The default is `none`, which makes no model call.

### Recheck note
The text `[re-check: ... Verify before applying.]` that Aletheia appends to a stale rule in synced files and in the session-start context.

### Redaction
Replacing secrets and `<private>` blocks with markers before text is stored. It is pattern based and does not catch everything.

### REST
The HTTP API of the hub, with routes under `/v1` and `/api/hub`. It listens on loopback by default.

### Review queue
The items waiting for your decision: contradictions between facts, entity matches that are not certain, and suggested rules.

### RRF
Reciprocal rank fusion. It merges ranked lists by adding up 1 divided by (60 plus the rank) for each list. Aletheia uses it for hybrid search and to merge fact and memory results in the CLI.

### Rule
A standing instruction that you want every tool to follow, such as "Run the tests before you commit." See [Rules](../concepts/rules.md).

### Scope
Where something applies. A memory or fact is `project` or `global`. A rule is `everywhere`, `project` or `situation`.

### Semantic search
Search by meaning with embeddings, so a question can match a memory that shares no words with it. It is optional and off by default.

### Session-start context
The block of pinned and recent memories, recent requests, facts and rules that a new session receives. See [Session-start context](../concepts/session-context.md).

### Spool
The local file `spool/hook-spool.jsonl` where a hook parks an already-redacted item when it cannot reach the database. The next hook that can reach the database writes it.

### Stale rule
A rule that is flagged for re-check because evidence behind it changed, or because nobody confirmed it within the review window. The flag never turns the rule off.

### Summary
A session summary. A hook stores the host's last assistant message, and extraction later replaces its text with a short summary built from facts. The row keeps its id.

### Supersede
What a newer fact does to an older fact about the same subject and predicate. The older fact is closed with an end date and marked `superseded`. It is not deleted.

### Sync
Aletheia Sync: a self-hosted, append-only operation log that moves memory between your devices after you pair them. Payloads are redacted before they leave the device.

### Token economics
The estimated token counts in the session-start block and in `aletheia context economics`. A token is estimated as the number of characters divided by four.

## Next steps

- [Memory model](../concepts/memory-model.md) - memories, facts, episodes and rules in detail.
- [Rules](../concepts/rules.md) - scopes, stale rules and the managed block.
- [Privacy and redaction](../concepts/privacy.md) - redaction, the private tag and erase.
- [How Aletheia works](../start/how-it-works.md) - capture, extraction and recall end to end.
