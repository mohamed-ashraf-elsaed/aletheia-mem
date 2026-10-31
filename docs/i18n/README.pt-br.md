> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: fc8ba0b007961ce592029c236a6e38ff5d849c7b36009c77a21b17d99ebda93b

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**Um hub gratuito e local de memória e regras para ferramentas de programação com IA.**<br>Memória persistente para Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf e OpenCode: uma alternativa local ao claude-mem, independente de ferramenta.

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20Windows%20%28CI%20tested%29-lightgrey)

Listado no [registro oficial do MCP](https://registry.modelcontextprotocol.io/v0/servers?search=aletheia-mem), no [Glama](https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/aletheia-mem), no [mcpservers.org](https://mcpservers.org/servers/mohamed-ashraf-elsaed/aletheia-mem), no [TensorBlock awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers/pull/4715) e no [AlternativeTo](https://alternativeto.net/software/aletheia-mem/).

**Status: alfa.** O motor de memória e os instaladores funcionam nos testes. O Claude Code, o Command Code, o Codex CLI e o OpenCode reais listaram a configuração MCP gerada. Os hooks foram executados em sessões reais do Claude Code (dois dias de uso), do Command Code (uma sessão curta) e do Codex CLI (uma sessão interativa), tudo na máquina do autor e com um único usuário, com segredos redigidos e nenhum vazamento encontrado pelo verificador. Nenhum hook foi executado dentro do Cursor, Gemini CLI, Windsurf ou OpenCode ainda, e a precisão das respostas não está medida. A CI executa a suíte de testes no Linux, no macOS e no Windows. No Windows, duas verificações de hooks (Windsurf e Gemini CLI) são ignoradas e nenhuma ferramenta real foi testada lá, então o Windows só foi testado na CI.

As traduções automáticas ficam em `docs/i18n/`; a versão em inglês é a canônica. Nenhuma tradução passou por revisão de um falante nativo.

## O que é

Aletheia é um hub gratuito e local de memória e regras para ferramentas de programação com IA. Qualquer ferramenta lê o mesmo armazenamento SQLite por MCP, REST ou pela CLI, e suas regras são gravadas no arquivo de instruções de cada ferramenta. Ele foi criado para dar ao Claude Code, ao Codex CLI, ao Cursor, ao Gemini CLI, ao Windsurf e ao OpenCode uma memória compartilhada e persistente; as seções abaixo dizem quais deles foram verificados em uma instalação real.

Todo agente de programação esquece entre sessões, e cada um lembra de um jeito diferente. Aletheia guarda a memória e as regras uma vez, na sua máquina, e deixa cada ferramenta lê-las no formato que já entende. Não há conta, telemetria nem chamada de rede, a menos que você configure um provedor de modelos. Ela escuta apenas em loopback.

## Instalação em três comandos

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Abra <http://127.0.0.1:37790>. Requer [Bun](https://bun.sh) 1.1 ou posterior. Não há passo `npm install` porque não há dependências de execução.

A primeira tela tem cinco abas: **Home** (comece aqui: escolha um projeto e veja, em palavras simples, o que a Aletheia sabe sobre ele, suas regras e as ferramentas conectadas), **Activity** (a visão própria da Aletheia das solicitações e sessões em que suas ferramentas trabalharam), **Knowledge** (buscar, editar, fixar, ocultar, exportar), **Rules** (escrever uma vez e sincronizar) e **Connections** (status dos instaladores e auditoria).

## Como a captura funciona

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

Sem `--write`, o comando é uma simulação. Ele imprime cada arquivo que mudaria e não grava nada. Cada arquivo alterado recebe um backup com data e hora. Os hooks chamam o comando `aletheia` instalado, removem segredos e blocos `<private>` antes de gravar, gravam em disco se o banco não estiver disponível e sempre saem com 0 para não bloquear o anfitrião. A compressão entra na fila, não roda dentro do hook. Detalhes e a lista exata de hooks por anfitrião: [docs/25](../../docs/25-installers.md).

## Com quais ferramentas se conecta

Aletheia não depende de uma única ferramenta. Fala MCP (stdio e HTTP), uma API REST simples e uma CLI, e grava o arquivo de instruções que cada ferramenta já lê. O que foi verificado e o que não foi:

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
| codex | full | MCP connection 0.165.0 on 2026-10-29; hooks ran in one interactive session (reviewed once with /hooks); one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | MCP connection 1.18.33 on 2026-10-27; hooks not run | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says MCP connection when the real CLI listed the server. Hooks have run in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run._
<!-- /gen:tools -->

## Números medidos

No LoCoMo, claude-mem 15.2.0 como distribuído contra este projeto. **São números de recuperação, não precisão de respostas.**

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

Leia a tabela assim:

- **Recall@5 é recuperação.** Pergunta se a evidência correta está entre os cinco primeiros resultados. Não julga se uma resposta estava certa.
- **A precisão das respostas não está medida.** Ainda não há uma bancada de leitura ou julgamento.
- **A diferença não é 2×** quando os dois sistemas recebem os mesmos fatos extraídos. A diferença de velocidade é maior que a de qualidade.
- **A primeira execução de extração local falhou.** O Ollama `llama3.2:1b` respondeu a uma chamada trivial, mas o prompt `facts-v1` em uma janela de dois turnos devolveu HTTP 500 após 4 min 41 s. Nenhum fato foi extraído dessa execução.
- **Nosso extrator de regras não reproduz o ganho dos fatos.** Ele adicionou 1.672 fatos e moveu o Recall@5 de 57,3% para 57,7%; os fatos do próprio conjunto adicionaram 7,3 pontos. Método, arquivos brutos e o resultado negativo: [bench/results](../../bench/results/).

## Como se compara

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

## Sincronização e MCP remoto

Ambos são auto-hospedados e gratuitos; nenhum foi testado entre duas máquinas reais.

- **Aletheia Sync** é um log de operações somente de acréscimo com um resultado por operação, pareamento de dispositivos, lápides, compactação, purga e tokens com escopo. A criptografia ponta a ponta opcional criptografa as cargas no dispositivo antes do envio; **ela não esconde metadados** como id do dispositivo, tipo de operação, id da entidade, horário ou tamanho do texto cifrado. Contas sem criptografia mantêm as cargas em texto claro no hub. Testado apenas em loopback. [docs/29](../../docs/29-sync.md)
- **MCP remoto** serve as ferramentas de leitura (e, com um token `sync` ou `admin`, as de escrita) pelo transporte MCP Streamable HTTP. Cada chamada exige um token de portador, tem limite de taxa e grava uma linha de auditoria somente de acréscimo. O TLS fica a cargo de um proxy reverso ou túnel; OAuth não foi construído. [docs/30](../../docs/30-remote-mcp.md)

## Interfaces

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

## Configuração

Todas as configurações são variáveis de ambiente. Os padrões são seguros para uma máquina de um usuário.

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

## Limites e afirmações não verificadas

Esta lista é a metade honesta do README.

- Nenhuma configuração foi executada dentro do aplicativo anfitrião. “Configuração escrita a partir da documentação, não testada em uma instalação real.”
- A CI executa a suíte de testes no Linux, no macOS e no Windows (runner windows-latest do GitHub, Bun 1.3.10). No Windows, as verificações de execução de hooks do Windsurf e do Gemini CLI e uma verificação de limpeza de pastas temporárias são ignoradas, e nenhuma ferramenta real foi testada. O teste de fumaça da instalação roda no Linux e no macOS, e o portão do benchmark apenas no Linux.
- A precisão das respostas não está medida. Recall@5 é recuperação, não se a resposta estava certa.
- A execução de extração com o modelo de 1B falhou; os fatos do nosso extrator foram medidos apenas com o extrator de regras.
- A sincronização e a criptografia ponta a ponta foram testadas com diretórios temporários e um hub em loopback. Não foi usado um túnel real nem um segundo host.
- A criptografia ponta a ponta cobre as cargas, não os metadados.
- Com 50.000 linhas, a busca por palavras-chave teve p95 de 108,1 ms após uma correção no FTS; a meta de 50 ms não foi atingida.
- As 10 traduções do README são automáticas. Nenhum falante nativo as revisou.
- Não se afirma “Works with <tool>” para nenhuma ferramenta. Só um teste de instalação real justificaria isso.

## Estrutura

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

## Documentação

A documentação completa está em <https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/>. O Markdown em `docs/` é a versão canônica.

1. **Primeiros passos:** [Introdução](../../docs/start/introduction.md) · [Instalação](../../docs/start/installation.md)
   · [Início rápido](../../docs/start/quickstart.md) · [Como funciona](../../docs/start/how-it-works.md)
   · [Painel](../../docs/start/dashboard.md) · [Perguntas frequentes](../../docs/start/faq.md)
2. **Conceitos:** [Modelo de memória](../../docs/concepts/memory-model.md) · [Regras](../../docs/concepts/rules.md)
   · [Busca](../../docs/concepts/search.md) · [Contexto de início de sessão](../../docs/concepts/session-context.md)
   · [Privacidade](../../docs/concepts/privacy.md) · [Fatos](../../docs/33-facts.md) · [Glossário](../../docs/concepts/glossary.md)
3. **Conecte suas ferramentas:** [Visão geral](../../docs/tools/overview.md) · [Claude Code](../../docs/tools/claude-code.md)
   · [Command Code](../../docs/tools/command-code.md) · [Codex CLI](../../docs/tools/codex.md) · [Cursor](../../docs/tools/cursor.md)
   · [Gemini CLI](../../docs/tools/gemini-cli.md) · [Windsurf](../../docs/tools/windsurf.md) · [OpenCode](../../docs/tools/opencode.md)
   · [Claude Desktop](../../docs/claude-desktop.md) · [Outras ferramentas](../../docs/tools/other-tools.md)
4. **Guias:** [Migrar do claude-mem](../../docs/guides/migrate-from-claude-mem.md)
   · [Escrever as regras uma vez](../../docs/guides/write-rules-once.md) · [Backup, exportação e importação](../../docs/guides/backup-export-import.md)
   · [Executar como serviço](../../docs/guides/run-as-a-service.md) · [Provedores de modelos](../../docs/guides/model-providers.md)
   · [Solução de problemas](../../docs/guides/troubleshooting.md) · [Sincronização](../../docs/29-sync.md) · [MCP remoto](../../docs/30-remote-mcp.md)
   · [Modo de equipe](../../docs/31-team.md) · [Solicitações e objetivos](../../docs/32-requests.md)
5. **Referência:** [CLI](../../docs/reference/cli.md) · [Ferramentas MCP](../../docs/reference/mcp-tools.md)
   · [Configuração](../../docs/reference/configuration.md) · [Hooks](../../docs/reference/hooks.md) · [API HTTP](../../docs/03-http-api.md)
   · [Instaladores](../../docs/25-installers.md) · [Destinos das regras](../../docs/verification/rules-targets.md)
6. **Comparações:** [Aletheia versus claude-mem](../../docs/compare/aletheia-vs-claude-mem.md)
   · [Outras ferramentas de memória](../../docs/compare/memory-tools.md) · [Opções de memória do Claude Code](../../docs/compare/claude-code-memory.md)
7. **Projeto:** [Benchmarks](../../docs/project/benchmarks.md) · [Status e limites](../../docs/project/status-and-limits.md)
   · [Dependências e licenças](../../docs/dependencies.md)
8. **Funcionamento interno:** [Arquitetura](../../docs/01-architecture.md) · [Modelo de dados](../../docs/02-data-model.md)
   · [Frontend](../../docs/06-frontend.md) · [Operações](../../docs/07-operations.md)

Ferramentas de IA podem ler o [llms.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms.txt), ou o [llms-full.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms-full.txt) para todas as páginas em um único arquivo.

## Contribuir

A contribuição mais útil é um relatório de uma instalação real: abra um issue com a ferramenta, sua versão, o comando que você rodou e o que a ferramenta fez. Veja [CONTRIBUTING.md](../../CONTRIBUTING.md). Rode `bun test` e `bun scripts/gen-tables.mjs --check` antes de um pull request. Uma nova dependência de execução precisa de uma razão.

## Licença

Apache-2.0. Veja [NOTICE.md](../../NOTICE.md) para o que vem do claude-mem. Não é afiliado nem endossado pelos autores do claude-mem ou pela Anthropic.

## Autor

Criado por [Mohamed Ashraf Elsaed](https://mohamedashrafelsaed.com), líder técnico e arquiteto de backend no Cairo. Página do projeto e mais ferramentas: [mohamedashrafelsaed.com/projects/aletheia/](https://mohamedashrafelsaed.com/projects/aletheia/).
