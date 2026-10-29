# Aletheia memory model: memories, facts, episodes and rules

<!-- description: What Aletheia stores in hub.db: memory kinds and types, facts, episodes, entities, rules, project and global scope, pin, dismiss and importance. -->
<!-- keywords: aletheia memory model, memory kinds and types, observation vs fact, project and global scope, pin dismiss restore memory, importance score, hub.db tables -->

Aletheia (aletheia-mem) keeps everything it remembers in one SQLite file, `hub.db`, in its data directory (`~/.aletheia` by default). A memory is one stored record. Facts, episodes, entities and rules sit beside memories and point back at the record they came from.

## Two layers in one file

The first layer is the `memories` table. Hooks, `aletheia save`, the MCP `save_memory` tool, the REST API and the importers write to it. Search and the session-start context read it. The Knowledge tab of the dashboard shows it.

The second layer is derived. An extraction step reads some memories and builds episodes, facts, entities, generated summaries and links between them. Extraction runs when you run `aletheia compress`, or in the background while `aletheia-server` is running. It never runs inside a hook.

Rules, settings, dismissals and an audit log live in the same file.

## Kinds of stored things

| Thing | What it is | Written by | Table |
|---|---|---|---|
| Memory | One record: a prompt, tool event, session summary, note or observation | hooks, `save`, MCP, REST, imports | `memories` |
| Episode | One raw turn or tool step, kept as source text and never edited | extraction, `import transcripts`, `watch` | `episodes` |
| Observation | A derived record with an importance score, a pin and a status | extraction, schema migration | `observations` |
| Fact | One statement (subject, predicate, object) with dates and a confidence | extraction from summaries and notes | `facts` |
| Entity | A named thing inside a project: person, service, file, repo, library, concept or org | extraction | `entities`, `entity_aliases`, `fact_entities` |
| Summary | Text built from facts, stored with the ids of the facts it came from | extraction, `aletheia summarize` | `summaries`, plus a memory row |
| Rule | A standing instruction you want every tool to follow | you, MCP `add_rule`, approved suggestions, imports | `rules`, `rule_evidence` |

The two layers are not mirrors. A memory you save today does not get a row in `observations`. Only generated summaries and rows copied during a schema migration do.

## Memory kinds

Every memory has a `kind` that says where it came from.

- `observation`: a durable record of something learned or done. The claude-mem importer and the provider-based compress route write these. A `POST /v1/memories` call without a kind also stores `observation`.
- `summary`: a session summary. At the end of a turn or session, a hook stores the host's last assistant message. Extraction later replaces that text with a short summary built from facts. The row keeps its id.
- `prompt`: a prompt you typed, captured by a hook.
- `note`: text a person saved with `aletheia save`, the MCP `save_memory` tool or the note box in the dashboard.
- `event`: one tool call and its output, cut to 1,500 characters. Events stay out of the session-start context, the timeline, the default export and the embeddings.

## Memory types

The `type` column is a label for what the memory is about. It is separate from `kind`. A note saved with `--type decision` has kind `note` and type `decision`.

The session-start context marks each memory with one letter:

```
Legend: b=bugfix f=feature r=refactor c=change d=discovery D=decision n=note g=gotcha e=event s=summary ?=other
```

The store keeps any type string up to 40 characters, and the legend shows `?` for a type it does not know. The MCP `save_memory` tool accepts decision, gotcha, bugfix, feature, refactor, change, discovery and note.

## Scope: project and global

Every memory, episode, observation and fact has a project and a scope. The project key is the repository folder name, or `<repo>/<worktree>` for a git worktree. Hooks derive it from the working directory the host reports. A folder with no git checkout uses its own name.

The scope is `project` by default. A project read returns that project's rows plus every row promoted to `global`. Promote a row to make it visible in every project:

```bash
aletheia promote memory 6
```

```
{
  "type": "memory",
  "id": 6,
  "scope": "global",
  "project": "other"
}
```

