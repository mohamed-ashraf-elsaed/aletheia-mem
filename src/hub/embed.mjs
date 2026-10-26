// Local embeddings, optional. The project has no required dependencies; semantic search turns on when
// `@huggingface/transformers` is installed (bun add @huggingface/transformers). The model runs on this machine
// (ONNX, quantised); nothing is sent anywhere. First use downloads the model once (about 35 MB quantised).
import { join } from "node:path";
import { defaultDataDir } from "../config.mjs";

export const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5"; // 384 dimensions, 33M parameters (BAAI bge-small-en-v1.5, ONNX port)
// bge models expect this prefix on QUERIES (not on documents) for retrieval.
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

/** Returns {model, dim, embedDocs(texts), embedQuery(text)} or throws a clear error when the runtime is missing. */
export async function createEmbedder({ model = DEFAULT_MODEL, cacheDir = join(defaultDataDir(process.env.HOME ?? "."), "models"), batch = 32 } = {}) {
  let mod;
  try {
    // ALETHEIA_TRANSFORMERS_FROM: a folder whose node_modules holds the package (lets you keep it out of this project).
    const from = process.env.ALETHEIA_TRANSFORMERS_FROM;
    mod = await import(from ? Bun.resolveSync("@huggingface/transformers", from) : "@huggingface/transformers");
  } catch {
    throw new Error("Semantic search needs the optional package: bun add @huggingface/transformers");
  }
  mod.env.cacheDir = cacheDir;
  const extractor = await mod.pipeline("feature-extraction", model, { dtype: "q8" });
  const run = async (texts, prefix = "") => {
    const out = [];
    for (let i = 0; i < texts.length; i += batch) {
      const part = texts.slice(i, i + batch).map((t) => `${prefix}${String(t).slice(0, 2000)}`);
      const t = await extractor(part, { pooling: "cls", normalize: true });
      const [n, dim] = t.dims;
      for (let r = 0; r < n; r++) out.push(Float32Array.from(t.data.slice(r * dim, (r + 1) * dim)));
    }
    return out;
  };
  const probe = (await run(["probe"]))[0];
  return { model, dim: probe.length, embedDocs: (texts) => run(texts), embedQuery: async (text) => (await run([text], QUERY_PREFIX))[0] };
}
