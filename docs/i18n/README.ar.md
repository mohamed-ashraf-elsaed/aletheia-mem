> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: bd60edf5d69f2e5edbc4f79d725101dd67c01b32cdbeb1834370973466f1adc5

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<div dir="rtl">

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**مركز مجاني ومحلي للذاكرة والقواعد لأدوات البرمجة بالذكاء الاصطناعي.**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%28tested%29-lightgrey)

**الحالة: ألفا.** محرك الذاكرة والمثبّتات تعمل في الاختبارات. لم يُفتح أي تطبيق مضيف بعد بإعدادات مولّدة، ودقة الإجابات غير مقيسة. تعمل CI على Linux فقط؛ لم تُختبر macOS وWindows.

الترجمات الآلية موجودة في `docs/i18n/`؛ النسخة الإنجليزية هي المرجع. لم يراجع أي ترجمة متحدث أصلي.

## ما هو

Aletheia مركز مجاني ومحلي للذاكرة والقواعد لأدوات البرمجة بالذكاء الاصطناعي. تقرأ كل أداة نفس مخزن SQLite عبر MCP أو REST أو CLI، وتُكتب قواعدك في ملف التعليمات الخاص بكل أداة.

كل وكيل برمجة ينسى بين الجلسات، وكل واحد يتذكر بطريقة مختلفة. يحفظ Aletheia الذاكرة والقواعد مرة واحدة على جهازك، ويترك كل أداة تقرأها بالصيغة التي تفهمها بالفعل. لا يوجد حساب ولا قياس عن بُعد ولا اتصال بالشبكة إلا إذا أعددت مزوّد نماذج. يستمع على الواجهة المحلية فقط.

## التثبيت بثلاثة أوامر

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

افتح <http://127.0.0.1:37790>. يحتاج [Bun](https://bun.sh) 1.1 أو أحدث. لا توجد خطوة `npm install` لعدم وجود تبعيات وقت التشغيل.

الشاشة الأولى فيها أربعة تبويبات: **Work** (عرض Aletheia الخاص للجلسات والحقائق والأهداف الملتقطة)، و**Memory** (بحث وتحرير وتثبيت وحذف وتصدير)، و**Rules** (اكتب مرة واحدة وزامن)، و**Tools** (حالة المثبّتات والتدقيق).

## كيف يعمل الالتقاط

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

بدون `--write` يكون الأمر تجربة. يطبع كل ملف سيغيّره ولا يكتب شيئًا. يحصل كل ملف متغيّر على نسخة احتياطية بطابع زمني. تستدعي الخطافات أمر `aletheia` المثبّت، وتزيل الأسرار وكتل `<private>` قبل التخزين، وتكتب إلى القرص إذا لم تكن قاعدة البيانات متاحة، وتخرج دائمًا بالرمز 0 حتى لا تعيق المضيف. يُوضع الضغط في قائمة انتظار ولا يعمل داخل الخطاف. التفاصيل وقائمة الخطافات الدقيقة لكل مضيف: [docs/25](../../docs/25-installers.md).

## الأدوات التي يتصل بها

لا يعتمد Aletheia على أداة واحدة. يتحدث MCP (stdio وHTTP) وواجهة REST بسيطة وCLI، ويكتب ملف التعليمات الذي تقرأه كل أداة بالفعل. ما تم التحقق منه وما لم يتم:

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
| claude-code | full | config written from docs, not tested on a real install | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | config written from docs, not tested on a real install | SessionStart, PostToolUse, Stop |
| cursor | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | config written from docs, not tested on a real install | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | config written from docs, not tested on a real install | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says tested on a real install only when that column says so; today none do._
<!-- /gen:tools -->

## الأرقام المقيسة

على LoCoMo، إصدار claude-mem 15.2.0 كما يُشحن مقابل هذا المشروع. **هذه أرقام استرجاع، وليست دقة إجابات.**

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

_Retrieval only: Recall@5 asks whether the gold evidence is in the top five results. It is not answer accuracy. Every row is measured-by-us on the same LoCoMo questions; no vendor-claimed benchmark number is in this table. Generated from bench/results/2026-10-26/ (docs/14 §14.6, raw-turns.json (hybrid), dataset-facts.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts+rerank), dataset-facts-rerank.json (hybrid+facts+rerank), our-facts-rules.json (hybrid+facts)); re-run with `bun scripts/compare-bench.mjs`._
<!-- /gen:bench -->

اقرأ الجدول هكذا:

