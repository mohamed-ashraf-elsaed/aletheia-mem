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
| `narration` | The text is about the project, not the conversation or a moment: no first/second person (`I`, `we`, `you`, `your`, `my`), no `now`, `today`, `yet`, `currently` or `right now`, no progress/status phrases (`is running`, `are running`, `is done`, `are done`, `gone`, `in progress`, `waiting on`, `will be`, `has been`, `was created`, `not allowed`, `denied`), no `this session`, `the owner`, `tell me` or `next session`, and no imperative opening (`Do`, `Don't`, `Run`, `Open`, `Merge`, `Publish`, `Wait`). |
| `word_count` | 3–40 words in the whole text. |
| `char_count` | At most 200 characters in the whole text. |
| `subject_words` | A subject of 1–8 words. |
| `subject_continuation` | The subject does not start with `and`, `but`, `then`, `how`, `to`, `do` or `not`. |
| `subject_pronoun` | The subject does not start with a bare pronoun/demonstrative such as `There`, `It`, `This` or `Everything`. |
| `object_mid_clause` | The object does not end on a dangling conjunction, preposition, article, auxiliary or relative word. |
| `confidence_floor` | The stored confidence is at least `facts.minConfidence`. |

The confidence calculation is unchanged; the floor only blocks storage below the setting.

The rule-based extractor splits a source into sentences before applying this gate. A dot is a sentence boundary only
when it is followed by whitespace or the end of the text, so a dot inside a version number (`20.19.6`), an IP address
(`127.0.0.1`), a file name (`config.toml`), a domain (`example.com`) or a URL stays in its sentence instead of
fragmenting it.

## 33.3 Confidence floor

`facts.minConfidence` is stored in the Hub settings table under `ui.settings.facts.minConfidence`. The range is
0.3 to 0.9 and the default is 0.4. The rule-based extractor stores facts at 0.45 (0.35 when the object is inferred), so a floor above 0.45 stops it from storing any fact; raise the floor only with a model provider. It can be changed through the settings UI, `GET`/`PUT /api/hub/settings`, or
directly in the settings table.

## 33.4 Cleaning existing facts

```
aletheia facts clean                           # dry run (default): counts and the first 10 examples per reason
aletheia facts clean --apply                   # dismiss each failing fact with reason quality:<reason>
aletheia facts clean --ineligible-sources      # also reject facts whose source episode kind is not summary or note
aletheia facts clean --apply --ineligible-sources
```

`--apply` uses the normal dismissal path, so every row is reversible with `aletheia restore fact:<id>`. Nothing
is deleted. `--ineligible-sources` adds the reason `ineligible_source` for a fact whose source episode kind is not
`summary` or `note`; without the flag those facts are left alone.

## 33.5 Session-start context

The session-start Facts section already skips dismissed facts. Each fact line is capped at 140 characters so a
single long fact cannot dominate the context.

The `context.facts` setting controls which facts the section lists, and is stored under
`ui.settings.context.facts`:

| Value | Behaviour |
|---|---|
| `auto` (default) | List a fact only when it is pinned (its owning observation is pinned), its extractor mode is `provider`, or its confidence is at least 0.6. The rule extractor's 0.45/0.35 output is left out. |
| `on` | Keep the historical behaviour: list up to 10 active facts. |
| `off` | Hide the Facts section entirely. |

It can be changed through the settings UI, `GET`/`PUT /api/hub/settings`, or directly in the settings table. The
measured context-economics line counts only what is actually listed.
