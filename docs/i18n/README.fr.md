> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: bd60edf5d69f2e5edbc4f79d725101dd67c01b32cdbeb1834370973466f1adc5

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.png" alt="Aletheia" width="320"></p>

# Aletheia

**Un hub gratuit et local de mémoire et de règles pour les outils de programmation IA.**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%28tested%29-lightgrey)

**Statut : alpha.** Le moteur de mémoire et les installateurs fonctionnent dans les tests. Aucune application hôte n'a encore été ouverte avec une configuration générée, et la précision des réponses n'est pas mesurée. La CI tourne sous Linux et macOS ; Windows n'est pas encore pris en charge et n'est pas testé.

Les traductions automatiques se trouvent dans `docs/i18n/` ; la version anglaise fait référence. Aucune traduction n'a été relue par un locuteur natif.

## Ce que c'est

Aletheia est un hub gratuit et local de mémoire et de règles pour les outils de programmation IA. Chaque outil lit le même stockage SQLite via MCP, REST ou la CLI, et vos règles sont écrites dans le fichier d'instructions propre à chaque outil.

Chaque agent de programmation oublie entre les sessions, et chacun se souvient différemment. Aletheia conserve la mémoire et les règles une seule fois, sur votre machine, et laisse chaque outil les lire dans le format qu'il comprend déjà. Il n'y a ni compte, ni télémétrie, ni appel réseau sauf si vous configurez un fournisseur de modèles. Il n'écoute que sur la boucle locale.

## Installation en trois commandes

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Ouvrez <http://127.0.0.1:37790>. Nécessite [Bun](https://bun.sh) 1.1 ou plus récent. Il n'y a pas d'étape `npm install`, car il n'y a aucune dépendance d'exécution.

Le premier écran a quatre onglets : **Work** (la vue propre à Aletheia des sessions, faits et objectifs capturés), **Memory** (rechercher, modifier, épingler, supprimer, exporter), **Rules** (écrire une fois et synchroniser) et **Tools** (état des installateurs et audit).

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
| claude-code | full | config written from docs, not tested on a real install | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | config written from docs, not tested on a real install | SessionStart, PostToolUse, Stop |
| cursor | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | config written from docs, not tested on a real install | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | config written from docs, not tested on a real install | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says tested on a real install only when that column says so; today none do._
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

_Retrieval only: Recall@5 asks whether the gold evidence is in the top five results. It is not answer accuracy. Every row is measured-by-us on the same LoCoMo questions; no vendor-claimed benchmark number is in this table. Generated from bench/results/2026-10-26/ (docs/14 §14.6, raw-turns.json (hybrid), dataset-facts.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts+rerank), dataset-facts-rerank.json (hybrid+facts+rerank), our-facts-rules.json (hybrid+facts)); re-run with `bun scripts/compare-bench.mjs`._
<!-- /gen:bench -->

Lire le tableau ainsi :

- **Recall@5 est la récupération.** Il demande si la bonne preuve figure dans les cinq premiers résultats. Il ne juge pas si une réponse était correcte.
- **La précision des réponses n'est pas mesurée.** Il n'y a pas encore de banc de lecture ou de juge (T-051).
- **L'écart n'est pas de 2×** lorsque les deux systèmes reçoivent les mêmes faits extraits. L'écart de vitesse est plus grand que l'écart de qualité.
- **La première exécution d'extraction locale a échoué.** Ollama `llama3.2:1b` a répondu à un appel trivial, mais le prompt `facts-v1` sur une fenêtre de deux tours a renvoyé HTTP 500 après 4 min 41 s. Aucun fait n'a été extrait de cette exécution.
- **Notre extracteur de règles ne reproduit pas le gain des faits.** Il a ajouté 1 672 faits et fait passer Recall@5 de 57,3 % à 57,7 % ; les faits du jeu de données ont ajouté 7,3 points. Méthode, fichiers bruts et résultat négatif : [docs/22](../../docs/22-improve-the-numbers.md).

## Comment il se compare

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

## Synchronisation et MCP distant

Les deux sont auto-hébergés et gratuits ; aucun n'est testé entre deux machines réelles.