- **Recall@5 هو استرجاع.** يسأل هل الدليل الصحيح ضمن النتائج الخمس الأولى. لا يحكم هل كانت الإجابة صحيحة.
- **دقة الإجابات غير مقيسة.** لا يوجد بعد إطار قارئ أو محكّم (T-051).
- **الفارق ليس 2×** عندما يتلقى النظامان نفس الحقائق المستخرجة. فارق السرعة أكبر من فارق الجودة.
- **فشل أول تشغيل استخراج محلي.** أجاب Ollama `llama3.2:1b` على نداء بسيط، لكن موجه `facts-v1` على نافذة دورين أعاد HTTP 500 بعد 4 دقائق و41 ثانية. لم تُستخرج أي حقيقة من ذلك التشغيل.
- **مستخرج القواعد لدينا لا يعيد إنتاج مكسب الحقائق.** أضاف 1,672 حقيقة ونقل Recall@5 من 57.3% إلى 57.7%؛ وأضافت حقائق مجموعة البيانات نفسها 7.3 نقطة. الطريقة والملفات الخام والنتيجة السلبية: [docs/22](../../docs/22-improve-the-numbers.md).

## كيف يُقارن

<!-- gen:capabilities -->
| Capability | Aletheia (today) | claude-mem | Mem0 | Zep/Graphiti | Supermemory | Basic Memory |
|---|---|---|---|---|---|---|
| Local-first | yes | yes | yes OSS | partial (Graphiti only) | yes self-host | yes |
| Free | yes | yes OSS | yes OSS | partial (Graphiti free) | yes OSS | yes OSS |
| No account | yes | yes local | yes OSS | yes Graphiti | yes self-host | yes |
| MCP | yes stdio + HTTP (T-067, T-107) | yes | yes | partial (reference servers) | yes | yes |
| REST | yes `/v1` | yes worker API | yes | yes | yes | partial |
| CLI | yes | yes `npx` | partial | no | partial | yes |
| Rules sync to tool files | yes 9 targets | no | no | no | no | partial (AGENTS.md) |
| Import/export between tools | partial (own bundle + claude-mem) | partial (export/import) | partial (platform migration) | partial | partial | yes Markdown |
| Hook capture | yes six hosts, fixture-tested; no host opened (T-140) | yes | no | no | no | partial |
| Vector search | partial (optional ONNX) | yes Chroma | yes | yes | yes | yes |
| Graph / entity memory | partial (entity rows exist; graph retrieval T-048) | no | yes | yes | UNVERIFIED | yes wikilinks |
| Temporal reasoning | partial (bi-temporal facts, invalidation; as-of query T-026) | partial (dates) | yes | yes | yes | partial |
| Team sharing | partial (self-hosted sync and devices; team mode T-112) | partial (paid) | yes paid | yes paid | yes paid | no |
| Benchmark published and reproducible | partial (retrieval yes; answer no) | no | vendor only | vendor only | vendor only | no |
| Languages supported | 11 (English + 10 machine translations; no native review) | 29 modes, 32 READMEs | SDK | SDK | SDK | SDK |

_Generated from docs/28-competitor-report.json (rows copied from docs/21-competitor-landscape.md, fetched 2026-10-26). Aletheia cells updated 2026-10-26 from validated tasks; see docs/20 and docs/25. Cells the source did not state read UNVERIFIED._
<!-- /gen:capabilities -->

## المزامنة وMCP البعيد

كلاهما مستضاف ذاتيًا ومجاني؛ ولم يُختبر أي منهما بين جهازين حقيقيين.

- **Aletheia Sync** سجل عمليات للإضافة فقط، بنتيجة لكل عملية، واقتران أجهزة، وشواهد قبور، وضغط، ومحو، ورموز محدودة النطاق. التشفير الاختياري من طرف إلى طرف يشفّر الحمولات على الجهاز قبل إرسالها؛ **ولا يخفي البيانات الوصفية** مثل معرّف الجهاز ونوع العملية ومعرّف الكيان والوقت وحجم النص المشفّر. الحسابات غير المشفّرة تحتفظ بحمولات نصية صريحة على المركز. اختُبر على الواجهة المحلية فقط. [docs/29](../../docs/29-sync.md)
- **MCP البعيد** يقدّم أدوات القراءة (وأدوات الكتابة عند وجود رمز `sync` أو `admin`) عبر نقل MCP Streamable HTTP. يحتاج كل نداء إلى رمز حامل، ويخضع لحد معدل، ويُكتب في صف تدقيق للإضافة فقط. تُترك TLS لوكيل عكسي أو نفق؛ OAuth غير مبني (T-111). [docs/30](../../docs/30-remote-mcp.md)

