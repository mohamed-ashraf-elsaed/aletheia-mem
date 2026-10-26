// T-213: motion helpers and the stylesheet's motion rules. The helpers run against a fake element with a recording
// animate(); the stylesheets are read as text.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { animate, collapse, countUp, enter, expand, leave, reducedMotion, shake, tokenMs, watchVisibility } from "../public/ui-motion.js";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

const root = join(import.meta.dir, "..", "public");
const read = (name) => readFileSync(join(root, name), "utf8");
let dom;

beforeEach(() => { dom = installFakeDom(); delete globalThis.matchMedia; delete globalThis.getComputedStyle; });
afterAll(() => restoreGlobals());

function recorder() {
  const runs = [];
  return { runs, animate(frames, options) { runs.push({ frames, options }); return { finished: Promise.resolve() }; }, hidden: false, scrollHeight: 120 };
}
const reduce = (on) => { globalThis.matchMedia = () => ({ matches: on }); };

describe("T-213: reduced motion", () => {
  test("it is read from the media query", () => {
    expect(reducedMotion()).toBe(false);
    reduce(true);
    expect(reducedMotion()).toBe(true);
  });
  test("movement becomes a short fade when reduced", async () => {
    reduce(true);
    const el = recorder();
    await enter(el);
    expect(el.runs.length).toBe(1);
    for (const frame of el.runs[0].frames) expect(Object.keys(frame)).toEqual(["opacity"]);
    expect(el.runs[0].options.duration).toBe(80);
  });
  test("with motion allowed the same call moves and uses the token duration", async () => {
    const el = recorder();
    await enter(el);
    expect(el.runs[0].frames[0]).toMatchObject({ opacity: 0, transform: "translateY(8px)" });
    expect(el.runs[0].options.duration).toBe(200);
  });
  test("an animation that only moves does nothing when reduced", async () => {
    reduce(true);
    const el = recorder();
    await shake(el);
    expect(el.runs.length).toBe(0);
  });
  test("every kind of enter and leave keeps to opacity and transform", async () => {
    const el = recorder();
    for (const kind of ["rise", "scale", "slide-right"]) { await enter(el, kind); await leave(el, kind); }
    expect(el.runs.length).toBe(6);
    for (const run of el.runs) for (const frame of run.frames) for (const key of Object.keys(frame)) expect(["opacity", "transform"]).toContain(key);
  });
  test("leave holds its end state until the element is removed", async () => {
    const el = recorder();
    await leave(el);
    expect(el.runs[0].options.fill).toBe("forwards");
  });
  test("an element without animate() resolves at once", async () => {
    await expect(animate({}, [{ opacity: 0 }, { opacity: 1 }])).resolves.toBeUndefined();
    await expect(animate(null, [])).resolves.toBeUndefined();
  });
  test("expand and collapse animate height, and collapse hides at the end", async () => {
    const el = recorder();
    el.hidden = true;
    await expand(el);
    expect(el.hidden).toBe(false);
    expect(el.runs[0].frames[1]).toMatchObject({ height: "120px" });
    await collapse(el);
    expect(el.hidden).toBe(true);
  });
  test("expand skips motion when reduced", async () => {
    reduce(true);
    const el = recorder();
    await expand(el);
    expect(el.runs.length).toBe(0);
  });
});

