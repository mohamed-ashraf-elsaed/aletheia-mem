# 24. Repository parity and growth

Status: plan, 2026-10-26. The goal is to make the repository and site as complete and discoverable as claude-mem's
**without copying its words, artwork or numbers**. Everything below is either a real current state, a sourced rule, or
a task.

Current public state, fetched 2026-10-26 (`api.github.com/repos/mohamed-ashraf-elsaed/aletheia-mem`):

| Field | Value |
|---|---|
| Visibility | public |
| Stars | 0 |
| Licence | Apache-2.0 |
| Topics | 12, including `ai-memory`, `mcp`, `local-first`, `claude-code`, `cursor`, `codex` |
| Discussions | disabled |
| Homepage | `https://mohamed-ashraf-elsaed.github.io/aletheia-mem/` |
| Last push | 2026-10-26T09:24:31Z |
| npm package `aletheia-mem` | **404 — not published** (verified `registry.npmjs.org/aletheia-mem`) |

Current repository files, updated 2026-10-26: `README.md` (logo, real badges, ten machine translations, generated
tables), `SECURITY.md`, `CONTRIBUTING.md`, `NOTICE.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, the issue
forms and PR template under `.github/`, `.github/workflows/{ci,test,pages}.yml`, `.github/dependabot.yml`,
`docs/i18n/`, `Dockerfile`, `compose.yaml`, and `site/` with Open Graph tags and JSON-LD. Still missing: releases,
FUNDING (owner decision), Discussions, a demo GIF, a published npm package, and a generated docs site (T-086).

## 24.1 README structure we will adopt

The order is chosen so a stranger can decide in 30 seconds, then verify in 5 minutes. Wording plan is ours; the
structure is the part worth copying.

| # | Section | Wording plan (first sentence) | Current state |
|---:|---|---|---|
| 1 | Logo, name, one-line claim | "A free, local memory and rules hub for AI coding tools." | No logo. Add a wordmark, not claude-mem's. |
| 2 | Status line | "Status: alpha. The memory engine works; hook installers are not built." | Honest but buried in the README. |
| 3 | Badges | Licence, CI, last commit, issues, status, Bun, tested platform. No npm badge until published. | None. |
| 4 | Language switcher | One line, 32 links, after translations exist. | None. |
| 5 | The problem | "Every coding agent forgets between sessions, and each one remembers differently." | Present, longer. |
| 6 | What Aletheia is | Three sentences: one SQLite store, three interfaces, rules written into each tool's own file. | Present. |
| 7 | Quick start | Clone and `bun test` today; `npx aletheia-mem` only after T-080. | Present, says "after: git clone". Keep until published. |
| 8 | Verified vs not verified | A table with a "not tested on a real install" row. | Present and good. Keep. |
| 9 | Measured numbers | Retrieval table with n, date, command link and the answer-accuracy gap. | Present. Add the date visibly. |
| 10 | Interfaces | MCP, REST, CLI, files. | Present. |
| 11 | Rules sync | Nine targets, managed block, preview and backup. | Present. |
| 12 | Memory building | Facts, entities, temporal updates, dedupe, review. | **Not built**; do not add until T-017 to T-034 ship. |
| 13 | Privacy | Redaction before storage, loopback only, no telemetry, no account. | Present. |
| 14 | Migrate | claude-mem import, bundle, Markdown. | Present. |
| 15 | Configuration | Environment table. | Present. |
| 16 | Docs index | The numbered docs list. | Present. |
| 17 | Contributing and community | "The most useful contribution is a report from a real install." | Present in `CONTRIBUTING.md`; repeat one line. |
| 18 | Licence and NOTICE | Apache-2.0, claude-mem attribution. | Present. |

What we will **not** do: reuse claude-mem's prose, its logo or screenshots, its sponsor badges, or its "works with"
claims for tools we have not installed. The current README's honesty table is the model for every new section.

## 24.2 i18n plan

### 24.2.1 Languages claude-mem ships

From the repository tree (`docs/i18n/README.*.md`, fetched 2026-10-26), 32 files:

`ar`, `bn`, `cs`, `da`, `de`, `el`, `es`, `fi`, `fr`, `he`, `hi`, `hu`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`,
`pt`, `pt-br`, `ro`, `ru`, `sv`, `th`, `tl`, `tr`, `uk`, `ur`, `vi`, `zh`, `zh-tw`.

The README's language names, in its own order: 中文, 繁體中文, 日本語, Português, Português (Brasil), 한국어, Español,
Deutsch, Français, עברית, العربية, Русский, Polski, Čeština, Nederlands, Türkçe, Українська, Tiếng Việt, Tagalog,
Indonesia, ไทย, हिन्दी, বাংলা, اردو, Română, Svenska, Italiano, Ελληνικά, Magyar, Suomi, Dansk, Norsk.

