> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 5e99c552b3f0ffd2e8c156ad87b25130ae71db15ea39db8ad52c7a5c669203f2

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**Бесплатный локальный хаб памяти и правил для инструментов программирования с ИИ.**<br>Постоянная память для Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf и OpenCode: локальная альтернатива claude-mem, не привязанная к конкретному инструменту.

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20Windows%20%28CI%20tested%29-lightgrey)

**Статус: альфа.** Движок памяти и установщики работают в тестах. Реальные Claude Code, Command Code, Codex CLI и OpenCode перечислили сгенерированную MCP-конфигурацию. Хуки отработали в реальных сессиях Claude Code (два дня использования), Command Code (одна короткая сессия) и Codex CLI (одна интерактивная сессия) — всё на машине автора и одним пользователем, с отредактированными секретами и без утечек, найденных проверкой. В Cursor, Gemini CLI, Windsurf или OpenCode хуки ещё не запускались, а точность ответов не измерена. CI запускает набор тестов на Linux, macOS и Windows. В Windows пропускаются две проверки хуков (Windsurf и Gemini CLI), и ни один настоящий инструмент там не пробовали, поэтому Windows проверен только в CI.

Машинные переводы находятся в `docs/i18n/`; английская версия является основной. Ни один перевод не проверен носителем языка.

## Что это

Aletheia — бесплатный локальный хаб памяти и правил для инструментов программирования с ИИ. Любой инструмент читает одно и то же хранилище SQLite через MCP, REST или CLI, а ваши правила записываются в собственный файл инструкций каждого инструмента. Он создан, чтобы дать Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf и OpenCode одну общую постоянную память; в разделах ниже сказано, какие из них проверены на реальной установке.

Каждый агент программирования забывает между сессиями, и каждый помнит по-своему. Aletheia хранит память и правила один раз на вашей машине и позволяет каждому инструменту читать их в уже понятном ему формате. Нет учётной записи, телеметрии и сетевых вызовов, если вы не настроили провайдера моделей. Он слушает только loopback.

## Установка в три команды

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Откройте <http://127.0.0.1:37790>. Нужен [Bun](https://bun.sh) 1.1 или новее. Шага `npm install` нет, потому что нет зависимостей времени выполнения.

На первом экране пять вкладок: **Home** (начните здесь: выберите проект и простыми словами посмотрите, что Aletheia о нём знает, его правила и подключённые инструменты), **Activity** (собственное представление Aletheia о запросах и сессиях, над которыми работали ваши инструменты), **Knowledge** (поиск, редактирование, закрепление, скрытие, экспорт), **Rules** (написать один раз и синхронизировать) и **Connections** (состояние установщиков и аудит).

## Как работает захват

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

Без `--write` команда работает как пробный запуск. Она печатает каждый файл, который изменила бы, и ничего не записывает. Каждый изменённый файл получает резервную копию с отметкой времени. Хуки вызывают установленную команду `aletheia`, удаляют секреты и блоки `<private>` перед сохранением, складывают данные на диск, если база недоступна, и всегда завершаются с кодом 0, чтобы не блокировать хост. Сжатие ставится в очередь и не выполняется внутри хука. Подробности и точный список хуков для каждого хоста: [docs/25](../../docs/25-installers.md).

## С какими инструментами соединяется

Aletheia не зависит ни от одного инструмента. Он говорит на MCP (stdio и HTTP), простом REST API и CLI и записывает файл инструкций, который каждый инструмент уже читает. Что проверено, а что нет:

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

## Измеренные числа

На LoCoMo, claude-mem 15.2.0 в поставляемом виде против этого проекта. **Это числа поиска, а не точность ответов.**

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

Читайте таблицу так:

- **Recall@5 — это поиск.** Он спрашивает, попали ли правильные доказательства в первые пять результатов. Он не судит, был ли ответ правильным.
- **Точность ответов не измерена.** Читающего или оценивающего стенда пока нет.
- **Разрыв не 2×**, когда обе системы получают одни и те же извлечённые факты. Разница в скорости больше разницы в качестве.
- **Первый локальный запуск извлечения не удался.** Ollama `llama3.2:1b` ответил на простой вызов, но запрос `facts-v1` на окне из двух ходов вернул HTTP 500 через 4 мин 41 с. Из этого запуска не извлечено ни одного факта.
- **Наш извлекатель правил не воспроизводит прирост от фактов.** Он добавил 1 672 факта и поднял Recall@5 с 57,3% до 57,7%; факты самого набора данных добавили 7,3 пункта. Метод, исходные файлы и отрицательный результат: [bench/results](../../bench/results/).

## Как он сравнивается

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

## Синхронизация и удалённый MCP

Оба размещаются самостоятельно и бесплатны; ни один не проверен между двумя реальными машинами.

- **Aletheia Sync** — это журнал операций только на добавление с одним результатом на операцию, сопряжением устройств, надгробиями, уплотнением, очисткой и токенами с областями. Необязательное сквозное шифрование шифрует полезные нагрузки на устройстве до отправки; **оно не скрывает метаданные**, такие как id устройства, тип операции, id сущности, время или размер шифртекста. Незашифрованные аккаунты хранят нагрузки в открытом виде на хабе. Проверено только на loopback. [docs/29](../../docs/29-sync.md)
- **Удалённый MCP** предоставляет инструменты чтения (а с токеном `sync` или `admin` — и записи) через транспорт MCP Streamable HTTP. Каждый вызов требует bearer-токен, ограничен по частоте и записывается в строку аудита только на добавление. TLS передаётся обратному прокси или туннелю; OAuth не реализован. [docs/30](../../docs/30-remote-mcp.md)

## Интерфейсы

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

## Конфигурация

Все настройки — переменные окружения. Значения по умолчанию безопасны для машины одного пользователя.

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

