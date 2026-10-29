# Model providers: none, Claude CLI, OpenAI-compatible and Ollama

<!-- description: Choose how Aletheia extracts facts: rule-based with no model, the Claude CLI, an OpenAI-compatible API or Ollama, plus env vars and privacy notes. -->
<!-- keywords: aletheia model provider, aletheia ollama, aletheia openai compatible, ALETHEIA_PROVIDER, fact extraction local model, aletheia output language -->

Aletheia (aletheia-mem) runs without any model. A model provider is optional, and it only changes how facts are extracted from your session summaries and notes. This page lists the providers, the environment variables, what leaves your machine, and what the measurements say.

## The default: no provider

With nothing set, `ALETHEIA_PROVIDER` is `none`. Extraction uses a rule extractor that makes no network call. It accepts a plain "subject verb object" sentence and skips everything else, so it is quiet rather than clever.

```bash
aletheia compress
```

```text
Extraction mode: rules; keyword only
queue: {"pending":0,"running":0,"done":1,"failed":0,"oldestPendingEpoch":null}
last: 1 memories, 1 window(s), 0 new fact(s), 0 rejected, 0 embedded
```

The measured limits, from the project README (retrieval numbers on LoCoMo, not answer accuracy):

- Facts from the rule extractor add about 0.4 points of Recall@5. The README text says 57.3% to 57.7%, while its table lists the raw-turns baseline as 57.4%. The README also reports that the dataset's own facts added 7.3 points. These are measured-by-us numbers.
- The first run with a small local model failed. Ollama `llama3.2:1b` answered a trivial chat call, but the fact-extraction prompt over a two-turn window returned HTTP 500 after 4 minutes 41 seconds, and no fact was stored. The raw note is in [provider-note.txt](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/results/2026-10-26/provider-note.txt).
- No provider extraction recall number is published. Answer accuracy is not measured.

See [Benchmarks](../project/benchmarks.md) for the full table.

## What a provider is used for

I read the code for every place a provider is called.

| Use | Trigger | Needs |
|---|---|---|
| Fact extraction | The server's background worker, and `aletheia compress` | A provider from `ALETHEIA_PROVIDER` or `ALETHEIA_PROVIDERS` |
| Compress events into observations | The **Compress now** button in Knowledge, Import and export | `ALETHEIA_PROVIDER` other than `none` |
| Work view refresh (goals, grouping, reviews, story) | The server, every 10 minutes, when `ALETHEIA_PROVIDER` is not `none` | The claude-mem database and `python3` |
| Plain-language card text ("human copy") | The server, when both `ALETHEIA_OPENAI_API_KEY` and `ALETHEIA_OPENAI_MODEL` are set | Those two variables. It ignores `ALETHEIA_PROVIDER`. |

Not model calls:

- Summaries. Session and project summaries are built from stored facts as a bullet list. I found no model call in that code.
- Reranking. The cross-encoder in `src/hub/rerank.mjs` is used by the benchmark script. I found no call to it from the CLI, the server or the MCP tools.
- Embeddings. They are a separate optional feature (see below).

If you want a provider for extraction only, turn the Work view refresh off. Without this, `ALETHEIA_PROVIDER=openai` on the server prints `refresh   : on (openai, every 10 min)`.

```bash
ALETHEIA_AUTO_REFRESH=false
```

## Providers and presets

`ALETHEIA_PROVIDER` takes one of these values. Anything else stops with `Unknown provider "<name>". Use one of: none, local, openai, openrouter, claude-cli, fake.` The value `fake` is for tests.

| Value | What it calls |
|---|---|
| `none` | Nothing. Rule extractor only. |
| `local` | An OpenAI-compatible endpoint at `ALETHEIA_LOCAL_BASE_URL`. The default is Ollama's `http://127.0.0.1:11434/v1/chat/completions`. |
| `openai` | `ALETHEIA_OPENAI_BASE_URL`, default `https://api.openai.com/v1/chat/completions`, with `ALETHEIA_OPENAI_API_KEY`. |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` with `ALETHEIA_OPENAI_API_KEY`. |
| `claude-cli` | The `claude` program in print mode. |

`ALETHEIA_PROVIDERS` takes an ordered list of presets: `ollama`, `lmstudio`, `llamacpp`, `local`, `openai`, `openrouter`, `claude-cli` and `anthropic-compatible`. `ALETHEIA_PROVIDER=ollama` is not valid; `ollama` is a preset name for the list only.

| Preset | URL |
|---|---|
| `ollama` | `http://127.0.0.1:11434/v1/chat/completions` |
| `lmstudio` | `http://127.0.0.1:1234/v1/chat/completions` |
| `llamacpp` | `http://127.0.0.1:8080/v1/chat/completions` |
| `local` | `ALETHEIA_LOCAL_BASE_URL` |
| `openai`, `openrouter` | The public endpoints above, API key required |
| `anthropic-compatible` | `ALETHEIA_ANTHROPIC_BASE_URL`. There is no default, because Anthropic publishes no OpenAI-shaped chat endpoint. Point it at a gateway that has one. |

