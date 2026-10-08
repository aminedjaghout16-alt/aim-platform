/* =========================================================
   AIMFORGE — Target model
   Plain data object + tiny state helpers. The DOM element
   for a target is created by the Engine using this model.
   ========================================================= */

let __idCounter = 0;

export class Target {
  constructor({ x, y, radius, ttl = 0, spawnedAt = performance.now() }) {
    this.id = ++__idCounter;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.ttl = ttl;              // 0 == no auto-expire
    this.spawnedAt = spawnedAt;
    this.hit = false;
    this.missed = false;
    this.el = null;              // rendered DOM node
  }

  /** True if the (px, py) point is inside the target. */
  contains(px, py) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  isExpired(now = performance.now()) {
    return this.ttl > 0 && now - this.spawnedAt >= this.ttl;
  }
}
