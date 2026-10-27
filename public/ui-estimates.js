// Links for values that are chosen rules rather than measurements (T-218 to T-221). The request grouping, the
// progress formula, the ETA pace and the rule strength bands are documented in docs/32-requests.md and listed in
// docs/tasks/unverified.md. A page that prints one of them prints this label next to it.
import { h } from "./ui-dom.js";

export const UNVERIFIED_URL = "https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/tasks/unverified.md#request-layer-story-and-economics-2026-10-27";

export const ESTIMATED_NOTE = "This is a chosen rule, not a measured value. See the UNVERIFIED note.";

/** A small "estimated" link. Its name says what is estimated, so a list of them is not a list of identical links. `kind` names the value in the tooltip, for example "Progress". */
export function estimated(kind = "This value") {
  return h("a", { class: "ui-estimate", href: UNVERIFIED_URL, target: "_blank", rel: "noreferrer", title: `${kind}: ${ESTIMATED_NOTE}`, "aria-label": `${kind}: estimated` }, "estimated");
}
