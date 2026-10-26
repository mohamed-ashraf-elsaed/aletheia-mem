> Machine-translated from the English README on 2026-10-26. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: 40fc302b3defd7644dd3eac811e3797563787fabeca0b2d52657258f74cee27e

[English](../../README.md) · [中文](README.zh.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-br.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [Русский](README.ru.md)

<p align="center"><img src="../assets/logo.svg" alt="Aletheia" width="220"></p>

# Aletheia

**Ein kostenloser, lokaler Hub für Gedächtnis und Regeln für KI-Programmierwerkzeuge.**

[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](../../LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%28tested%29-lightgrey)

**Status: Alpha.** Die Gedächtnis-Engine und die Installer funktionieren in Tests. Noch wurde keine Host-Anwendung mit einer erzeugten Konfiguration geöffnet, und die Antwortgenauigkeit ist nicht gemessen. Die CI läuft nur unter Linux; macOS und Windows sind ungetestet.

Maschinelle Übersetzungen liegen in `docs/i18n/`; das englische Original ist maßgeblich. Keine Übersetzung wurde von einem Muttersprachler geprüft.

## Was es ist

Aletheia ist ein kostenloser, lokaler Hub für Gedächtnis und Regeln für KI-Programmierwerkzeuge. Jedes Werkzeug liest denselben SQLite-Speicher über MCP, REST oder die CLI, und deine Regeln werden in die eigene Anweisungsdatei jedes Werkzeugs geschrieben.

Jeder Programmieragent vergisst zwischen Sitzungen, und jeder erinnert sich anders. Aletheia speichert Gedächtnis und Regeln einmal auf deiner Maschine und lässt jedes Werkzeug sie in dem Format lesen, das es bereits versteht. Es gibt kein Konto, keine Telemetrie und keinen Netzwerkaufruf, außer du konfigurierst einen Modellanbieter. Es lauscht nur auf Loopback.

## Installation in drei Befehlen

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Öffne <http://127.0.0.1:37790>. Benötigt [Bun](https://bun.sh) 1.1 oder neuer. Es gibt keinen Schritt `npm install`, weil es keine Laufzeitabhängigkeiten gibt.

Der erste Bildschirm hat vier Tabs: **Work** (Aletheias eigene Ansicht der erfassten Sitzungen, Fakten und Ziele), **Memory** (suchen, bearbeiten, anheften, löschen, exportieren), **Rules** (einmal schreiben und synchronisieren) und **Tools** (Installer-Status und Audit).

## Wie die Erfassung funktioniert

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

Ohne `--write` ist der Befehl ein Probelauf. Er zeigt jede Datei, die er ändern würde, und schreibt nichts. Jede geänderte Datei erhält eine Sicherung mit Zeitstempel. Hooks rufen den installierten Befehl `aletheia` auf, entfernen Geheimnisse und `<private>`-Blöcke vor dem Speichern, legen bei nicht verfügbarer Datenbank eine Warteschlange auf der Festplatte an und beenden sich immer mit 0, damit sie den Host nie blockieren. Die Komprimierung wird eingereiht, nicht im Hook ausgeführt. Details und die genaue Hook-Liste je Host: [docs/25](../../docs/25-installers.md).

## Mit welchen Werkzeugen es sich verbindet

Aletheia hängt nicht von einem einzigen Werkzeug ab. Es spricht MCP (stdio und HTTP), eine einfache REST-API und eine CLI und schreibt die Anweisungsdatei, die jedes Werkzeug bereits liest. Was geprüft wurde und was nicht:

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

## Gemessene Zahlen

Auf LoCoMo, claude-mem 15.2.0 wie ausgeliefert gegen dieses Projekt. **Das sind Abrufzahlen, keine Antwortgenauigkeit.**

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

Die Tabelle so lesen:

- **Recall@5 ist Abruf.** Gefragt wird, ob die richtige Evidenz unter den ersten fünf Ergebnissen ist. Es wird nicht bewertet, ob eine Antwort richtig war.
- **Die Antwortgenauigkeit ist nicht gemessen.** Es gibt noch keine Lese- oder Bewertungsvorrichtung (T-051).
- **Der Abstand ist nicht 2×**, wenn beide Systeme dieselben extrahierten Fakten erhalten. Der Geschwindigkeitsunterschied ist größer als der Qualitätsunterschied.
- **Der erste lokale Extraktionslauf ist fehlgeschlagen.** Ollama `llama3.2:1b` beantwortete einen trivialen Aufruf, aber der `facts-v1`-Prompt über ein Zwei-Turn-Fenster lieferte nach 4 min 41 s HTTP 500. Aus diesem Lauf wurde kein Fakt extrahiert.
- **Unser Regelextraktor reproduziert den Faktengewinn nicht.** Er fügte 1.672 Fakten hinzu und verschob Recall@5 von 57,3% auf 57,7%; die Fakten des Datensatzes selbst brachten 7,3 Punkte. Methode, Rohdateien und das negative Ergebnis: [docs/22](../../docs/22-improve-the-numbers.md).

## Wie es sich vergleicht

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

## Sync und Remote-MCP

Beides ist selbst gehostet und kostenlos; nichts davon ist zwischen zwei echten Maschinen getestet.

- **Aletheia Sync** ist ein reines Anhänge-Operationsprotokoll mit einem Ergebnis pro Operation, Gerätepaarung, Grabsteinen, Kompaktierung, Purge und bereichsbezogenen Tokens. Die optionale Ende-zu-Ende-Verschlüsselung verschlüsselt Nutzlasten auf dem Gerät vor dem Senden; **sie verbirgt keine Metadaten** wie Geräte-ID, Operationsart, Entitäts-ID, Zeitpunkt oder Chiffratgröße. Unverschlüsselte Konten behalten Klartext-Nutzlasten auf dem Hub. Nur auf Loopback getestet. [docs/29](../../docs/29-sync.md)
- **Remote-MCP** stellt die Lesewerkzeuge (und mit einem `sync`- oder `admin`-Token die Schreibwerkzeuge) über den MCP-Streamable-HTTP-Transport bereit. Jeder Aufruf braucht ein Bearer-Token, ist ratenbegrenzt und schreibt eine reine Anhänge-Auditzeile. TLS wird an einen Reverse-Proxy oder Tunnel delegiert; OAuth ist nicht gebaut (T-111). [docs/30](../../docs/30-remote-mcp.md)

## Schnittstellen

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | `search`, `timeline`, `get_observations`, `save_memory`, `session_start_context`, `list_rules`, `add_rule` |
| MCP (HTTP) | sync hub `/mcp` | the same tools with a bearer token and per-token scope |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info`, `/v1/work` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron, sync |
| Files | rules sync | each tool's own instruction file |

## Konfiguration

Alle Einstellungen sind Umgebungsvariablen. Die Vorgaben sind für einen Einzelplatzrechner sicher.

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

## Grenzen und unbestätigte Aussagen

Diese Liste ist die ehrliche Hälfte der README. Jeder Punkt wird in
[docs/tasks/unverified.md](../../docs/tasks/unverified.md) verfolgt.

- Keine Konfiguration wurde in ihrer Host-Anwendung ausgeführt. „Konfiguration aus der Dokumentation geschrieben, nicht in einer echten Installation getestet.“
- CI und Benchmark laufen nur unter Linux. macOS und Windows sind ungetestet.
- Die Antwortgenauigkeit ist nicht gemessen. Recall@5 ist Abruf, nicht ob eine Antwort richtig war.
- Der Extraktionslauf mit dem 1B-Modell ist fehlgeschlagen; die Fakten unseres Extraktors wurden nur mit dem Regelextraktor gemessen.
- Sync und E2EE sind nur mit temporären Datenverzeichnissen und einem Loopback-Hub getestet. Es wurde kein echter Tunnel und kein zweiter Host verwendet.
- E2EE deckt Nutzlasten ab, nicht Metadaten.
- Bei 50.000 Zeilen lag die Keyword-Suche nach einem FTS-Fix bei p95 108,1 ms; das 50-ms-Ziel ist nicht erreicht.
- Die 10 README-Übersetzungen sind maschinell. Kein Muttersprachler hat sie geprüft.
- „Works with <tool>“ wird für kein Werkzeug behauptet. Nur ein echter Installationstest würde das rechtfertigen.

## Aufbau

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

## Dokumente

1. [Architektur](../../docs/01-architecture.md) · 2. [Datenmodell](../../docs/02-data-model.md) · 3. [HTTP-API](../../docs/03-http-api.md)
   · 4. [Lesemodell](../../docs/04-read-model.md) · 5. [Refresh-Pipeline](../../docs/05-refresh-pipeline.md)
   · 6. [Frontend](../../docs/06-frontend.md) · 7. [Betrieb](../../docs/07-operations.md)
   · 8. [Erkenntnisse](../../docs/08-findings.md) · 9. [Verifikation](../../docs/09-verification.md)
   · 10. [Neuaufbau-Anleitung](../../docs/10-rebuild-guide.md)
2. [Funktionsinventar gegen claude-mem](../../docs/11-feature-inventory.md) · [Produkt](../../docs/12-universal-memory-product.md)
3. [Forschung und Messergebnisse](../../docs/14-research-ai-memory.md) · [Produktspezifikation](../../docs/15-product-spec.md)
   · [Zielarchitektur](../../docs/16-target-architecture.md) · [Technische Aufgaben](../../docs/17-tech-tasks.md)
   · [Benchmark-Plan](../../docs/18-benchmark-plan.md)
4. [Funktionsmatrix](../../docs/20-claude-mem-feature-matrix.md) · [Wettbewerbslandschaft](../../docs/21-competitor-landscape.md)
   · [Die Zahlen verbessern](../../docs/22-improve-the-numbers.md) · [Gedächtnisaufbau](../../docs/23-memory-building.md)
5. [Repository-Parität](../../docs/24-repo-parity-and-growth.md) · [Installer](../../docs/25-installers.md)
   · [Gedächtnis-Pipeline](../../docs/26-memory-pipeline.md) · [Kostenlos-bezahlt-Parität](../../docs/27-free-paid-parity.md)
6. [Wettbewerbsbericht](../../docs/28-competitor-report.md) · [Sync](../../docs/29-sync.md) · [Remote-MCP](../../docs/30-remote-mcp.md)

## Mitwirken

Der nützlichste Beitrag ist ein Bericht aus einer echten Installation: Eröffne ein Issue mit dem Werkzeug, seiner Version, dem ausgeführten Befehl und dem, was das Werkzeug getan hat. Siehe [CONTRIBUTING.md](../../CONTRIBUTING.md) und das Aufgabensystem in [docs/tasks/TASKS.md](../../docs/tasks/TASKS.md). Führe vor einem Pull Request `bun test`, `bun scripts/check-tasks.mjs` und `bun scripts/gen-tables.mjs --check` aus. Eine neue Laufzeitabhängigkeit braucht einen Grund.

## Lizenz

Apache-2.0. Siehe [NOTICE.md](../../NOTICE.md) für das, was von claude-mem stammt. Nicht mit den claude-mem-Autoren oder Anthropic verbunden und von ihnen nicht unterstützt.

