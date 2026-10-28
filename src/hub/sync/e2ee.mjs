// E2EE for sync: standard primitives only, from node:crypto.
//   - AES-256-GCM, random 96-bit nonce per message, never reused; the GCM tag authenticates the
//     associated data, so ciphertext cannot be moved between ops or entities.
//   - scrypt for passphrase stretching: OWASP minimum N=2^17, r=8, p=1, 32-byte output (docs/29 §29.6).
//     Each wrapped key stores its own params, so older keys keep unlocking and `upgrade-kdf` re-wraps them.
//   - random 256-bit data keys from crypto.getRandomValues.
// The envelope { "@e2ee": 1, v: 1, kid, nonce, ct } marks an encrypted payload; kid names the data key.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const DEFAULT_KDF = { name: "scrypt", N: 131072, r: 8, p: 1, keyLen: 32 };
export const KDF = DEFAULT_KDF; // legacy alias for older call sites; records carry their own params
const MAXMEM = 256 * 1024 * 1024;

const b64 = (buffer) => Buffer.from(buffer).toString("base64");
const fromB64 = (text) => Buffer.from(String(text), "base64");

export const isEnvelope = (payload) =>
  !!payload && typeof payload === "object" && payload["@e2ee"] === 1 && typeof payload.nonce === "string" && typeof payload.ct === "string" && Number.isSafeInteger(payload.kid);

/** A fresh 256-bit data key. */
export function randomKey(bytes = 32) {
  return randomBytes(bytes);
}

/** scrypt(passphrase, salt, params?) -> 32-byte key-encryption key. `params` comes from the wrapped-key record. */
export function deriveKek(passphrase, saltB64, params = null) {
  const kdf = params && typeof params === "object" ? params : DEFAULT_KDF;
  const N = Number.isSafeInteger(kdf.N) ? kdf.N : DEFAULT_KDF.N;
  const r = Number.isSafeInteger(kdf.r) ? kdf.r : DEFAULT_KDF.r;
  const p = Number.isSafeInteger(kdf.p) ? kdf.p : DEFAULT_KDF.p;
  const keyLen = Number.isSafeInteger(kdf.keyLen) ? kdf.keyLen : DEFAULT_KDF.keyLen;
  return scryptSync(String(passphrase), fromB64(saltB64), keyLen, { N, r, p, maxmem: MAXMEM });
}

/** Wrap a data key with a KEK: AES-256-GCM. Returns { v: 1, nonce, ct }. */
export function wrapKey(dataKey, kek) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, nonce);
  const ct = Buffer.concat([cipher.update(dataKey), cipher.final(), cipher.getAuthTag()]);
  return { v: 1, nonce: b64(nonce), ct: b64(ct) };
}

/** Unwrap a data key. Throws (GCM tag) on a wrong KEK or tampering. */
export function unwrapKey(wrapped, kek) {
  const nonce = fromB64(wrapped.nonce);
  const ct = fromB64(wrapped.ct);
  const decipher = createDecipheriv("aes-256-gcm", kek, nonce);
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
}

/** Encrypt a payload buffer with a data key. `aad` binds the ciphertext to the op it belongs to. */
export function encryptPayload(plainBuffer, dataKey, aad, kid) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
  cipher.setAAD(Buffer.from(String(aad ?? ""), "utf8"));
  const ct = Buffer.concat([cipher.update(plainBuffer), cipher.final(), cipher.getAuthTag()]);
  return { "@e2ee": 1, v: 1, kid, nonce: b64(nonce), ct: b64(ct) };
}

/** Decrypt an envelope. Throws (GCM tag) on tampering, a wrong key or a wrong AAD. */
export function decryptPayload(envelope, dataKey, aad) {
  const nonce = fromB64(envelope.nonce);
  const ct = fromB64(envelope.ct);
  const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce);
  decipher.setAAD(Buffer.from(String(aad ?? ""), "utf8"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString("utf8");
}
