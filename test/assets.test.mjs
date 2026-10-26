// T-083: an original, text-free mark; a 1280x640 social card; no demo GIF is claimed.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const files = ["docs/assets/logo.svg", "docs/assets/logo-dark.svg", "docs/assets/social.svg", "site/assets/logo.svg", "site/favicon.svg"];

describe("visual assets", () => {
  test("every asset exists, is SVG and has no external image reference", () => {
    for (const file of files) {
      expect(existsSync(join(root, file))).toBe(true);
      const text = read(file);
      expect(text.startsWith("<svg")).toBe(true);
      expect(text).toContain("viewBox=");
      expect(text).not.toContain("<image");
      expect(text).not.toContain("href=");
    }
  });

  test("the logo is a text-free geometric mark", () => {
    for (const file of ["docs/assets/logo.svg", "docs/assets/logo-dark.svg", "site/assets/logo.svg"]) {
      const text = read(file);
      expect(text).not.toContain("<text");
      expect(text).toContain("<path");
      expect(text).toContain("<circle");
    }
  });

  test("the social card is 1280x640 and uses our own wording", () => {
    const text = read("docs/assets/social.svg");
    expect(text).toContain('width="1280"');
    expect(text).toContain('height="640"');
    expect(text).toContain("Free, local memory and rules");
    expect(text).toContain("for AI coding tools.");
    expect(text).not.toMatch(/\b\d[\d,]*\s+(stars?|downloads?|tests?)\b/i);
  });

  test("README and site header point at the mark", () => {
    expect(read("README.md")).toContain("docs/assets/logo.svg");
    expect(read("site/index.html")).toContain("assets/logo.svg");
  });

  test("no demo GIF is referenced or claimed", () => {
    for (const file of ["README.md", "site/index.html", "docs/24-repo-parity-and-growth.md"]) {
      expect(read(file)).not.toMatch(/demo\.gif|\.gif\)/i);
    }
  });
});
