/* =========================================================
   AIMFORGE — DOM helpers
   Tiny helpers to keep component files declarative.
   ========================================================= */

/**
 * el("div.foo#bar", { onclick }, "text", childEl)
 * The tag string supports "tag.class1.class2#id".
 */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...rest] = spec.match(/[.#]?[^.#]+/g) || [spec];
  const node = document.createElement(tag);
  for (const token of rest) {
    if (token.startsWith(".")) node.classList.add(token.slice(1));
    else if (token.startsWith("#")) node.id = token.slice(1);
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "html") {
      node.innerHTML = v;
    } else if (k === "style" && typeof v === "object") {
      Object.assign(node.style, v);
    } else if (k === "dataset" && typeof v === "object") {
      Object.assign(node.dataset, v);
    } else if (k in node && k !== "list") {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
  return node;
}

/** Escape user-supplied strings for safe innerHTML. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Format a millisecond duration as m:ss. */
export function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Format a fractional accuracy as pct string. */
export function fmtPct(v, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`;
}
