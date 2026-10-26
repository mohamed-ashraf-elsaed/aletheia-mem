import { describe, expect, test } from "bun:test";
import { parseMarkdown, renderMarkdown, safeUrl } from "../public/ui-markdown.js";
import { fakeDoc, serialize } from "./support/fake-dom.mjs";

const render = (text, options = {}) => renderMarkdown(text, { doc: fakeDoc, ...options });
const html = (text) => serialize(render(text));
const TAGS = new Set(["div", "p", "span", "h2", "h3", "h4", "h5", "h6", "hr", "blockquote", "pre", "code", "ul", "ol", "li", "input", "table", "thead", "tbody", "tr", "th", "td", "a", "strong", "em", "del", "br", "button"]);
const ATTRS = new Set(["class", "dir", "href", "rel", "target", "type", "disabled", "checked", "aria-label", "start", "tabindex", "data-lang"]);

function assertInert(root) {
  for (const el of root.all()) {
    expect(TAGS.has(el.tag)).toBe(true);
    for (const [key, value] of Object.entries(el.attrs)) {
      expect(ATTRS.has(key)).toBe(true);
      expect(key.startsWith("on")).toBe(false);
      if (key === "href") expect(/^(https?:\/\/|mailto:)/i.test(value)).toBe(true);
    }
  }
}

describe("T-150: Markdown blocks", () => {
  test("headings shift down one level so the page keeps its own h1", () => {
    expect(html("# Title\n\n### Small")).toContain("<h2");
    expect(html("### Small")).toContain("<h4");
  });
  test("paragraphs keep soft line breaks as <br>", () => {
    expect(html("one\ntwo")).toContain("one<br></br>two");
  });
  test("unordered, ordered and nested lists", () => {
    const out = html("- a\n- b\n  - inner\n\n3. x\n4. y");
    expect(out).toContain("<ul>");
    expect(out).toContain("inner");
    expect(out).toContain('<ol start="3">');
  });
  test("task lists render disabled checkboxes", () => {
    const root = render("- [x] done\n- [ ] todo");
    const boxes = root.querySelectorAll("input");
    expect(boxes.length).toBe(2);
    expect(boxes[0].attrs.checked).toBe("");
    expect(boxes[1].attrs.checked).toBeUndefined();
    expect(boxes[0].attrs.disabled).toBe("");
  });
  test("fenced code keeps its text, shows the language and has a copy button", () => {
    const root = render("```js\nconst a = '<b>';\n```");
    expect(root.querySelector(".ui-md-lang").textContent).toBe("js");
    expect(root.querySelector("pre").textContent).toBe("const a = '<b>';");
    expect(root.querySelector("button").textContent).toBe("Copy");
  });
  test("the copy button sends the code to the copy callback", async () => {
    let copied = null;
    const root = render("```\nhello\n```", { onCopy: (text) => { copied = text; } });
    root.querySelector("button").dispatch("click");
    await Promise.resolve();
    expect(copied).toBe("hello");
  });
  test("an unclosed fence runs to the end", () => {
    expect(render("```\nopen\nstill").querySelector("pre").textContent).toBe("open\nstill");
  });
  test("blockquotes nest blocks", () => {
    expect(html("> quote\n> - item")).toContain("<blockquote");
    expect(html("> quote\n> - item")).toContain("<li");
  });
  test("tables with alignment", () => {
    const root = render("| a | b |\n|:--|--:|\n| 1 | 2 |\n| 3 | x\\|y |");
    expect(root.querySelectorAll("th").length).toBe(2);
    expect(root.querySelectorAll("td").length).toBe(4);
    expect(root.querySelectorAll("th")[1].className).toBe("ui-align-right");
    expect(root.querySelectorAll("td")[3].textContent).toBe("x|y");
  });
  test("a horizontal rule", () => {
    expect(html("a\n\n---\n\nb")).toContain("<hr");
  });
  test("a pipe in a paragraph is not a table", () => {
    expect(render("a | b\nplain").querySelectorAll("table").length).toBe(0);
  });
});

