/* =========================================================
   AIMFORGE — Icon set
   Inline SVGs — no icon library dependency.
   Every icon uses currentColor for easy theming.
   ========================================================= */

const svg = (paths, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  home:      svg(`<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>`),
  library:   svg(`<rect x="3" y="4" width="6" height="16"/><rect x="10" y="4" width="6" height="16"/><path d="M17 4h4v16h-4"/>`),
  target:    svg(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`),
  chart:     svg(`<path d="M4 20V6"/><path d="M10 20v-8"/><path d="M16 20V10"/><path d="M22 20H2"/>`),
  user:      svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`),
  gear:      svg(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`),
  play:      svg(`<polygon points="6 4 20 12 6 20 6 4"/>`),
  arrow:     svg(`<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>`),
  logout:    svg(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`),
  bolt:      svg(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`),
  shield:    svg(`<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>`),
  crosshair: svg(`<circle cx="12" cy="12" r="9"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>`),
  book:      svg(`<path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M4 4v12a4 4 0 0 0 4 4"/>`),
  discord:   svg(`<path d="M8 12h.01"/><path d="M16 12h.01"/><path d="M18 6a15 15 0 0 0-4-1l-.4.8a12 12 0 0 0-3.2 0L10 5a15 15 0 0 0-4 1C3 10 3 16 6 18l1.4-1.4A11 11 0 0 1 12 18a11 11 0 0 1 4.6-1.4L18 18c3-2 3-8 0-12z"/>`)
};

/** Return a live <svg> element for a given name. */
export function icon(name, opts = {}) {
  const wrap = document.createElement("span");
  wrap.className = `af-nav__icon ${opts.className || ""}`.trim();
  wrap.innerHTML = icons[name] || icons.target;
  return wrap.firstElementChild;
}
