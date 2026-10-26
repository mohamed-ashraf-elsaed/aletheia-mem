// Redaction, kept in its own module so a hook can load it without the rest of the capture code.
// Order matters: <private> blocks are dropped first, then vendor patterns, then generic credentials.
const REDACTIONS = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, "[redacted:anthropic-key]"],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "[redacted:api-key]"], // OpenAI (sk-proj-...), OpenRouter (sk-or-v1-...), others
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, "[redacted:stripe-key]"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, "[redacted:gitlab-token]"],
  [/\bnpm_[A-Za-z0-9]{30,}/g, "[redacted:npm-token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted:jwt]"],
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]{3,}(@)/gi, "$1[redacted]$2"], // credentials inside a URL
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, "[redacted:github-token]"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g, "[redacted:github-token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted:aws-key-id]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted:slack-token]"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[redacted:google-key]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted:private-key]"],
  [/\b(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  [/\b((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)["']?[^\s"',;]{6,}["']?/gi, "$1[redacted]"],
];

export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text.replace(/<private>[\s\S]*?<\/private>/gi, "[private]");
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub);
  return out;
}
