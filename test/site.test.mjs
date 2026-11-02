// the docs site is generated from Markdown, uses relative links, and its sitemap matches the pages.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { faqOf, highlight, parseChangelog } from "../scripts/build-site.mjs";

const root = join(import.meta.dir, "..");
const site = join(root, "site");
const read = (path) => readFileSync(path, "utf8");

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : name.endsWith(".html") ? [path] : [];
  });

describe("docs site", () => {
  test("the build and sitemap check pass", async () => {
    const build = Bun.spawn([process.execPath, "scripts/build-site.mjs"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [buildOut, buildErr, buildCode] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited]);
    expect(buildCode).toBe(0);
    expect(buildErr).toBe("");
    expect(buildOut).toMatch(/site built: \d+ document pages/);
    const check = Bun.spawn([process.execPath, "scripts/check-sitemap.mjs"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [checkOut, checkErr, checkCode] = await Promise.all([new Response(check.stdout).text(), new Response(check.stderr).text(), check.exited]);
    expect(checkCode).toBe(0);
    expect(checkErr).toBe("");
    expect(checkOut).toMatch(/sitemap matches pages: \d+/);
  }, 60000);

  test("there is one page per top-level document", () => {
    // Count only tracked documents: private files may sit on a maintainer's disk but are never published.
    const tracked = Bun.spawnSync(["git", "ls-files", "docs"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const trackedNames = tracked.exitCode === 0 ? new Set(new TextDecoder().decode(tracked.stdout).split("\n").filter(Boolean)) : null;
    const docs = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md") && !name.startsWith("_") && (!trackedNames || trackedNames.has(`docs/${name}`)));
    // changelog.html is generated from CHANGELOG.md at the repository root, not from a docs/ document.
    const pages = readdirSync(join(site, "docs")).filter((name) => name.endsWith(".html") && name !== "index.html" && name !== "changelog.html");
    expect(pages.length).toBe(docs.length);
    for (const name of ["01-architecture.html", "25-installers.html", "29-sync.html", "30-remote-mcp.html", "32-requests.html"]) {
      expect(existsSync(join(site, "docs", name))).toBe(true);
    }
  });

  test("the changelog page is generated from CHANGELOG.md", () => {
    const html = read(join(site, "docs", "changelog.html"));
    expect(html).toContain('<h1 id="release-notes">Release notes</h1>');
    expect(html).toContain('"@type":"TechArticle"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('<link rel="canonical" href="https://aletheia.mohamedashrafelsaed.com/docs/changelog.html">');
    expect(html).toContain("<h2");
    // The Markdown copy is the raw changelog, and the page is listed in the sitemap and llms.txt.
    expect(read(join(site, "docs", "changelog.md"))).toBe(read(join(root, "CHANGELOG.md")));
    expect(read(join(site, "sitemap.xml"))).toContain("<loc>https://aletheia.mohamedashrafelsaed.com/docs/changelog.html</loc>");
    expect(read(join(site, "llms.txt"))).toContain("[Changelog](https://aletheia.mohamedashrafelsaed.com/docs/changelog.html)");
    expect(read(join(site, "llms-full.txt"))).toContain("Source: https://aletheia.mohamedashrafelsaed.com/docs/changelog.html");
  });

  test("a page renders headings, tables, lists, code and TechArticle data", () => {
    const text = read(join(site, "docs", "29-sync.html"));
    expect(text).toContain("<h1 id=");
    expect(text).toContain("<h2 id=");
    expect(text).toContain("<table>");
    expect(text).toContain("<ol>");
    expect(text).toContain("<ul>");
    expect(text).toContain("<pre><code");
    expect(text).toContain('"@type":"TechArticle"');
    expect(text).toContain('<link rel="canonical" href="https://aletheia.mohamedashrafelsaed.com/docs/29-sync.html">');
    expect(text).toContain('"author":{"@type":"Person","name":"Mohamed Ashraf Elsaed","url":"https://mohamedashrafelsaed.com","@id":"https://mohamedashrafelsaed.com/#person"}');
    expect(text).toContain('<footer>By <a rel="author" href="https://mohamedashrafelsaed.com">Mohamed Ashraf Elsaed</a>');
    expect(text).not.toContain("<private>");
    const installers = read(join(site, "docs", "25-installers.html"));
    expect(installers).toContain("&lt;private&gt;");
  });

  test("every relative href and asset resolves", () => {
    const problems = [];
    for (const file of htmlFiles(site)) {
      const text = read(file);
      for (const match of text.matchAll(/href="([^"]+)"/g)) {
        const href = match[1];
        if (/^(https?:|#|mailto:|tel:|\/)/.test(href)) continue;
        const clean = href.split("#")[0];
        if (!clean) continue;
        const target = resolve(dirname(file), decodeURIComponent(clean));
        if (!target.startsWith(site) || !existsSync(target)) problems.push(`${file}: ${href}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("the site uses no CDN or external script", () => {
    for (const file of htmlFiles(site)) {
      const text = read(file);
      expect(text).not.toMatch(/<script[^>]+src=/i);
      expect(text).not.toMatch(/(?:src|href)="https?:\/\/(?:[^"]*\.)?(?:cdn\.|unpkg|jsdelivr|googleapis)/i);
      expect(text).not.toContain("@import");
    }
  });

  test("the landing page carries FAQPage data and a docs link", () => {
    const text = read(join(site, "index.html"));
    expect(text).toContain('"@type":"FAQPage"');
    expect(text).toContain('href="docs/"');
    expect(text).toContain("assets/mark.png");
  });

  test("robots.txt points at the generated sitemap", () => {
    expect(read(join(site, "robots.txt"))).toContain("https://aletheia.mohamedashrafelsaed.com/sitemap.xml");
  });
});

describe("release notes", () => {
  const log = parseChangelog(read(join(root, "CHANGELOG.md")));
  const base = "https://aletheia.mohamedashrafelsaed.com/";

  test("parseChangelog reads dated versions, a yanked mark, Unreleased and undated notes", () => {
    const parsed = parseChangelog("# Changelog\n\n## [Unreleased]\n\n### Added\n\n- next\n\n## [1.1.0] - 2026-02-01\n\n### Added\n\n- a\n- b\n\n### Fixed\n\n- c\n\n## [1.0.1] - 2026-01-02 [YANKED]\n\n- bad\n\n## [1.0.0] - 2026-01-01\n\nFirst.\n\n## [0.9.0] — not released\n\nOld.\n\n[Unreleased]: https://example.com\n");
    expect(parsed.unreleased).toBe("### Added\n\n- next");
    expect(parsed.releases.map((release) => [release.version, release.date, release.yanked])).toEqual([["1.1.0", "2026-02-01", false], ["1.0.1", "2026-01-02", true], ["1.0.0", "2026-01-01", false]]);
    expect(parsed.releases[0].counts).toEqual({ Added: 2, Fixed: 1 });
    expect(parsed.releases[1].newer.version).toBe("1.1.0");
    expect(parsed.releases[1].older.version).toBe("1.0.0");
    expect(parsed.notes).toEqual([{ title: "0.9.0 — not released", markdown: "Old." }]);
  });

  test("every dated version has a page, a Markdown copy, a sitemap entry, an llms.txt line and an anchor", () => {
    expect(log.releases.length).toBeGreaterThan(10);
    const sitemap = read(join(site, "sitemap.xml"));
    const llms = read(join(site, "llms.txt"));
    const overview = read(join(site, "docs", "changelog.html"));
    for (const release of log.releases) {
      const html = read(join(site, "docs", "releases", `v${release.version}.html`));
      expect(html).toContain(`<h1 id="release-${release.version.replace(/\./g, "-")}">Aletheia ${release.version} release notes</h1>`);
      expect(html).toContain(`<link rel="canonical" href="${base}docs/releases/v${release.version}.html">`);
      expect(html).toContain(`"datePublished":"${release.date}"`);
      expect(html).toContain(`"softwareVersion":"${release.version}"`);
      expect(html).toContain('class="side"');
      expect(html).toContain('aria-current="page"');
      const description = /<meta name="description" content="([^"]+)">/.exec(html)[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      expect(description.length).toBeGreaterThanOrEqual(70);
      expect(description.length).toBeLessThanOrEqual(175);
      expect(existsSync(join(site, "docs", "releases", `v${release.version}.md`))).toBe(true);
      expect(sitemap).toContain(`<loc>${base}docs/releases/v${release.version}.html</loc><lastmod>${release.date}</lastmod>`);
      expect(llms).toContain(`(${base}docs/releases/v${release.version}.md)`);
      expect(overview).toContain(`id="v${release.version}"`);
      if (release.yanked) {
        expect(html).toContain("<strong>Yanked.</strong>");
        expect(html.replace(/<[^>]+>/g, "")).not.toContain(`npm install -g aletheia-mem@${release.version}`);
        expect(html).not.toContain(`/releases/tag/v${release.version}"`);
      } else {
        expect(html.replace(/<[^>]+>/g, "")).toContain(`npm install -g aletheia-mem@${release.version}`);
        expect(html).toContain(`https://github.com/mohamed-ashraf-elsaed/aletheia-mem/releases/tag/v${release.version}`);
      }
    }
  });

  test("no heading id repeats on the overview, though every version has Added or Changed", () => {
    const html = read(join(site, "docs", "changelog.html"));
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the Atom feed has one entry per version and every page links it", () => {
    const feed = read(join(site, "docs", "releases", "feed.xml"));
    expect(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect((feed.match(/<entry /g) ?? []).length).toBe(log.releases.length);
    expect(feed).toContain(`<updated>${log.releases[0].date}T00:00:00Z</updated>`);
    expect(feed).not.toMatch(/<content type="html">[^<]*<(?!\/content)/);
    for (const page of ["docs/index.html", "docs/start/introduction.html", "docs/changelog.html"]) {
      expect(read(join(site, page))).toContain(`<link rel="alternate" type="application/atom+xml" href="${base}docs/releases/feed.xml"`);
    }
  });

  test("the sidebar links the release notes and the header menu names the latest release", () => {
    const latest = log.releases[0];
    for (const page of ["docs/index.html", "docs/29-sync.html", "docs/releases/v0.1.0.html"]) {
      const html = read(join(site, page));
      expect(html).toContain('<summary>Prologue</summary>');
      expect(html).toMatch(/<a href="[^"]*changelog\.html"[^>]*>Release notes<\/a>/);
      expect(html).toContain(`<summary class="ver" aria-label="Releases, latest v${latest.version}">v${latest.version}`);
    }
    expect(read(join(site, "docs/releases/v0.1.0.html"))).toContain('<details class="grp side-releases" open><summary>Prologue</summary>');
    expect(read(join(site, "docs/29-sync.html"))).not.toContain('<details class="grp side-releases" open>');
  });

  test("the landing page shows the latest release and its JSON-LD carries the version", () => {
    const latest = log.releases[0];
    const html = read(join(site, "index.html"));
    expect(html).toContain(`<!-- release:begin --><p class="release-line">Latest release: <a href="docs/releases/v${latest.version}.html">Aletheia ${latest.version}</a>, ${latest.date}`);
    expect(html).toContain(`"softwareVersion":"${latest.version}","releaseNotes":"${base}docs/releases/v${latest.version}.html"`);
    expect((html.match(/"softwareVersion"/g) ?? []).length).toBe(1);
  });
});

describe("docs site structure and search metadata", () => {
  const nav = JSON.parse(read(join(root, "docs", "_nav.json")));
  const entries = nav.sections.flatMap((section) => section.pages.map((page) => ({ section: section.title, page })));
  const sectionDirs = /^(start|concepts|tools|guides|reference|compare|project)\//;

  test("the manifest lists each page once and every file exists", () => {
    const names = entries.map((entry) => entry.page);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(existsSync(join(root, "docs", name))).toBe(true);
    expect(nav.sections.map((section) => section.title)).toEqual(["Get started", "Concepts", "Connect your tools", "Guides", "Reference", "Compare", "Project", "Internals"]);
  });

  test("every listed page has an HTML page with a sidebar, breadcrumbs and a Markdown copy", () => {
    for (const { page } of entries) {
      const base = page.replace(/\.md$/, "");
      const html = read(join(site, "docs", `${base}.html`));
      expect(html).toContain('class="side"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('property="og:title"');
      expect(existsSync(join(site, "docs", `${base}.md`))).toBe(true);
    }
  });

  test("new pages carry one H1, a 70 to 175 character description and search keywords", () => {
    const titles = new Set();
    for (const { page } of entries.filter((entry) => sectionDirs.test(entry.page))) {
      const markdown = read(join(root, "docs", page));
      const prose = markdown.replace(/^\s*```[\s\S]*?^\s*```/gm, "");
      expect((prose.match(/^# /gm) ?? []).length).toBe(1);
      const description = /^<!--\s*description:\s*(.+?)\s*-->$/m.exec(markdown)?.[1];
      expect(description, `${page} description`).toBeTruthy();
      expect(description.length, `${page} description length`).toBeGreaterThanOrEqual(70);
      expect(description.length, `${page} description length`).toBeLessThanOrEqual(175);
      const keywords = /^<!--\s*keywords:\s*(.+?)\s*-->$/m.exec(markdown)?.[1] ?? "";
      expect(keywords.split(",").filter((word) => word.trim()).length, `${page} keywords`).toBeGreaterThanOrEqual(3);
      expect(markdown, `${page} names the product`).toMatch(/aletheia-mem/i);
      const title = /^# (.+)$/m.exec(prose)[1];
      expect(titles.has(title), `${page} duplicate title`).toBe(false);
      titles.add(title);
    }
  });

  test("llms.txt lists every page and llms-full.txt carries their text", () => {
    const llms = read(join(site, "llms.txt"));
    const full = read(join(site, "llms-full.txt"));
    expect(llms.startsWith("# Aletheia\n")).toBe(true);
    expect(llms).toContain("\n> Aletheia (npm package aletheia-mem)");
    for (const { page } of entries) {
      expect(llms).toContain(`/docs/${page})`);
      expect(full).toContain(`Source: https://aletheia.mohamedashrafelsaed.com/docs/${page.replace(/\.md$/, ".html")}`);
    }
    expect(full).not.toContain("<!-- keywords:");
  });

  test("robots.txt names the AI crawlers and the sitemap", () => {
    const robots = read(join(site, "robots.txt"));
    for (const name of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) expect(robots).toContain(`User-agent: ${name}`);
    expect(robots).not.toMatch(/Disallow:\s*\//);
  });

  test("the FAQ page publishes FAQPage data with one entry per question", () => {
    const html = read(join(site, "docs", "start", "faq.html"));
    expect(html).toContain('"@type":"FAQPage"');
    const markdown = read(join(root, "docs", "start", "faq.md"));
    const questions = (markdown.match(/^### .+\?$/gm) ?? []).length;
    expect(questions).toBeGreaterThanOrEqual(15);
    expect((html.match(/"@type":"Question"/g) ?? []).length).toBe(questions);
  });

  test("the docs index has the sidebar, a search box and a card for every section", () => {
    const html = read(join(site, "docs", "index.html"));
    expect(html).toContain('<aside class="side" id="side"');
    expect(html).toContain('<div class="frame">');
    expect(html).toContain('id="q"');
    for (const section of nav.sections) expect(html).toContain(`<h2>${section.title}</h2>`);
  });

  test("search.json lists every page and every release with a site-relative address", () => {
    const index = JSON.parse(read(join(site, "docs", "search.json")));
    const urls = new Set(index.map((entry) => entry.u));
    for (const { page } of entries) expect(urls.has(`docs/${page.replace(/\.md$/, ".html")}`)).toBe(true);
    expect(urls.has("docs/changelog.html")).toBe(true);
    for (const entry of index) {
      expect(existsSync(join(site, entry.u))).toBe(true);
      expect(typeof entry.t).toBe("string");
    }
  });

  test("every page head carries the social image size, locale, author and the page script inline", () => {
    for (const page of ["docs/index.html", "docs/start/faq.html", "docs/releases/v0.1.12.html"]) {
      const html = read(join(site, page));
      expect(html).toContain('<meta property="og:image:width" content="1280">');
      expect(html).toContain('<meta property="og:locale" content="en_US">');
      expect(html).toContain('<meta name="author" content="Mohamed Ashraf Elsaed">');
      expect(html).toContain('<a class="skip" href="#content">');
      expect(html).toContain('<main id="content" class="doc">');
      expect(html).toContain('docs/search.json');
      expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
    }
  });

  test("docs pages use the docs stylesheet and self-hosted fonts, with their licences", () => {
    for (const name of ["instrument-sans-latin.woff2", "ibm-plex-mono-500-latin.woff2", "OFL-InstrumentSans.txt", "OFL-IBMPlexMono.txt"]) {
      expect(existsSync(join(site, "assets", "fonts", name))).toBe(true);
    }
    const css = read(join(site, "assets", "docs.css"));
    expect(css).toContain("url(fonts/instrument-sans-latin.woff2)");
    expect(css).not.toMatch(/url\((?:"|')?https?:/);
    const html = read(join(site, "docs", "start", "quickstart.html"));
    expect(html).toContain('<link rel="stylesheet" href="../../assets/docs.css">');
    expect(html).toContain('<link rel="preload" href="../../assets/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>');
    expect(html).toContain('<dialog class="search-dialog" id="ds-dialog"');
    expect(html).toContain('class="page-meta"><a href="https://github.com/mohamed-ashraf-elsaed/aletheia-mem/edit/main/docs/start/quickstart.md">');
    expect(html).toContain('<nav class="toc" aria-label="On this page">');
    expect(html).toContain('<nav class="toc-inline" aria-label="Sections">');
    expect(html).toContain('<button class="copy-md" type="button" data-md="quickstart.md">');
  });

  test("no page repeats an element id, so the search dialog and anchors always resolve", () => {
    const problems = [];
    for (const file of htmlFiles(site)) {
      const ids = [...read(file).matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
      const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (repeated.length) problems.push(`${file}: ${[...new Set(repeated)].join(", ")}`);
    }
    expect(problems).toEqual([]);
  });

  test("highlight numbers every line, colours shell and JSON tokens and escapes HTML", () => {
    expect(highlight("$ ALETHEIA_PORT=1 aletheia-server --port 2 # note", "bash")).toBe('<span class="line"><span class="c">$ </span><span class="v">ALETHEIA_PORT=1 </span><span class="k">aletheia-server</span> <span class="f">--port</span> <span class="n">2</span> <span class="c"># note</span></span>');
    expect(highlight('{"a": "<b>", "n": 1}', "json")).toBe('<span class="line">{<span class="f">&quot;a&quot;</span>: <span class="s">&quot;&lt;b&gt;&quot;</span>, <span class="f">&quot;n&quot;</span>: <span class="n">1</span>}</span>');
    expect(highlight("a\n<b>", "text")).toBe('<span class="line">a</span>\n<span class="line">&lt;b&gt;</span>');
  });

  test("faqOf turns question headings into question and answer pairs and ignores code", () => {
    const pairs = faqOf("# T\n\n### Is it free?\n\nYes. See [the licence](LICENSE).\n\n```\n### not a question?\n```\n\n### Where is data?\n\nIn `~/.aletheia`.\n");
    expect(pairs).toEqual([
      { question: "Is it free?", answer: "Yes. See the licence." },
      { question: "Where is data?", answer: "In ~/.aletheia." },
    ]);
  });
});
