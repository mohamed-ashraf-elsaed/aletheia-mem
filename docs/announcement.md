# Aletheia announcement kit

Ready-to-post text for each channel, and a plan to get the project found by search engines.
Nothing here has been posted. Post it yourself, or tell an agent to post a specific item.

Facts used in every post come from the README and the status page. Do not add claims that are not in
the README. The project is alpha: say so. No host has been opened with a generated config yet, answer
accuracy is not measured, and CI runs on Linux and macOS only.

Links used below:

- npm: https://www.npmjs.com/package/aletheia-mem
- Repo: https://github.com/mohamed-ashraf-elsaed/aletheia-mem
- Docs: https://mohamed-ashraf-elsaed.github.io/aletheia-mem/
- Install: `npm install -g aletheia-mem` then `aletheia-server` (Bun 1.1 or newer is required)

Before posting, publish the next npm version so the npm page shows the new look (see `docs/releasing.md`).
Check the npm page, the screenshots and the badges first. Post only after that works.

## One-line pitch

A free, local memory and rules hub for AI coding tools. One store on your machine; any tool reads it over MCP, REST or the CLI.

## Short pitch (about 50 words)

Every coding agent forgets between sessions, and each one remembers differently. Aletheia keeps your memory
and rules once, on your machine, in one SQLite store. Tools read it over MCP, REST or the CLI. Your rules
are written into each tool's own file: CLAUDE.md, AGENTS.md, Cursor rules and more. Free, no account.

## Posts by channel

### GitHub release and Discussions

Title: Aletheia 0.1.x: one local memory and rules store for your AI coding tools

Body:

Aletheia is a free, local memory and rules hub for AI coding tools.

- One SQLite store on your machine. No account, no cloud needed.
- Read it over MCP, REST or the CLI.
- Rules are synced into each tool's own instruction file.
- Export and import to move between tools.
- A local web app to search, edit, pin and review what was stored.

Install: `npm install -g aletheia-mem`, then `aletheia-server`, then open http://127.0.0.1:37790. Bun 1.1 or newer is required.

Status: alpha. Feedback and bug reports are very welcome: https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues

### Hacker News (Show HN)

Title: Show HN: Aletheia, a local memory and rules hub for AI coding tools

Body:

I got tired of every coding agent forgetting between sessions, and each one keeping its own notes in its own format.
Aletheia keeps memory and rules in one local SQLite store. Tools read it over MCP, REST or a CLI, and rules are written
into each tool's own file (CLAUDE.md, AGENTS.md, Cursor rules). Recalled memory is wrapped and marked as untrusted data
before it reaches a model.

It is alpha. It runs on Bun, CI covers Linux and macOS, and answer accuracy is not measured yet. I would like to hear what breaks.

https://github.com/mohamed-ashraf-elsaed/aletheia-mem

Tips: post on a weekday morning (US Eastern), stay in the thread for the first two hours, answer every question plainly.

### Reddit

Pick subreddits whose rules allow project posts, and read each rule first. Do not post the same text everywhere on the same day.
Candidates: r/ClaudeAI, r/LocalLLaMA, r/mcp, r/commandline, r/opensource, r/programming (only if it allows self-posts).

Title: I built a free local memory and rules hub for AI coding tools (MCP, REST, CLI)

Body:

Each coding agent forgets between sessions and keeps its own notes. I built Aletheia so the memory and rules live once,
on your machine, in one SQLite store. Any tool can read it over MCP, REST or the CLI, and your rules are synced into
CLAUDE.md, AGENTS.md and Cursor rules.

Free, Apache-2.0, no account. Alpha. Needs Bun 1.1+.
`npm install -g aletheia-mem` and `aletheia-server`.

Repo: https://github.com/mohamed-ashraf-elsaed/aletheia-mem. What would you want it to do that it does not?

### X (Twitter), thread

1. I built Aletheia: a free, local memory and rules hub for AI coding tools. One store on your machine. Any tool reads it over MCP, REST or the CLI. [screenshot: memory-dark]
2. The problem: every agent forgets between sessions, and each keeps notes in its own format.
3. What it does: one SQLite store, rules synced into CLAUDE.md, AGENTS.md and Cursor rules, export and import, a local web app to search and edit.
4. Install: `npm install -g aletheia-mem` then `aletheia-server`. Needs Bun 1.1+. Alpha, Apache-2.0.
5. Repo and docs: https://github.com/mohamed-ashraf-elsaed/aletheia-mem. Feedback welcome.

### LinkedIn

Title line: Open source: one memory store for all your AI coding tools

Post:

Using more than one AI coding tool means repeating yourself. Each one forgets between sessions and stores notes its own way.

I built Aletheia, a free, local memory and rules hub. One store on your machine; your tools read it over MCP, REST or the CLI,
and your rules are written into each tool's own file.

