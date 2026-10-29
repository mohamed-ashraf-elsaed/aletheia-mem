// The GitHub wiki is generated from the docs: page names come from titles and links are rewritten for the wiki.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { toWikiMarkdown, wikiName } from "../scripts/build-wiki.mjs";

const root = join(import.meta.dir, "..");

describe("wiki page names", () => {
  test("a name is the title before a colon, words joined with hyphens, punctuation removed", () => {
    expect(wikiName("Quickstart: your first memory in ten minutes")).toBe("Quickstart");
    expect(wikiName("Claude Code memory with Aletheia")).toBe("Claude-Code-memory-with-Aletheia");
    expect(wikiName("Install smoke check (macOS and no-Bun)")).toBe("Install-smoke-check-macOS-and-no-Bun");
  });
});

describe("wiki Markdown", () => {
  const names = new Map([["concepts/rules", "Rules"], ["start/faq", "FAQ"]]);
  const page = { rel: "start/introduction", siteRel: "docs/start/introduction.html", file: join(root, "docs", "start", "introduction.md") };

  test("links between documents become wiki links and keep the anchor", () => {
    const out = toWikiMarkdown("See [rules](../concepts/rules.md#scopes) and [FAQ](faq.md).", page, names);
    expect(out).toContain("[rules](Rules#scopes)");
    expect(out).toContain("[FAQ](FAQ)");
  });

  test("links to other repository files and images become GitHub URLs", () => {
    const out = toWikiMarkdown("[README](../../README.md) and ![shot](../screenshots/home-dark.webp)", page, names);
    expect(out).toContain("(https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/README.md)");
    expect(out).toContain("(https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/docs/screenshots/home-dark.webp)");
  });

  test("keyword comments are dropped, code is untouched and a source line is added", () => {
    const out = toWikiMarkdown("# T\n\n<!-- keywords: a, b -->\n\n```\n[x](y.md)\n```\n", page, names);
    expect(out).not.toContain("keywords:");
    expect(out).toContain("[x](y.md)");
    expect(out).toContain("generated from [`docs/start/introduction.md`]");
  });
});
