// Test fixture: a worker that extracts one fact, then hangs on the second window. The parent kills it with
// SIGKILL to prove a restarted worker resumes the job without losing or duplicating work.
import { HubStore } from "../../src/hub/store.mjs";
import { runWorker } from "../../src/hub/queue.mjs";

const dbPath = process.argv[2];
const store = new HubStore(dbPath);
let calls = 0;

const ask = async (prompt) => {
  calls++;
  const id = Number(/EPISODE_IDS: \[(\d+)/.exec(prompt)?.[1]);
  if (calls >= 2) await new Promise((resolve) => setTimeout(resolve, 60_000));
  return JSON.stringify({
    facts: [{
      subject: "checkout service",
      predicate: "uses",
      object: `postgres ${id}`,
      text: `The checkout service uses postgres ${id}`,
      valid_from: null,
      valid_to: null,
      confidence: 0.9,
      episode_ids: [id],
    }],
  });
};

await runWorker({
  store,
  ask,
  config: { factBudget: { maxEpisodes: 1, maxChars: 10_000 } },
  batchSize: 1,
  now: () => Date.now(),
});
store.close();
