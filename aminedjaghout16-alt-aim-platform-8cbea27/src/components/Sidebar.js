/* =========================================================
   AIMFORGE — Sidebar navigation
   Fixed left rail with primary sections and user badge.
   ========================================================= */
import { el } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { store } from "../state.js";

const SECTIONS = [
  {
    heading: "Main",
    items: [
      { label: "Dashboard",    path: "/dashboard",  ic: "home" },
      { label: "Library",      path: "/library",    ic: "library" },
      { label: "Statistics",   path: "/stats",      ic: "chart" }
    ]
  },
  {
    heading: "Training",
    items: [
      { label: "Quick Start",  path: "/setup/demo-flick-01", ic: "bolt" },
      { label: "Playbook",     path: "/library?filter=recent", ic: "book" }
    ]
  },
  {
    heading: "Account",
    items: [
      { label: "Profile",      path: "/profile",   ic: "user" },
      { label: "Settings",     path: "/settings",  ic: "gear" }
    ]
  }
];

export function Sidebar({ activePath }) {
  const user = store.get().user;

  const nav = el("nav.af-sidebar__nav", {});
  for (const section of SECTIONS) {
    nav.appendChild(el("div.af-nav__section", {}, section.heading));
    for (const it of section.items) {
      const isActive = activePath && activePath.startsWith(it.path.split("?")[0]);
      const item = el("a.af-nav__item", {
        href: `#${it.path}`,
        "aria-current": isActive ? "page" : null
      },
        icon(it.ic),
        el("span.af-nav__label", {}, it.label)
      );
      nav.appendChild(item);
    }
  }

  return el("aside.af-sidebar", {},
    el("div.af-sidebar__brand", {},
      el("a.af-logo", { href: "#/" },
        el("span.af-logo__mark", {}, "A"),
        el("span.af-logo__wordmark", {}, "AIMFORGE")
      )
    ),
    nav,
    el("div.af-sidebar__footer", {},
      el("div.af-avatar", {}, (user?.handle || "G")[0].toUpperCase()),
      el("div", {},
        el("div.af-user__name", {}, user?.handle || "Guest Operator"),
        el("div.af-user__meta", {}, user ? `TIER ${user.tier || "01"}` : "Signed-out")
      )
    )
  );
}
