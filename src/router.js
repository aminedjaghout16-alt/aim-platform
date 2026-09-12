/* =========================================================
   AIMFORGE — Hash router
   Tiny, dependency-free client-side router.
   Routes are declared as { path, page, layout, meta }.
   Path patterns support :param placeholders.
   ========================================================= */

export class Router {
  constructor({ routes, outlet, onBefore, onAfter }) {
    this.routes = routes;
    this.outlet = outlet;
    this.onBefore = onBefore || (() => {});
    this.onAfter  = onAfter  || (() => {});
    this.current = null;

    window.addEventListener("hashchange", () => this.resolve());
  }

  start() {
    if (!location.hash) location.hash = "#/";
    this.resolve();
  }

  /** Programmatic navigation. */
  go(path) {
    location.hash = path.startsWith("#") ? path : `#${path}`;
  }

  /** Match hash against route table. */
  match(hash) {
    const path = hash.replace(/^#/, "") || "/";
    for (const route of this.routes) {
      const pattern = route.path.replace(/:[^/]+/g, "([^/]+)");
      const re = new RegExp(`^${pattern}$`);
      const m = path.match(re);
      if (m) {
        const keys = (route.path.match(/:[^/]+/g) || []).map(k => k.slice(1));
        const params = {};
        keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route, params, path };
      }
    }
    // Fallback to first route that has fallback=true, else null.
    const fb = this.routes.find(r => r.fallback);
    return fb ? { route: fb, params: {}, path } : null;
  }

  async resolve() {
    const hit = this.match(location.hash);
    if (!hit) {
      this.outlet.innerHTML = "<div class='af-page'>Route not found.</div>";
      return;
    }
    const { route, params, path } = hit;
    const ctx = { params, path, query: this.query(), router: this };

    this.onBefore(ctx, this.current);

    // Render layout, then the page inside the layout's outlet.
    if (route.layout) {
      const layoutEl = await route.layout(ctx);
      this.outlet.replaceChildren(layoutEl);
      const inner = layoutEl.querySelector("[data-outlet]");
      if (inner) {
        const pageEl = await route.page(ctx);
        inner.replaceChildren(pageEl);
      }
    } else {
      const pageEl = await route.page(ctx);
      this.outlet.replaceChildren(pageEl);
    }

    this.current = { route, params, path };
    this.onAfter(ctx);

    // Scroll to top for a fresh page.
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Parse ?a=b&c=d from the hash. */
  query() {
    const q = (location.hash.split("?")[1] || "");
    const params = new URLSearchParams(q);
    return Object.fromEntries(params.entries());
  }
}