We will ship the same set because it is a reasonable reach list, not because the list itself is proprietary.

### 24.2.2 File layout and switcher

```
README.md                          # English is canonical
docs/i18n/README.<code>.md         # one file per language
docs/i18n/.translation-state.json  # source hash per language
scripts/i18n-check.mjs             # drift detector (T-087)
```

Each translated file starts with:

```markdown
> Machine-translated from the English README on 2026-10-26. Review welcome: open a PR against this file.
> Source: [README.md](../../README.md)
```

The switcher line in `README.md` and in every translated file:

```markdown
[English](README.md) · [中文](docs/i18n/README.zh.md) · [Español](docs/i18n/README.es.md) · …
```

For `ar`, `he` and `ur`, add `<div dir="rtl">` around the body. Do not machine-translate code blocks, command names,
environment variables or URLs.

### 24.2.3 Workflow

1. English README changes land first.
2. A translator (human or machine) updates the target file.
3. `scripts/i18n-check.mjs` reads `README.md`, hashes the translatable text (excluding code fences and the switcher),
   compares it with `.translation-state.json`, and exits non-zero for stale languages.
4. CI runs the check on pull requests that touch `README.md` or `docs/i18n/`.
5. The translated file records the source hash and date. A stale file stays published but is marked stale in the
   switcher; it is never silently presented as current.
6. Native-speaker review is recorded in the file header as `reviewed by <handle> on <date>` only when it happened.

### 24.2.4 Order of work

- **Wave 1 (T-088):** `zh`, `es`, `pt-br`, `ja`, `de`, `fr`, `ko`, `hi`, `ar`, `ru`. These cover the largest likely
  audiences and the RTL case.
- **Wave 2 (T-089):** the remaining 22.
- **Docs site:** translate only the landing page after the README waves. Do not translate 20+ technical documents
  until the English ones stop changing weekly.

Cost: one machine translation pass per language, then review time. The workflow is cheap; the review is the cost.
Do not claim a language is "supported" until its file passes the drift check and at least one human has read it.

## 24.3 Badge plan

### 24.3.1 Badges we may show now (real data, real endpoints)

| Badge | Endpoint | Why it is honest | Notes |
|---|---|---|---|
| Licence | `https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem` | Reads `LICENSE` (Apache-2.0) | Always correct. |
| CI | `https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg` | Reads the real workflow status | Currently Linux only; state that next to it. |
| Last commit | `https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem` | Reads the repository | Shows activity honestly. |
| Stars | `https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem` | Reads the real count (0 today) | Allowed; consider hiding until it is meaningful, but never fake it. |
| Open issues | `https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem` | Reads the real count | Optional. |
| Status | `https://img.shields.io/badge/status-alpha-orange` | States project status, not a metric | Honest. |
| Runtime | `https://img.shields.io/badge/bun-%3E%3D1.1-black` | Matches `package.json` engines | Honest. |
| Tested platform | `https://img.shields.io/badge/platform-linux%20(tested)-lightgrey` | Only Linux is tested today | Update when T-014 adds macOS/Windows CI. |

A benchmark badge is *allowed* once the result has a dated command and raw output, for example
`Recall@5 57.5% · LoCoMo · 2026-10-26`. Until the raw output is published next to it, do not add it.

### 24.3.2 Badges we may NOT show yet

| Badge | Condition that must be met first | Current blocker |
|---|---|---|
| npm version | `npm view aletheia-mem version` returns a version | Package is 404 (verified 2026-10-26) |
| npm downloads | The same, plus 30 days of data | No package |
| Coverage | A real coverage run in CI with an uploaded report | No coverage tool or report |
| Test count | A script that reads `bun test` output and updates the number | README no longer types a count; `scripts/check-claims.mjs` runs the suite |
| Docker pulls | A published image on a registry | No published image; `Dockerfile` and `compose.yaml` exist, `docker build` NOT RUN BY AUTHOR |
| Latest release | A tagged GitHub release | No releases |
| OpenSSF Scorecard | A real scorecard run | None |
| "Works with <tool>" | A test on a real install of that tool | None for any tool (`README.md` says so). 2026-10-26: six tools have fixture-tested hook configs and end-to-end runs through their installed hook commands; that is still not a real install test. |
| Awesome-list mention | The list accepted the entry | No entry |
| Trendshift / Vercel OSS / sponsor badges | Actual acceptance into the programme | Not a member; do not copy claude-mem's |