A selected provider that is incomplete stops with a message that names the setting:

```text
Provider "openai" needs a model: set ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL.
Provider "ollama" needs a model: set ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL.
Provider "anthropic-compatible" needs a URL: set ALETHEIA_ANTHROPIC_BASE_URL.
```

The extraction worker in the server does not stop on a bad provider setting. It falls back to the rule extractor. The Work view refresh is different: with `ALETHEIA_PROVIDER=openai` and no model, `aletheia-server` printed the `needs a model` error and exited in my test. Set `ALETHEIA_AUTO_REFRESH=false` to avoid that path.

## Set one up

Local model with Ollama. Pull a model first with Ollama. The model name is yours to choose.

```bash
ALETHEIA_PROVIDER=local ALETHEIA_OPENAI_MODEL=llama3.2:1b aletheia compress
```

The variable `ALETHEIA_OPENAI_MODEL` names the model for every provider except `claude-cli`. Use `ALETHEIA_EXTRACT_MODEL` to name a different model for extraction.

OpenAI-compatible hosted API:

```bash
ALETHEIA_PROVIDER=openai \
ALETHEIA_OPENAI_API_KEY=<your key> \
ALETHEIA_OPENAI_MODEL=<model name> \
aletheia compress
```

Set `ALETHEIA_OPENAI_BASE_URL` to use another OpenAI-style endpoint with the `openai` value.

Claude CLI:

```bash
ALETHEIA_PROVIDER=claude-cli aletheia compress
```

The code runs `claude -p --output-format json --no-session-persistence --tools "" --setting-sources ""` and sends the prompt on standard input. It uses `haiku` for extraction and `sonnet` for summaries unless you set `ALETHEIA_EXTRACT_MODEL` or `ALETHEIA_SUMMARY_MODEL`. `ALETHEIA_CLAUDE_BIN` names the program. I did not run this provider for this page.

For the server, set the same variables in the environment of the process. For a systemd service that means `Environment=` lines. See [Run as a service](run-as-a-service.md).

The Settings page also has provider fields. I found no code that reads the saved values when the provider is built. Use environment variables.

## Fallback chain

`ALETHEIA_PROVIDERS=ollama,openai` tries the providers in order.

- A quota error, HTTP 408, 425, 429 or 5xx, or a timeout moves the call to the next provider. The failed provider rests for `ALETHEIA_PROVIDER_COOLDOWN_MS` (60,000 by default).
- An error the service can answer, such as a 400, is raised. It is not hidden by a fallback.
- At most `ALETHEIA_MAX_CONCURRENT` requests run at once (1 by default).
- `ALETHEIA_PROVIDER_TIMEOUT_MS` (60,000 by default) applies to the chain only. A single provider uses a 5 minute timeout.
- A failed extraction job retries with backoff, up to 5 attempts. After that it is marked failed, and `aletheia doctor` shows it in the `queue` row.

One display quirk: with only `ALETHEIA_PROVIDERS` set, the server banner prints `extraction: worker on (rule-based)` and `aletheia compress` prints `Extraction mode: none`. Both read `ALETHEIA_PROVIDER`. The chain is still used for the calls.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_PROVIDER` | `none` | One provider, see above. |
| `ALETHEIA_PROVIDERS` | empty | Ordered chain of presets. Wins over `ALETHEIA_PROVIDER` when set. |
| `ALETHEIA_OPENAI_API_KEY` | empty | Key for `openai`, `openrouter` and the presets with a key. |
| `ALETHEIA_OPENAI_MODEL` | empty | Model for extraction. |
| `ALETHEIA_OPENAI_BASE_URL` | `https://api.openai.com/v1/chat/completions` | Endpoint for `openai`. The README table lists an OpenRouter URL as the default; the code uses the OpenAI URL. |
| `ALETHEIA_LOCAL_BASE_URL` | Ollama URL | Endpoint for `local`. |
| `ALETHEIA_ANTHROPIC_BASE_URL` | empty | Gateway for `anthropic-compatible`. |
| `ALETHEIA_EXTRACT_MODEL`, `ALETHEIA_SUMMARY_MODEL` | empty | Per-stage model names. |
| `ALETHEIA_CLAUDE_BIN` | `claude` | The Claude CLI program. |
| `ALETHEIA_FACT_MAX_EPISODES` | 20 | Episodes per request. |
| `ALETHEIA_FACT_CHAR_BUDGET` | 12000 | Characters per request. |
| `ALETHEIA_PRICE_IN_PER_1K`, `ALETHEIA_PRICE_OUT_PER_1K` | 0 | Your own prices, for the cost estimate. |
| `ALETHEIA_MODE` | `code` | Extraction style: `code`, `chill`, `language-en` or `language-es`. |
| `ALETHEIA_OUTPUT_LANGUAGE` | empty | Output language, see below. |
| `ALETHEIA_AUTO_REFRESH` | on | `false` turns the Work view refresh off. |

