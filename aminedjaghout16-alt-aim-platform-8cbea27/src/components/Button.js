/* =========================================================
   AIMFORGE — Button component
   Variants: primary | ghost | danger | (default)
   Sizes:    sm | (default) | lg
   ========================================================= */
import { el } from "../utils/dom.js";

export function Button({ label, variant = "", size = "", onClick, href, block, icon, disabled, type = "button" }) {
  const classes = ["af-btn"];
  if (variant) classes.push(`af-btn--${variant}`);
  if (size)    classes.push(`af-btn--${size}`);
  if (block)   classes.push("af-btn--block");

  const children = [];
  if (icon) children.push(icon);
  children.push(label);

  if (href) {
    return el(`a.${classes.join(".")}`, { href, onClick }, ...children);
  }
  return el(`button.${classes.join(".")}`, { type, onClick, disabled }, ...children);
}
