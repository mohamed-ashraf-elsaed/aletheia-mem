> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: fc8ba0b007961ce592029c236a6e38ff5d849c7b36009c77a21b17d99ebda93b

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**Un hub gratuit et local de mémoire et de règles pour les outils de programmation IA.**<br>Mémoire persistante pour Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf et OpenCode : une alternative locale à claude-mem, indépendante de l'outil.

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20Windows%20%28CI%20tested%29-lightgrey)

Référencé dans le [registre MCP officiel](https://registry.modelcontextprotocol.io/v0/servers?search=aletheia-mem), chez [Glama](https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/aletheia-mem), [mcpservers.org](https://mcpservers.org/servers/mohamed-ashraf-elsaed/aletheia-mem), [TensorBlock awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers/pull/4715) et [AlternativeTo](https://alternativeto.net/software/aletheia-mem/).

**Statut : alpha.** Le moteur de mémoire et les installateurs fonctionnent dans les tests. Les vrais Claude Code, Command Code, Codex CLI et OpenCode ont listé la configuration MCP générée. Des hooks se sont exécutés dans de vraies sessions de Claude Code (deux jours d'utilisation), de Command Code (une courte session) et de Codex CLI (une session interactive), le tout sur la machine de l'auteur et avec un seul utilisateur, avec des secrets expurgés et aucune fuite détectée par le vérificateur. Aucun hook n'a encore été exécuté dans Cursor, Gemini CLI, Windsurf ou OpenCode, et la précision des réponses n'est pas mesurée. La CI exécute la suite de tests sous Linux, macOS et Windows. Sous Windows, deux vérifications de hooks (Windsurf et Gemini CLI) sont ignorées et aucun vrai outil n'y a été essayé ; Windows n'est donc testé que dans la CI.

Les traductions automatiques se trouvent dans `docs/i18n/` ; la version anglaise fait référence. Aucune traduction n'a été relue par un locuteur natif.

## Ce que c'est

Aletheia est un hub gratuit et local de mémoire et de règles pour les outils de programmation IA. Chaque outil lit le même stockage SQLite via MCP, REST ou la CLI, et vos règles sont écrites dans le fichier d'instructions propre à chaque outil. Il est conçu pour donner à Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf et OpenCode une mémoire partagée et persistante ; les sections ci-dessous indiquent lesquels ont été vérifiés sur une installation réelle.

Chaque agent de programmation oublie entre les sessions, et chacun se souvient différemment. Aletheia conserve la mémoire et les règles une seule fois, sur votre machine, et laisse chaque outil les lire dans le format qu'il comprend déjà. Il n'y a ni compte, ni télémétrie, ni appel réseau sauf si vous configurez un fournisseur de modèles. Il n'écoute que sur la boucle locale.

## Installation en trois commandes

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Ouvrez <http://127.0.0.1:37790>. Nécessite [Bun](https://bun.sh) 1.1 ou plus récent. Il n'y a pas d'étape `npm install`, car il n'y a aucune dépendance d'exécution.

Le premier écran a cinq onglets : **Home** (point de départ : choisissez un projet et voyez, en mots simples, ce qu'Aletheia sait de lui, ses règles et les outils connectés), **Activity** (la vue propre à Aletheia des demandes et sessions sur lesquelles vos outils ont travaillé), **Knowledge** (rechercher, modifier, épingler, masquer, exporter), **Rules** (écrire une fois et synchroniser) et **Connections** (état des installateurs et audit).

## Comment fonctionne la capture

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

Sans `--write`, la commande est une simulation. Elle affiche chaque fichier qu'elle modifierait et n'écrit rien. Chaque fichier modifié reçoit une sauvegarde horodatée. Les hooks appellent la commande `aletheia` installée, suppriment les secrets et les blocs `<private>` avant le stockage, écrivent sur disque si la base n'est pas disponible et se terminent toujours par 0 pour ne jamais bloquer l'hôte. La compression est mise en file d'attente, pas exécutée dans le hook. Détails et liste exacte des hooks par hôte : [docs/25](../../docs/25-installers.md).

## À quels outils il se connecte

Aletheia ne dépend d'aucun outil en particulier. Il parle MCP (stdio et HTTP), une API REST simple et une CLI, et écrit le fichier d'instructions que chaque outil lit déjà. Ce qui a été vérifié et ce qui ne l'a pas été :

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

## Chiffres mesurés

Sur LoCoMo, claude-mem 15.2.0 tel que distribué face à ce projet. **Ce sont des chiffres de récupération, pas de précision des réponses.**

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

Lire le tableau ainsi :

- **Recall@5 est la récupération.** Il demande si la bonne preuve figure dans les cinq premiers résultats. Il ne juge pas si une réponse était correcte.
- **La précision des réponses n'est pas mesurée.** Il n'y a pas encore de banc de lecture ou de juge.
- **L'écart n'est pas de 2×** lorsque les deux systèmes reçoivent les mêmes faits extraits. L'écart de vitesse est plus grand que l'écart de qualité.
- **La première exécution d'extraction locale a échoué.** Ollama `llama3.2:1b` a répondu à un appel trivial, mais le prompt `facts-v1` sur une fenêtre de deux tours a renvoyé HTTP 500 après 4 min 41 s. Aucun fait n'a été extrait de cette exécution.
- **Notre extracteur de règles ne reproduit pas le gain des faits.** Il a ajouté 1 672 faits et fait passer Recall@5 de 57,3 % à 57,7 % ; les faits du jeu de données ont ajouté 7,3 points. Méthode, fichiers bruts et résultat négatif : [bench/results](../../bench/results/).

## Comment il se compare

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

## Synchronisation et MCP distant

Les deux sont auto-hébergés et gratuits ; aucun n'est testé entre deux machines réelles.

- **Aletheia Sync** est un journal d'opérations en ajout seul, avec un résultat par opération, l'appairage d'appareils, des pierres tombales, la compaction, la purge et des jetons à portée. Le chiffrement de bout en bout facultatif chiffre les charges sur l'appareil avant l'envoi ; **il ne masque pas les métadonnées** comme l'id de l'appareil, le type d'opération, l'id d'entité, l'heure ou la taille du chiffré. Les comptes non chiffrés gardent les charges en clair sur le hub. Testé uniquement en boucle locale. [docs/29](../../docs/29-sync.md)
- **MCP distant** sert les outils de lecture (et, avec un jeton `sync` ou `admin`, les outils d'écriture) via le transport MCP Streamable HTTP. Chaque appel exige un jeton porteur, est limité en débit et écrit une ligne d'audit en ajout seul. TLS est délégué à un proxy inverse ou un tunnel ; OAuth n'est pas construit. [docs/30](../../docs/30-remote-mcp.md)

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

## Configuration

Tous les réglages sont des variables d'environnement. Les valeurs par défaut conviennent à une machine mono-utilisateur.

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

## Limites et affirmations non vérifiées

Cette liste est la moitié honnête du README.

- Aucune configuration n'a été exécutée dans son application hôte. « Configuration écrite d'après la documentation, non testée sur une installation réelle. »
- La CI exécute la suite de tests sous Linux, macOS et Windows (runner windows-latest de GitHub, Bun 1.3.10). Sous Windows, les vérifications d'exécution des hooks pour Windsurf et Gemini CLI ainsi qu'une vérification de nettoyage des dossiers temporaires sont ignorées, et aucun vrai outil n'a été essayé. Le test de fumée d'installation tourne sous Linux et macOS, et le contrôle de benchmark uniquement sous Linux.
- La précision des réponses n'est pas mesurée. Recall@5 est la récupération, pas si une réponse était correcte.
- L'exécution d'extraction avec le modèle 1B a échoué ; les faits de notre extracteur n'ont été mesurés qu'avec l'extracteur de règles.
- La synchronisation et le chiffrement de bout en bout sont testés avec des répertoires temporaires et un hub en boucle locale. Aucun tunnel réel ni second hôte n'a été utilisé.
- Le chiffrement de bout en bout couvre les charges, pas les métadonnées.
- À 50 000 lignes, la recherche par mots-clés avait un p95 de 108,1 ms après un correctif FTS ; l'objectif de 50 ms n'est pas atteint.
- Les 10 traductions du README sont automatiques. Aucun locuteur natif ne les a relues.
- « Works with <tool> » n'est affirmé pour aucun outil. Seul un test d'installation réelle le justifierait.

## Structure

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

## Documentation

La documentation complète se trouve à l'adresse <https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/>. Le Markdown de `docs/` fait référence.

1. **Prise en main :** [Introduction](../../docs/start/introduction.md) · [Installation](../../docs/start/installation.md)
   · [Démarrage rapide](../../docs/start/quickstart.md) · [Comment ça marche](../../docs/start/how-it-works.md)
   · [Tableau de bord](../../docs/start/dashboard.md) · [FAQ](../../docs/start/faq.md)
2. **Concepts :** [Modèle de mémoire](../../docs/concepts/memory-model.md) · [Règles](../../docs/concepts/rules.md)
   · [Recherche](../../docs/concepts/search.md) · [Contexte de début de session](../../docs/concepts/session-context.md)
   · [Confidentialité](../../docs/concepts/privacy.md) · [Faits](../../docs/33-facts.md) · [Glossaire](../../docs/concepts/glossary.md)
3. **Connecter vos outils :** [Vue d'ensemble](../../docs/tools/overview.md) · [Claude Code](../../docs/tools/claude-code.md)
   · [Command Code](../../docs/tools/command-code.md) · [Codex CLI](../../docs/tools/codex.md) · [Cursor](../../docs/tools/cursor.md)
   · [Gemini CLI](../../docs/tools/gemini-cli.md) · [Windsurf](../../docs/tools/windsurf.md) · [OpenCode](../../docs/tools/opencode.md)
   · [Claude Desktop](../../docs/claude-desktop.md) · [Autres outils](../../docs/tools/other-tools.md)
4. **Guides :** [Migrer depuis claude-mem](../../docs/guides/migrate-from-claude-mem.md)
   · [Écrire les règles une seule fois](../../docs/guides/write-rules-once.md) · [Sauvegarder, exporter, importer](../../docs/guides/backup-export-import.md)
   · [Exécuter comme service](../../docs/guides/run-as-a-service.md) · [Fournisseurs de modèles](../../docs/guides/model-providers.md)
   · [Dépannage](../../docs/guides/troubleshooting.md) · [Synchronisation](../../docs/29-sync.md) · [MCP distant](../../docs/30-remote-mcp.md)
   · [Mode équipe](../../docs/31-team.md) · [Demandes et objectifs](../../docs/32-requests.md)
5. **Référence :** [CLI](../../docs/reference/cli.md) · [Outils MCP](../../docs/reference/mcp-tools.md)
   · [Configuration](../../docs/reference/configuration.md) · [Hooks](../../docs/reference/hooks.md) · [API HTTP](../../docs/03-http-api.md)
   · [Installateurs](../../docs/25-installers.md) · [Cibles des règles](../../docs/verification/rules-targets.md)
6. **Comparaisons :** [Aletheia comparé à claude-mem](../../docs/compare/aletheia-vs-claude-mem.md)
   · [Autres outils de mémoire](../../docs/compare/memory-tools.md) · [Options de mémoire pour Claude Code](../../docs/compare/claude-code-memory.md)
7. **Projet :** [Benchmarks](../../docs/project/benchmarks.md) · [État et limites](../../docs/project/status-and-limits.md)
   · [Dépendances et licences](../../docs/dependencies.md)
8. **Fonctionnement interne :** [Architecture](../../docs/01-architecture.md) · [Modèle de données](../../docs/02-data-model.md)
   · [Frontend](../../docs/06-frontend.md) · [Exploitation](../../docs/07-operations.md)

Les outils d'IA peuvent lire [llms.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms.txt), ou [llms-full.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms-full.txt) pour toutes les pages dans un seul fichier.

## Contribuer

La contribution la plus utile est un rapport d'installation réelle : ouvrez un ticket avec l'outil, sa version, la commande exécutée et ce que l'outil a fait. Voir [CONTRIBUTING.md](../../CONTRIBUTING.md). Lancez `bun test` et `bun scripts/gen-tables.mjs --check` avant une pull request. Une nouvelle dépendance d'exécution exige une raison.

## Licence

Apache-2.0. Voir [NOTICE.md](../../NOTICE.md) pour ce qui vient de claude-mem. Non affilié aux auteurs de claude-mem ni à Anthropic, et non approuvé par eux.

## Auteur

Créé par [Mohamed Ashraf Elsaed](https://mohamedashrafelsaed.com), responsable technique et architecte backend au Caire. Page du projet et autres outils : [mohamedashrafelsaed.com/projects/aletheia/](https://mohamedashrafelsaed.com/projects/aletheia/).
