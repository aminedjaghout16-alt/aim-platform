/* ============================================
   Three Arena Renderer — 3D FPS Training Environment
   Uses Three.js for a first-person aim training arena.
   Reusable engine: future scenarios share this renderer.
   ============================================ */
VantageEngine.Renderers.ThreeArenaRenderer = class ThreeArenaRenderer {
  constructor(canvas, scenario, config) {
    this.canvas = canvas;
    this.scenario = scenario;
    this.config = config;
    this.running = false;
    this._animFrame = null;
    this._onHit = null;
    this._onMiss = null;

    // Resolve target size from settings (difficulty shrinks targets: sqrt keeps Extreme playable)
    const S = VantageEngine.Settings;
    const sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    const diffSetting = S.getDifficulty(config.difficulty || 'medium');
    const diffMult = diffSetting ? diffSetting.multiplier : 1;
    const baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius / Math.sqrt(diffMult);

    // Target speed controls how quickly the next target appears after a hit
    const speedSetting = S.getTargetSpeed(config.targetSpeed || 'normal');
    this._speedMult = speedSetting ? speedSetting.multiplier : 1;

    // Mouse sensitivity: radians per mouse count, from the chosen game's yaw factor
    const game = S.getGame(config.game) || S.getGame('generic');
    const sens = Number(config.sensitivity) > 0 ? Number(config.sensitivity) : (game ? game.defaultSensitivity : 1);
    const yawDeg = game && game.yaw ? game.yaw : 0.022;
    this._yawDeg = yawDeg;
    this._radPerCount = sens * yawDeg * Math.PI / 180;
    this._paused = false;
    this._pauseStart = 0;

    // Vertical field of view in degrees (changeable live via setFov)
    this._fov = Number(config.fov) > 0 ? Number(config.fov) : 75;

    // Input guards after (re)acquiring the mouse: ignore stray clicks and the
    // first mouse-move events (some browsers report a large bogus delta on lock)
    this._ignoreClicksUntil = 0;
    this._skipMoves = 0;

    // Camera / mouse-look state
    this._yaw = 0;
    this._pitch = 0;
    this._pointerLocked = false;

    // Target management
    this._targets = [];
    this._spawnTimer = null;
    this._clock = null;
    this._initialized = false;

    // Session tracking for difficulty progression
    this._hitCount = 0;
    this._sessionStartTime = 0;
    this._lastTargetPos = null;

    // Particle system for hit effects
    this._particles = [];

    // Three.js objects
    this._scene = null;
    this._camera = null;
    this._renderer3d = null;
    this._raycaster = null;
    this._arenaGroup = null;

    // Bound handlers
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onClick = this._handleClick.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onResize = this._handleResize.bind(this);
    this._onContextMenu = (ev) => ev.preventDefault();

    // Weapon system
    this._weaponGroup = null;     // Root group attached to camera
    this._muzzleFlash = null;     // Muzzle flash mesh
    this._muzzleFlash2 = null;    // Secondary muzzle flash mesh
    this._muzzleFlashLife = 0;    // Remaining flash lifetime
    this._recoilOffset = 0;       // Current recoil displacement (0..1)
    this._recoilRotOffset = 0;    // Current recoil rotation
    this._weaponRestPos = new THREE.Vector3(0.28, -0.22, -0.45);
    this._weaponRestRot = new THREE.Euler(-0.05, -0.08, 0.02);

    // Weapon config (resolved from VantageEngine.Weapons)
    this._weapon = null;
    this._weaponModelParts = null;  // { group, muzzleFlash, muzzleFlash2 }
    this._lastFireTime = 0;        // Timestamp of last shot (for fire rate limiting)
    this._mouseDown = false;        // Whether mouse button is held (for auto fire)
    this._autoFireTimer = null;     // Interval for auto-fire
    this._targetColor = '#ff2d95';  // target color (changeable via setTargetColor)

    // View recoil (camera kick). Deliberately SEPARATE from the player's real aim (_yaw/_pitch):
    // the camera is rendered at (aim + recoil) and recoil always decays back to exactly 0, so
    // it can never permanently shift the aim. Angles in radians.
    this._recoil = { pitch: 0, yaw: 0, pitchTarget: 0, yawTarget: 0, sinceShot: 999 };
    this._viewRecoilCfg = null;      // cached tuning for the active weapon

    // Scope (weapons with a `scope` config, e.g. the Operator). Right-click cycles the zoom levels.
    this._scopeLevel = 0;        // 0 = unscoped, 1..n = index+1 into weapon.scope.zoomLevels
    this._zoomCur = 1;           // current smoothed magnification (1 = none)
    this._zoomTarget = 1;        // magnification we are easing toward
    this._scopeBlend = 0;        // 0..1 how far scoped-in we are (drives accuracy + overlay)
    this._scopeEl = null;        // DOM overlay (black lens frame + reticle)
    this._onScope = null;        // callback(isScoped) so the page can hide the normal crosshair

    // Bullet tracers (small pool of reusable meshes — no per-shot allocations)
    this._tracers = [];
    this._tracerNext = 0;
    this._tracerEnd = null;
    this._arenaBox = null;
  }

  /* ---------- Lifecycle ---------- */

  // Called early (during countdown) to build the 3D scene
  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._initScene();
    this._buildArena();
    this._buildWeapon();
    this._buildTracers();
    this._bindEvents();
    this._clock = new THREE.Clock();
    this._clock.start();
    // Start rendering the arena immediately (no targets yet)
    this._idleRenderLoop();
  }

  // Called when gameplay actually begins (after countdown)
  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._lastTargetPos = null;
    this._recentPositions = [];
    this._spawnPending = false;
    this._spawnTarget();
    this._loop();
  }

  pause() {
    this._paused = true;
    this._resetScope();
    this._pauseStart = Date.now();
    this.running = false;
    clearTimeout(this._spawnTimer);
    this._spawnPending = false;
    // Release pointer lock so user can interact with HUD
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    // Keep rendering the arena (frozen, no target updates)
    this._idleRenderLoop();
  }

  resume() {
    // Shift time-based state forward by the time spent paused, so pausing never
    // inflates reaction times or advances the difficulty ramp.
    if (this._pauseStart) {
      const pausedMs = Date.now() - this._pauseStart;
      this._sessionStartTime += pausedMs;
      for (const t of this._targets) t.spawnTime += pausedMs;
      this._pauseStart = 0;
    }
    this._paused = false;
    this._stopIdleLoop();
    this.running = true;
    this._spawnPending = false;
    // Player must click canvas again to re-lock pointer
    this._spawnTarget();
    this._loop();
  }

  stop() {
    if (this._stopped) return;
    this._stopped = true;
    this.running = false;
    this._mouseDown = false;
    this._stopAutoFire();
    this._spawnPending = false;
    clearTimeout(this._spawnTimer);
    cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
    this._unbindEvents();
    this._clearTargets();
    this._clearParticles();

    if (this._renderer3d) {
      this._renderer3d.dispose();
      this._renderer3d.forceContextLoss();
    }
    if (this._scene) {
      this._scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this._scene = null;
    this._camera = null;
    this._renderer3d = null;
    this._weaponGroup = null;
    this._muzzleFlash = null;
    this._muzzleFlash2 = null;
    this._tracers = [];
    this._initialized = false;
  }

  _clearParticles() {
    for (const p of this._particles) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._particles = [];
  }

  // Request mouse lock (must be called from a user gesture). Never throws.
  requestLock() {
    try {
      if (!this.canvas || document.pointerLockElement === this.canvas) return;
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) { /* browser refused; user can click again */ }
  }

  isLocked() {
    return !!this.canvas && document.pointerLockElement === this.canvas;
  }

  // ---- Live settings (safe to call at any time, including while paused) ----

  // In-game sensitivity for the chosen game; takes effect on the very next mouse move
  setSensitivity(sens) {
    const n = Number(sens);
    if (!(n > 0)) return;
    this._radPerCount = n * this._yawDeg * Math.PI / 180;
  }

  // Vertical field of view in degrees
  setFov(deg) {
    const n = Number(deg);
    if (!(n > 0)) return;
    this._fov = n;
    if (this._camera) {
      // While scoped/zooming the per-frame scope update owns camera.fov
      this._camera.fov = this._fovForZoom(this._zoomCur);
      this._camera.updateProjectionMatrix();
    }
  }

  // 0..1 progression of the existing difficulty ramp (hits + time based)
  getProgression() {
    if (!this._sessionStartTime) return 0;
    return this._getDifficultyFactor();
  }

  setCallbacks({ onHit, onMiss, onScope }) {
    this._onHit = onHit;
    this._onMiss = onMiss;
    this._onScope = onScope || null;
  }

  /* ---------- Scope ---------- */

  _hasScope() {
    return !!(this._weapon && this._weapon.scope && this._weapon.scope.zoomLevels && this._weapon.scope.zoomLevels.length);
  }

  // Vertical FOV that gives `zoom`x magnification of the base FOV (tan-based, so it is a true zoom)
  _fovForZoom(zoom) {
    if (!(zoom > 1)) return this._fov;
    const half = Math.atan(Math.tan(this._fov * Math.PI / 360) / zoom);
    return half * 360 / Math.PI;
  }

  // Right-click: unscoped -> scope 1 -> scope 2 -> ... -> unscoped
  _cycleScope() {
    if (!this._hasScope()) return;
    const levels = this._weapon.scope.zoomLevels;
    this._setScopeLevel(this._scopeLevel >= levels.length ? 0 : this._scopeLevel + 1);
  }

  _setScopeLevel(level) {
    if (!this._hasScope() && level !== 0) return;
    const was = this._scopeLevel > 0;
    this._scopeLevel = level;
    this._zoomTarget = level > 0 ? this._weapon.scope.zoomLevels[level - 1] : 1;
    this._ensureScopeOverlay();
    const now = level > 0;
    if (now !== was && this._onScope) this._onScope(now);
  }

  // Per frame: ease the zoom, drive the overlay, hide the gun while looking through the scope
  _updateScope(dt) {
    if (!this._camera) return;
    if (this._zoomCur === this._zoomTarget && this._scopeLevel === 0 && this._scopeBlend === 0) return;
    const f = 1 - Math.exp(-16 * dt);
    this._zoomCur += (this._zoomTarget - this._zoomCur) * f;
    if (Math.abs(this._zoomTarget - this._zoomCur) < 0.002) this._zoomCur = this._zoomTarget;
    const first = this._hasScope() ? this._weapon.scope.zoomLevels[0] : 2;
    this._scopeBlend = Math.max(0, Math.min(1, (this._zoomCur - 1) / (first - 1)));
    if (this._zoomCur === 1) this._scopeBlend = 0;

    const fov = this._fovForZoom(this._zoomCur);
    if (Math.abs(this._camera.fov - fov) > 1e-4) {
      this._camera.fov = fov;
      this._camera.updateProjectionMatrix();
    }
    if (this._scopeEl) {
      this._scopeEl.style.opacity = String(this._scopeBlend);
      this._scopeEl.style.display = this._scopeBlend > 0.01 ? 'block' : 'none';
    }
    if (this._weaponGroup) this._weaponGroup.visible = this._scopeBlend < 0.5;
  }

  _ensureScopeOverlay() {
    if (this._scopeEl || !this.canvas || !this.canvas.parentElement) return;
    const el = document.createElement('div');
    el.className = 'vscope-overlay';
    el.style.display = 'none';
    el.innerHTML = '<div class="vscope-line vscope-h"></div><div class="vscope-line vscope-v"></div><div class="vscope-dot"></div>';
    this.canvas.parentElement.appendChild(el);
    this._scopeEl = el;
    // Reticle follows the player's crosshair colour so it is visible on the dark arena
    try {
      const ch = VantageEngine.PlayerPrefs.get().crosshair;
      if (ch && ch.color) el.style.setProperty('--scope-color', ch.color);
    } catch (err) { /* keep CSS default */ }
  }

  // Drop out of the scope instantly (pause, pointer unlock, stop)
  _resetScope() {
    const was = this._scopeLevel > 0;
    this._scopeLevel = 0;
    this._zoomTarget = 1;
    this._zoomCur = 1;
    this._scopeBlend = 0;
    if (this._camera) {
      this._camera.fov = this._fov;
      this._camera.updateProjectionMatrix();
    }
    if (this._scopeEl) { this._scopeEl.style.opacity = '0'; this._scopeEl.style.display = 'none'; }
    if (this._weaponGroup) this._weaponGroup.visible = true;
    if (was && this._onScope) this._onScope(false);
  }

  /* ---------- Scene Initialization ---------- */

  _initScene() {
    const wrapper = this.canvas.parentElement;
    const w = wrapper.clientWidth || window.innerWidth;
    const h = wrapper.clientHeight || window.innerHeight;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1a1c);
    this._scene.fog = new THREE.Fog(0x1a1a1c, 45, 90);

    this._camera = new THREE.PerspectiveCamera(this._fov, w / h, 0.1, 120);
    this._camera.position.set(0, 1.7, 0);
    this._camera.rotation.order = 'YXZ';

    this._renderer3d = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this._renderer3d.setSize(w, h);
    this._renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Shadows disabled for performance — arena uses baked lighting feel
    this._renderer3d.shadowMap.enabled = false;
    this._renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer3d.toneMappingExposure = 1.25;

    this._raycaster = new THREE.Raycaster();

    this._arenaGroup = new THREE.Group();
    this._scene.add(this._arenaGroup);
  }

  /* ---------- Procedural textures (no external assets) ---------- */

  _rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _makeTexture(w, h, repX, repY, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this._renderer3d.capabilities.getMaxAnisotropy());
    return tex;
  }

  _concreteBase(g, w, h, base, rnd, blotches, blotchAlpha, grain) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // soft blotches (drawn wrapped so tiles repeat without a hard seam)
    for (let i = 0; i < blotches; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 160;
      const dark = rnd() < 0.55;
      const a = 0.03 + rnd() * blotchAlpha;
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          grd.addColorStop(0, dark ? 'rgba(30,28,25,' + a + ')' : 'rgba(255,252,245,' + a + ')');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
    // fine grain / pores
    for (let i = 0; i < grain; i++) {
      const x = rnd() * w, y = rnd() * h, sz = rnd() < 0.85 ? 1 : 2;
      g.fillStyle = rnd() < 0.5
        ? 'rgba(20,18,15,' + (0.05 + rnd() * 0.12) + ')'
        : 'rgba(255,255,250,' + (0.04 + rnd() * 0.1) + ')';
      g.fillRect(x, y, sz, sz);
    }
  }

  _makeArenaTextures() {
    const T = {};

    // Wall: concrete panels (8m x 6m per tile) with seams, tie holes, stains, dark lower band
    T.wall = this._makeTexture(1024, 768, 5, 1, (g, w, h) => {
      const rnd = this._rng(11);
      this._concreteBase(g, w, h, '#b8b5ae', rnd, 45, 0.08, 9000);
      for (let i = 0; i < 14; i++) {            // vertical water streaks
        const x = rnd() * w, len = 120 + rnd() * 340, wd = 6 + rnd() * 18;
        const grd = g.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(40,36,30,' + (0.05 + rnd() * 0.06) + ')');
        grd.addColorStop(1, 'rgba(40,36,30,0)');
        g.fillStyle = grd;
        g.fillRect(x, 0, wd, len);
      }
      const bandH = 140, bandY = h - bandH;     // darker protective lower band
      g.fillStyle = 'rgba(70,64,56,0.30)';
      g.fillRect(0, bandY, w, bandH);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.fillRect(0, bandY - 2, w, 2);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, bandY, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.22)';          // mid horizontal joint
      g.fillRect(0, Math.floor(h * 0.45), w, 2);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(0, Math.floor(h * 0.45) + 2, w, 1);
      g.fillStyle = 'rgba(0,0,0,0.32)';          // vertical panel seam (tile edge)
      g.fillRect(0, 0, 4, h);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(4, 0, 2, h);
      for (const px of [w * 0.25, w * 0.75]) {   // tie holes
        for (const py of [h * 0.22, h * 0.68]) {
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.beginPath(); g.arc(px, py + 1, 6, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(25,22,20,0.6)';
          g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
        }
      }
    });

    // Floor: polished concrete slabs (4m) with control joints, scuffs, oil stains, hairline cracks
    T.floor = this._makeTexture(1024, 1024, 10, 10, (g, w, h) => {
      const rnd = this._rng(23);
      this._concreteBase(g, w, h, '#76716a', rnd, 60, 0.1, 22000);
      for (let i = 0; i < 3; i++) {              // oil stains
        const x = rnd() * w, y = rnd() * h, r = 50 + rnd() * 70;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(15,14,12,0.28)');
        grd.addColorStop(1, 'rgba(15,14,12,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {             // scuffs
        const x = rnd() * w, y = rnd() * h, len = 60 + rnd() * 110, ang = rnd() * Math.PI;
        g.strokeStyle = 'rgba(20,18,16,' + (0.07 + rnd() * 0.08) + ')';
        g.lineWidth = 2 + rnd() * 4;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + 12, y + Math.sin(ang) * len * 0.5 - 12, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.stroke();
      }
      g.lineWidth = 1.2;                         // hairline cracks
      for (let i = 0; i < 4; i++) {
        let x = rnd() * w, y = rnd() * h;
        g.strokeStyle = 'rgba(15,14,12,0.28)';
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += (rnd() - 0.3) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = 'rgba(10,9,8,0.45)';         // control joints on slab edges
      g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, 3, w, 2); g.fillRect(3, 0, 2, h);
    });

    // Ceiling: acoustic tiles (2m) with perforations and light T-bar grid
    T.ceil = this._makeTexture(512, 512, 20, 20, (g, w, h) => {
      const rnd = this._rng(37);
      g.fillStyle = '#c3c0b9';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = 'rgba(30,28,25,' + (0.03 + rnd() * 0.06) + ')';
        g.fillRect(rnd() * w, rnd() * h, 1, 1);
      }
      g.fillStyle = 'rgba(40,38,34,0.16)';        // perforations
      for (let y = 20; y < h - 10; y += 16) {
        for (let x = 20; x < w - 10; x += 16) { g.beginPath(); g.arc(x, y, 1.1, 0, Math.PI * 2); g.fill(); }
      }
      g.fillStyle = '#8e8b84'; g.fillRect(0, 0, w, 9); g.fillRect(0, 0, 9, h);
      g.fillStyle = '#dcdad3'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h);
    });

    // Pillar concrete
    T.pillar = this._makeTexture(256, 512, 1, 3, (g, w, h) => {
      const rnd = this._rng(53);
      this._concreteBase(g, w, h, '#a09d96', rnd, 20, 0.08, 5000);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, Math.floor(h / 2), w, 2);
    });

    // Acoustic foam pyramids
    T.foam = this._makeTexture(256, 256, 1, 1, (g, w, h) => {
      const cell = 64;
      const shades = ['#3a3b3e', '#2a2b2d', '#1d1e20', '#303134'];
      for (let cy = 0; cy < h; cy += cell) {
        for (let cx = 0; cx < w; cx += cell) {
          const mx = cx + cell / 2, my = cy + cell / 2;
          const corners = [[cx, cy], [cx + cell, cy], [cx + cell, cy + cell], [cx, cy + cell]];
          for (let k = 0; k < 4; k++) {
            g.fillStyle = shades[k];
            g.beginPath();
            g.moveTo(corners[k][0], corners[k][1]);
            g.lineTo(corners[(k + 1) % 4][0], corners[(k + 1) % 4][1]);
            g.lineTo(mx, my);
            g.closePath();
            g.fill();
          }
        }
      }
    });

    // Yellow/black hazard stripes
    T.hazard = this._makeTexture(128, 128, 1, 1, (g, w, h) => {
      g.fillStyle = '#1a1a1a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9b310';
      for (let i = -w; i < w * 2; i += 32) {
        g.beginPath();
        g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - h, h); g.lineTo(i - h, h);
        g.closePath();
        g.fill();
      }
    });

    // Vent grille
    T.vent = this._makeTexture(128, 96, 1, 1, (g, w, h) => {
      g.fillStyle = '#9a9c9e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2c2e30'; g.fillRect(8, 8, w - 16, h - 16);
      for (let y = 12; y < h - 10; y += 10) {
        g.fillStyle = '#7d8083'; g.fillRect(8, y, w - 16, 5);
        g.fillStyle = '#b4b6b8'; g.fillRect(8, y, w - 16, 1);
      }
    });

    // EXIT sign
    T.exit = this._makeTexture(128, 48, 1, 1, (g, w, h) => {
      g.fillStyle = '#1f9d55'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#ffffff';
      g.font = 'bold 30px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('EXIT', w / 2, h / 2 + 2);
    });

    return T;
  }

  /* ---------- Arena Construction ---------- */

  _buildArena() {
    const arena = this._arenaGroup;
    const tex = this._makeArenaTextures();

    // --- Floor with subtle gradient ---
    const floorGeo = new THREE.PlaneGeometry(40, 40, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.floor,
      roughness: 0.6,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    arena.add(floor);

    // --- Walls ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.wall,
      roughness: 0.9,
      metalness: 0.0,
    });
    const wallH = 6;
    const half = 20;

    const wallConfigs = [
      { w: 40, pos: [0, wallH / 2, -half], ry: 0 },
      { w: 40, pos: [0, wallH / 2, half], ry: Math.PI },
      { w: 40, pos: [-half, wallH / 2, 0], ry: Math.PI / 2 },
      { w: 40, pos: [half, wallH / 2, 0], ry: -Math.PI / 2 },
    ];
    for (const cfg of wallConfigs) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w, wallH), wallMat);
      wall.position.set(...cfg.pos);
      wall.rotation.y = cfg.ry;
      arena.add(wall);

    }

    // --- Ceiling ---
    const ceilMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex.ceil });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallH;
    arena.add(ceiling);

    // --- Crisp edge outlines: floor/ceiling seams + vertical corners ---
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4844 });
    const edgePts = [];
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = corners[i];
      const [x2, z2] = corners[(i + 1) % 4];
      edgePts.push(x1, 0.03, z1, x2, 0.03, z2);           // floor seam
      edgePts.push(x1, wallH, z1, x2, wallH, z2);         // ceiling seam
      edgePts.push(x1, 0, z1, x1, wallH, z1);             // vertical corner
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
    arena.add(new THREE.LineSegments(edgeGeo, edgeMat));

    // --- Lighting (improved) ---
    const ambient = new THREE.AmbientLight(0xffffff, 1.6);
    this._scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xfff4e0, 1.3);
    mainLight.position.set(2, 8, 3);
    this._scene.add(mainLight);

    // Teal accent lights (brighter)
    const accent1 = new THREE.PointLight(0xfff1dc, 0.9, 35);
    accent1.position.set(-10, 3.5, -10);
    this._scene.add(accent1);

    const accent2 = new THREE.PointLight(0xfff1dc, 0.8, 35);
    accent2.position.set(10, 3.5, 10);
    this._scene.add(accent2);

    // Additional corner accents
    const accent3 = new THREE.PointLight(0xfff1dc, 0.5, 25);
    accent3.position.set(-10, 2, 10);
    this._scene.add(accent3);

    const accent4 = new THREE.PointLight(0xfff1dc, 0.5, 25);
    accent4.position.set(10, 2, -10);
    this._scene.add(accent4);

    // Warm fill (improved)
    const fill = new THREE.PointLight(0xffe8c0, 0.5, 40);
    fill.position.set(0, 4, -15);
    this._scene.add(fill);

    // Overhead center light
    const overhead = new THREE.PointLight(0xffffff, 0.5, 20);
    overhead.position.set(0, 5, 0);
    this._scene.add(overhead);

    // Additional fill lights for better visibility
    const fillLeft = new THREE.PointLight(0xdfe8ff, 0.3, 30);
    fillLeft.position.set(-15, 3, 0);
    this._scene.add(fillLeft);

    const fillRight = new THREE.PointLight(0xdfe8ff, 0.3, 30);
    fillRight.position.set(15, 3, 0);
    this._scene.add(fillRight);

    const concreteDark = new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.9, metalness: 0.0 });

    // --- Decorative pillars (improved) ---
    const pillarGeo = new THREE.BoxGeometry(0.6, wallH, 0.6);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.pillar,
      roughness: 0.85,
      metalness: 0.0,
    });
    const pillarPos = [
      [-12, wallH / 2, -12], [12, wallH / 2, -12],
      [-12, wallH / 2, 12], [12, wallH / 2, 12],
    ];
    for (const pp of pillarPos) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(...pp);
      arena.add(pillar);
      // Hazard-stripe guard + base plate + cap
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 1.1, 0.64),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.hazard, roughness: 0.7, metalness: 0.0 })
      );
      guard.position.set(pp[0], 0.7, pp[2]);
      arena.add(guard);
      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.8), concreteDark);
      basePlate.position.set(pp[0], 0.075, pp[2]);
      arena.add(basePlate);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.18, 0.76), concreteDark);
      cap.position.set(pp[0], wallH - 0.09, pp[2]);
      arena.add(cap);
    }

    // ===== Extra realism details =====
    // Rubber shooting mat under the player
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.95, metalness: 0.0 })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.012;
    arena.add(mat);

    // Baseboards
    const bbGeo = new THREE.BoxGeometry(40, 0.25, 0.08);
    for (const b of [
      { pos: [0, 0.125, -half + 0.04], ry: 0 },
      { pos: [0, 0.125, half - 0.04], ry: 0 },
      { pos: [-half + 0.04, 0.125, 0], ry: Math.PI / 2 },
      { pos: [half - 0.04, 0.125, 0], ry: Math.PI / 2 },
    ]) {
      const bb = new THREE.Mesh(bbGeo, concreteDark);
      bb.position.set(...b.pos);
      bb.rotation.y = b.ry;
      arena.add(bb);
    }

    // Acoustic foam panels on the back wall
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.foam, roughness: 1.0, metalness: 0.0 });
    const foamGeo = new THREE.BoxGeometry(1.5, 1.5, 0.12);
    for (let x = -9; x <= 9; x += 1.5) {
      for (const y of [2.0, 3.5]) {
        const f = new THREE.Mesh(foamGeo, foamMat);
        f.position.set(x, y, -half + 0.06);
        arena.add(f);
      }
    }

    // Ceiling light panels (3 x 3)
    const lightFrameMat = new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.6, metalness: 0.1 });
    const lightPanelMat = new THREE.MeshBasicMaterial({ color: 0xfff6e2 });
    for (const lx of [-9, 0, 9]) {
      for (const lz of [-9, 0, 9]) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.3), lightFrameMat);
        frame.position.set(lx, wallH - 0.05, lz);
        arena.add(frame);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.1), lightPanelMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(lx, wallH - 0.106, lz);
        arena.add(panel);
      }
    }

    // Ventilation duct along the back wall (with seam bands)
    const ductMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.45, metalness: 0.1 });
    const duct = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 0.7), ductMat);
    duct.position.set(0, 5.3, -half + 0.35);
    arena.add(duct);
    const bandGeo = new THREE.BoxGeometry(0.06, 0.64, 0.74);
    for (let x = -18; x <= 18; x += 4) {
      const band = new THREE.Mesh(bandGeo, concreteDark);
      band.position.set(x, 5.3, -half + 0.35);
      arena.add(band);
    }

    // Pipes along the side walls (grey left, red fire line right) with brackets
    const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, 40, 12);
    const bracketGeo = new THREE.BoxGeometry(0.14, 0.2, 0.14);
    for (const side of [-1, 1]) {
      const pipeMat = new THREE.MeshStandardMaterial({
        color: side < 0 ? 0x6b7078 : 0x9c2f2a, roughness: 0.5, metalness: 0.15,
      });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * (half - 0.25), 4.6, 0);
      arena.add(pipe);
      for (let z = -17.5; z <= 17.5; z += 5) {
        const br = new THREE.Mesh(bracketGeo, concreteDark);
        br.position.set(side * (half - 0.18), 4.6, z);
        arena.add(br);
      }
    }

    // Vents + exit signs
    const ventMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.vent, roughness: 0.6, metalness: 0.1 });
    const ventGeo = new THREE.PlaneGeometry(0.9, 0.7);
    const exitMat = new THREE.MeshBasicMaterial({ map: tex.exit });
    const exitGeo = new THREE.PlaneGeometry(0.7, 0.26);
    const wallPlace = (obj, wallIdx, along, y) => {
      const o = 0.03;
      if (wallIdx === 0) { obj.position.set(along, y, -half + o); obj.rotation.y = 0; }
      if (wallIdx === 1) { obj.position.set(along, y, half - o); obj.rotation.y = Math.PI; }
      if (wallIdx === 2) { obj.position.set(-half + o, y, along); obj.rotation.y = Math.PI / 2; }
      if (wallIdx === 3) { obj.position.set(half - o, y, along); obj.rotation.y = -Math.PI / 2; }
      arena.add(obj);
    };
    for (const [wi, al] of [[0, -14], [0, 14], [2, -10], [2, 10], [3, -10], [3, 10], [1, -10], [1, 10]]) {
      wallPlace(new THREE.Mesh(ventGeo, ventMat), wi, al, 3.9);
    }
    for (const [wi, al] of [[0, 17], [1, -15], [2, 15], [3, -16]]) {
      wallPlace(new THREE.Mesh(exitGeo, exitMat), wi, al, 4.2);
    }

    // Fire extinguishers on the walls
    const extMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4, metalness: 0.2 });
    const extGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.45, 12);
    const extTopGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
    for (const [wi, al] of [[2, -6], [3, 7], [1, 4]]) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(extGeo, extMat);
      body.position.y = 0.225;
      group.add(body);
      const top = new THREE.Mesh(extTopGeo, concreteDark);
      top.position.y = 0.5;
      group.add(top);
      group.position.y = 0.95;
      const o = 0.12;
      if (wi === 1) group.position.set(al, 0.95, half - o);
      if (wi === 2) group.position.set(-half + o, 0.95, al);
      if (wi === 3) group.position.set(half - o, 0.95, al);
      arena.add(group);
    }
  }

  /* ---------- Weapon Model ---------- */

  _buildWeapon() {
    // Resolve weapon from the weapon system
    var Weapons = VantageEngine.Weapons;
    var weaponId = 'classic';
    if (VantageEngine.PlayerPrefs && VantageEngine.PlayerPrefs.get) {
      var prefs = VantageEngine.PlayerPrefs.get();
      weaponId = prefs.selectedWeapon || 'classic';
    }
    // Respect the game mode's weapon lock (e.g. Static Flick = single-shot weapons only)
    var scenarioId = this.scenario && this.scenario.id;
    this._weapon = Weapons ? Weapons.resolveForScenario(weaponId, scenarioId) : null;
    if (!this._weapon && Weapons) this._weapon = Weapons.getById('classic');

    var modelResult;
    if (this._weapon && Weapons) {
      modelResult = Weapons.buildModel(this._weapon);
    } else {
      // Fallback: build classic manually if weapon system not available
      modelResult = { group: new THREE.Group(), muzzleFlash: null, muzzleFlash2: null };
    }

    this._weaponModelParts = modelResult;
    var group = modelResult.group;
    this._muzzleFlash = modelResult.muzzleFlash;
    this._muzzleFlash2 = modelResult.muzzleFlash2;

    // Set rest position/rotation from weapon config
    if (this._weapon && this._weapon.model) {
      var mp = this._weapon.model;
      this._weaponRestPos.set(mp.restPos[0], mp.restPos[1], mp.restPos[2]);
      this._weaponRestRot.set(mp.restRot[0], mp.restRot[1], mp.restRot[2]);
    }

    // Position the weapon group relative to camera
    group.position.copy(this._weaponRestPos);
    group.rotation.copy(this._weaponRestRot);

    // Attach to camera
    this._camera.add(group);
    this._scene.add(this._camera); // Camera must be in scene for children to render
    this._weaponGroup = group;
  }

  // Trigger the weapon fire effects (uses weapon-specific settings)
  _fireWeapon() {
    var weapon = this._weapon;
    var recoilProfile = weapon ? weapon.recoil : { vertical: 0.08, horizontal: 0.02, recovery: 6 };

    this._recoilOffset = 1.0;
    this._recoilRotOffset = 1.0;
    this._muzzleFlashLife = 1.0;

    // Show muzzle flash with weapon-specific size/color
    if (this._muzzleFlash) {
      this._muzzleFlash.material.opacity = 1;
      var flashScale = weapon ? weapon.muzzleFlash.size * 8 : 0.8;
      this._muzzleFlash.scale.setScalar(flashScale * (0.8 + Math.random() * 0.5));
      this._muzzleFlash.rotation.z = Math.random() * Math.PI;
    }
    if (this._muzzleFlash2) {
      this._muzzleFlash2.material.opacity = 0.7;
      var flash2Scale = weapon ? weapon.muzzleFlash.size * 6 : 0.6;
      this._muzzleFlash2.scale.setScalar(flash2Scale * (0.6 + Math.random() * 0.4));
    }
  }

  // Update weapon animations (called each frame)
  _updateWeapon(dt) {
    this._updateScope(dt);
    this._updateRecoil(dt);
    this._updateTracers(dt);
    if (!this._weaponGroup) return;

    var weapon = this._weapon;
    var recovery = weapon ? weapon.recoil.recovery : 8;

    // Recoil recovery (smooth lerp back to rest)
    if (this._recoilOffset > 0.001) {
      this._recoilOffset = Math.max(0, this._recoilOffset - dt * recovery);
    } else {
      this._recoilOffset = 0;
    }
    if (this._recoilRotOffset > 0.001) {
      this._recoilRotOffset = Math.max(0, this._recoilRotOffset - dt * recovery);
    } else {
      this._recoilRotOffset = 0;
    }

    // Apply recoil: push gun backward (+z) and kick up slightly (-x rotation)
    var recoilZ = this._recoilOffset * 0.06;
    var recoilRotX = -this._recoilRotOffset * 0.12;
    this._weaponGroup.position.set(
      this._weaponRestPos.x,
      this._weaponRestPos.y - this._recoilOffset * 0.01,
      this._weaponRestPos.z + recoilZ,
    );
    this._weaponGroup.rotation.set(
      this._weaponRestRot.x + recoilRotX,
      this._weaponRestRot.y,
      this._weaponRestRot.z,
    );

    // Muzzle flash decay (weapon-specific duration)
    if (this._muzzleFlashLife > 0) {
      var flashDur = weapon ? (1.0 / (weapon.muzzleFlash.duration || 0.06)) : 18;
      this._muzzleFlashLife = Math.max(0, this._muzzleFlashLife - dt * flashDur);
      if (this._muzzleFlash) {
        this._muzzleFlash.material.opacity = this._muzzleFlashLife;
        this._muzzleFlash.scale.setScalar(0.5 + this._muzzleFlashLife * 0.6);
      }
      if (this._muzzleFlash2) {
        this._muzzleFlash2.material.opacity = this._muzzleFlashLife * 0.6;
      }
      if (this._muzzleFlashLife <= 0) {
        if (this._muzzleFlash) this._muzzleFlash.material.opacity = 0;
        if (this._muzzleFlash2) this._muzzleFlash2.material.opacity = 0;
      }
    }
  }

  // Target color as '#rrggbb'; recolors targets already on screen
  setTargetColor(hex) {
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return;
    this._targetColor = hex;
    for (const t of this._targets || []) {
      if (!t || !t.mesh) continue;
      t.mesh.material.color.set(hex);
      if (t.mesh.material.emissive) t.mesh.material.emissive.set(hex);
      if (t.ring) t.ring.material.color.set(hex);
      if (t.innerRing) t.innerRing.material.color.set(hex);
    }
  }

  /* ---------- View Recoil ---------- */

  // Active weapon's camera-recoil tuning (degrees), with defaults for anything missing.
  _getViewRecoil() {
    if (!this._viewRecoilCfg) {
      const v = (this._weapon && this._weapon.recoil && this._weapon.recoil.view) || {};
      this._viewRecoilCfg = Object.assign({}, this.constructor.RECOIL_DEFAULTS, v);
    }
    return this._viewRecoilCfg;
  }

  // Camera = player's real aim + temporary recoil offset. Only place the camera angles are set.
  _applyCameraRotation() {
    if (!this._camera) return;
    const lim = Math.PI / 2 - 0.05;
    this._camera.rotation.y = this._yaw + this._recoil.yaw;
    this._camera.rotation.x = Math.max(-lim, Math.min(lim, this._pitch + this._recoil.pitch));
  }

  // Add one shot's worth of kick. Only touches the recoil offset, never _yaw/_pitch.
  _applyRecoilKick() {
    const r = this._getViewRecoil();
    const rc = this._recoil;
    const D = Math.PI / 180;
    // Vertical: always up, with a little variation so it doesn't feel robotic
    const up = r.pitch * (1 + (Math.random() * 2 - 1) * r.pitchVariance) * D;
    rc.pitchTarget = Math.min(r.maxPitch * D, rc.pitchTarget + up);
    // Horizontal (optional: yaw 0 disables it)
    if (r.yaw > 0) {
      const side = (Math.random() * 2 - 1) * r.yaw * D;
      rc.yawTarget = Math.max(-r.maxYaw * D, Math.min(r.maxYaw * D, rc.yawTarget + side));
    }
    rc.sinceShot = 0;
  }

  // Per frame: ease the view toward the kick, then decay the kick back to zero.
  _updateRecoil(dt) {
    const rc = this._recoil;
    if (rc.pitch === 0 && rc.yaw === 0 && rc.pitchTarget === 0 && rc.yawTarget === 0) return;
    const r = this._getViewRecoil();

    rc.sinceShot += dt;
    if (rc.sinceShot > r.delay) {            // recovery only starts once firing pauses
      const k = Math.exp(-r.recovery * dt);  // frame-rate independent decay
      rc.pitchTarget *= k;
      rc.yawTarget *= k;
    }
    const f = 1 - Math.exp(-r.snap * dt);    // view follows the kick quickly but smoothly
    rc.pitch += (rc.pitchTarget - rc.pitch) * f;
    rc.yaw += (rc.yawTarget - rc.yaw) * f;

    // Snap to EXACTLY zero once it is invisible, so the aim returns to the precise original point
    const EPS = 1e-4; // ~0.006 degrees
    if (Math.abs(rc.pitchTarget) < EPS) rc.pitchTarget = 0;
    if (Math.abs(rc.yawTarget) < EPS) rc.yawTarget = 0;
    if (rc.pitchTarget === 0 && Math.abs(rc.pitch) < EPS) rc.pitch = 0;
    if (rc.yawTarget === 0 && Math.abs(rc.yaw) < EPS) rc.yaw = 0;

    this._applyCameraRotation();
  }

  _resetRecoil() {
    const rc = this._recoil;
    rc.pitch = rc.yaw = rc.pitchTarget = rc.yawTarget = 0;
    rc.sinceShot = 999;
    this._applyCameraRotation();
  }

  /* ---------- Bullet Tracers ---------- */

  _buildTracers() {
    const T = this.constructor.TRACER_DEFAULTS;
    const geo = new THREE.BoxGeometry(1, 1, 1);   // shared; scaled into a thin streak
    this._tracers = [];
    this._tracerNext = 0;
    for (let i = 0; i < T.poolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.raycast = function () {};   // tracers never take part in hit detection
      this._scene.add(mesh);
      this._tracers.push({ mesh, active: false, age: 0, dist: 1, dir: new THREE.Vector3(), start: new THREE.Vector3() });
    }
    this._tracerEnd = new THREE.Vector3();
    // Inside of the room: the tracer ends on the wall/floor/ceiling the crosshair points at
    this._arenaBox = new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 6, 20));
  }

  // Streak from the muzzle to where the shot went (the hit point, or the surface behind it).
  // Must be called right after the raycaster was set from the crosshair.
  _spawnTracer(hitPoint) {
    if (!this._tracers.length || !this._muzzleFlash) return;
    const T = this.constructor.TRACER_DEFAULTS;
    const ray = this._raycaster.ray;
    const end = this._tracerEnd;
    if (hitPoint) end.copy(hitPoint);
    else if (!ray.intersectBox(this._arenaBox, end)) end.copy(ray.direction).multiplyScalar(40).add(ray.origin);

    // Pick a free slot, otherwise recycle the oldest
    let t = null;
    for (let i = 0; i < this._tracers.length; i++) {
      if (!this._tracers[i].active) { t = this._tracers[i]; break; }
    }
    if (!t) { t = this._tracers[this._tracerNext]; this._tracerNext = (this._tracerNext + 1) % this._tracers.length; }

    this._muzzleFlash.getWorldPosition(t.start);
    t.dir.subVectors(end, t.start);
    t.dist = t.dir.length();
    if (t.dist < 0.3) { t.active = false; t.mesh.visible = false; return; }
    t.dir.divideScalar(t.dist);
    t.age = 0;
    t.active = true;

    const mesh = t.mesh;
    mesh.position.copy(t.start);
    mesh.lookAt(end);                       // +Z of the mesh now points along the shot
    mesh.scale.set(T.width, T.width, 0.001);
    mesh.visible = true;
    const mf = this._weapon && this._weapon.muzzleFlash;
    mesh.material.color.setHex(mf ? mf.color : 0xfff2b0).lerp(new THREE.Color(0xffffff), 0.45);
    mesh.material.opacity = T.opacity;
  }

  _updateTracers(dt) {
    const T = this.constructor.TRACER_DEFAULTS;
    for (let i = 0; i < this._tracers.length; i++) {
      const t = this._tracers[i];
      if (!t.active) continue;
      t.age += dt;
      const travelled = T.speed * t.age;
      if (travelled - T.length >= t.dist) {   // tail reached the end: done
        t.active = false;
        t.mesh.visible = false;
        continue;
      }
      const head = Math.min(t.dist, travelled);
      const tail = Math.max(0, travelled - T.length);
      t.mesh.position.copy(t.start).addScaledVector(t.dir, (head + tail) * 0.5);
      t.mesh.scale.z = Math.max(0.001, head - tail);
      t.mesh.material.opacity = T.opacity * (1 - tail / t.dist);
    }
  }

  /* ---------- Target Management ---------- */

  // Arena bounds (walls at ±20, keep targets 2 units inside)
  static ARENA_HALF = 18;

  // Fallbacks used when a weapon doesn't define `recoil.view` (angles in degrees)
  static RECOIL_DEFAULTS = {
    pitch: 0.8, pitchVariance: 0.15, yaw: 0.2,
    maxPitch: 5, maxYaw: 2, recovery: 9, delay: 0.05, snap: 45,
  };

  // Bullet tracer look. speed in m/s, length in metres, width in metres.
  static TRACER_DEFAULTS = { speed: 260, length: 3.0, width: 0.014, opacity: 0.9, poolSize: 14 };
  static ARENA_MIN_Y = 0.4;
  static ARENA_MAX_Y = 4.5;

  // Calculate difficulty progression based on session progress
  _getDifficultyFactor() {
    const nowMs = this._paused && this._pauseStart ? this._pauseStart : Date.now();
    const elapsed = (nowMs - this._sessionStartTime) / 1000;
    // Smooth ramp: hits count more early, time catches up later
    const hitProgress = Math.min(this._hitCount / 40, 1);
    const timeProgress = Math.min(elapsed / 90, 1);
    // Blend: early session favors hit count, later session favors time
    return Math.min(1, hitProgress * 0.6 + timeProgress * 0.4);
  }

  // Get the player's current look direction as a world-space angle (yaw)
  // Spawn angles use x = sin(a), z = -cos(a); the camera's forward vector for yaw θ is
  // (-sin θ, 0, -cos θ), so the look direction in spawn-angle space is -yaw.
  _getPlayerLookYaw() {
    return -this._yaw;
  }

  // Generate a natural target position with FOV-aware zone-based spawning
  _generateTargetPosition() {
    const difficulty = this._getDifficultyFactor();
    const playerYaw = this._getPlayerLookYaw();

    // Minimum angular offset from crosshair (radians) — forces a real flick
    // Starts at ~25 degrees, increases slightly with difficulty
    const minFlickAngle = 0.44 + difficulty * 0.1; // 25° → 32°

    // Maximum angular offset — keep within comfortable FOV (~55° from center)
    // Increases slightly with difficulty to use more of the screen
    const maxFlickAngle = 0.95 + difficulty * 0.15; // 54° → 63°

    // Define spawn zones with weights
    const zones = [
      { minDist: 5, maxDist: 8, weight: 0.30 - difficulty * 0.10 }, // Close
      { minDist: 8, maxDist: 12, weight: 0.40 },                     // Mid
      { minDist: 12, maxDist: 16, weight: 0.20 + difficulty * 0.10 }, // Far
    ];

    // Normalize weights and select zone
    const totalWeight = zones.reduce((sum, z) => sum + Math.max(0.05, z.weight), 0);
    let rand = Math.random() * totalWeight;
    let selectedZone = zones[0];
    for (const zone of zones) {
      rand -= Math.max(0.05, zone.weight);
      if (rand <= 0) {
        selectedZone = zone;
        break;
      }
    }

    const distance = selectedZone.minDist + Math.random() * (selectedZone.maxDist - selectedZone.minDist);

    // Pick angle relative to player look direction, enforcing minimum flick
    let bestAngle = null;
    const maxAttempts = 20;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Random offset from player's look direction
      const sign = Math.random() < 0.5 ? -1 : 1;
      const flickOffset = minFlickAngle + Math.random() * (maxFlickAngle - minFlickAngle);
      const candidateAngle = playerYaw + sign * flickOffset;

      // Compute candidate position
      const cx = Math.sin(candidateAngle) * distance;
      const cz = -Math.cos(candidateAngle) * distance;

      // Check arena bounds
      if (Math.abs(cx) > ThreeArenaRenderer.ARENA_HALF || Math.abs(cz) > ThreeArenaRenderer.ARENA_HALF) {
        continue; // Out of bounds, try again
      }

      // Check minimum distance from last target
      if (this._lastTargetPos) {
        const dx = cx - this._lastTargetPos.x;
        const dz = cz - this._lastTargetPos.z;
        const sep = Math.sqrt(dx * dx + dz * dz);
        if (sep < 2.5) continue; // Too close to last target
      }

      // Check minimum separation from all recent target positions
      if (this._recentPositions) {
        let tooCloseToRecent = false;
        for (const rp of this._recentPositions) {
          const dx = cx - rp.x;
          const dz = cz - rp.z;
          if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
            tooCloseToRecent = true;
            break;
          }
        }
        if (tooCloseToRecent) continue;
      }

      bestAngle = candidateAngle;
      break;
    }

    // Fallback: if no valid angle found after all attempts, pick any valid angle
    if (bestAngle === null) {
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const cx = Math.sin(playerYaw + a) * distance;
        const cz = -Math.cos(playerYaw + a) * distance;
        if (Math.abs(cx) <= ThreeArenaRenderer.ARENA_HALF && Math.abs(cz) <= ThreeArenaRenderer.ARENA_HALF) {
          bestAngle = playerYaw + a;
          break;
        }
      }
      // Ultimate fallback
      if (bestAngle === null) bestAngle = playerYaw + 0.8;
    }

    // Height distribution — weighted toward eye level
    const heightZones = [
      { min: 0.5, max: 1.2, weight: 0.15 }, // Low
      { min: 1.2, max: 2.2, weight: 0.50 }, // Eye level
      { min: 2.2, max: 3.0, weight: 0.25 }, // High
      { min: 3.0, max: 4.0, weight: 0.10 }, // Very high
    ];

    const totalHeightWeight = heightZones.reduce((sum, z) => sum + z.weight, 0);
    let heightRand = Math.random() * totalHeightWeight;
    let selectedHeightZone = heightZones[0];
    for (const zone of heightZones) {
      heightRand -= zone.weight;
      if (heightRand <= 0) {
        selectedHeightZone = zone;
        break;
      }
    }

    const height = selectedHeightZone.min + Math.random() * (selectedHeightZone.max - selectedHeightZone.min);

    const x = Math.sin(bestAngle) * distance;
    const z = -Math.cos(bestAngle) * distance;

    // Final clamp to arena bounds (safety net)
    const clampedX = Math.max(-ThreeArenaRenderer.ARENA_HALF, Math.min(ThreeArenaRenderer.ARENA_HALF, x));
    const clampedZ = Math.max(-ThreeArenaRenderer.ARENA_HALF, Math.min(ThreeArenaRenderer.ARENA_HALF, z));
    const clampedY = Math.max(ThreeArenaRenderer.ARENA_MIN_Y, Math.min(ThreeArenaRenderer.ARENA_MAX_Y, height));

    return { x: clampedX, y: clampedY, z: clampedZ, distance, angle: bestAngle };
  }

  _spawnTarget() {
    if (!this.running) return;

    // Guard: don't spawn if there's already an alive target
    const aliveCount = this._targets.filter(t => t.alive).length;
    if (aliveCount > 0) return;

    // Remove any existing alive targets (should be none due to guard above)
    this._clearAliveTargets();

    // Generate natural position
    const pos = this._generateTargetPosition();
    this._lastTargetPos = { x: pos.x, z: pos.z };

    // Track recent positions for variety
    if (!this._recentPositions) this._recentPositions = [];
    this._recentPositions.push({ x: pos.x, z: pos.z });
    if (this._recentPositions.length > 5) this._recentPositions.shift();

    // Mark that we have a pending spawn resolved
    this._spawnPending = false;

    const radius = this.targetBaseRadius;

    // Target sphere with improved materials
    const targetGeo = new THREE.SphereGeometry(radius, 24, 24);
    const targetMat = new THREE.MeshStandardMaterial({
      color: this._targetColor,
      emissive: this._targetColor,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(pos.x, pos.y, pos.z);

    // Inner core (bright dot) - improved
    const coreGeo = new THREE.SphereGeometry(radius * 0.4, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    targetMesh.add(core);

    // Outer ring (billboard) - improved
    const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.7, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this._targetColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    targetMesh.add(ring);

    // Secondary inner ring for depth
    const innerRingGeo = new THREE.RingGeometry(radius * 0.7, radius * 0.85, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: this._targetColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    targetMesh.add(innerRing);

    this._scene.add(targetMesh);

    this._targets.push({
      mesh: targetMesh,
      core: core,
      ring: ring,
      innerRing: innerRing,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      hitAnim: 0,
      baseY: pos.y,
      spawnPos: { x: pos.x, y: pos.y, z: pos.z },
    });
  }

  _clearAliveTargets() {
    const toRemove = this._targets.filter(t => t.alive);
    for (const t of toRemove) {
      this._disposeTarget(t);
    }
    this._targets = this._targets.filter(t => !t.alive);
  }

  _clearTargets() {
    for (const t of this._targets) {
      this._disposeTarget(t);
    }
    this._targets = [];
  }

  _disposeTarget(t) {
    if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
    // Dispose all geometries and materials in the target hierarchy
    t.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  /* ---------- Hit Detection ---------- */

  // Create particle burst effect at target position
  _createHitParticles(position) {
    const particleCount = 12;
    const particleGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const particleMat = new THREE.MeshBasicMaterial({
      color: this._targetColor,
      transparent: true,
      opacity: 1,
    });

    for (let i = 0; i < particleCount; i++) {
      const particle = new THREE.Mesh(particleGeo, particleMat.clone());
      particle.position.copy(position);

      // Random velocity in sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 3 + Math.random() * 4;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.sin(phi) * Math.sin(theta) * speed;
      const vz = Math.cos(phi) * speed;

      this._particles.push({
        mesh: particle,
        velocity: { x: vx, y: vy, z: vz },
        life: 1.0,
        decay: 2.5 + Math.random() * 1.5,
      });

      this._scene.add(particle);
    }
  }

  // Update particles
  _updateParticles(dt) {
    const toRemove = [];

    for (const p of this._particles) {
      p.life -= dt * p.decay;

      if (p.life <= 0) {
        toRemove.push(p);
      } else {
        // Move particle
        p.mesh.position.x += p.velocity.x * dt;
        p.mesh.position.y += p.velocity.y * dt;
        p.mesh.position.z += p.velocity.z * dt;

        // Gravity
        p.velocity.y -= 9.8 * dt;

        // Fade and shrink
        p.mesh.material.opacity = p.life;
        p.mesh.scale.setScalar(p.life * 0.8 + 0.2);
      }
    }

    // Remove dead particles
    for (const p of toRemove) {
      const idx = this._particles.indexOf(p);
      if (idx !== -1) this._particles.splice(idx, 1);
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
  }

  _handleClick(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (this._paused || this._stopped) return;
    // A double-click on a menu button must not turn into a shot the moment the mouse re-locks
    if (this._pointerLocked && Date.now() < this._ignoreClicksUntil) return;

    // First click locks the mouse (also allowed during the countdown)
    if (!this._pointerLocked) {
      this.requestLock();
      return;
    }
    if (!this.running) return;

    // Track mouse state for auto-fire
    this._mouseDown = true;

    // Attempt to fire
    this._tryFire();
  }

  _handleMouseDown(ev) {
    // Right-click: scope (weapons with a scope only)
    if (ev.button === 2) {
      if (this._paused || this._stopped || !this._pointerLocked || !this.running) return;
      if (Date.now() < this._ignoreClicksUntil) return;
      this._cycleScope();
      return;
    }
    if (ev.button !== undefined && ev.button !== 0) return;
    if (this._paused || this._stopped) return;
    // If not locked, request lock (same as original click handler)
    if (!this._pointerLocked) {
      this.requestLock();
      return;
    }
    if (!this.running) return;
    if (Date.now() < this._ignoreClicksUntil) return;
    this._mouseDown = true;
    this._tryFire();
    // For automatic weapons, start continuous fire
    if (this._weapon && this._weapon.fireMode === 'auto') {
      this._startAutoFire();
    }
  }

  _handleMouseUp(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    this._mouseDown = false;
    this._stopAutoFire();
  }

  _startAutoFire() {
    this._stopAutoFire();
    if (!this._weapon) return;
    var interval = VantageEngine.Weapons.getIntervalMs(this._weapon);
    this._autoFireTimer = setInterval(() => {
      if (this._mouseDown && this.running && !this._paused && !this._stopped) {
        this._tryFire();
      } else {
        this._stopAutoFire();
      }
    }, interval);
  }

  _stopAutoFire() {
    if (this._autoFireTimer) {
      clearInterval(this._autoFireTimer);
      this._autoFireTimer = null;
    }
  }

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;
    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return; // 5ms tolerance for setInterval jitter
    this._lastFireTime = now;

    // Fire weapon visual/audio effects
    this._fireWeapon();
    // Play weapon-specific sound
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    // Raycast from center of screen (crosshair). Refresh the camera matrix first so a click
    // that lands right after a mouse move uses the current aim, not last frame's.
    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    this._applyShotSpread();

    const meshes = this._targets.filter(t => t.alive).map(t => t.mesh);

    // Only the target sphere is hittable (decorative rings/core are children and must not count)
    const intersects = meshes.length > 0 ? this._raycaster.intersectObjects(meshes, false) : [];

    // The shot is resolved from the crosshair. Only NOW add the tracer and the recoil kick, so
    // recoil can never alter the shot that caused it (it affects the following frames/shots).
    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    if (meshes.length === 0) {
      // No targets alive — don't count as miss
      return;
    }

    let hit = false;
    if (intersects.length > 0) {
      // Find the root target mesh (intersects might hit a child like core or ring)
      let hitObj = intersects[0].object;
      while (hitObj.parent && hitObj.parent !== this._scene) {
        hitObj = hitObj.parent;
      }
      const target = this._targets.find(t => t.mesh === hitObj && t.alive);
      if (target) {
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;

        // Create particle burst at hit position
        this._createHitParticles(target.mesh.position.clone());

        const reactionTime = Date.now() - target.spawnTime;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        clearTimeout(this._spawnTimer);
        // Faster spawn delay that decreases with difficulty
        const baseDelay = 150;
        const minDelay = 80;
        const difficulty = this._getDifficultyFactor();
        const spawnDelay = (baseDelay - (baseDelay - minDelay) * difficulty) / this._speedMult;
        this._spawnPending = true;
        this._spawnTimer = setTimeout(() => {
          this._spawnPending = false;
          this._spawnTarget();
        }, spawnDelay);
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  // Inaccuracy for weapons with `accuracy.hipSpread` (Operator): the shot goes to a random point
  // inside a cone around the crosshair. The cone closes as the scope zooms in, so a full scope is
  // pinpoint but unscoped / half-scoped shots miss. Weapons without the setting are unaffected.
  _applyShotSpread() {
    const acc = this._weapon && this._weapon.accuracy;
    if (!acc || !(acc.hipSpread > 0)) return;
    const spreadDeg = acc.hipSpread * (1 - this._scopeBlend);
    if (spreadDeg <= 0.001) return;
    const r = spreadDeg * Math.PI / 180 * Math.sqrt(Math.random()); // uniform over the disc
    const a = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(Math.sin(a) * r, Math.cos(a) * r, 0, 'YXZ'));
    dir.applyQuaternion(this._camera.quaternion).normalize();
    this._raycaster.ray.direction.copy(dir);
  }

  /* ---------- Mouse Look ---------- */

  _handleMouseMove(ev) {
    if (!this._pointerLocked || this._paused || this._stopped || !this._camera) return;
    if (this._skipMoves > 0) { this._skipMoves--; return; }

    // While zoomed, scale sensitivity by the FOV ratio so the crosshair crosses the screen at
    // the same speed as unscoped (otherwise the scope would feel twitchy).
    const zoomK = this._camera.fov === this._fov ? 1
      : Math.tan(this._camera.fov * Math.PI / 360) / Math.tan(this._fov * Math.PI / 360);
    this._yaw -= ev.movementX * this._radPerCount * zoomK;
    this._pitch -= ev.movementY * this._radPerCount * zoomK;

    // Clamp pitch
    this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch));

    this._applyCameraRotation();
  }

  _handlePointerLockChange() {
    const wasLocked = this._pointerLocked;
    this._pointerLocked = document.pointerLockElement === this.canvas;
    if (this._pointerLocked && !wasLocked) {
      this._ignoreClicksUntil = Date.now() + 250;
      this._skipMoves = 2;
    }
    if (!this._pointerLocked && wasLocked) this._resetScope();
    // Update canvas cursor
    if (this.canvas) {
      this.canvas.style.cursor = this._pointerLocked ? 'none' : 'crosshair';
    }
  }

  _handleResize() {
    if (!this._camera || !this._renderer3d) return;
    const wrapper = this.canvas.parentElement;
    if (!wrapper) return;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (w === 0 || h === 0) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer3d.setSize(w, h);
  }

  /* ---------- Events ---------- */

  _bindEvents() {
    document.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('resize', this._onResize);
    this.canvas.style.cursor = 'crosshair';
  }

  _unbindEvents() {
    document.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('resize', this._onResize);
    this._stopAutoFire();
    this._resetScope();
    if (this._scopeEl && this._scopeEl.parentElement) this._scopeEl.parentElement.removeChild(this._scopeEl);
    this._scopeEl = null;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.canvas.style.cursor = 'default';
  }

  /* ---------- Render Loops ---------- */

  // Idle loop: renders the arena during countdown and pause (no target logic)
  _idleRenderLoop() {
    if (this.running) return; // gameplay loop took over
    // Keep weapon animations smooth even while idle (e.g. recoil recovery after last shot)
    if (this._clock) {
      const dt = Math.min(this._clock.getDelta(), 0.1);
      this._updateWeapon(dt);
    }
    this._render();
    this._animFrame = requestAnimationFrame(() => this._idleRenderLoop());
  }

  _stopIdleLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  // Gameplay loop: updates targets + renders
  _loop() {
    if (!this.running) return;
    this._update();
    this._render();
    this._animFrame = requestAnimationFrame(() => this._loop());
  }

  _update() {
    if (!this._clock) return;
    const dt = Math.min(this._clock.getDelta(), 0.1); // Cap delta to avoid jumps
    const now = Date.now();

    // Update particles
    this._updateParticles(dt);

    // Update weapon animations
    this._updateWeapon(dt);

    // Safety net: ensure there's always an alive target during gameplay
    // If no alive target and no spawn pending, spawn one immediately
    if (this.running && !this._spawnPending) {
      const aliveCount = this._targets.filter(t => t.alive).length;
      if (aliveCount === 0) {
        this._spawnTarget();
      }
    }

    // Collect dead targets to remove (avoid mutating array during iteration)
    const toRemove = [];

    for (const t of this._targets) {
      if (t.alive) {
        // Smooth fade in with easing
        t.opacity = Math.min(1, t.opacity + dt * 8);
        const easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;
        t.mesh.material.opacity = easedOpacity;
        t.core.material.opacity = easedOpacity * 0.9;
        t.ring.material.opacity = easedOpacity * 0.7;
        if (t.innerRing) t.innerRing.material.opacity = easedOpacity * 0.5;

        // Billboard the rings to face camera (in world space)
        const camPos = this._camera.position.clone();
        const localCamPos = t.mesh.worldToLocal(camPos);
        t.ring.lookAt(localCamPos);
        if (t.innerRing) t.innerRing.lookAt(localCamPos);

        // Subtle hover bob with variation
        const bobSpeed = 0.0025;
        const bobAmount = 0.05;
        t.mesh.position.y = t.baseY + Math.sin(now * bobSpeed + t.spawnTime * 0.001) * bobAmount;

        // Subtle pulse on emissive
        const pulse = 0.5 + Math.sin(now * 0.005) * 0.1;
        t.mesh.material.emissiveIntensity = pulse;
      } else {
        // Improved hit animation — flash, expand, then shrink and fade
        t.hitAnim -= dt * 6;
        if (t.hitAnim <= 0) {
          toRemove.push(t);
        } else {
          if (t.hitAnim > 0.8) {
            // Initial flash: bright white flash and slight expand
            const flash = (1 - t.hitAnim) / 0.2;
            t.mesh.scale.setScalar(1 + flash * 0.4);
            t.mesh.material.emissiveIntensity = 0.6 + flash * 3;
            t.mesh.material.color.setHex(0xffffff);
            t.core.material.opacity = 1;
          } else if (t.hitAnim > 0.5) {
            // Transition back to target color
            const transition = (0.8 - t.hitAnim) / 0.3;
            t.mesh.scale.setScalar(1.4 - transition * 0.3);
            t.mesh.material.emissiveIntensity = 3 - transition * 2;
            const colorLerp = transition;
            t.mesh.material.color.setHex(0xffffff).lerp(new THREE.Color(this._targetColor), colorLerp);
          } else {
            // Shrink and fade
            const shrink = t.hitAnim / 0.5;
            t.mesh.scale.setScalar(shrink * 1.1);
            t.mesh.material.opacity = shrink * 0.6;
            t.mesh.material.emissiveIntensity = shrink;
            t.mesh.material.color.set(this._targetColor);
          }
          t.core.material.opacity = t.hitAnim * 0.5;
          t.ring.material.opacity = t.hitAnim * 0.5;
          if (t.innerRing) t.innerRing.material.opacity = t.hitAnim * 0.35;
        }
      }
    }

    // Remove finished dead targets
    for (const t of toRemove) {
      const idx = this._targets.indexOf(t);
      if (idx !== -1) this._targets.splice(idx, 1);
      this._disposeTarget(t);
    }
  }

  _render() {
    if (this._renderer3d && this._scene && this._camera) {
      this._renderer3d.render(this._scene, this._camera);
    }
  }
};
