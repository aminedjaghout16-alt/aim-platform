/* =========================================================
   AIMFORGE — Card component
   Supports header (title / id / actions) + body slot.
   Optional `brackets` prop adds tactical corner accents.
   ========================================================= */
import { el } from "../utils/dom.js";

export function Card({ title, id, actions, brackets, pad = "", flush = false, children }) {
  const classes = ["af-card"];
  if (brackets) classes.push("af-brackets");
  if (pad === "sm") classes.push("af-card--pad-sm");
  if (flush) classes.push("af-card--flush");

  const inner = [];
  if (title || id || actions) {
    inner.push(
      el("header.af-card__head", {},
        title ? el("h3.af-card__title", {}, title) : null,
        id ? el("span.af-card__id", {}, id) : null,
        actions || null
      )
    );
  }
  const body = el("div.af-card__body", {}, ...(Array.isArray(children) ? children : [children]));
  inner.push(body);

  const card = el(`section.${classes.join(".")}`, {}, ...inner);
  if (brackets) {
    // add the two extra bracket corners
    card.appendChild(el("i.af-br"));
    card.appendChild(el("i.af-br"));
  }
  return card;
}

/** Section header with eyebrow + big title. */
export function SectionHeader({ eyebrow, title, sub, right }) {
  return el("header.af-section", {},
    el("div", {},
      eyebrow ? el("div.af-section__eyebrow", {}, eyebrow) : null,
      el("h2.af-section__title", {}, title),
      sub ? el("p.af-section__sub", {}, sub) : null
    ),
    right ? el("div", {}, right) : null
  );
}

/** Stat tile — label + value + optional meta. */
export function Stat({ label, value, meta }) {
  return el("div.af-stat.af-brackets", {},
    el("div.af-stat__label", {}, label),
    el("div.af-stat__value.af-num", {}, value),
    meta ? el("div.af-stat__meta", { html: meta }) : null,
    el("i.af-br"),
    el("i.af-br")
  );
}

/** Placeholder — visible "not built yet" surface. */
export function Placeholder({ title, description, mark = "TBD" }) {
  return el("div.af-placeholder", {},
    el("div.af-placeholder__mark", {}, mark),
    el("div.af-placeholder__title", {}, title),
    description ? el("p.af-placeholder__desc", {}, description) : null
  );
}