describe("T-150: Markdown inline", () => {
  test("code, strong, emphasis and strikethrough", () => {
    const out = html("`x` **b** *i* ~~d~~");
    for (const tag of ["<code", "<strong", "<em", "<del"]) expect(out).toContain(tag);
  });
  test("snake_case words are not emphasis", () => {
    expect(html("use snake_case_name here")).not.toContain("<em");
  });
  test("code spans protect markup characters", () => {
    expect(html("`**not bold**`")).not.toContain("<strong");
  });
  test("a link has rel and target, and the label is text", () => {
    const a = render("[site](https://example.com/a?b=1)").querySelector("a");
    expect(a.attrs).toMatchObject({ href: "https://example.com/a?b=1", rel: "noopener noreferrer", target: "_blank" });
    expect(a.textContent).toBe("site");
  });
  test("mailto and bare URLs become links; trailing punctuation stays outside", () => {
    expect(render("[m](mailto:a@b.co)").querySelector("a").attrs.href).toBe("mailto:a@b.co");
    const a = render("see https://example.com/x.").querySelector("a");
    expect(a.attrs.href).toBe("https://example.com/x");
  });
  test("backslash escapes", () => {
    expect(render("\\*not em\\*").textContent).toBe("*not em*");
  });
});

describe("T-150: hostile input stays inert", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](java\nscript:alert(1))",
    "[x](java\tscript:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](vbscript:msgbox(1))",
    "[x](//evil.example/x)",
    "[x](/relative)",
    "<img src=x onerror=alert(1)>",
    "![x](javascript:alert(1))",
    "<a href=\"javascript:alert(1)\" onclick=\"x()\">y</a>",
    "**<svg onload=alert(1)>**",
    "| <b>x</b> |\n|---|\n| <img onerror=x> |",
    "```<script>```\n<script>\n```",
    "- <iframe src=x></iframe>",
    "> <style>*{display:none}</style>",
    "# <script>x</script>",
    "[a](https://ok.example \"title\" onmouseover=alert(1))",
    "‮<script>",
  ];
  for (const attack of attacks) {
    test(`inert: ${JSON.stringify(attack).slice(0, 50)}`, () => {
      const root = render(attack);
      assertInert(root);
    });
  }
  test("script text survives as visible text, not markup", () => {
    const root = render("<script>alert(1)</script>");
    expect(root.textContent).toContain("<script>alert(1)</script>");
    expect(root.querySelectorAll("script").length).toBe(0);
    expect(serialize(root)).toContain("&lt;script&gt;");
  });
  test("a javascript: link keeps its label as plain text", () => {
    const root = render("[click](javascript:alert(1))");
    expect(root.querySelectorAll("a").length).toBe(0);
    expect(root.textContent).toBe("click");
  });
  test("safeUrl only accepts http, https and mailto", () => {
    expect(safeUrl("https://a.example")).toBe("https://a.example");
    expect(safeUrl("HTTP://a.example")).toBe("HTTP://a.example");
    for (const bad of ["javascript:1", " javascript:1", "data:text/plain,x", "ftp://x", "//x", "/x", "", null, "http//x", "https://", "java\u0000script:1"]) expect(safeUrl(bad)).toBeNull();
  });
  test("deep nesting and huge input do not blow the stack or hang", () => {
    const start = performance.now();
    assertInert(render("> ".repeat(500) + "deep"));
    assertInert(render("- a\n".repeat(2000)));
    assertInert(render("*".repeat(5000)));
    assertInert(render("[".repeat(3000) + "](x)"));
    assertInert(render("`".repeat(3000)));
    expect(performance.now() - start).toBeLessThan(3000);
  });
  test("very long text is cut with a notice", () => {
    const root = render("a".repeat(300_000), { maxChars: 1000 });
    expect(root.textContent).toContain("cut here");
    expect(parseMarkdown("x".repeat(10), { maxChars: 5 }).truncated).toBe(true);
  });
  test("user text carries dir=auto for right-to-left scripts", () => {
    expect(render("مرحبا بالعالم").querySelector("p").attrs.dir).toBe("auto");
  });
});
