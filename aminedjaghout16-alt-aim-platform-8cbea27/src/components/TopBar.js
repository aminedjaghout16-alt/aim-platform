/* =========================================================
   AIMFORGE — Top bar
   Breadcrumbs + system status + right-hand actions slot.
   ========================================================= */
import { el } from "../utils/dom.js";
import { Button } from "./Button.js";

export function TopBar({ crumbs = [], actions }) {
  const crumbEls = [];
  crumbs.forEach((c, i) => {
    if (i > 0) crumbEls.push(el("span.sep", {}, "/"));
    if (c.href) crumbEls.push(el("a", { href: `#${c.href}` }, c.label));
    else crumbEls.push(el("strong", {}, c.label));
  });

  return el("header.af-topbar", {},
    el("div.af-topbar__crumbs", {}, ...crumbEls),
    el("div.af-topbar__spacer", {}),
    el("div.af-topbar__tools", {},
      el("div.af-status", {},
        el("span.af-status__dot"),
        "System Nominal"
      ),
      actions || Button({ label: "Quick Train", variant: "primary", size: "sm", href: "#/setup/demo-flick-01" })
    )
  );
}