It is alpha and open source (Apache-2.0). Install with `npm install -g aletheia-mem`. Feedback and issues are welcome.

https://github.com/mohamed-ashraf-elsaed/aletheia-mem

### Bluesky and Mastodon

Aletheia: a free, local memory and rules hub for AI coding tools. One SQLite store on your machine, read over MCP, REST or CLI.
Rules synced to CLAUDE.md, AGENTS.md and Cursor. Alpha, Apache-2.0. `npm i -g aletheia-mem`
https://github.com/mohamed-ashraf-elsaed/aletheia-mem
#opensource #MCP #AI #devtools

### dev.to, Hashnode and Medium (article)

Title: One memory for every AI coding tool: why I built Aletheia

Outline (800 words or fewer):

1. The problem: agents forget; every tool has its own notes and rules file.
2. The idea: keep memory and rules once, locally, and let tools read them in their own format.
3. How it works: SQLite store, MCP/REST/CLI, rule sync, export and import.
4. Safety: recalled memory is wrapped and marked untrusted so a poisoned note cannot give orders to a model.
5. Try it: install block and a screenshot.
6. Honest status: alpha, what is tested and what is not, what is next.

Set the canonical URL to the docs site if you publish the article there first. Add tags: opensource, ai, mcp, productivity.

### Product Hunt

Name: Aletheia
Tagline (60 characters or fewer): Local memory and rules for all your AI coding tools
Description: A free, local hub that keeps your AI tools' memory and rules in one SQLite store. Read it over MCP, REST or CLI. Open source, alpha.
First comment: say who you are, the problem, that it is alpha, and ask what to build next.
Product Hunt favours products with a working landing page; the docs site serves as that.

### Lobsters, Discord and Slack communities

Lobsters needs an invite and a tag (`ai`, `show`). Use the Hacker News text.
For Discord and Slack servers about MCP, Claude Code, Cursor and local AI: read the rules, post once in the right channel,
and keep it to three lines: what it is, the install command, the repo link.

### YouTube or short video (optional)

Title: One memory for all your AI coding tools (Aletheia demo, 2 minutes)
Script: show install, open the app, search a memory, sync a rule file. Use the real app on demo data and say "demo data" on screen.

## Registries and lists (these also drive search traffic)

Open pull requests or submissions to:

- The official MCP registry and other MCP directories (task T-082 prepares the drafts).
- Awesome lists for MCP servers and for AI coding tools. Follow each list's contribution rules.
- npm: keywords are already set in `package.json`. Keep them accurate.
- GitHub: add repository topics (for example `mcp`, `ai-memory`, `claude-code`, `cursor`, `sqlite`, `bun`) and set the social preview image to `docs/assets/social.png` in repo settings. These are owner steps.

## Getting found by search engines

Honest limit: nobody can guarantee a ranking in one week, and anyone who promises it is selling something.
A brand-new site usually takes weeks to rank for competitive terms. What you can do in one week is get indexed
and earn the first real links. Do these in order.

Day 1: make the pages findable

1. Publish the next npm version so the npm page is current.
2. Check the docs site has one clear title and description per page, a canonical URL, and `site/sitemap.xml`
   (the site builder generates it). Confirm https://mohamed-ashraf-elsaed.github.io/aletheia-mem/sitemap.xml opens.
3. Check that `robots.txt` does not block the site.
4. Add the repository topics and the social preview image on GitHub.

Day 1 to 2: ask search engines to crawl

5. Google Search Console: add the docs site as a property, verify it, submit the sitemap, and request indexing for the home page.
6. Bing Webmaster Tools: add the site (you can import it from Search Console) and submit the sitemap.
   Bing also feeds DuckDuckGo and other engines.
7. IndexNow: submit the URLs once (Bing, Yandex and others accept it).
8. Check progress with `site:mohamed-ashraf-elsaed.github.io/aletheia-mem` in Google and Bing.

Day 2 to 7: earn links (this is what moves rankings)

9. Post the announcements above, one channel per day, not all at once.
10. Submit to the MCP registry and the awesome lists. These are high-quality links.
11. Publish the dev.to or Hashnode article with a link to the docs site and the repo.
12. Answer questions on Stack Overflow, Reddit and Discord where Aletheia is a real answer, with a link. Do not spam.
13. Ask a few people you know to star the repo and share it. Do not buy stars or links: it breaks platform rules and gets the project banned.

Targets that are realistic: your own name, "aletheia-mem" and "Aletheia memory hub AI coding" should appear in search within
days to two weeks. Broad terms such as "AI memory" or "MCP memory server" take longer and depend on links and real use.

## Rules for every post

- Say alpha. Do not write "works with X" unless a test proves it.
- No download, star or user numbers unless they are real and read from the source that day.
- One link to the repo, one to the docs site. No tracking links.
- Reply to every comment in the first day.
- Record each post and its URL in `docs/tasks/unverified.md` or a launch log, so the claims can be checked later.
