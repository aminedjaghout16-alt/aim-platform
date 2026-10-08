/* ============================================
   Grid Shot Renderer — Demo Training Scenario
   Targets appear on a grid. Click them as fast as possible.
   ============================================ */
VantageEngine.Renderers.GridShotRenderer = class {
  constructor(canvas, scenario, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scenario = scenario;
    this.config = config;
    this.targets = [];
    this.running = false;
    this._spawnTimer = null;
    this._animFrame = null;
    this._onHit = null;
    this._onMiss = null;

    // Resolve target size from settings
    const sizeSetting = VantageEngine.Settings.getTargetSize(config.targetSize || 'medium');
    this.targetRadius = sizeSetting ? sizeSetting.px / 2 : 18;

    this._handleClick = this._handleClick.bind(this);
    this._resize = this._resize.bind(this);
  }

  start(sessionData) {
    this.running = true;
    this._resize();
    window.addEventListener('resize', this._resize);
    this.canvas.addEventListener('click', this._handleClick);
    this.canvas.style.cursor = 'crosshair';
    this._spawnTarget();
    this._loop();
  }

  pause() {
    this.running = false;
    clearTimeout(this._spawnTimer);
  }

  resume() {
    this.running = true;
    this._spawnTarget();
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this._spawnTimer);
    cancelAnimationFrame(this._animFrame);
    window.removeEventListener('resize', this._resize);
    this.canvas.removeEventListener('click', this._handleClick);
    this.canvas.style.cursor = 'default';
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  _spawnTarget() {
    if (!this.running) return;
    const padding = this.targetRadius + 20;
    const x = padding + Math.random() * (this.w - padding * 2);
    const y = padding + Math.random() * (this.h - padding * 2);
    this.targets = [{
      x, y,
      radius: this.targetRadius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
    }];
  }

  _handleClick(e) {
    if (!this.running) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let hit = false;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dx = mx - t.x;
      const dy = my - t.y;
      if (dx * dx + dy * dy <= t.radius * t.radius) {
        t.alive = false;
        hit = true;
        const reactionTime = Date.now() - t.spawnTime;
        if (this._onHit) this._onHit(reactionTime);
        // Spawn next target quickly
        clearTimeout(this._spawnTimer);
        this._spawnTimer = setTimeout(() => this._spawnTarget(), 150);
        break;
      }
    }
    if (!hit && this._onMiss) this._onMiss();
  }

  _loop() {
    if (!this.running && this.targets.length === 0) return;
    this._draw();
    this._animFrame = requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = gridSize; x < this.w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); ctx.stroke();
    }
    for (let y = gridSize; y < this.h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
    }

    // Draw targets
    for (const t of this.targets) {
      if (!t.alive) continue;
      // Fade in
      t.opacity = Math.min(1, t.opacity + 0.08);

      // Outer ring
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 224, 208, ${0.12 * t.opacity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(0, 224, 208, ${0.8 * t.opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 224, 208, ${t.opacity})`;
      ctx.fill();

      // Crosshair lines
      const cLen = t.radius + 8;
      ctx.strokeStyle = `rgba(0, 224, 208, ${0.3 * t.opacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(t.x - cLen, t.y); ctx.lineTo(t.x - t.radius - 4, t.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t.x + t.radius + 4, t.y); ctx.lineTo(t.x + cLen, t.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t.x, t.y - cLen); ctx.lineTo(t.x, t.y - t.radius - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t.x, t.y + t.radius + 4); ctx.lineTo(t.x, t.y + cLen); ctx.stroke();
    }
  }

  // Allow engine to register callbacks
  setCallbacks({ onHit, onMiss }) {
    this._onHit = onHit;
    this._onMiss = onMiss;
  }
};
