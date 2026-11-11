// Links for values that are chosen rules rather than measurements. The request grouping, the
// progress formula, the ETA pace and the rule strength bands are documented in docs/32-requests.md (section 32.12). A page that prints one of them prints this label next to it.
import { h } from "./ui-dom.js";
import { t } from "./ui-i18n.js";

export const UNVERIFIED_URL = "https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/32-requests.md#3212-what-is-not-done";

export const ESTIMATED_NOTE = {
  toString: () => t("home.estimatedNote"),
};

/** A small "estimated" link. Its name says what is estimated, so a list of them is not a list of identical links. `kind` names the value in the tooltip, for example "Progress". */
export function estimated(kind = t("home.thisValue")) {
  return h("a", { class: "ui-estimate", href: UNVERIFIED_URL, target: "_blank", rel: "noreferrer", title: t("home.estimatedTitle", { kind }), "aria-label": t("home.estimatedAria", { kind }) }, t("home.estimated"));
}
