/* =========================================================
   AIMFORGE — App shell layout
   The default authenticated-app layout: sidebar + topbar +
   scrolling content outlet. Pages plug in via [data-outlet].
   ========================================================= */
import { el } from "../utils/dom.js";
import { Sidebar } from "./Sidebar.js";
import { TopBar } from "./TopBar.js";

export function AppLayout({ crumbs, actions, activePath, full = false }) {
  const outletClass = full ? "af-page.af-page--full" : "af-page";
  return el("div.af-shell", {},
    Sidebar({ activePath }),
    el("div.af-main", {},
      TopBar({ crumbs, actions }),
      el(`section.${outletClass}`, { dataset: { outlet: "true" } })
    )
  );
}

/** Bare layout used for /login, /register, gameplay full-screen etc. */
export function BareLayout() {
  return el("div", { dataset: { outlet: "true" } });
}
