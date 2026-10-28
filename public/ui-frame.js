// A tab's frame: the title, an optional row of actions, the page links with counts, and the slot for the page
//. The Rules and Tools tabs use it; the page inside is swapped on a route change and the old one is
// disposed, so list controllers stop listening for Back and Forward.
import { SUBVIEWS } from "./ui-core.js";
import { tabs } from "./ui-components.js";
import { h, swap } from "./ui-dom.js";

export function tabFrame({ tab, title, lede, actions = [], extra = [], build }) {
  const content = h("div", { class: "ui-tab-content" });
  const subs = SUBVIEWS[tab] ?? [];
  const subnav = tabs({ label: `${title} pages`, className: "ui-subnav-tabs", items: subs.map((item) => ({ id: item.id, label: item.label, href: `#/${tab}/${item.id}`, count: item.count })), active: subs[0]?.id });
  const el = h("div", { class: `ui-${tab}-frame` },
    h("div", { class: "ui-page-head" }, h("div", {}, h("h1", { id: `ui-${tab}-title`, tabindex: "-1" }, title), lede ? h("p", { class: "ui-page-lede" }, lede) : null), actions.length ? h("div", { class: "ui-row" }, ...actions) : null),
    ...extra,
    h("div", { class: "ui-subnav" }, subnav),
    content);
  let view = null;
  const frame = {
    el, subnav, content,
    project: null,
    show(route) {
      subnav.setActive(route.sub);
      view?.dispose?.();
      view = build(route.sub, route, frame);
      const label = subs.find((item) => item.id === route.sub)?.label ?? title;
      // A hidden h2 keeps the heading order whole (h1, h2, h3 for each row) on pages whose rows use h3.
      swap(content, h("div", { class: `ui-${tab}-page`, role: "region", "aria-label": label }, h("h2", { class: "ui-sr" }, label), view));
      return view;
    },
    current: () => view,
  };
  return frame;
}
