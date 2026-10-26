// T-086: the docs site is generated from Markdown, uses relative links, and its sitemap matches the pages.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
    expect(buildOut).toContain("30 document pages");
    const check = Bun.spawn([process.execPath, "scripts/check-sitemap.mjs"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [checkOut, checkErr, checkCode] = await Promise.all([new Response(check.stdout).text(), new Response(check.stderr).text(), check.exited]);
    expect(checkCode).toBe(0);
    expect(checkErr).toBe("");
    expect(checkOut).toContain("sitemap matches pages: 32");
  });

  test("there is one page per top-level document", () => {
    const docs = readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md") && !name.startsWith("_"));
    const pages = readdirSync(join(site, "docs")).filter((name) => name.endsWith(".html") && name !== "index.html");
    expect(pages.length).toBe(docs.length);
    for (const name of ["01-architecture.html", "20-claude-mem-feature-matrix.html", "29-sync.html", "30-remote-mcp.html", "manual-test.html"]) {
      expect(existsSync(join(site, "docs", name))).toBe(true);
    }
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
    expect(text).toContain('<link rel="canonical" href="https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/29-sync.html">');
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
    expect(text).toContain("assets/logo.svg");
  });

  test("robots.txt points at the generated sitemap", () => {
    expect(read(join(site, "robots.txt"))).toContain("https://mohamed-ashraf-elsaed.github.io/aletheia-mem/sitemap.xml");
  });
});
