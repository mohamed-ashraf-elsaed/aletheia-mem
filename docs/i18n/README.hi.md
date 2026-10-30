> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 5e99c552b3f0ffd2e8c156ad87b25130ae71db15ea39db8ad52c7a5c669203f2

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**AI कोडिंग टूल के लिए मुफ़्त, लोकल मेमोरी और नियम हब।**<br>Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf और OpenCode के लिए स्थायी मेमोरी: claude-mem का लोकल विकल्प, जो किसी एक टूल से बंधा नहीं है।

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20Windows%20%28CI%20tested%29-lightgrey)

**स्थिति: अल्फ़ा।** मेमोरी इंजन और इंस्टॉलर टेस्ट में काम करते हैं। वास्तविक Claude Code, Command Code, Codex CLI और OpenCode ने जनरेट की गई MCP कॉन्फ़िग को सूचीबद्ध किया। लेखक की मशीन पर वास्तविक Claude Code (दो दिनों का उपयोग), Command Code (एक छोटा सत्र) और Codex CLI (एक इंटरैक्टिव सत्र) के सत्रों में हुक चले, सभी एक उपयोगकर्ता के साथ, सीक्रेट रिडैक्ट किए गए और चेकर को कोई लीक नहीं मिला। Cursor, Gemini CLI, Windsurf या OpenCode के अंदर अभी तक कोई हुक नहीं चला है, और उत्तर की सटीकता मापी नहीं गई है। CI टेस्ट सूट को Linux, macOS और Windows पर चलाता है। Windows पर दो हुक जाँच (Windsurf और Gemini CLI) छोड़ दी जाती हैं और वहाँ कोई वास्तविक टूल आज़माया नहीं गया, इसलिए Windows का परीक्षण केवल CI में हुआ है।

मशीनी अनुवाद `docs/i18n/` में हैं; अंग्रेज़ी संस्करण मानक है। किसी भी अनुवाद की मूल वक्ता द्वारा समीक्षा नहीं हुई है।

## यह क्या है

Aletheia AI कोडिंग टूल के लिए मुफ़्त, लोकल मेमोरी और नियम हब है। कोई भी टूल MCP, REST या CLI से एक ही SQLite स्टोर पढ़ता है, और आपके नियम हर टूल की अपनी निर्देश फ़ाइल में लिखे जाते हैं। इसे Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf और OpenCode को एक साझा, स्थायी मेमोरी देने के लिए बनाया गया है; नीचे के सेक्शन बताते हैं कि इनमें से किन टूल को वास्तविक इंस्टॉल पर जाँचा गया है।

हर कोडिंग एजेंट सेशन के बीच भूल जाता है, और हर एक अलग तरह से याद रखता है। Aletheia मेमोरी और नियम एक बार आपकी मशीन पर रखता है और हर टूल को उसी प्रारूप में पढ़ने देता है जो वह पहले से समझता है। कोई खाता नहीं, कोई टेलीमेट्री नहीं, और जब तक आप मॉडल प्रदाता कॉन्फ़िगर नहीं करते, कोई नेटवर्क कॉल नहीं। यह केवल लूपबैक पर सुनता है।

## तीन कमांड में इंस्टॉल

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

<http://127.0.0.1:37790> खोलें। [Bun](https://bun.sh) 1.1 या नया चाहिए। `npm install` का चरण नहीं है क्योंकि कोई रनटाइम निर्भरता नहीं है।

पहली स्क्रीन पर पाँच टैब हैं: **Home** (यहीं से शुरू करें: एक प्रोजेक्ट चुनें और सरल शब्दों में देखें कि Aletheia उसके बारे में क्या जानता है, उसके नियम क्या हैं और कौन से टूल जुड़े हैं), **Activity** (आपके टूल ने जिन अनुरोधों और सेशन पर काम किया, उनका Aletheia का अपना दृश्य), **Knowledge** (खोजें, संपादित करें, पिन करें, छिपाएँ, निर्यात करें), **Rules** (एक बार लिखें और सिंक करें) और **Connections** (इंस्टॉलर स्थिति और ऑडिट)।