## الواجهات

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | `search`, `timeline`, `get_observations`, `save_memory`, `session_start_context`, `list_rules`, `add_rule` |
| MCP (HTTP) | sync hub `/mcp` | the same tools with a bearer token and per-token scope |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info`, `/v1/work` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron, sync |
| Files | rules sync | each tool's own instruction file |

## الإعدادات

كل الإعدادات متغيرات بيئة. القيم الافتراضية آمنة لجهاز مستخدم واحد.

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
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half ([F1](../../docs/08-findings.md)). |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## الحدود والادعاءات غير المتحقق منها

هذه القائمة هي النصف الصادق من README. كل بند متتبع في
[docs/tasks/unverified.md](../../docs/tasks/unverified.md).

- لم يُشغّل أي إعداد داخل تطبيقه المضيف. «الإعدادات مكتوبة من الوثائق، وغير مختبرة على تثبيت حقيقي.»
- تعمل CI والمعيار على Linux فقط. لم تُختبر macOS وWindows.
- دقة الإجابات غير مقيسة. Recall@5 استرجاع، وليس هل كانت الإجابة صحيحة.
- فشل تشغيل الاستخراج بنموذج 1B؛ وقِيست حقائق مستخرجنا بمستخرج القواعد فقط.
- المزامنة والتشفير من طرف إلى طرف مختبران بمجلدات بيانات مؤقتة ومركز محلي فقط. لم يُستخدم نفق حقيقي ولا مضيف ثانٍ.
- التشفير من طرف إلى طرف يغطي الحمولات لا البيانات الوصفية.
- عند 50,000 صف، كان p95 للبحث بالكلمات المفتاحية 108.1 ms بعد إصلاح FTS؛ هدف 50 ms غير محقق.
- ترجمات README العشر آلية. لم يراجعها متحدث أصلي.
- لا يُدّعى «Works with <tool>» لأي أداة. فقط اختبار تثبيت حقيقي يبرر ذلك.

## البنية

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

## الوثائق

1. [البنية](../../docs/01-architecture.md) · 2. [نموذج البيانات](../../docs/02-data-model.md) · 3. [واجهة HTTP](../../docs/03-http-api.md)
   · 4. [نموذج القراءة](../../docs/04-read-model.md) · 5. [خط التحديث](../../docs/05-refresh-pipeline.md)
   · 6. [الواجهة الأمامية](../../docs/06-frontend.md) · 7. [التشغيل](../../docs/07-operations.md)
   · 8. [النتائج](../../docs/08-findings.md) · 9. [التحقق](../../docs/09-verification.md)
   · 10. [دليل إعادة البناء](../../docs/10-rebuild-guide.md)
2. [جرد الميزات مقابل claude-mem](../../docs/11-feature-inventory.md) · [المنتج](../../docs/12-universal-memory-product.md)
3. [البحث والنتائج المقيسة](../../docs/14-research-ai-memory.md) · [مواصفات المنتج](../../docs/15-product-spec.md)
   · [البنية المستهدفة](../../docs/16-target-architecture.md) · [المهام التقنية](../../docs/17-tech-tasks.md)
   · [خطة المعيار](../../docs/18-benchmark-plan.md)
4. [مصفوفة الميزات](../../docs/20-claude-mem-feature-matrix.md) · [مشهد المنافسين](../../docs/21-competitor-landscape.md)
   · [تحسين الأرقام](../../docs/22-improve-the-numbers.md) · [بناء الذاكرة](../../docs/23-memory-building.md)
5. [تكافؤ المستودع](../../docs/24-repo-parity-and-growth.md) · [المثبّتات](../../docs/25-installers.md)
   · [خط الذاكرة](../../docs/26-memory-pipeline.md) · [تكافؤ المجاني والمدفوع](../../docs/27-free-paid-parity.md)
6. [تقرير المنافسين](../../docs/28-competitor-report.md) · [المزامنة](../../docs/29-sync.md) · [MCP البعيد](../../docs/30-remote-mcp.md)

## المساهمة

أكثر مساهمة مفيدة هي تقرير من تثبيت حقيقي: افتح issue فيه الأداة وإصدارها والأمر الذي شغّلته وما فعلته الأداة. راجع [CONTRIBUTING.md](../../CONTRIBUTING.md) ونظام المهام في [docs/tasks/TASKS.md](../../docs/tasks/TASKS.md). شغّل `bun test` و`bun scripts/check-tasks.mjs` و`bun scripts/gen-tables.mjs --check` قبل طلب السحب. أي تبعية وقت تشغيل جديدة تحتاج إلى سبب.

## الترخيص

Apache-2.0. راجع [NOTICE.md](../../NOTICE.md) لما يأتي من claude-mem. غير تابع لمؤلفي claude-mem أو Anthropic وغير معتمد منهم.


</div>
