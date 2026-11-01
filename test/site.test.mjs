// the docs site is generated from Markdown, uses relative links, and its sitemap matches the pages.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { faqOf } from "../scripts/build-site.mjs";

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
    expect(html).toContain('<h1 id="changelog">Changelog</h1>');
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

  test("the docs index has a search box and a card for every section", () => {
    const html = read(join(site, "docs", "index.html"));
    expect(html).toContain('id="q"');
    for (const section of nav.sections) expect(html).toContain(`<h2>${section.title}</h2>`);
  });

  test("faqOf turns question headings into question and answer pairs and ignores code", () => {
    const pairs = faqOf("# T\n\n### Is it free?\n\nYes. See [the licence](LICENSE).\n\n```\n### not a question?\n```\n\n### Where is data?\n\nIn `~/.aletheia`.\n");
    expect(pairs).toEqual([
      { question: "Is it free?", answer: "Yes. See the licence." },
      { question: "Where is data?", answer: "In ~/.aletheia." },
    ]);
  });
});