## कैप्चर कैसे काम करता है

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

`--write` के बिना कमांड ड्राई रन है। यह हर वह फ़ाइल छापता है जिसे बदलेगा और कुछ नहीं लिखता। बदली गई हर फ़ाइल की टाइमस्टैम्प वाली बैकअप कॉपी बनती है। हुक इंस्टॉल किए गए `aletheia` कमांड को कॉल करते हैं, स्टोर करने से पहले रहस्य और `<private>` ब्लॉक हटाते हैं, डेटाबेस उपलब्ध न होने पर डिस्क पर स्पूल करते हैं, और होस्ट को कभी न रोकें इसलिए हमेशा 0 से बाहर निकलते हैं। कम्प्रेशन कतार में जाता है, हुक के अंदर नहीं चलता। हर होस्ट के विवरण और सटीक हुक सूची: [docs/25](../../docs/25-installers.md)।

## किन टूल से जुड़ता है

Aletheia किसी एक टूल पर निर्भर नहीं है। यह MCP (stdio और HTTP), सादा REST API और CLI बोलता है, और वह निर्देश फ़ाइल लिखता है जिसे हर टूल पहले से पढ़ता है। क्या जाँचा गया और क्या नहीं:

| Check | Result |
|---|---|
| MCP server against the official MCP SDK client | Passes (protocol versions 2025-11-25 to 2024-11-05) |
| Config formats for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI, Windsurf, OpenCode | Written from official docs fetched 2026-10-26 and tested against fixtures. **Not tested on a real install.** |
| Claude Desktop MCP config | Documented and merge-tested against a fixture; not opened in the app |
| Rules files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurf/rules/*.md`, Copilot, Aider | Written and tested in temp folders (`docs/verification/rules-targets.md`) |
| Any of the above **on a real install of that tool** | **Not tested yet.** Reports welcome. |
| Automatic capture through a tool's hooks | Built for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf. Each installed hook command is exercised end to end in a temp HOME with a recorded payload; none has been run inside the tool. OpenCode is MCP+rules. |

<!-- gen:tools -->
| Tool | Level | Verification | Hook events installed |
|---|---|---|---|
| claude-code | full | MCP connection 2.1.312 on 2026-10-27; hooks ran in real sessions over two days of use; one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | MCP connection 1.88.1 on 2026-10-27; hooks ran in one short session; one user on one machine | SessionStart, PostToolUse, Stop |
| cursor | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | MCP connection 0.130.0 on 2026-10-27; hooks ran in one interactive session (reviewed once with /hooks); one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | MCP connection 1.18.33 on 2026-10-27; hooks not run | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says MCP connection when the real CLI listed the server. Hooks have run in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run._
<!-- /gen:tools -->

## मापे गए आंकड़े

LoCoMo पर, जैसा भेजा जाता है वैसा claude-mem 15.2.0 बनाम यह प्रोजेक्ट। **ये रिट्रीवल के आंकड़े हैं, उत्तर की सटीकता नहीं।**

<!-- gen:bench -->
| Run | Questions | Recall@5 | MRR | ms/query |
|---|---|---|---|---|
| claude-mem 15.2.0 (as shipped), raw turns — measured-by-us | 1,536 | 36.0% | 0.285 | p50 1,699 ms, p95 2,824 ms (idle, 40 queries) |
| Raw turns, all 10 conversations | 1,536 | 57.4% | 0.497 | 3.72 |
| Dataset facts, all 10 | 1,536 | 64.8% | 0.591 | 5.53 |
| Dataset facts, 3 conversations | 383 | 67.4% | 0.620 | 5.80 |
| Dataset facts, 3 conversations, + rerank | 383 | 73.9% | 0.686 | 251.16 |
| Dataset facts, all 10, + rerank | 1,536 | 72.3% | 0.680 | 646.19 |
| Our rule-extracted facts, all 10 | 1,536 | 57.7% | 0.492 | 4.94 |

_Retrieval only: Recall@5 asks whether the gold evidence is in the top five results. It is not answer accuracy. Every row is measured-by-us on the same LoCoMo questions; no vendor-claimed benchmark number is in this table. Generated from bench/results/2026-10-26/ (bench/claude-mem-baseline.mjs, raw-turns.json (hybrid), dataset-facts.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts+rerank), dataset-facts-rerank.json (hybrid+facts+rerank), our-facts-rules.json (hybrid+facts)); re-run with `bun scripts/compare-bench.mjs`._
<!-- /gen:bench -->

तालिका इस तरह पढ़ें:

- **Recall@5 रिट्रीवल है।** यह पूछता है कि सही साक्ष्य शीर्ष पाँच परिणामों में है या नहीं। यह नहीं बताता कि उत्तर सही था या नहीं।
- **उत्तर की सटीकता मापी नहीं गई है।** अभी कोई रीडर या जज हार्नेस नहीं है।
- **जब दोनों सिस्टम को समान निकाले गए तथ्य मिलते हैं तो अंतर 2× नहीं है।** गति का अंतर गुणवत्ता के अंतर से बड़ा है।
- **पहला लोकल एक्सट्रैक्शन रन विफल रहा।** Ollama `llama3.2:1b` ने एक सामान्य कॉल का उत्तर दिया, लेकिन दो-टर्न विंडो पर `facts-v1` प्रॉम्प्ट 4 मिनट 41 सेकंड बाद HTTP 500 लौटाया। उस रन से कोई तथ्य नहीं निकला।
- **हमारा नियम एक्सट्रैक्टर तथ्यों का लाभ दोहराता नहीं है।** इसने 1,672 तथ्य जोड़े और Recall@5 को 57.3% से 57.7% किया; डेटासेट के अपने तथ्यों ने 7.3 अंक जोड़े। विधि, कच्ची फ़ाइलें और नकारात्मक परिणाम: [bench/results](../../bench/results/)।

## इसकी तुलना

<!-- gen:capabilities -->
| Capability | Aletheia (today) | claude-mem | Mem0 | Zep/Graphiti | Supermemory | Basic Memory |
|---|---|---|---|---|---|---|
| Local-first | yes | yes | yes OSS | partial (Graphiti only) | yes self-host | yes |
| Free | yes | yes OSS | yes OSS | partial (Graphiti free) | yes OSS | yes OSS |
| No account | yes | yes local | yes OSS | yes Graphiti | yes self-host | yes |
| MCP | yes stdio + HTTP | yes | yes | partial (reference servers) | yes | yes |
| REST | yes `/v1` | yes worker API | yes | yes | yes | partial |
| CLI | yes | yes `npx` | partial | no | partial | yes |
| Rules sync to tool files | yes 9 targets | no | no | no | no | partial (AGENTS.md) |
| Import/export between tools | partial (own bundle + claude-mem) | partial (export/import) | partial (platform migration) | partial | partial | yes Markdown |
| Hook capture | yes six hosts, fixture-tested; no host opened | yes | no | no | no | partial |
| Vector search | partial (optional ONNX) | yes Chroma | yes | yes | yes | yes |
| Graph / entity memory | partial (entity rows exist; graph retrieval) | no | yes | yes | UNVERIFIED | yes wikilinks |
| Temporal reasoning | partial (bi-temporal facts, invalidation; as-of query) | partial (dates) | yes | yes | yes | partial |
| Team sharing | partial (self-hosted sync and devices; team mode) | partial (paid) | yes paid | yes paid | yes paid | no |
| Benchmark published and reproducible | partial (retrieval yes; answer no) | no | vendor only | vendor only | vendor only | no |
| Languages supported | 11 (English + 10 machine translations; no native review) | 29 modes, 32 READMEs | SDK | SDK | SDK | SDK |

_Competitor cells are copied from each project's own public documentation, fetched 2026-10-26. Aletheia cells were updated 2026-10-26 from tested features; installer sources are in `docs/25-installers.md`. Cells the source did not state read UNVERIFIED._
<!-- /gen:capabilities -->

## सिंक और रिमोट MCP

दोनों स्व-होस्टेड और मुफ़्त हैं; दोनों दो असली मशीनों पर परीक्षण नहीं हुए हैं।

- **Aletheia Sync** एक केवल-जोड़ने वाला ऑपरेशन लॉग है जिसमें प्रति ऑपरेशन एक परिणाम, डिवाइस पेयरिंग, टॉम्बस्टोन, कम्पैक्शन, पर्ज और स्कोप वाले टोकन हैं। वैकल्पिक एंड-टू-एंड एन्क्रिप्शन भेजने से पहले डिवाइस पर पेलोड एन्क्रिप्ट करता है; **यह मेटाडेटा नहीं छिपाता** जैसे डिवाइस id, ऑपरेशन प्रकार, एंटिटी id, समय या सिफरटेक्स्ट का आकार। बिना एन्क्रिप्शन वाले खाते हब पर सादे पेलोड रखते हैं। केवल लूपबैक पर परीक्षण। [docs/29](../../docs/29-sync.md)
- **रिमोट MCP** पढ़ने वाले टूल (और `sync` या `admin` टोकन के साथ लिखने वाले टूल) MCP Streamable HTTP ट्रांसपोर्ट पर देता है। हर कॉल के लिए बियरर टोकन चाहिए, दर सीमा लागू है, और हर कॉल केवल-जोड़ने वाली ऑडिट पंक्ति में लिखा जाता है। TLS रिवर्स प्रॉक्सी या टनल को सौंपा गया है; OAuth नहीं बना है। [docs/30](../../docs/30-remote-mcp.md)

## इंटरफ़ेस

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | the 13 MCP tools below (read and write) |
| MCP (HTTP) | sync hub `/mcp` | the same tools with a bearer token and per-token scope |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info`, `/v1/work` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron, sync |
| Files | rules sync | each tool's own instruction file |

### MCP tools

| Tool | Purpose | Access |
|---|---|---|
| `search` | Search shared memory | read |
| `timeline` | Show context around a memory | read |
| `get_observations` | Get full memory text by id | read |
| `save_memory` | Save a memory | write |
| `session_start_context` | Load session start context | read |
| `fact_history` | Show how a fact changed | read |
| `list_rules` | List standing rules | read |
| `add_rule` | Add a standing rule | write |
| `confirm_rule` | Confirm a rule is still right | write |
| `dismiss_memory` | Dismiss a memory | write |
| `restore_memory` | Restore a dismissed memory | write |
| `work_state_write` | Write a work-state list | write |
| `work_state_read` | Read a work-state list | read |

## कॉन्फ़िगरेशन

सभी सेटिंग्स एनवायरनमेंट वेरिएबल हैं। डिफ़ॉल्ट एकल उपयोगकर्ता मशीन के लिए सुरक्षित हैं।

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_PORT` | `37790` | Listen port. |
| `ALETHEIA_HOST` | `127.0.0.1` | Bind address. A non-loopback bind turns on Hub login. |
| `ALETHEIA_DATA_DIR` | `~/.aletheia` | Everything this project writes, including `hub.db`. |
| `ALETHEIA_HUB_DB` | `<data dir>/hub.db` | The shared memory store. |
| `ALETHEIA_API_KEY` | empty | Bearer key required on `/v1/*` when set. |
| `CLAUDE_MEM_DB` | `~/.claude-mem/claude-mem.db` | claude-mem's database (read-only; importer and optional legacy viewer). |
| `ALETHEIA_RULES_FILE` | `<data dir>/MY-RULES.md` | The legacy Work view's rules file. |
| `ALETHEIA_PROVIDER` | `none` | `none`, `claude-cli` or an OpenAI-compatible provider. |
| `ALETHEIA_PROVIDERS` | empty | Ordered fallback chain, for example `ollama,openai`. |
| `ALETHEIA_OPENAI_BASE_URL`, `_API_KEY`, `_MODEL` | OpenRouter URL, empty, empty | For `openai` and human copy. |
| `ALETHEIA_OUTPUT_LANGUAGE` | empty | Language for extracted facts and summaries. |
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half. |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## सीमाएँ और असत्यापित दावे

यह सूची README का ईमानदार आधा हिस्सा है।

- कोई भी कॉन्फ़िग उसके होस्ट ऐप के अंदर नहीं चलाई गई। "कॉन्फ़िग दस्तावेज़ों से लिखी गई, असली इंस्टॉल पर परीक्षण नहीं हुआ।"
- CI टेस्ट सूट को Linux, macOS और Windows पर चलाता है (GitHub का windows-latest रनर, Bun 1.3.10)। Windows पर Windsurf और Gemini CLI की हुक-निष्पादन जाँचें और एक अस्थायी-फ़ोल्डर सफ़ाई जाँच छोड़ दी जाती हैं, और कोई वास्तविक टूल आज़माया नहीं गया। इंस्टॉल स्मोक टेस्ट Linux और macOS पर चलता है और बेंचमार्क गेट केवल Linux पर।
- उत्तर की सटीकता मापी नहीं गई। Recall@5 रिट्रीवल है, यह नहीं कि उत्तर सही था।
- 1B मॉडल का एक्सट्रैक्शन रन विफल रहा; हमारे एक्सट्रैक्टर के तथ्य केवल नियम एक्सट्रैक्टर से मापे गए।
- सिंक और E2EE केवल अस्थायी डेटा डायरेक्टरी और लूपबैक हब पर परीक्षित हैं। कोई असली टनल या दूसरा होस्ट इस्तेमाल नहीं हुआ।
- E2EE पेलोड को कवर करता है, मेटाडेटा को नहीं।
- 50,000 पंक्तियों पर, FTS सुधार के बाद कीवर्ड खोज p95 108.1 ms थी; 50 ms लक्ष्य पूरा नहीं हुआ।
- README के 10 अनुवाद मशीनी हैं। किसी मूल वक्ता ने समीक्षा नहीं की।
- किसी भी टूल के लिए "Works with <tool>" का दावा नहीं है। केवल असली इंस्टॉल टेस्ट ही इसे सही ठहराएगा।

## संरचना

```
bin/            server, CLI, MCP server, sync hub, legacy Work ledger CLI
src/
  server.mjs app.mjs source.mjs config.mjs humancopy.mjs      server and the legacy Work API
  readmodel/ ledger/ refresh/ store/ http/                     legacy Work internals
  hub/            store (memories, FTS5, rules, bundles)  rules-sync  tools  importers  capture  compress  mcp  routes  sync
public/         the one UI (index.html, one-ui.*, tabs/, work-view.js);
                work.html and assets/ are the optional legacy viewer
public-hub/     the old Memory Hub assets, still served at /hub/app.js
prompts/ vendor/ the original's skill prompts and Python scripts
test/           the test suite and a synthetic fixture database
docs/           the documents
```

## दस्तावेज़ीकरण

पूरा दस्तावेज़ीकरण <https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/> पर है। `docs/` का Markdown मानक है।

1. **शुरू करें:** [परिचय](../../docs/start/introduction.md) · [इंस्टॉलेशन](../../docs/start/installation.md)
   · [क्विकस्टार्ट](../../docs/start/quickstart.md) · [यह कैसे काम करता है](../../docs/start/how-it-works.md)
   · [डैशबोर्ड](../../docs/start/dashboard.md) · [अक्सर पूछे जाने वाले प्रश्न](../../docs/start/faq.md)
2. **अवधारणाएँ:** [मेमोरी मॉडल](../../docs/concepts/memory-model.md) · [नियम](../../docs/concepts/rules.md)
   · [खोज](../../docs/concepts/search.md) · [सेशन शुरू होने पर संदर्भ](../../docs/concepts/session-context.md)
   · [गोपनीयता](../../docs/concepts/privacy.md) · [तथ्य](../../docs/33-facts.md) · [शब्दावली](../../docs/concepts/glossary.md)
3. **अपने टूल जोड़ें:** [ओवरव्यू](../../docs/tools/overview.md) · [Claude Code](../../docs/tools/claude-code.md)
   · [Command Code](../../docs/tools/command-code.md) · [Codex CLI](../../docs/tools/codex.md) · [Cursor](../../docs/tools/cursor.md)
   · [Gemini CLI](../../docs/tools/gemini-cli.md) · [Windsurf](../../docs/tools/windsurf.md) · [OpenCode](../../docs/tools/opencode.md)
   · [Claude Desktop](../../docs/claude-desktop.md) · [अन्य टूल](../../docs/tools/other-tools.md)
4. **गाइड:** [claude-mem से माइग्रेट करें](../../docs/guides/migrate-from-claude-mem.md)
   · [नियम एक बार लिखें](../../docs/guides/write-rules-once.md) · [बैकअप, एक्सपोर्ट, इम्पोर्ट](../../docs/guides/backup-export-import.md)
   · [सेवा के रूप में चलाएँ](../../docs/guides/run-as-a-service.md) · [मॉडल प्रदाता](../../docs/guides/model-providers.md)
   · [समस्या निवारण](../../docs/guides/troubleshooting.md) · [सिंक](../../docs/29-sync.md) · [रिमोट MCP](../../docs/30-remote-mcp.md)
   · [टीम मोड](../../docs/31-team.md) · [अनुरोध और लक्ष्य](../../docs/32-requests.md)
5. **संदर्भ:** [CLI](../../docs/reference/cli.md) · [MCP टूल](../../docs/reference/mcp-tools.md)
   · [कॉन्फ़िगरेशन](../../docs/reference/configuration.md) · [हुक](../../docs/reference/hooks.md) · [HTTP API](../../docs/03-http-api.md)
   · [इंस्टॉलर](../../docs/25-installers.md) · [नियमों के लक्ष्य](../../docs/verification/rules-targets.md)
6. **तुलना:** [Aletheia बनाम claude-mem](../../docs/compare/aletheia-vs-claude-mem.md)
   · [अन्य मेमोरी टूल](../../docs/compare/memory-tools.md) · [Claude Code के मेमोरी विकल्प](../../docs/compare/claude-code-memory.md)
7. **प्रोजेक्ट:** [बेंचमार्क](../../docs/project/benchmarks.md) · [स्थिति और सीमाएँ](../../docs/project/status-and-limits.md)
   · [निर्भरताएँ और लाइसेंस](../../docs/dependencies.md)
8. **आंतरिक संरचना:** [आर्किटेक्चर](../../docs/01-architecture.md) · [डेटा मॉडल](../../docs/02-data-model.md)
   · [फ़्रंटएंड](../../docs/06-frontend.md) · [संचालन](../../docs/07-operations.md)

AI टूल [llms.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms.txt) पढ़ सकते हैं, या सभी पेज एक फ़ाइल में पाने के लिए [llms-full.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms-full.txt) पढ़ सकते हैं।

## योगदान

सबसे उपयोगी योगदान असली इंस्टॉल की रिपोर्ट है: टूल, उसका संस्करण, आपने जो कमांड चलाया और टूल ने क्या किया, यह एक इश्यू में लिखें। [CONTRIBUTING.md](../../CONTRIBUTING.md) देखें। पुल रिक्वेस्ट से पहले `bun test` और `bun scripts/gen-tables.mjs --check` चलाएँ। नई रनटाइम निर्भरता के लिए कारण चाहिए।

## लाइसेंस

Apache-2.0. claude-mem से आने वाली चीज़ों के लिए [NOTICE.md](../../NOTICE.md) देखें। claude-mem के लेखकों या Anthropic से संबद्ध या उनके द्वारा समर्थित नहीं।

## लेखक

[Mohamed Ashraf Elsaed](https://mohamedashrafelsaed.com) द्वारा बनाया गया, जो काहिरा में टेक्निकल लीड और बैकएंड आर्किटेक्ट हैं। प्रोजेक्ट पेज और अन्य टूल: [mohamedashrafelsaed.com/projects/aletheia/](https://mohamedashrafelsaed.com/projects/aletheia/)।
