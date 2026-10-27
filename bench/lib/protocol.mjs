// Benchmark protocol guards. A comparison between two memory systems is meaningless unless
// the harness waits for each competitor index to settle and feeds every system the identical
// question set and gold ids, so those rules live here as code instead of a README reminder.

const defaultNow = () => performance.now();
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeQuestion(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function waitForIndex(healthFn, countFn, stableMs, opts = {}) {
  const now = opts.now ?? defaultNow;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollMs = opts.pollMs ?? 25;
  const start = now();
  let lastCount = null;
  let changedAt = start;
  for (;;) {
    const healthy = Boolean(healthFn());
    const count = countFn();
    if (count !== lastCount) {
      lastCount = count;
      changedAt = now();
    }
    if (healthy && now() - changedAt >= stableMs) {
      return { settleMs: now() - start, count, healthy };
    }
    if (now() - start >= timeoutMs) {
      throw new Error(`waitForIndex: index not ready after ${timeoutMs}ms (count ${lastCount}, healthy ${healthy})`);
    }
    await sleep(pollMs);
  }
}

export function assertSameQuestions(systems) {
  if (systems.length < 2) throw new Error("assertSameQuestions: need at least two systems");
  const sets = systems.map((system) => ({
    name: system.name,
    questions: new Set((system.items ?? []).map((item) => normalizeQuestion(item.question))),
  }));
  const base = sets[0];
  for (const other of sets.slice(1)) {
    if (other.questions.size !== base.questions.size) {
      throw new Error(`assertSameQuestions: ${base.name} has ${base.questions.size} questions but ${other.name} has ${other.questions.size}`);
    }
    for (const question of base.questions) {
      if (!other.questions.has(question)) throw new Error(`assertSameQuestions: "${question}" missing from ${other.name}`);
    }
  }
  return base.questions.size;
}

export function assertSameGoldIds(systems) {
  if (systems.length < 2) throw new Error("assertSameGoldIds: need at least two systems");
  const byQuestion = (system) => {
    const gold = new Map();
    for (const item of system.items ?? []) {
      const ids = [...new Set((item.goldIds ?? []).map(String))].sort();
      gold.set(normalizeQuestion(item.question), ids);
    }
    return { name: system.name, gold };
  };
  const base = byQuestion(systems[0]);
  for (const other of systems.slice(1).map(byQuestion)) {
    if (other.gold.size !== base.gold.size) {
      throw new Error(`assertSameGoldIds: ${base.name} has ${base.gold.size} gold questions but ${other.name} has ${other.gold.size}`);
    }
    for (const [question, ids] of base.gold) {
      const otherIds = other.gold.get(question);
      if (!otherIds) throw new Error(`assertSameGoldIds: no gold ids for "${question}" in ${other.name}`);
      if (ids.join("\u0000") !== otherIds.join("\u0000")) {
        throw new Error(`assertSameGoldIds: gold ids differ for "${question}" (${base.name}: ${ids.join(", ")}; ${other.name}: ${otherIds.join(", ")})`);
      }
    }
  }
  return base.gold.size;
}