## Ограничения и непроверенные утверждения

Этот список — честная половина README.

- Ни одна конфигурация не запускалась внутри своего хост-приложения. «Конфигурация написана по документации, не проверена на реальной установке».
- CI запускает набор тестов на Linux, macOS и Windows (раннер GitHub windows-latest, Bun 1.3.10). В Windows пропускаются проверки запуска хуков для Windsurf и Gemini CLI и одна проверка очистки временных папок, и ни один настоящий инструмент не пробовали. Дымовой тест установки работает на Linux и macOS, а проверка бенчмарка — только на Linux.
- Точность ответов не измерена. Recall@5 — это поиск, а не правильность ответа.
- Запуск извлечения моделью на 1B не удался; факты нашего извлекателя измерены только извлекателем правил.
- Синхронизация и E2EE проверены только с временными каталогами данных и loopback-хабом. Реальный туннель и второй хост не использовались.
- E2EE покрывает полезные нагрузки, но не метаданные.
- На 50 000 строк p95 поиска по ключевым словам составил 108,1 мс после исправления FTS; цель 50 мс не достигнута.
- 10 переводов README машинные. Носитель языка их не проверял.
- Утверждение «Works with <tool>» не делается ни для одного инструмента. Его оправдал бы только тест на реальной установке.

## Структура

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

## Документация

Полная документация находится по адресу <https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/>. Основным источником является Markdown в `docs/`.

1. **Начало работы:** [Введение](../../docs/start/introduction.md) · [Установка](../../docs/start/installation.md)
   · [Быстрый старт](../../docs/start/quickstart.md) · [Как это работает](../../docs/start/how-it-works.md)
   · [Панель](../../docs/start/dashboard.md) · [Частые вопросы](../../docs/start/faq.md)
2. **Концепции:** [Модель памяти](../../docs/concepts/memory-model.md) · [Правила](../../docs/concepts/rules.md)
   · [Поиск](../../docs/concepts/search.md) · [Контекст начала сессии](../../docs/concepts/session-context.md)
   · [Конфиденциальность](../../docs/concepts/privacy.md) · [Факты](../../docs/33-facts.md) · [Глоссарий](../../docs/concepts/glossary.md)
3. **Подключение инструментов:** [Обзор](../../docs/tools/overview.md) · [Claude Code](../../docs/tools/claude-code.md)
   · [Command Code](../../docs/tools/command-code.md) · [Codex CLI](../../docs/tools/codex.md) · [Cursor](../../docs/tools/cursor.md)
   · [Gemini CLI](../../docs/tools/gemini-cli.md) · [Windsurf](../../docs/tools/windsurf.md) · [OpenCode](../../docs/tools/opencode.md)
   · [Claude Desktop](../../docs/claude-desktop.md) · [Другие инструменты](../../docs/tools/other-tools.md)
4. **Руководства:** [Переход с claude-mem](../../docs/guides/migrate-from-claude-mem.md)
   · [Написать правила один раз](../../docs/guides/write-rules-once.md) · [Резервное копирование, экспорт и импорт](../../docs/guides/backup-export-import.md)
   · [Запуск в виде службы](../../docs/guides/run-as-a-service.md) · [Провайдеры моделей](../../docs/guides/model-providers.md)
   · [Устранение неполадок](../../docs/guides/troubleshooting.md) · [Синхронизация](../../docs/29-sync.md) · [Удалённый MCP](../../docs/30-remote-mcp.md)
   · [Командный режим](../../docs/31-team.md) · [Запросы и цели](../../docs/32-requests.md)
5. **Справочник:** [CLI](../../docs/reference/cli.md) · [Инструменты MCP](../../docs/reference/mcp-tools.md)
   · [Конфигурация](../../docs/reference/configuration.md) · [Хуки](../../docs/reference/hooks.md) · [HTTP API](../../docs/03-http-api.md)
   · [Установщики](../../docs/25-installers.md) · [Цели записи правил](../../docs/verification/rules-targets.md)
6. **Сравнение:** [Aletheia и claude-mem: сравнение](../../docs/compare/aletheia-vs-claude-mem.md)
   · [Другие инструменты памяти](../../docs/compare/memory-tools.md) · [Варианты памяти для Claude Code](../../docs/compare/claude-code-memory.md)
7. **Проект:** [Бенчмарки](../../docs/project/benchmarks.md) · [Состояние и ограничения](../../docs/project/status-and-limits.md)
   · [Зависимости и лицензии](../../docs/dependencies.md)
8. **Внутреннее устройство:** [Архитектура](../../docs/01-architecture.md) · [Модель данных](../../docs/02-data-model.md)
   · [Фронтенд](../../docs/06-frontend.md) · [Эксплуатация](../../docs/07-operations.md)

Инструменты ИИ могут читать [llms.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms.txt) или [llms-full.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms-full.txt), где все страницы собраны в одном файле.

## Участие

Самый полезный вклад — отчёт о реальной установке: откройте issue с инструментом, его версией, выполненной командой и тем, что сделал инструмент. См. [CONTRIBUTING.md](../../CONTRIBUTING.md). Перед pull request выполните `bun test` и `bun scripts/gen-tables.mjs --check`. Новая зависимость времени выполнения требует причины.

## Лицензия

Apache-2.0. См. [NOTICE.md](../../NOTICE.md) о том, что взято из claude-mem. Не связано с авторами claude-mem или Anthropic и не одобрено ими.

## Автор

Создано [Mohamed Ashraf Elsaed](https://mohamedashrafelsaed.com), техническим лидом и бэкенд-архитектором из Каира. Страница проекта и другие инструменты: [mohamedashrafelsaed.com/projects/aletheia/](https://mohamedashrafelsaed.com/projects/aletheia/).