## What is sent to the model

I started a local mock endpoint, pointed `ALETHEIA_PROVIDER=local` at it, queued one job and recorded the request body. A hosted provider receives the same body.

The request has the keys `model`, `stream`, `temperature` and `messages`. The message holds:

- the fixed extraction instructions, the mode line and the language line;
- the project name and the episode ids;
- one log line per source: id, timestamp, tool name, kind and the text.

The sources are session summaries (the last assistant message that the Stop hook captured) and saved notes. Prompts and tool events are not fact sources, so they are not sent by this path.

The text is redacted again right before the call. In the test, a summary imported from claude-mem held a fake AWS key id, and the request carried `[redacted:aws-key-id]`. The `Authorization` header was absent because no key was set. Facts that come back are redacted again before storing.

What the redaction does not cover:

- The Compress now route sends the title and the first 400 characters of the text of event rows, and only the title of prompt rows. They were redacted when captured, and that route does not redact again.
- I found no call to the redaction function in the Work view refresh code or in the human copy code.
- Redaction is pattern-based and cannot be complete. See [Privacy and redaction](../concepts/privacy.md).

## Cost and privacy notes

- A local provider keeps the text on your machine. A hosted provider receives the redacted text above, under that provider's terms. `claude-cli` sends it through your Claude login.
- Aletheia records an estimate for every call: tokens are characters divided by 4, not the vendor's count. Prices default to 0, because this project does not guess a vendor price. Set the two price variables to get a cost estimate.
- Each request is bounded by the episode and character budgets above, and each episode is cut to 2,000 characters.
- Extraction runs after sessions end, not inside a hook. Hooks never call a model.
- The rule extractor makes no network call.

### Embeddings are separate

Semantic search and fact vectors use an optional package, `@huggingface/transformers`. They need no provider. They run only from `aletheia compress`, `aletheia embed` and `aletheia search --semantic`, and only when the package can be found. The first use downloads a model, about 35 MB according to the code comment. In a temporary home, my first `aletheia compress` with no provider set created a 34 MB model folder at `~/.aletheia/models`, because the package was available on this machine. That is a network download you did not configure a provider for. Set `ALETHEIA_EMBED_FACTS=0` to skip it in `aletheia compress`. Without the package installed, none of this runs.

## Output language

`ALETHEIA_OUTPUT_LANGUAGE` and `aletheia language` set the language of extracted facts. The setting adds one line to the model prompt. It has no effect on the rule extractor, which does not translate.

```bash
aletheia language set es --project shop
aletheia language set pt_BR
aletheia language
aletheia language set "" --project shop
```

```text
Output language for shop: es
Output language for default: pt-br
shop                     es
default                  pt-br
Cleared the output language for shop; it follows the extraction mode.
```

A language tag is checked when you set it. Use a BCP 47 tag such as `en`, `es` or `pt-BR`. The tag is stored in lower case. A bad tag stops with `"<text>" is not a language tag.`

The order of precedence is: the project's saved language, then the saved `default` language, then `ALETHEIA_OUTPUT_LANGUAGE`, then the extraction mode. An empty value clears a saved language. The prompt keeps code, paths, names and identifiers unchanged.

## Next steps

- [Facts and contradictions](../33-facts.md) - the quality gate that every extracted fact passes.
- [Privacy and redaction](../concepts/privacy.md) - what is redacted, and when.
- [Configuration reference](../reference/configuration.md) - every environment variable.
- [Benchmarks](../project/benchmarks.md) - the retrieval numbers behind the default.
- [Troubleshooting](troubleshooting.md) - failed jobs and doctor output.
