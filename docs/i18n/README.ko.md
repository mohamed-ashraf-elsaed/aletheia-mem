> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 9c4b57e1221ebbf5d369ab883738ff1650098bda3392ef66460f21cdab792c2a

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**AI 코딩 도구를 위한 무료 로컬 메모리 및 규칙 허브.**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%28CI%20tested%29-lightgrey)

**상태: 알파.** 메모리 엔진과 설치 프로그램은 테스트에서 동작합니다. 실제 Claude Code, Command Code, Codex CLI, OpenCode는 생성된 MCP 설정을 나열했습니다. 훅은 저자의 머신에서 실제 Claude Code 세션에서 이틀 동안 실행되어 프롬프트와 도구 이벤트를 캡처했고, 비밀은 가려졌으며, 검사기는 누출을 찾지 못했습니다 — 한 명의 사용자, 한 대의 머신. 다른 도구 내부에서는 아직 훅이나 세션이 실행된 적이 없고, 답변 정확도는 측정되지 않았습니다. CI는 Linux와 macOS에서 실행되며, Windows는 아직 지원되지 않고 테스트되지 않았습니다.

기계 번역은 `docs/i18n/`에 있습니다. 영어판이 기준입니다. 어떤 번역도 원어민 검토를 받지 않았습니다.

## 무엇인가

Aletheia는 AI 코딩 도구를 위한 무료 로컬 메모리 및 규칙 허브입니다. 모든 도구가 MCP, REST 또는 CLI로 같은 SQLite 저장소를 읽고, 규칙은 각 도구의 자체 지시 파일에 기록됩니다.

모든 코딩 에이전트는 세션 사이에 잊어버리고, 기억하는 방식도 서로 다릅니다. Aletheia는 메모리와 규칙을 한 번만 당신의 컴퓨터에 저장하고, 각 도구가 이미 이해하는 형식으로 읽게 합니다. 계정도, 텔레메트리도 없으며 모델 제공자를 설정하지 않으면 네트워크 호출도 하지 않습니다. 루프백에서만 수신합니다.

## 세 명령으로 설치

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

<http://127.0.0.1:37790>을 엽니다. [Bun](https://bun.sh) 1.1 이상이 필요합니다. 런타임 의존성이 없으므로 `npm install` 단계가 없습니다.

첫 화면에는 네 개의 탭이 있습니다. **Work**(Aletheia 자체의 캡처된 세션, 사실, 목표 보기), **Memory**(검색, 편집, 고정, 삭제, 내보내기), **Rules**(한 번 쓰고 동기화), **Tools**(설치 프로그램 상태와 감사).

## 캡처 방식

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

`--write` 없이 실행하면 명령은 미리보기입니다. 변경할 모든 파일을 출력하고 아무것도 쓰지 않습니다. 변경된 각 파일에는 타임스탬프가 붙은 백업이 생깁니다. 훅은 설치된 `aletheia` 명령을 호출하고, 저장 전에 비밀과 `<private>` 블록을 제거하며, 데이터베이스를 사용할 수 없으면 디스크에 임시 저장하고, 호스트를 막지 않도록 항상 0으로 종료합니다. 압축은 대기열에 들어가며 훅 안에서 실행되지 않습니다. 호스트별 세부 정보와 정확한 훅 목록: [docs/25](../../docs/25-installers.md).

## 연결하는 도구

Aletheia는 특정 도구에 의존하지 않습니다. MCP(stdio 및 HTTP), 단순 REST API, CLI를 지원하고 각 도구가 이미 읽는 지시 파일을 기록합니다. 확인된 것과 확인되지 않은 것:

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
| claude-code | full | MCP connection 2.1.312 on 2026-10-27; hooks ran in real sessions over two days (prompts and tool events captured, secrets redacted, no leaks); one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | MCP connection 1.88.1 on 2026-10-27; hooks not run | SessionStart, PostToolUse, Stop |
| cursor | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | MCP connection 0.130.0 on 2026-10-27; hooks not run | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | MCP connection 1.18.33 on 2026-10-27; hooks not run | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says MCP connection when the real CLI listed the server. Hooks have run only inside real Claude Code sessions so far._
<!-- /gen:tools -->

## 측정 숫자

LoCoMo에서 배포된 claude-mem 15.2.0과 이 프로젝트를 비교합니다. **이것은 검색 숫자이며 답변 정확도가 아닙니다.**

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

표를 읽는 방법:

