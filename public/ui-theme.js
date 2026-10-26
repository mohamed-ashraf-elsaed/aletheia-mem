// Theme preference: Auto (follow the system), Dark or Light, saved in localStorage under aletheia.theme.
export const THEME_KEY = "aletheia.theme";
export const THEMES = ["auto", "dark", "light"];

/** The stored value, or "auto" when it is missing, odd or storage is blocked. */
export function readTheme(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** The data-theme attribute for a preference: "dark", "light", or null for Auto (no attribute). */
export const themeAttribute = (pref) => (pref === "dark" || pref === "light" ? pref : null);

export function applyTheme(pref, { root = globalThis.document?.documentElement, storage = globalThis.localStorage } = {}) {
  const value = THEMES.includes(pref) ? pref : "auto";
  const attr = themeAttribute(value);
  if (root) { if (attr) root.setAttribute("data-theme", attr); else root.removeAttribute("data-theme"); }
  try {
    if (value === "auto") storage?.removeItem(THEME_KEY); else storage?.setItem(THEME_KEY, value);
  } catch {
    // the choice still applies for this visit
  }
  return value;
}