The row keeps its project label and the change is written to the audit log. There is no command to turn a promoted row back into a project row. To stop seeing it, [dismiss it](#dismiss-and-restore). Pass `--scope all` to `aletheia search` or `aletheia context` to read every project at once.

## Pin

A pinned memory is listed under `## Pinned` in the session-start context, up to 50 of them, whatever the recent-memory limit is. Pinned memories also sort first in the default Knowledge list. Pin when you save, or later from the dashboard:

```bash
aletheia save "Use bun, not npm, for every script in this repo" --project demo --type decision --pin
```

```
Saved as #1.
```

The MCP `save_memory` tool takes `pinned: true`. `PATCH /api/hub/memories/<id>` with `{"pinned": true}` pins an existing row.

## Dismiss and restore

Dismiss hides a memory, episode, observation or fact. It deletes nothing. A dismissed row disappears from search, lists and the session-start context. Restore brings it back.

```bash
aletheia dismiss 5 --reason "wrong after the rewrite"
aletheia dismissed
aletheia restore memory:5
```

```
Dismissed memory #5. Restore with: aletheia restore memory:5
memory:5  2026-10-29T19:50:36.367Z  wrong after the rewrite
Restored memory #5.
```

A bare number means a memory. Use `fact:12`, `observation:12` or `episode:12` for the other types. Only `aletheia prune --apply` removes dismissed rows for good, and it leaves episodes in place. To delete on purpose and get a signed receipt, use [aletheia erase](privacy.md#erase-data-with-a-receipt).

## Importance score

Observations carry an importance score between 0 and 1. It is a weighted sum, and every input is stored with the score so you can see why it came out as it did.

```bash
aletheia importance recompute --project w
```

```
{
  "updated": 2,
  "formula": "importance-v1",
  "weights": {
    "type": 0.35,
    "recency": 0.25,
    "reinforcement": 0.2,
    "provenance": 0.1,
    "user": 0.1
  },
  "halfLifeDays": 90
}
```

- **Type** (0.35): decision and gotcha score 1, bugfix 0.9, feature 0.8, discovery 0.7, refactor and summary 0.6, change 0.5, note 0.4, event 0.2. An unknown type scores 0.4.
- **Recency** (0.25): halves every 90 days. A pinned row does not decay.
- **Reinforcement** (0.2): the number of facts attached to the observation, capped at 5.
- **Provenance** (0.1): 1 when the observation has an episode or a fact behind it, 0.5 when it has none.
- **User signal** (0.1): 1 when pinned, 0.8 when edited, 0 otherwise.

The score has two uses. The Facts table shows the linked observation's importance. The retention rule never marks a fact cold while its observation is pinned or scores 0.8 or higher. Search ranking and the order of the session-start context do not use it.

## How facts replace or conflict

A fact is one statement with a subject, a predicate and an object, for example "sync service" / "stores" / "its outbox in SQLite". It also carries the text, a valid-from and valid-to date, the date it was recorded, a confidence from 0 to 1, a status (`active`, `superseded` or `cold`), the extractor mode (`rules` or `provider`) and the episode it came from. A fact with no episode is rejected.

Only summaries and notes are fact sources. A prompt is an instruction, and an event is tool output, so neither produces facts. A candidate fact must also pass a quality gate before it is stored: balanced quotes and brackets, no code tokens, no narration about the conversation, 3 to 40 words and at most 200 characters.

When a new fact arrives for the same project, subject and predicate:

- **Same object:** it is a duplicate and is not stored twice.
- **Different object, later valid-from date:** the older fact is closed. Its valid-to date is set, its status becomes `superseded`, and the new fact records which fact it replaces.
- **Different object, same valid-from date:** both stay active, both confidences drop by 0.1, and a `contradiction` item goes to the review queue for you to decide.
- **Different object, earlier valid-from date:** the new fact is stored as history and the current fact stays current.

Nothing is deleted. `aletheia search --history` shows closed facts, `--as-of DATE` shows what was valid on a date, and the MCP `fact_history` tool lists how one subject changed. The quality gate, the confidence floor and `aletheia facts clean` are in [Facts and contradictions](../33-facts.md).

## Where each part lives in hub.db

| Tables | Holds |
|---|---|
| `memories`, `memories_fts`, `memory_files`, `memory_vectors` | memories, their full-text index, the file paths they touched, optional embeddings |
| `episodes` | raw turns and tool steps |
| `observations` | derived records with importance, pin and status |
| `facts`, `facts_fts`, `fact_vectors` | facts, their full-text index, optional embeddings |
| `entities`, `entity_aliases`, `fact_entities` | named things and the facts that mention them |
| `memory_links`, `memory_keys` | provenance links such as `derived_from`, `supersedes` and `mentions`, and extra search keys |
| `summaries` | generated summaries with their source ids |
| `rules`, `rule_evidence`, `rule_suggestions`, `rule_suggestion_quotes` | rules, what each rests on, and suggested rules waiting for a decision |
| `dismissals`, `review_queue` | hidden rows and items waiting for your review |
| `jobs`, `fact_usage` | the extraction queue and the tokens each extraction used |
| `session_end`, `settings`, `audit` | session-end marks, saved settings, and who changed what |

The schema is in [store.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/store.mjs).

## Next steps

- [Search](../concepts/search.md) - how memories and facts are found and ranked.
- [Session-start context](../concepts/session-context.md) - which memories, facts and rules a new session receives.
- [Rules](../concepts/rules.md) - standing instructions, scopes and syncing.
- [Facts and contradictions](../33-facts.md) - the quality gate and the confidence floor.
- [Privacy and redaction](../concepts/privacy.md) - what is stored, what is redacted and how to erase.