- **Aletheia Sync** est un journal d'opérations en ajout seul, avec un résultat par opération, l'appairage d'appareils, des pierres tombales, la compaction, la purge et des jetons à portée. Le chiffrement de bout en bout facultatif chiffre les charges sur l'appareil avant l'envoi ; **il ne masque pas les métadonnées** comme l'id de l'appareil, le type d'opération, l'id d'entité, l'heure ou la taille du chiffré. Les comptes non chiffrés gardent les charges en clair sur le hub. Testé uniquement en boucle locale. [docs/29](../../docs/29-sync.md)
- **MCP distant** sert les outils de lecture (et, avec un jeton `sync` ou `admin`, les outils d'écriture) via le transport MCP Streamable HTTP. Chaque appel exige un jeton porteur, est limité en débit et écrit une ligne d'audit en ajout seul. TLS est délégué à un proxy inverse ou un tunnel ; OAuth n'est pas construit (T-111). [docs/30](../../docs/30-remote-mcp.md)

## Interfaces

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | `search`, `timeline`, `get_observations`, `save_memory`, `session_start_context`, `list_rules`, `add_rule` |
| MCP (HTTP) | sync hub `/mcp` | the same tools with a bearer token and per-token scope |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info`, `/v1/work` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron, sync |
| Files | rules sync | each tool's own instruction file |

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
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half ([F1](../../docs/08-findings.md)). |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## Limites et affirmations non vérifiées

Cette liste est la moitié honnête du README. Chaque élément est suivi dans
[docs/tasks/unverified.md](../../docs/tasks/unverified.md).

- Aucune configuration n'a été exécutée dans son application hôte. « Configuration écrite d'après la documentation, non testée sur une installation réelle. »
- La CI tourne sous Linux et macOS. Le benchmark tourne uniquement sous Linux. Windows n'est pas encore pris en charge et n'est pas testé.
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

## Documents

1. [Architecture](../../docs/01-architecture.md) · 2. [Modèle de données](../../docs/02-data-model.md) · 3. [API HTTP](../../docs/03-http-api.md)
   · 4. [Modèle de lecture](../../docs/04-read-model.md) · 5. [Pipeline de rafraîchissement](../../docs/05-refresh-pipeline.md)
   · 6. [Frontend](../../docs/06-frontend.md) · 7. [Exploitation](../../docs/07-operations.md)
   · 8. [Constats](../../docs/08-findings.md) · 9. [Vérification](../../docs/09-verification.md)
   · 10. [Guide de reconstruction](../../docs/10-rebuild-guide.md)
2. [Inventaire des fonctions face à claude-mem](../../docs/11-feature-inventory.md) · [Produit](../../docs/12-universal-memory-product.md)
3. [Recherche et résultats mesurés](../../docs/14-research-ai-memory.md) · [Spécification](../../docs/15-product-spec.md)
   · [Architecture cible](../../docs/16-target-architecture.md) · [Tâches techniques](../../docs/17-tech-tasks.md)
   · [Plan de benchmark](../../docs/18-benchmark-plan.md)
4. [Matrice des fonctions](../../docs/20-claude-mem-feature-matrix.md) · [Paysage concurrentiel](../../docs/21-competitor-landscape.md)
   · [Améliorer les chiffres](../../docs/22-improve-the-numbers.md) · [Construction de la mémoire](../../docs/23-memory-building.md)
5. [Parité du dépôt](../../docs/24-repo-parity-and-growth.md) · [Installateurs](../../docs/25-installers.md)
   · [Pipeline de mémoire](../../docs/26-memory-pipeline.md) · [Parité gratuit/payant](../../docs/27-free-paid-parity.md)
6. [Rapport concurrentiel](../../docs/28-competitor-report.md) · [Synchronisation](../../docs/29-sync.md) · [MCP distant](../../docs/30-remote-mcp.md)

## Contribuer

La contribution la plus utile est un rapport d'installation réelle : ouvrez un ticket avec l'outil, sa version, la commande exécutée et ce que l'outil a fait. Voir [CONTRIBUTING.md](../../CONTRIBUTING.md) et le système de tâches dans [docs/tasks/TASKS.md](../../docs/tasks/TASKS.md). Lancez `bun test`, `bun scripts/check-tasks.mjs` et `bun scripts/gen-tables.mjs --check` avant une pull request. Une nouvelle dépendance d'exécution exige une raison.

## Licence

Apache-2.0. Voir [NOTICE.md](../../NOTICE.md) pour ce qui vient de claude-mem. Non affilié aux auteurs de claude-mem ni à Anthropic, et non approuvé par eux.

