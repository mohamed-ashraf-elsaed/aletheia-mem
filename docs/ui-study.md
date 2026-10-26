# UI study: the claude-mem viewer

This is a read-only study of the viewer that claude-mem serves on the owner's machine (`http://127.0.0.1:37700/`),
done on 2026-10-27 with a real browser. Only structure and behaviour are described, in our own words. No code, CSS,
icon or copy text was reused. Things that were not observed are marked `UNVERIFIED` and listed in
[unverified.md](tasks/unverified.md).

What was captured: the My Work page at about 920 px and at 375 px, the My Goals page at 375 px, the network list,
the CSS keyframe names and the ARIA roles in use. Source: the local page itself, fetched 2026-10-27
(see [research-log.md](tasks/research-log.md)).

## Layout and navigation

- A top bar holds the product name, a team chip, a machine count, a live-updates indicator and external links.
- A slim rail of icon buttons on the left switches between three pages: My Work, My Goals, My Rules. On wide screens
  the labels appear beside the icons.
- At 375 px the rail becomes a bottom bar with three labelled buttons, and the header shrinks. The page did not
  scroll sideways.
- The page address does not change when the page changes. Back and reload return to My Work. Aletheia puts the page
  and filters in the URL hash instead.
- Two small switches sit above the header: a dark theme switch and a "Spec IDs" switch.

## Status indicators and what drives them

| Indicator | What it shows | What drives it |
|---|---|---|
| "Live updates" dot | The page believes it gets pushes. | A request to an events endpoint made at load. How it behaves later is `UNVERIFIED`. |
| Card state pill (Working, Idle, Shipped) | The state of one request. | Derived on the server and sent in the work payload. |
| Spinner beside the pill | The card is being worked on or its title is being written. | Same payload. |
| Progress bar with a percent | How far a request is. | A review score the server stores; a card with no review says "Not reviewed yet". |
| "Needs you" count | Items waiting on the owner. | Count from the payload. |
| "Last refreshed" line | Time of the last payload. | Client clock when the payload arrived. |

## Loading, empty and error states

- Loading: the first paint is the shell; the cards appear after one request to the work endpoint. A skeleton was not
  seen, but the load was too fast to be sure.
- Empty: the headline says "Nothing needs you right now" and the count of working items.
- Error and offline: `UNVERIFIED`. The server stayed up.

## Long lists

Five cards were shown, so no pagination, infinite scroll or virtualization was triggered. `UNVERIFIED` for larger
stores. Long prompt text inside a card is cut with an ellipsis and the card body scrolls inside a fixed box.

## Filters, sort and search

- A segmented "View" control switches between Cards, List and By agent.
- A segmented "Filter" control shows All, Needs you and Shipped with a count on each.
- A sort select ("Needs you first") sits beside the filters. At 375 px it shrinks to an icon.
- No search box was seen on the pages captured.

## How text is rendered

- Prompt text is shown as monospace, in a fixed-height box that scrolls. Ellipsis marks the cut.
- A longer "build story" paragraph is shown as plain prose with a "Read" button that opens the full text.
- Dates use a short local form ("Oct 27, 1:18 am"). Durations use a rough form ("1 day", "17 hr", "Just started").

## Motion

Keyframes found in the stylesheet: spin, ping, pulse, enter, exit, accordion-down, accordion-up. That points to a
spinner, a pulsing dot, enter and exit transitions for popovers or dialogs, and animated expanders. The stylesheet
has two reduced-motion rules. Which elements use them was not checked.

## Keyboard and accessibility

- ARIA roles in use: switch, tablist, tab, tabpanel, progressbar, region. There is one live region.
- Six elements carry a tabindex. Keyboard shortcuts: `UNVERIFIED`.
- The progress bars carry a text value ("92% complete").

## Responsive behaviour

- About 920 px: two cards per row, a left icon rail.
- 375 px: one card per row, bottom tab bar, sort control collapsed to an icon, header title wraps.

## Ideas Aletheia takes, and what it builds differently

| Idea seen | What Aletheia does |
|---|---|
| Counts on filter chips | Filter chips show counts when the API returns a total. |
| Bottom bar on phones | Tabs stay on top and scroll sideways inside their own strip; the command palette covers jumping. |
| Progress shown as text and bar | Same: every bar has a text value. |
| Rough durations | Relative times ("3 min ago") with the exact time in a tooltip. |
| Theme switch | Three-way switch: Auto, Dark, Light. |
| Address does not change | The page, filters, sort and page number live in the URL hash. |

## What the study did not find

No pagination, no skeleton, no error state, no shortcuts and no search were seen. Aletheia's design for those parts
comes from its own task list ([docs/tasks/TASKS.md](tasks/TASKS.md), T-148 to T-164), not from this study.
