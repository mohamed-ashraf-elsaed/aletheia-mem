// Scoring helpers for benchmark harnesses: a deterministic seeded bootstrap and normalized exact matching.
// The bootstrap is over questions (the sampling unit), so a rerun with the same seed reproduces the same CI.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeAnswer(text) {
  return String(text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function exactMatch(predicted, gold) {
  const p = normalizeAnswer(predicted);
  const g = normalizeAnswer(gold);
  return Boolean(p && g && p === g);
}

/** 95% bootstrap confidence interval over a list of 0/1 (or any numeric) values. */
export function bootstrapMeanCI(values, { seed = 1, iterations = 1000, alpha = 0.05 } = {}) {
  if (!Array.isArray(values) || values.length === 0) return { n: 0, mean: null, ci95: [null, null] };
  const rng = mulberry32(seed);
  const means = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(rng() * values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const lo = Math.max(0, Math.floor(iterations * (alpha / 2)));
  const hi = Math.min(iterations - 1, Math.ceil(iterations * (1 - alpha / 2)) - 1);
  return { n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, ci95: [means[lo], means[hi]] };
}
