> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 8a46344ccb10df9aff21b444185154e17a153903407dc4352c047dba7c5ce02f

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**面向 AI 编程工具的免费本地记忆与规则中心。**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%28CI%20tested%29-lightgrey)

**状态：alpha。** 记忆引擎和安装器已通过测试。还没有任何宿主被真正打开并加载生成的配置，答案准确率尚未测量。CI 在 Linux 和 macOS 上运行；Windows 暂不支持，也未测试。

机器翻译位于 `docs/i18n/`；英文版为准。没有任何翻译经过母语者审校。

## 它是什么

Aletheia 是一个面向 AI 编程工具的免费本地记忆与规则中心。任意工具都可以通过 MCP、REST 或 CLI 读取同一个 SQLite 存储，你的规则会被写入每个工具自己的指令文件。

每个编程代理在会话之间都会遗忘，而且各自的记忆方式不同。Aletheia 把记忆和规则保存一次，放在你的机器上，让每个工具用自己已经理解的格式读取。没有账户、没有遥测，除非你配置模型提供商，否则不会发起网络请求。它只监听回环地址。

## 三条命令安装

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

打开 <http://127.0.0.1:37790>。需要 [Bun](https://bun.sh) 1.1 或更高版本。没有 `npm install` 步骤，因为没有运行时依赖。

首个界面有四个标签页：**Work**（Aletheia 自己的已捕获会话、事实和目标视图）、**Memory**（搜索、编辑、固定、删除、导出）、**Rules**（写一次并同步）和 **Tools**（安装器状态与审计）。

## 捕获如何工作

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

不加 `--write` 时命令是试运行。它会打印将要修改的每个文件，但不写入任何内容。每个被修改的文件都会获得带时间戳的备份。钩子调用已安装的 `aletheia` 命令，在存储前删除密钥和 `<private>` 块，数据库不可用时写入磁盘暂存，并且始终以 0 退出，因此不会阻塞宿主。压缩任务进入队列，不在钩子内运行。每个宿主的详细信息和确切钩子列表：[docs/25](../../docs/25-installers.md)。

## 它连接哪些工具

Aletheia 不依赖任何单一工具。它支持 MCP（stdio 和 HTTP）、普通 REST API 和 CLI，并写入每个工具已经读取的指令文件。已经检查和尚未检查的内容如下：

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

## 测量数字

在 LoCoMo 上，claude-mem 15.2.0 原版对比本项目。**这些是检索数字，不是答案准确率。**

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

这样读这张表：

- **Recall@5 是检索指标。** 它问的是正确证据是否出现在前五个结果中，并不判断答案是否正确。
- **答案准确率尚未测量。** 目前没有阅读器或评判器测试框架。
- **当双方获得相同的抽取事实时，差距不是 2 倍。** 速度差异大于质量差异。
- **第一次本地抽取运行失败了。** Ollama `llama3.2:1b` 能回答一个简单调用，但 `facts-v1` 提示在两轮窗口上运行 4 分 41 秒后返回 HTTP 500。该次运行没有抽取到任何事实。
- **我们的规则抽取器没有复现事实带来的增益。** 它添加了 1,672 条事实，把 Recall@5 从 57.3% 提高到 57.7%；数据集自带的事实在相同条件下提高了 7.3 分。方法、原始文件和负面结果：[bench/results](../../bench/results/)。

## 它如何比较

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

## 同步与远程 MCP

两者都是自托管且免费；都还没有在两台真实机器之间测试过。

- **Aletheia Sync** 是一个只追加的操作日志，每个操作一个结果，支持设备配对、墓碑、压缩、清除和作用域令牌。可选的端到端加密在设备上加密载荷后再发送；**它不隐藏元数据**，例如设备 ID、操作类型、实体 ID、时间和密文大小。未加密账户的载荷在中心以明文保存。只在回环环境测试过。[docs/29](../../docs/29-sync.md)
- **远程 MCP** 通过 MCP Streamable HTTP 传输提供读取工具（使用 `sync` 或 `admin` 令牌时也包括写入工具）。每次调用都需要持有者令牌，受速率限制，并写入只追加审计行。TLS 交给反向代理或隧道；OAuth 尚未构建。[docs/30](../../docs/30-remote-mcp.md)

## 接口

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

## 配置

所有设置都是环境变量。默认值适合单用户机器。

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

## 限制与未验证声明

这份清单是 README 诚实的一半。

- 没有任何配置在宿主应用内运行过。“配置根据文档编写，未在真实安装中测试。”
- CI 在 Linux 和 macOS 上运行。基准测试只在 Linux 上运行。Windows 暂不支持，也未测试。
- 答案准确率尚未测量。Recall@5 是检索，不是答案是否正确。
- 10 亿参数模型的抽取运行失败了；我们自己的抽取器只用规则抽取器测量过。
- 同步和端到端加密只用临时数据目录和回环中心测试过。没有使用真实隧道或第二台主机。
- 端到端加密覆盖载荷，不覆盖元数据。
- 在 50,000 行时，FTS 修复后关键词搜索 p95 为 108.1 ms；50 ms 目标未达到。
- 10 份 README 翻译是机器翻译。没有母语者审校。
- 没有对任何工具声称“Works with <tool>”。只有真实安装测试才能证明这一点。

## 目录结构

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

## 文档

1. [架构](../../docs/01-architecture.md) · [数据模型](../../docs/02-data-model.md) · [HTTP API](../../docs/03-http-api.md)
   · [前端](../../docs/06-frontend.md) · [运维](../../docs/07-operations.md)
2. [安装器](../../docs/25-installers.md) · [同步](../../docs/29-sync.md) · [远程 MCP](../../docs/30-remote-mcp.md)
   · [Team mode](../../docs/31-team.md) · [Requests and goals](../../docs/32-requests.md)
3. [Dependencies and licences](../../docs/dependencies.md) · [Claude Desktop](../../docs/claude-desktop.md)
   · [Rules targets](../../docs/verification/rules-targets.md)

## 贡献

最有用的贡献是来自真实安装的报告：打开一个 issue，写明工具、版本、你运行的命令以及工具做了什么。参见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。提交 PR 前运行 `bun test` 和 `bun scripts/gen-tables.mjs --check`。新增运行时依赖需要说明理由。

## 许可证

Apache-2.0。参见 [NOTICE.md](../../NOTICE.md) 了解来自 claude-mem 的部分。与本项目无关，也未获得 claude-mem 作者或 Anthropic 的认可。

