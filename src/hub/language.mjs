// Output language for extraction and summaries (T-120). A language tag is validated here so a typo fails at the
// setting, not at the model. The prompt line only names the language; the schema never changes.
const TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

/** Return a normalised language tag, or throw. Empty is allowed and means "follow the mode". */
export function normalizeLanguage(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > 35 || !TAG.test(text)) throw new RangeError(`"${text}" is not a language tag. Use a BCP 47 tag such as en, es or pt-BR.`);
  return text.replace(/_/g, "-").toLowerCase();
}

/** The prompt line, or "" when no language was chosen. */
export function languageInstruction(value) {
  const tag = normalizeLanguage(value);
  if (!tag) return "";
  return `OUTPUT_LANGUAGE: ${tag}. Write every fact and summary in this language. Keep code, paths, names and identifiers unchanged.`;
}
