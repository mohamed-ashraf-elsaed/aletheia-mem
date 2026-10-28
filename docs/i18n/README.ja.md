> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 9c4b57e1221ebbf5d369ab883738ff1650098bda3392ef66460f21cdab792c2a

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**AI コーディングツールのための、無料でローカルなメモリとルールのハブ。**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%28CI%20tested%29-lightgrey)

**状態: アルファ。** メモリエンジンとインストーラーはテストで動作します。実際の Claude Code、Command Code、Codex CLI、OpenCode は生成された MCP 設定を一覧表示しました。フックは作者のマシン上の実際の Claude Code セッションで 2 日間にわたり実行され、プロンプトとツールイベントを取得し、シークレットは秘匿化され、チェッカーは漏えいを検出しませんでした——1 ユーザー、1 マシン。他のツール内ではまだフックもセッションも実行されておらず、回答の正確さは測定していません。CI は Linux と macOS で動作します。Windows は未対応で、未検証です。

機械翻訳は `docs/i18n/` にあります。英語版が正典です。ネイティブ話者によるレビューは受けていません。

## これは何か

Aletheia は、AI コーディングツールのための無料でローカルなメモリとルールのハブです。どのツールも MCP、REST、CLI のいずれかで同じ SQLite ストアを読み、ルールは各ツール自身の指示ファイルに書き込まれます。

コーディングエージェントはセッションの間で忘れ、記憶の仕方もそれぞれ違います。Aletheia はメモリとルールを一度だけあなたのマシンに保存し、各ツールがすでに理解する形式で読めるようにします。アカウントもテレメトリもなく、モデルプロバイダーを設定しない限りネットワーク呼び出しも行いません。ループバックのみで待ち受けます。

## 3 つのコマンドでインストール

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

<http://127.0.0.1:37790> を開きます。[Bun](https://bun.sh) 1.1 以降が必要です。ランタイム依存がないため `npm install` の手順はありません。

最初の画面には 4 つのタブがあります。**Work**（Aletheia 自身の、取り込んだセッション・事実・目標の表示）、**Memory**（検索、編集、固定、削除、エクスポート）、**Rules**（一度書いて同期）、**Tools**（インストーラーの状態と監査）。

## キャプチャの仕組み

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

`--write` を付けない場合、コマンドはドライランです。変更するすべてのファイルを表示し、何も書き込みません。変更したファイルには日時付きのバックアップが作られます。フックはインストール済みの `aletheia` コマンドを呼び、保存前に秘密情報と `<private>` ブロックを削除し、データベースが使えないときはディスクに退避し、ホストを止めないよう常に 0 で終了します。圧縮はキューに入り、フック内では実行しません。ホストごとの詳細と正確なフック一覧: [docs/25](../../docs/25-installers.md)。

## 接続するツール

Aletheia は特定のツールに依存しません。MCP（stdio と HTTP）、素の REST API、CLI を話し、各ツールがすでに読む指示ファイルを書き込みます。確認済みのことと未確認のことは次のとおりです:

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

## 測定値

LoCoMo で、出荷時の claude-mem 15.2.0 とこのプロジェクトを比較します。**これは検索の数値であり、回答の正確さではありません。**

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

表は次のように読みます:

- **Recall@5 は検索の指標です。** 正しい根拠が上位 5 件に入ったかを問うもので、回答が正しかったかは判断しません。
- **回答の正確さは未測定です。** 読み手や判定器のハーネスはまだありません。
- **両方が同じ抽出済み事実を受け取ると、差は 2 倍ではありません。** 速度差のほうが品質差より大きいです。
- **最初のローカル抽出実行は失敗しました。** Ollama `llama3.2:1b` は簡単な呼び出しには答えましたが、2 ターンの窓に対する `facts-v1` プロンプトは 4 分 41 秒後に HTTP 500 を返しました。その実行から事実は抽出されていません。
- **私たちのルール抽出器は事実による利得を再現していません。** 1,672 件の事実を追加し、Recall@5 を 57.3% から 57.7% に動かしました。データセット自身の事実は 7.3 ポイント追加しました。方法、生ファイル、否定的な結果: [bench/results](../../bench/results/)。

## 比較

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

## 同期とリモート MCP

どちらもセルフホストで無料です。どちらも 2 台の実機では検証していません。

- **Aletheia Sync** は追記専用の操作ログで、操作ごとの結果、デバイスペアリング、墓標、圧縮、パージ、スコープ付きトークンを持ちます。任意のエンドツーエンド暗号化は、送信前にデバイス上でペイロードを暗号化します。**メタデータは隠しません**（デバイス ID、操作種別、エンティティ ID、時刻、暗号文の長さなど）。暗号化しないアカウントはハブ上で平文のペイロードを保持します。ループバックでのみ検証済みです。[docs/29](../../docs/29-sync.md)
- **リモート MCP** は読み取りツール（`sync` または `admin` トークンでは書き込みツールも）を MCP Streamable HTTP トランスポートで提供します。各呼び出しにはベアラートークンが必要で、レート制限され、追記専用の監査行に記録されます。TLS はリバースプロキシまたはトンネルに任せます。OAuth は未実装です。[docs/30](../../docs/30-remote-mcp.md)

## インターフェース

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

## 設定

すべての設定は環境変数です。既定値は単一ユーザーのマシンで安全です。

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

## 制限と未検証の主張

この一覧は README の正直な半分です。

- どの設定もホストアプリ内では実行されていません。「設定はドキュメントから書き、実インストールでは未検証」です。
- CI は Linux と macOS で動作します。ベンチマークは Linux のみです。Windows は未対応で、未検証です。
- 回答の正確さは未測定です。Recall@5 は検索であり、回答が正しかったかではありません。
- 10 億パラメータモデルでの抽出実行は失敗しました。私たちの抽出器の事実はルール抽出器でのみ測定しています。
- 同期と E2EE は一時データディレクトリとループバックハブでのみ検証しています。実際のトンネルや 2 台目のホストは使っていません。
- E2EE はペイロードを対象とし、メタデータは対象外です。
- 50,000 行では、FTS 修正後のキーワード検索 p95 は 108.1 ms でした。50 ms の目標は未達です。
- README の 10 翻訳は機械翻訳です。ネイティブ話者のレビューはありません。
- どのツールに対しても「Works with <tool>」とは主張しません。実インストールテストだけがそれを正当化します。

## 構成

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

## ドキュメント

1. [アーキテクチャ](../../docs/01-architecture.md) · [データモデル](../../docs/02-data-model.md) · [HTTP API](../../docs/03-http-api.md)
   · [フロントエンド](../../docs/06-frontend.md) · [運用](../../docs/07-operations.md)
2. [インストーラー](../../docs/25-installers.md) · [同期](../../docs/29-sync.md) · [リモート MCP](../../docs/30-remote-mcp.md)
   · [Team mode](../../docs/31-team.md) · [Requests and goals](../../docs/32-requests.md)
3. [Dependencies and licences](../../docs/dependencies.md) · [Claude Desktop](../../docs/claude-desktop.md)
   · [Rules targets](../../docs/verification/rules-targets.md)

## 貢献

最も役立つ貢献は実インストールからの報告です。ツール、そのバージョン、実行したコマンド、ツールが何をしたかを issue に書いてください。[CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。プルリクエストの前に `bun test`、`bun scripts/gen-tables.mjs --check` を実行してください。新しいランタイム依存には理由が必要です。

## ライセンス

Apache-2.0。[NOTICE.md](../../NOTICE.md) に claude-mem 由来のものを記載しています。claude-mem の作者や Anthropic とは提携しておらず、承認も受けていません。

