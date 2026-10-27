// Motion helpers (T-204, T-213). Everything here uses the Web Animations API on transform and opacity only, and
// reads its durations from the CSS tokens. When the user asks for reduced motion, movement is replaced by a very
// short fade. Nothing here blocks input: each function returns a promise that resolves when the animation ends.

export const reducedMotion = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/** A duration token in milliseconds, for example tokenMs("--ui-dur", 200). */
export function tokenMs(name, fallback = 200) {
  try {
    const raw = globalThis.getComputedStyle?.(globalThis.document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    return raw.endsWith("ms") ? Number.parseFloat(raw) : raw.endsWith("s") ? Number.parseFloat(raw) * 1000 : fallback;
  } catch {
    return fallback;
  }
}

const ease = { out: "cubic-bezier(0.16, 1, 0.3, 1)", standard: "cubic-bezier(0.2, 0, 0, 1)" };

/** Run keyframes. Under reduced motion only opacity is kept and the duration is cut to 80 ms. */
export function animate(el, keyframes, { duration = tokenMs("--ui-dur", 200), easing = ease.out, fill = "backwards", delay = 0 } = {}) {
  if (!el || typeof el.animate !== "function") return Promise.resolve();
  let frames = keyframes;
  let time = duration;
  if (reducedMotion()) {
    frames = keyframes.map((frame) => (frame.opacity === undefined ? {} : { opacity: frame.opacity })).filter((frame) => frame.opacity !== undefined);
    if (frames.length < 2) return Promise.resolve();
    time = 80;
  }
  try {
    const animation = el.animate(frames, { duration: time, easing, fill, delay });
    return animation.finished.then(() => {}, () => {});
  } catch {
    return Promise.resolve();
  }
}

export const enter = (el, kind = "rise") => animate(el, kind === "scale"
  ? [{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "scale(1)" }]
  : kind === "slide-right"
    ? [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "translateX(0)" }]
    : [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }]);

export const leave = (el, kind = "rise") => animate(el, kind === "scale"
  ? [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }]
  : kind === "slide-right"
    ? [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(24px)" }]
    : [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }], { duration: tokenMs("--ui-dur-fast", 120), easing: ease.standard, fill: "forwards" });

/** One short horizontal shake, for a new error. */
export const shake = (el) => animate(el, [
  { transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" },
], { duration: 320, easing: ease.standard });

/** Animate an element between its collapsed (0) and natural height. Height is not GPU-friendly, so this runs once per toggle. */
export async function expand(el) {
  el.hidden = false;
  const full = el.scrollHeight;
  if (reducedMotion() || !full) return;
  await animate(el, [{ height: "0px", opacity: 0 }, { height: `${full}px`, opacity: 1 }], { duration: tokenMs("--ui-dur", 200), easing: ease.standard });
}
export async function collapse(el) {
  const full = el.scrollHeight;
  if (!reducedMotion() && full) await animate(el, [{ height: `${full}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: tokenMs("--ui-dur-fast", 120), easing: ease.standard });
  el.hidden = true;
}

/** Count a number up in an element's text. The final value is always set, even if frames are skipped. */
export function countUp(el, to, { from = 0, format = (n) => String(n), duration = 600, easing = (t) => 1 - (1 - t) ** 3 } = {}) {
  if (reducedMotion() || from === to || typeof globalThis.requestAnimationFrame !== "function") {
    el.textContent = format(to);
    return Promise.resolve();
  }
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = format(Math.round(from + (to - from) * easing(t)));
      if (t < 1 && el.isConnected !== false) globalThis.requestAnimationFrame(frame);
      else { el.textContent = format(to); resolve(); }
    };
    globalThis.requestAnimationFrame(frame);
  });
}

/** Mark the page hidden so looping animations pause. Called once at start-up. */
export function watchVisibility(doc = globalThis.document) {
  if (!doc?.addEventListener) return;
  const apply = () => { doc.documentElement.dataset.hidden = doc.visibilityState === "hidden" ? "1" : ""; if (doc.visibilityState !== "hidden") delete doc.documentElement.dataset.hidden; };
  doc.addEventListener("visibilitychange", apply);
  apply();
}
