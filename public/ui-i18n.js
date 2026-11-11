// The dashboard's language layer. English lives in i18n/en.json and is loaded with the module, so t() works the
// moment this file is imported (and in a test with no browser). The other languages are fetched on demand.
// A key missing from the chosen language falls back to English, then to the key itself.
import en from "./i18n/en.json" with { type: "json" };

export const STORAGE_KEY = "aletheia.lang";

/** English plus the README languages. `name` is the language's own name, so it is readable before it is chosen. */
export const LANGS = [
  { code: "en", name: "English", dir: "ltr", tag: "en" },
  { code: "ar", name: "العربية", dir: "rtl", tag: "ar" },
  { code: "de", name: "Deutsch", dir: "ltr", tag: "de" },
  { code: "es", name: "Español", dir: "ltr", tag: "es" },
  { code: "fr", name: "Français", dir: "ltr", tag: "fr" },
  { code: "hi", name: "हिन्दी", dir: "ltr", tag: "hi" },
  { code: "ja", name: "日本語", dir: "ltr", tag: "ja" },
  { code: "ko", name: "한국어", dir: "ltr", tag: "ko" },
  { code: "pt-br", name: "Português (Brasil)", dir: "ltr", tag: "pt-BR" },
  { code: "ru", name: "Русский", dir: "ltr", tag: "ru" },
  { code: "zh", name: "中文", dir: "ltr", tag: "zh" },
];

let catalogues = { en: { ...en } };
let lang = "en";

const supported = (code) => LANGS.some((item) => item.code === code);
export const getLang = () => lang;
export const langInfo = (code = lang) => LANGS.find((item) => item.code === code) ?? LANGS[0];

/** Test hook: merge more strings into a language. */
export function registerCatalogue(code, strings) {
  catalogues[code] = { ...(catalogues[code] ?? {}), ...strings };
}

/** Test hook: back to English with only the shipped catalogue. */
export function resetLang() {
  catalogues = { en: { ...en } };
  lang = "en";
}

const rulesCache = new Map();
function pluralRule(code, count) {
  try {
    const tag = langInfo(code).tag;
    if (!rulesCache.has(tag)) rulesCache.set(tag, new Intl.PluralRules(tag));
    return rulesCache.get(tag).select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

function lookup(key, vars) {
  const chain = lang === "en" ? ["en"] : [lang, "en"];
  const count = vars && typeof vars.count === "number" ? vars.count : null;
  for (const code of chain) {
    const strings = catalogues[code];
    if (!strings) continue;
    if (count !== null) {
      const plural = strings[`${key}.${pluralRule(code, count)}`] ?? strings[`${key}.other`];
      if (plural !== undefined) return plural;
    }
    if (strings[key] !== undefined) return strings[key];
  }
  return key;
}

/** t("home.title") or t("memory.count", { count: 3 }): the text in the chosen language, {name} filled from vars. */
export function t(key, vars) {
  const text = lookup(key, vars);
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined || vars[name] === null ? whole : String(vars[name])));
}

/** The supported language that best matches a list of BCP 47 tags such as navigator.languages. */
export function detectLang(tags) {
  for (const raw of tags ?? []) {
    const tag = String(raw).toLowerCase();
    if (supported(tag)) return tag;
    const base = tag.split("-")[0];
    if (base === "pt") return "pt-br";
    if (supported(base)) return base;
  }
  return "en";
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function savedLang(storage) {
  try { const value = storage?.getItem(STORAGE_KEY); return supported(value) ? value : null; } catch { return null; }
}
function saveLang(storage, code) {
  try { storage?.setItem(STORAGE_KEY, code); } catch { /* storage blocked */ }
}

async function fetchCatalogue(code) {
  try {
    const response = await fetch(new URL(`./i18n/${code}.json`, import.meta.url));
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

/** Set lang and dir on the document. Arabic is right-to-left. */
export function applyLang(code = lang, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root) return;
  const info = langInfo(code);
  root.setAttribute("lang", info.tag);
  root.setAttribute("dir", info.dir);
}

/** Choose a language. A language that is already loaded switches at once; otherwise its file is fetched first. */
export async function setLang(code, { storage = defaultStorage(), load = fetchCatalogue, persist = true } = {}) {
  const next = supported(code) ? code : "en";
  if (!catalogues[next]) registerCatalogue(next, await load(next));
  lang = next;
  if (persist) saveLang(storage, next);
  applyLang(next);
  return next;
}

/** The saved language, else the browser's, else English. Loads its catalogue and applies it to the document. */
export async function initLang({ languages = globalThis.navigator?.languages ?? [globalThis.navigator?.language], storage = defaultStorage(), load = fetchCatalogue } = {}) {
  const code = savedLang(storage) ?? detectLang(languages);
  return setLang(code, { storage, load, persist: false });
}
