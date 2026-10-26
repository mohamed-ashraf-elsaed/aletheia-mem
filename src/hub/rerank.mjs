import { join } from "node:path";
import { defaultDataDir } from "../config.mjs";
// Cross-encoder reranking, optional (same optional package as embeddings). A cross-encoder reads the question and one
// candidate together and scores how well the candidate answers it, which a bi-encoder (embeddings) cannot do. It is slower,
// so it only reorders the few dozen candidates the first stage found.
export const DEFAULT_RERANKER = "Xenova/ms-marco-MiniLM-L-6-v2"; // 23M parameters, quantised; Xenova/bge-reranker-base is larger and slower

/** Returns {model, score(query, texts) -> number[]}. Throws a clear error when the runtime is missing. */
export async function createReranker({ model = DEFAULT_RERANKER, cacheDir = join(defaultDataDir(process.env.HOME ?? "."), "models"), batch = 16 } = {}) {
  let mod;
  try {
    const from = process.env.ALETHEIA_TRANSFORMERS_FROM;
    mod = await import(from ? Bun.resolveSync("@huggingface/transformers", from) : "@huggingface/transformers");
  } catch {
    throw new Error("Reranking needs the optional package: bun add @huggingface/transformers");
  }
  mod.env.cacheDir = cacheDir;
  const tokenizer = await mod.AutoTokenizer.from_pretrained(model);
  const net = await mod.AutoModelForSequenceClassification.from_pretrained(model, { dtype: "q8" });
  return {
    model,
    async score(query, texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += batch) {
        const part = texts.slice(i, i + batch).map((t) => String(t).slice(0, 1500));
        const inputs = tokenizer(new Array(part.length).fill(query), { text_pair: part, padding: true, truncation: true, max_length: 384 });
        const { logits } = await net(inputs);
        out.push(...Array.from(logits.data).slice(0, part.length));
      }
      return out;
    },
  };
}