describe("T-213: count up, tokens, visibility", () => {
  test("a count-up ends on the final value", async () => {
    const el = dom.createElement("b");
    let frame = 0;
    globalThis.requestAnimationFrame = (fn) => { frame += 1; setTimeout(() => fn(performance.now() + frame * 400), 0); };
    el.isConnected;
    await countUp(el, 120, { from: 0, duration: 600, format: (n) => `${n}!` });
    expect(el.textContent).toBe("120!");
  });
  test("under reduced motion the number is set at once", async () => {
    reduce(true);
    const el = dom.createElement("b");
    await countUp(el, 55);
    expect(el.textContent).toBe("55");
  });
  test("a count-up to the same value does not animate", async () => {
    const el = dom.createElement("b");
    await countUp(el, 7, { from: 7 });
    expect(el.textContent).toBe("7");
  });
  test("durations are read from the CSS tokens, with a fallback", () => {
    globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => ({ "--ui-dur": " 200ms", "--ui-slow": "0.3s" }[name] ?? "") });
    expect(tokenMs("--ui-dur", 1)).toBe(200);
    expect(tokenMs("--ui-slow", 1)).toBe(300);
    expect(tokenMs("--missing", 77)).toBe(77);
  });
  test("hiding the page marks the root so loops pause, and showing it clears the mark", () => {
    watchVisibility(dom);
    expect(dom.documentElement.dataset.hidden).toBeUndefined();
    dom.visibilityState = "hidden";
    dom.dispatchOnDocument("visibilitychange", {});
    expect(dom.documentElement.dataset.hidden).toBe("1");
    dom.visibilityState = "visible";
    dom.dispatchOnDocument("visibilitychange", {});
    expect(dom.documentElement.dataset.hidden).toBeUndefined();
  });
});

/** Every `@keyframes name { ... }` block, found by matching braces. */
function keyframeBlocks(source) {
  const blocks = [];
  for (const match of source.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) { if (source[i] === "{") depth += 1; else if (source[i] === "}") depth -= 1; i += 1; }
    blocks.push(source.slice(match.index, i));
  }
  return blocks;
}

describe("T-213: the stylesheets", () => {
  const theme = read("ui-theme.css");
  const css = read("ui-components.css") + read("one-ui.css");
  test("duration tokens are 120, 200 and 320 ms", () => {
    expect(theme).toMatch(/--ui-dur-fast: 120ms/);
    expect(theme).toMatch(/--ui-dur: 200ms/);
    expect(theme).toMatch(/--ui-dur-slow: 320ms/);
  });
  test("reduced motion shortens every token and the components block stops loops and movement", () => {
    expect(theme).toMatch(/prefers-reduced-motion: reduce[\s\S]*--ui-dur-slow: 0\.01ms/);
    const block = /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("animation-iteration-count: 1 !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
  });
  test("transitions list their properties and never use `all`", () => {
    expect(/transition:\s*all/.test(css)).toBe(false);
    const transitions = css.match(/transition:[^;}]+/g) ?? [];
    expect(transitions.length).toBeGreaterThan(10);
    for (const line of transitions) for (const part of line.replace("transition:", "").split(",")) expect(/^\s*(transform|opacity|background-color|border-color|box-shadow|color)\b/.test(part)).toBe(true);
  });
  test("transitions use duration tokens, not loose numbers", () => {
    for (const line of css.match(/transition:[^;}]+/g) ?? []) expect(/var\(--ui-dur(-fast|-slow)?\)/.test(line)).toBe(true);
  });
  test("layout properties are never transitioned or keyframed", () => {
    const frames = keyframeBlocks(css);
    expect(frames.length).toBeGreaterThan(8);
    for (const block of frames) expect(/\b(width|height|top|left|right|bottom|margin|padding)\s*:/.test(block)).toBe(false);
  });
  test("looping animations exist only for loading marks and live status, and pause when the page is hidden", () => {
    const loops = (css.match(/[^{}]+\{[^}]*infinite[^}]*\}/g) ?? []).map((rule) => rule.trim().split("{")[0].trim());
    for (const selector of loops) expect(/skel|spinner|dot|brain|progress|region-bar|status-refresh|indeterminate/.test(selector)).toBe(true);
    expect(css).toContain(':root[data-hidden] *');
    expect(css).toContain("animation-play-state: paused !important");
  });
  test("the interactive pieces named in the task have motion: press, lift, stagger, shimmer, slide", () => {
    expect(css).toMatch(/\.ui-btn:active \{ transform: scale/);
    expect(css).toMatch(/\.ui-card\.is-interactive:hover[^}]*translateY\(-2px\)/);
    expect(css).toMatch(/\.ui-rise \{[^}]*animation-delay: calc\(var\(--i, 0\)/);
    expect(css).toMatch(/@keyframes ui-shimmer/);
    expect(css).toMatch(/\.ui-tab-indicator \{[\s\S]*transition: transform/);
  });
});
