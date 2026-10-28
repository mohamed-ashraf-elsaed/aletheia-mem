# 33. Facts

Facts are the atomic, declarative pieces of memory that sit under summaries, search and the session-start
context. They are extracted from captured memory, never from a model's live output.

## 33.1 Eligible sources

Only two memory kinds are fact sources:

| Kind | Meaning |
|---|---|
| `summary` | An assistant's session summary, captured by a Stop/SessionEnd hook. |
| `note` | A note saved by a person (UI, CLI or MCP). |

Everything else is deliberately not a fact source. A `prompt` is an instruction or a request, not a fact about
the world, and an `event` is tool output or file contents — it often carries line-number prefixes, code, and
other noise that produces junk facts. Raw back-filled transcripts are excluded for the same reason.

## 33.2 Quality gate

Before a candidate fact is stored it must pass this gate. The first failing check is the reason code.

| Reason | Rule |
|---|---|
| `unbalanced_quotes` | An even number of `"` and of `'` in the whole text. |
| `unbalanced_brackets` | Matching counts for `(` and `)`, and for `[` and `]`. |
| `escaped_whitespace` | No literal `\n`, `\t` or `\r`. |
| `code_token` | No `$`, `->`, `::`, `=>`, braces, backticks, HTML tags, or uppercase SQL keywords. |
| `word_count` | 3–40 words in the whole text. |
| `char_count` | At most 200 characters in the whole text. |
| `subject_words` | A subject of 1–8 words. |
| `subject_continuation` | The subject does not start with `and`, `but`, `then`, `how`, `to`, `do` or `not`. |
| `subject_pronoun` | The subject does not start with a bare pronoun/demonstrative such as `There`, `It`, `This` or `Everything`. |
| `object_mid_clause` | The object does not end on a dangling conjunction, preposition, article, auxiliary or relative word. |
| `confidence_floor` | The stored confidence is at least `facts.minConfidence`. |

The confidence calculation is unchanged; the floor only blocks storage below the setting.

## 33.3 Confidence floor

`facts.minConfidence` is stored in the Hub settings table under `ui.settings.facts.minConfidence`. The range is
0.3 to 0.9 and the default is 0.5. It can be changed through the settings UI, `GET`/`PUT /api/hub/settings`, or
directly in the settings table.

## 33.4 Cleaning existing facts

```
aletheia facts clean          # dry run (default): counts and the first 10 examples per reason
aletheia facts clean --apply  # dismiss each failing fact with reason quality:<reason>
```

`--apply` uses the normal dismissal path, so every row is reversible with `aletheia restore fact:<id>`. Nothing
is deleted.

## 33.5 Session-start context

The session-start Facts section already skips dismissed facts. Each fact line is capped at 140 characters so a
single long fact cannot dominate the context.
