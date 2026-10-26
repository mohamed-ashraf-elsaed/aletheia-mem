// sha256 via Bun's built-in hasher. Kept apart from lib/util.mjs so a hook does not load node:crypto and fs.
export const sha256 = (value) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