- **Recall@5는 검색 지표입니다.** 정답 근거가 상위 다섯 결과에 있는지를 묻습니다. 답변이 옳았는지는 판단하지 않습니다.
- **답변 정확도는 측정되지 않았습니다.** 아직 읽기 또는 판정 하네스가 없습니다.
- **두 시스템이 같은 추출 사실을 받으면 차이는 2배가 아닙니다.** 속도 차이가 품질 차이보다 큽니다.
- **첫 로컬 추출 실행은 실패했습니다.** Ollama `llama3.2:1b`는 간단한 호출에는 답했지만, 두 턴 창에 대한 `facts-v1` 프롬프트는 4분 41초 후 HTTP 500을 반환했습니다. 그 실행에서 추출된 사실은 없습니다.
- **우리 규칙 추출기는 사실 이득을 재현하지 못합니다.** 1,672개의 사실을 추가해 Recall@5를 57.3%에서 57.7%로 올렸고, 데이터셋 자체의 사실은 7.3포인트를 더했습니다. 방법, 원본 파일, 부정적 결과: [bench/results](../../bench/results/).

## 비교

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

## 동기화와 원격 MCP

둘 다 자체 호스팅이며 무료입니다. 둘 다 두 대의 실제 컴퓨터에서는 테스트되지 않았습니다.

- **Aletheia Sync**는 작업당 하나의 결과, 기기 페어링, 무덤 표시, 압축, 제거, 범위 지정 토큰을 갖는 추가 전용 작업 로그입니다. 선택적 종단 간 암호화는 보내기 전에 기기에서 페이로드를 암호화합니다. **메타데이터는 숨기지 않습니다**(기기 ID, 작업 종류, 엔터티 ID, 시각, 암호문 크기 등). 암호화하지 않은 계정은 허브에 평문 페이로드를 보관합니다. 루프백에서만 테스트했습니다. [docs/29](../../docs/29-sync.md)
- **원격 MCP**는 읽기 도구(그리고 `sync` 또는 `admin` 토큰이 있으면 쓰기 도구)를 MCP Streamable HTTP 전송으로 제공합니다. 각 호출에는 베어러 토큰이 필요하고, 속도 제한이 적용되며, 추가 전용 감사 행에 기록됩니다. TLS는 리버스 프록시나 터널에 맡깁니다. OAuth는 구현되지 않았습니다. [docs/30](../../docs/30-remote-mcp.md)

## 인터페이스

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

## 설정

모든 설정은 환경 변수입니다. 기본값은 단일 사용자 컴퓨터에 안전합니다.

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

## 한계와 검증되지 않은 주장

이 목록은 README의 정직한 절반입니다.

- 어떤 설정도 호스트 앱 안에서 실행되지 않았습니다. "설정은 문서를 보고 작성했으며 실제 설치에서 테스트하지 않았습니다."
- CI는 Linux와 macOS에서 실행됩니다. 벤치마크는 Linux에서만 실행됩니다. Windows는 아직 지원되지 않고 테스트되지 않았습니다.
- 답변 정확도는 측정되지 않았습니다. Recall@5는 검색이지 답변이 옳았는지가 아닙니다.
- 10억 파라미터 모델 추출 실행은 실패했습니다. 우리 추출기의 사실은 규칙 추출기로만 측정했습니다.
- 동기화와 E2EE는 임시 데이터 디렉터리와 루프백 허브에서만 테스트했습니다. 실제 터널이나 두 번째 호스트는 사용하지 않았습니다.
- E2EE는 페이로드를 포함하지만 메타데이터는 포함하지 않습니다.
- 50,000행에서 FTS 수정 후 키워드 검색 p95는 108.1ms였습니다. 50ms 목표는 달성하지 못했습니다.
- README 번역 10개는 기계 번역입니다. 원어민 검토는 없습니다.
- 어떤 도구에도 "Works with <tool>"을 주장하지 않습니다. 실제 설치 테스트만이 그것을 정당화합니다.

## 구조

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

## 문서

1. [아키텍처](../../docs/01-architecture.md) · [데이터 모델](../../docs/02-data-model.md) · [HTTP API](../../docs/03-http-api.md)
   · [프런트엔드](../../docs/06-frontend.md) · [운영](../../docs/07-operations.md)
2. [설치 프로그램](../../docs/25-installers.md) · [동기화](../../docs/29-sync.md) · [원격 MCP](../../docs/30-remote-mcp.md)
   · [Team mode](../../docs/31-team.md) · [Requests and goals](../../docs/32-requests.md)
3. [Dependencies and licences](../../docs/dependencies.md) · [Claude Desktop](../../docs/claude-desktop.md)
   · [Rules targets](../../docs/verification/rules-targets.md)

## 기여

가장 유용한 기여는 실제 설치 보고서입니다. 도구, 버전, 실행한 명령, 도구가 한 일을 이슈에 적어 주세요. [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하세요. 풀 리퀘스트 전에 `bun test`, `bun scripts/gen-tables.mjs --check`를 실행하세요. 새 런타임 의존성에는 이유가 필요합니다.

## 라이선스

Apache-2.0. claude-mem에서 온 부분은 [NOTICE.md](../../NOTICE.md)를 참고하세요. claude-mem 저자나 Anthropic과 제휴하거나 그들의 승인을 받지 않았습니다.