Rule: a badge is a data read or an honest status. A static number that a human typed is neither. The README now says
"the test suite" without a count, and `scripts/check-claims.mjs` fails if a test, star or download count is typed by hand.

## 24.4 Repository polish checklist

| Item | Current | Task | Notes |
|---|---|---|---|
| Logo and wordmark | **Replaced 2026-10-27**: the owner's own logo (`docs/assets/logo.png`, brain mark `mark.png`, favicons in `site/`). The earlier SVG mark was removed | T-083 | Raster only; no SVG version of the new logo exists yet. |
| Social preview | **PNG card 2026-10-27**: `docs/assets/social.png`, 1280×640, built from the new logo | T-083 | The repository setting is the owner's action: upload this file in Settings > Social preview. |
| Demo GIF | **NOT RUN BY AUTHOR** | T-083 | Needs a real recorded session; no GIF is shipped. |
| Issue templates | **Done 2026-10-26**: bug, feature and new-host forms | T-084 | The new-host form requires the vendor's hook payload docs URL. |
| PR template | **Done 2026-10-26** | T-084 | Tests, docs, measurement command, no new dependency without a reason. |
| CODE_OF_CONDUCT | **Done 2026-10-26**: Contributor Covenant 2.1 | T-084 | Contact is a GitHub handle; no email is published. |
| SECURITY.md | Present; names GitHub private vulnerability reporting | — | No response-time promise. |
| CONTRIBUTING.md | Present | — | Keep; link the task system. |
| CHANGELOG.md | **Done 2026-10-26**: Keep a Changelog, 0.1.0 marked not released | T-085 | No tag or release was created. |
| Releases | None | T-085 | Tag `v0.1.0` only when the claims in it are true; owner action. |
| Dependabot | **Done 2026-10-26**: GitHub Actions weekly | T-085 | No npm entry because there are no npm dependencies. |
| FUNDING.yml | **Not added: owner decision** | T-085 | No funding destination was supplied. |
| Docker | **Files 2026-10-26**: `Dockerfile`, `compose.yaml` | T-081 | `docker build` NOT RUN BY AUTHOR. |
| GitHub topics | Present (12) | T-085 | Add `memory`, `agent-memory`, `rules`, `sqlite`, `bun`, `mcp-server`. |
| GitHub Discussions | Disabled | T-085 | Enable when there is a maintainer to answer; otherwise it is an empty room. |
| Docs site structure | **Done 2026-10-26**: 30 top-level docs plus an index, generated by `scripts/build-site.mjs` | T-086 | Markdown remains canonical; no framework or CDN. |
| Sitemap | **Done 2026-10-26**: 32 URLs, `lastmod` from git | T-086 | The count equals the pages. |
| Structured data | **Done 2026-10-26**: `TechArticle` per page, `CollectionPage` on the index, `FAQPage` on the landing page | T-086 | All inline JSON-LD; no external script. |
| robots.txt | Present; points at the generated sitemap | T-086 | Regenerated by the build. |
| Accessibility | Not audited | T-090 | axe pass, keyboard navigation, contrast, focus states. |
| Theme | Hub UI unaudited | T-090 | Light/dark, no flash of wrong theme. |
| Windows support | Not tested | T-014 | CI matrix; do not claim until green. |

## 24.5 Honest growth tactics

Effort is engineering or writing effort, not a time promise. Each tactic names the precondition that makes it honest.

