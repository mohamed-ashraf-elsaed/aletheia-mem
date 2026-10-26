// Cost accounting for extraction. A usage row is written per model call (or per rule-based window) with the
// tokens in and out, the model and mode, and an estimated dollar cost from configured prices. Prices default to 0:
// this project never guesses a vendor price.

/** Rough token estimate used only for the local ledger. Four characters per token is the common English average. */
export const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 4);

export const DEFAULT_PRICES = { inputPer1k: 0, outputPer1k: 0 };

export function pricesFrom(config = {}) {
  return {
    inputPer1k: Number(config.prices?.inputPer1k ?? config.inputPer1k ?? 0) || 0,
    outputPer1k: Number(config.prices?.outputPer1k ?? config.outputPer1k ?? 0) || 0,
  };
}

export function estimateUsd({ inputTokens = 0, outputTokens = 0, prices = DEFAULT_PRICES } = {}) {
  const p = pricesFrom({ prices });
  return (inputTokens / 1000) * p.inputPer1k + (outputTokens / 1000) * p.outputPer1k;
}

/** One usage row. `rawOutput` is kept only for a rejected answer, so bad model output can be inspected later. */
export function recordCall(store, call = {}) {
  const inputTokens = Number(call.inputTokens) || 0;
  const outputTokens = Number(call.outputTokens) || 0;
  store.recordUsage({ ...call, inputTokens, outputTokens, estimatedUsd: call.estimatedUsd ?? estimateUsd({ inputTokens, outputTokens, prices: call.prices }) });
}

export function totals(store, { sinceEpoch = 0 } = {}) {
  return store.usageSummary({ sinceEpoch });
}

export function formatTotals(summary) {
  if (!summary || !summary.calls) return "No extraction calls recorded.";
  const usd = Number(summary.estimated_usd ?? 0);
  return `${summary.calls} call(s), ${summary.input_tokens} input tokens, ${summary.output_tokens} output tokens, ${summary.facts} fact(s), ${summary.rejected} rejected, $${usd.toFixed(6)} estimated`;
}