| Tactic | Effort | Precondition | What to say | What not to say |
|---|---|---|---|---|
| Reproducible benchmark post | Medium | E01 answer accuracy (T-051) and raw outputs | "Here is the harness, the raw per-question output, the commit and the numbers, including the ones that got worse." | "Beats X by 2×" without equal inputs. |
| "Migrate from claude-mem" guide | Low | Importer exists (`src/hub/importers.mjs:14`) | "Read-only import, repeatable, here is the exact command and what is not imported." | "Lossless" (summaries and prompts are mapped, not byte-identical). |
| "Migrate from Mem0" guide | Medium | A Mem0 JSON importer (T-038-adjacent, currently missing) | "Export from Mem0, import here, here is the schema map." | "Works with Mem0" before the importer exists. |
| Show HN | Low | A user can try it without an account and without cloning a repo, ideally an npm package (T-080) | Title begins `Show HN:`, explains what it is and how to try it. | Landing pages, newsletters, "please upvote". HN's own guidelines say a Show HN must be something people can run; do not post a sign-up page. Source: `https://news.ycombinator.com/showhn.html`. |
| Reddit posts (r/ClaudeAI, r/LocalLLaMA, r/mcp) | Low | Mod rules checked at posting time | A benchmark result or a migration guide, with the command. | Cross-posted marketing copy. **UNVERIFIED**: Reddit returned HTTP 403 to every rules endpoint tried, so each subreddit's current rules must be read in a browser before posting. |
| awesome-claude-code | Low | 14 days old and active development, **or** ≥100 stars; one resource per PR | A one-line entry with the repository link. | Multiple entries in one PR; submissions before the age/star rule is met. Source: `https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/HEAD/CONTRIBUTING.md`. |
| awesome-mcp-servers | Low | Public GitHub repo, self-installable server (not remote-only) | Fork, branch, add the entry, open a PR; automated-agent PRs opt in with `🤖🤖🤖` in the title. Source: `https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/HEAD/CONTRIBUTING.md`. | Remote-only services; entries without an install path. |
| awesome-selfhosted | Low | The list's own criteria | **UNVERIFIED**: the README points to a contributing section, but the `CONTRIBUTING.md` path tried returned 404. Read the current criteria before submitting. | Assuming "free and local" is enough. |
| Other awesome lists | Low | Each list's rules | Follow the general awesome-list PR rules: one entry, correct alphabetical order, no duplicates, Code of Conduct. Source: `https://raw.githubusercontent.com/sindresorhus/awesome/HEAD/contributing.md`. | Bulk submissions. |
| Official MCP registry | Medium | A published server package and ownership proof | Publish with the `mcp-publisher` CLI from the server's own project; the registry README says a pull request does **not** publish a server. Namespace ownership is proven by GitHub login or DNS/HTTP challenge. Source: `https://raw.githubusercontent.com/modelcontextprotocol/registry/HEAD/README.md`. | A PR to the registry repository. |
| mcp.so | Low | A public server page | The site has a visible Submit entry point (`https://mcp.so`). Exact form fields **UNVERIFIED**. | Claiming a listing before it exists. |
| Glama | Low | A public repository | "Add Server" is visible on `https://glama.ai/mcp/servers`. Exact steps **UNVERIFIED**. | — |
| Smithery | Low | A public server | Landing page fetched (`https://smithery.ai`); submission steps **UNVERIFIED**. | — |
| PulseMCP | Low | — | **UNVERIFIED**: `https://www.pulsemcp.com` returned HTTP 403, so its submission process was not read. | Assuming it is automatic. |
| Integrations for each tool | High | A real install test per tool (T-055, T-075) | "Verified on <tool> <version> on <date>" with the config diff. 2026-10-26 status: six hook configs are fixture-tested, none has a real install test. | "Works with X" from documentation alone. |
| Talks and meetups | High | A measured result and a demo | A 10-minute "how we benchmarked memory and what failed" talk. | A product pitch with no numbers. |

### 24.5.1 What is explicitly out of scope

- **Buying stars, downloads, issues or reviews.** GitHub's Acceptable Use Policies prohibit "rank abuse, such as
  automated starring or following" and "inauthentic interactions, such as fake accounts and automated inauthentic
  activity" (`https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies`, section 4,
  fetched 2026-10-26).
- **Asking friends to upvote.** HN's Show HN guidelines say not to (`https://news.ycombinator.com/showhn.html`).
- **Copying claude-mem's README text, logo, artwork or screenshots.** Apache-2.0 permits code reuse with attribution;
  it does not make wholesale copying of the project's identity honest or useful. Attribution for the code we did reuse
  is in `NOTICE.md`.
- **Paid placement disguised as a recommendation.**
- **Badges for things that do not exist.** See 24.3.2.

### 24.5.2 The order that makes sense

1. **Make install real** (T-058, T-059): without hooks, a Show HN is a clone-and-read exercise, not a product.
2. **Publish the package** (T-080) so "try it" is one command.
3. **Publish answer accuracy** (T-051) so the benchmark post is not retrieval-only.
4. **Write the two migration guides**, because they are useful regardless of stars.
5. **Submit to the MCP registry and two awesome lists**, in that order.
6. **Show HN** only when the first three are done.
7. **Translations** after the English README stabilises; otherwise every translation is stale in a week.

## 24.6 What "parity" means for this repository

Parity with claude-mem is **not** copying its 163 features. It is closing the gaps that make the product usable and the
claims checkable:

- capture without manual calls (three installers, not nine);
- a measured answer-accuracy number;
- a reader that can install it in one command;
- a repository a contributor can navigate (templates, changelog, releases);
- a reachable README (translations, real badges, a demo).

Everything else in [20](20-claude-mem-feature-matrix.md) is either out of scope (paid cloud, enterprise) or a
differentiator we do not need to match (35 modes, TV view, Grok bot). The 20 highest-value gaps and their tasks are
ranked in [20 §20.12](20-claude-mem-feature-matrix.md#2012-the-20-most-valuable-gaps-ranked).
