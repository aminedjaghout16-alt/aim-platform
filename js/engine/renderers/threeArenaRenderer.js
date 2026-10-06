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
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onResize = this._handleResize.bind(this);
    this._onContextMenu = (ev) => ev.preventDefault();

    // Weapon system
    this._weaponGroup = null;     // Root group attached to camera
    this._muzzleFlash = null;     // Muzzle flash mesh
    this._muzzleFlashLife = 0;    // Remaining flash lifetime
    this._recoilOffset = 0;       // Current recoil displacement (0..1)
    this._recoilRotOffset = 0;    // Current recoil rotation
    this._weaponRestPos = new THREE.Vector3(0.28, -0.22, -0.45);
    this._weaponRestRot = new THREE.Euler(-0.05, -0.08, 0.02);
  }

  /* ---------- Lifecycle ---------- */

  // Called early (during countdown) to build the 3D scene
  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._initScene();
    this._buildArena();
    this._buildWeapon();
    this._bindEvents();
    this._clock = new THREE.Clock();
    this._clock.start();
    // Start rendering the arena immediately (no targets yet)
    this._idleRenderLoop();
  }

  // Called when gameplay actually begins (after countdown)
  start(sessionData) {
    this._stopIdleLoop();
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
      this._camera.fov = n;
      this._camera.updateProjectionMatrix();
    }
  }

  // 0..1 progression of the existing difficulty ramp (hits + time based)
  getProgression() {
    if (!this._sessionStartTime) return 0;
    return this._getDifficultyFactor();
  }

  setCallbacks({ onHit, onMiss }) {
    this._onHit = onHit;
    this._onMiss = onMiss;
  }

  /* ---------- Scene Initialization ---------- */

  _initScene() {
    const wrapper = this.canvas.parentElement;
    const w = wrapper.clientWidth || window.innerWidth;
    const h = wrapper.clientHeight || window.innerHeight;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x080a10);
    this._scene.fog = new THREE.Fog(0x080a10, 25, 55);

    this._camera = new THREE.PerspectiveCamera(this._fov, w / h, 0.1, 100);
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
    this._renderer3d.toneMappingExposure = 1.0;

    this._raycaster = new THREE.Raycaster();

    this._arenaGroup = new THREE.Group();
    this._scene.add(this._arenaGroup);
  }

  /* ---------- Arena Construction ---------- */

  _buildArena() {
    const arena = this._arenaGroup;

    // --- Floor with subtle gradient ---
    const floorGeo = new THREE.PlaneGeometry(40, 40, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e1018,
      roughness: 0.75,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    arena.add(floor);

    // Floor grid with better visibility
    const gridHelper = new THREE.GridHelper(40, 40, 0x1e2238, 0x141722);
    gridHelper.position.y = 0.01;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.transparent = true;
    arena.add(gridHelper);

    // Inner arena zone marker (subtle)
    const innerZoneGeo = new THREE.RingGeometry(8, 8.1, 64);
    const innerZoneMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const innerZone = new THREE.Mesh(innerZoneGeo, innerZoneMat);
    innerZone.rotation.x = -Math.PI / 2;
    innerZone.position.y = 0.02;
    arena.add(innerZone);

    // --- Walls with subtle panel lines ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x10131c,
      roughness: 0.85,
      metalness: 0.15,
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

      // Wall panel accent lines
      const panelLineMat = new THREE.MeshBasicMaterial({
        color: 0x1a1d2e,
        transparent: true,
        opacity: 0.3,
      });
      for (let i = -15; i <= 15; i += 10) {
        const lineGeo = new THREE.PlaneGeometry(0.02, wallH);
        const line = new THREE.Mesh(lineGeo, panelLineMat);
        if (cfg.ry === 0 || Math.abs(cfg.ry) === Math.PI) {
          line.position.set(i, wallH / 2, cfg.pos[2] + (cfg.ry === 0 ? 0.01 : -0.01));
          line.rotation.y = cfg.ry;
        } else {
          line.position.set(cfg.pos[0] + (cfg.ry > 0 ? 0.01 : -0.01), wallH / 2, i);
          line.rotation.y = cfg.ry;
        }
        arena.add(line);
      }
    }

    // --- Ceiling ---
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1.0 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallH;
    arena.add(ceiling);

    // --- Accent trim lines (improved) ---
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00e0d0, transparent: true, opacity: 0.25 });
    const trimGeo = new THREE.PlaneGeometry(40, 0.05);
    const trimPositions = [
      { pos: [0, 1.0, -half + 0.02], ry: 0 },
      { pos: [0, 1.0, half - 0.02], ry: Math.PI },
    ];
    for (const tp of trimPositions) {
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.position.set(...tp.pos);
      trim.rotation.y = tp.ry;
      arena.add(trim);
    }

    // Side trims
    const sideTrimGeo = new THREE.PlaneGeometry(40, 0.05);
    const sideTrims = [
      { pos: [-half + 0.02, 1.0, 0], ry: Math.PI / 2 },
      { pos: [half - 0.02, 1.0, 0], ry: -Math.PI / 2 },
    ];
    for (const st of sideTrims) {
      const trim = new THREE.Mesh(sideTrimGeo, trimMat);
      trim.position.set(...st.pos);
      trim.rotation.y = st.ry;
      arena.add(trim);
    }

    // Upper trim lines
    const upperTrimMat = new THREE.MeshBasicMaterial({ color: 0x00e0d0, transparent: true, opacity: 0.12 });
    const upperTrimGeo = new THREE.PlaneGeometry(40, 0.03);
    const upperTrims = [
      { pos: [0, wallH - 0.5, -half + 0.02], ry: 0 },
      { pos: [0, wallH - 0.5, half - 0.02], ry: Math.PI },
      { pos: [-half + 0.02, wallH - 0.5, 0], ry: Math.PI / 2 },
      { pos: [half - 0.02, wallH - 0.5, 0], ry: -Math.PI / 2 },
    ];
    for (const ut of upperTrims) {
      const trim = new THREE.Mesh(upperTrimGeo, upperTrimMat);
      trim.position.set(...ut.pos);
      trim.rotation.y = ut.ry;
      arena.add(trim);
    }

    // --- Lighting (improved) ---
    const ambient = new THREE.AmbientLight(0x404860, 0.8);
    this._scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xd0e8ff, 1.1);
    mainLight.position.set(2, 8, 3);
    this._scene.add(mainLight);

    // Teal accent lights (brighter)
    const accent1 = new THREE.PointLight(0x00e0d0, 0.9, 35);
    accent1.position.set(-10, 3.5, -10);
    this._scene.add(accent1);

    const accent2 = new THREE.PointLight(0x00e0d0, 0.7, 35);
    accent2.position.set(10, 3.5, 10);
    this._scene.add(accent2);

    // Additional corner accents
    const accent3 = new THREE.PointLight(0x00e0d0, 0.4, 25);
    accent3.position.set(-10, 2, 10);
    this._scene.add(accent3);

    const accent4 = new THREE.PointLight(0x00e0d0, 0.4, 25);
    accent4.position.set(10, 2, -10);
    this._scene.add(accent4);

    // Warm fill (improved)
    const fill = new THREE.PointLight(0xffb830, 0.3, 40);
    fill.position.set(0, 4, -15);
    this._scene.add(fill);

    // Overhead center light
    const overhead = new THREE.PointLight(0xffffff, 0.2, 20);
    overhead.position.set(0, 5, 0);
    this._scene.add(overhead);

    // --- Decorative pillars (improved) ---
    const pillarGeo = new THREE.BoxGeometry(0.6, wallH, 0.6);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x161925,
      roughness: 0.6,
      metalness: 0.4,
    });
    const pillarPos = [
      [-12, wallH / 2, -12], [12, wallH / 2, -12],
      [-12, wallH / 2, 12], [12, wallH / 2, 12],
    ];
    for (const pp of pillarPos) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(...pp);
      arena.add(pillar);

      // Pillar accent strip
      const stripGeo = new THREE.BoxGeometry(0.05, wallH, 0.62);
      const stripMat = new THREE.MeshBasicMaterial({
        color: 0x00e0d0,
        transparent: true,
        opacity: 0.15,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(pp[0], pp[1], pp[2]);
      arena.add(strip);
    }

    // --- Floor accent markers (improved landing pads) ---
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0.06,
    });
    const markerGeo = new THREE.CircleGeometry(1.2, 32);
    const markerPositions = [
      [0, 0.02, -10], [-6, 0.02, -8], [6, 0.02, -8],
      [-4, 0.02, -14], [4, 0.02, -14], [0, 0.02, -6],
      [-8, 0.02, -4], [8, 0.02, -4],
    ];
    for (const mp of markerPositions) {
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(...mp);
      arena.add(marker);

      // Inner ring
      const innerRingGeo = new THREE.RingGeometry(0.3, 0.35, 24);
      const innerRing = new THREE.Mesh(innerRingGeo, markerMat);
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.set(mp[0], mp[1] + 0.01, mp[2]);
      arena.add(innerRing);
    }

    // --- Distance markers on floor ---
    const distMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0.04,
    });
    const distances = [5, 10, 15];
    for (const dist of distances) {
      const ringGeo = new THREE.RingGeometry(dist - 0.05, dist + 0.05, 64);
      const ring = new THREE.Mesh(ringGeo, distMarkerMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      arena.add(ring);
    }
  }

  /* ---------- Weapon Model ---------- */

  _buildWeapon() {
    const group = new THREE.Group();

    // Materials (shared for performance)
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.35, metalness: 0.85 });
    const medMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.7 });
    const lightMetal = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.3, metalness: 0.9 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.8, metalness: 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.7, metalness: 0.05 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.75, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x00e0d0, roughness: 0.3, metalness: 0.6, emissive: 0x00e0d0, emissiveIntensity: 0.15 });

    // --- Receiver / body ---
    const bodyGeo = new THREE.BoxGeometry(0.045, 0.06, 0.22);
    const body = new THREE.Mesh(bodyGeo, medMetal);
    body.position.set(0, 0, -0.04);
    group.add(body);

    // --- Slide (top) ---
    const slideGeo = new THREE.BoxGeometry(0.04, 0.025, 0.24);
    const slide = new THREE.Mesh(slideGeo, darkMetal);
    slide.position.set(0, 0.042, -0.04);
    group.add(slide);

    // --- Barrel ---
    const barrelGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.14, 8);
    const barrel = new THREE.Mesh(barrelGeo, lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.24);
    group.add(barrel);

    // Barrel shroud
    const shroudGeo = new THREE.BoxGeometry(0.035, 0.035, 0.1);
    const shroud = new THREE.Mesh(shroudGeo, darkMetal);
    shroud.position.set(0, 0.025, -0.2);
    group.add(shroud);

    // --- Grip ---
    const gripGeo = new THREE.BoxGeometry(0.038, 0.09, 0.045);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.065, 0.04);
    grip.rotation.x = 0.2; // slight angle
    group.add(grip);

    // --- Magazine ---
    const magGeo = new THREE.BoxGeometry(0.03, 0.055, 0.035);
    const mag = new THREE.Mesh(magGeo, darkMetal);
    mag.position.set(0, -0.06, 0.01);
    group.add(mag);

    // --- Trigger guard ---
    const guardGeo = new THREE.TorusGeometry(0.018, 0.003, 6, 12, Math.PI);
    const guard = new THREE.Mesh(guardGeo, medMetal);
    guard.position.set(0, -0.035, -0.01);
    guard.rotation.y = Math.PI / 2;
    group.add(guard);

    // --- Accent line on slide (teal, matches arena theme) ---
    const accentGeo = new THREE.BoxGeometry(0.042, 0.003, 0.06);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(0, 0.055, -0.08);
    group.add(accent);

    // --- Front sight ---
    const fSightGeo = new THREE.BoxGeometry(0.005, 0.012, 0.005);
    const fSight = new THREE.Mesh(fSightGeo, darkMetal);
    fSight.position.set(0, 0.062, -0.15);
    group.add(fSight);

    // --- Rear sight ---
    const rSightGeo = new THREE.BoxGeometry(0.025, 0.01, 0.008);
    const rSight = new THREE.Mesh(rSightGeo, darkMetal);
    rSight.position.set(0, 0.06, 0.05);
    group.add(rSight);

    // --- Hand (holding grip) ---
    // Palm
    const palmGeo = new THREE.BoxGeometry(0.055, 0.04, 0.07);
    const palm = new THREE.Mesh(palmGeo, skinMat);
    palm.position.set(0, -0.065, 0.04);
    palm.rotation.x = 0.2;
    group.add(palm);

    // Fingers wrapping around grip
    for (let i = 0; i < 4; i++) {
      const fingerGeo = new THREE.BoxGeometry(0.012, 0.015, 0.04);
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.position.set(-0.018 + i * 0.012, -0.09, 0.025 - i * 0.005);
      finger.rotation.x = 0.4;
      group.add(finger);
    }

    // Thumb
    const thumbGeo = new THREE.BoxGeometry(0.015, 0.012, 0.045);
    const thumb = new THREE.Mesh(thumbGeo, skinMat);
    thumb.position.set(0.03, -0.045, 0.03);
    thumb.rotation.z = -0.3;
    thumb.rotation.x = 0.15;
    group.add(thumb);

    // --- Wrist / forearm ---
    const wristGeo = new THREE.BoxGeometry(0.05, 0.035, 0.12);
    const wrist = new THREE.Mesh(wristGeo, skinMat);
    wrist.position.set(0, -0.07, 0.12);
    wrist.rotation.x = 0.1;
    group.add(wrist);

    // Sleeve
    const sleeveGeo = new THREE.BoxGeometry(0.058, 0.042, 0.1);
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.position.set(0, -0.072, 0.2);
    sleeve.rotation.x = 0.08;
    group.add(sleeve);

    // --- Muzzle flash ---
    const flashGeo = new THREE.PlaneGeometry(0.08, 0.08);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, 0.025, -0.32);
    group.add(flash);
    this._muzzleFlash = flash;

    // Secondary flash (perpendicular for volume illusion)
    const flash2Geo = new THREE.PlaneGeometry(0.06, 0.06);
    const flash2Mat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const flash2 = new THREE.Mesh(flash2Geo, flash2Mat);
    flash2.position.set(0, 0.025, -0.32);
    flash2.rotation.y = Math.PI / 2;
    group.add(flash2);
    this._muzzleFlash2 = flash2;

    // Position the weapon group relative to camera
    group.position.copy(this._weaponRestPos);
    group.rotation.copy(this._weaponRestRot);

    // Disable raycasting on all weapon meshes so they never interfere with aiming
    group.traverse((child) => {
      child.raycast = function() {};
    });

    // Attach to camera
    this._camera.add(group);
    this._scene.add(this._camera); // Camera must be in scene for children to render
    this._weaponGroup = group;
  }

  // Trigger the weapon fire effects
  _fireWeapon() {
    this._recoilOffset = 1.0;
    this._recoilRotOffset = 1.0;
    this._muzzleFlashLife = 1.0;

    // Show muzzle flash
    if (this._muzzleFlash) {
      this._muzzleFlash.material.opacity = 1;
      this._muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);
      this._muzzleFlash.rotation.z = Math.random() * Math.PI;
    }
    if (this._muzzleFlash2) {
      this._muzzleFlash2.material.opacity = 0.7;
      this._muzzleFlash2.scale.setScalar(0.6 + Math.random() * 0.4);
    }
  }

  // Update weapon animations (called each frame)
  _updateWeapon(dt) {
    if (!this._weaponGroup) return;

    // Recoil recovery (smooth lerp back to rest)
    const recoilSpeed = 8;
    if (this._recoilOffset > 0.001) {
      this._recoilOffset = Math.max(0, this._recoilOffset - dt * recoilSpeed);
    } else {
      this._recoilOffset = 0;
    }
    if (this._recoilRotOffset > 0.001) {
      this._recoilRotOffset = Math.max(0, this._recoilRotOffset - dt * recoilSpeed);
    } else {
      this._recoilRotOffset = 0;
    }

    // Apply recoil: push gun backward (+z) and kick up slightly (-x rotation)
    const recoilZ = this._recoilOffset * 0.06;
    const recoilRotX = -this._recoilRotOffset * 0.12;
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

    // Muzzle flash decay
    if (this._muzzleFlashLife > 0) {
      this._muzzleFlashLife = Math.max(0, this._muzzleFlashLife - dt * 18);
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

  /* ---------- Target Management ---------- */

  // Arena bounds (walls at ±20, keep targets 2 units inside)
  static ARENA_HALF = 18;
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
      color: 0x00e0d0,
      emissive: 0x00e0d0,
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
    const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    targetMesh.add(ring);

    // Secondary inner ring for depth
    const innerRingGeo = new THREE.RingGeometry(radius * 0.7, radius * 0.8, 24);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
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
      color: 0x00e0d0,
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

    // Fire weapon visual/audio effects
    this._fireWeapon();
    VantageEngine.Audio.playShoot();

    // Raycast from center of screen (crosshair). Refresh the camera matrix first so a click
    // that lands right after a mouse move uses the current aim, not last frame's.
    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);

    const meshes = this._targets.filter(t => t.alive).map(t => t.mesh);
    if (meshes.length === 0) {
      // No targets alive — don't count as miss
      return;
    }

    // Only the target sphere is hittable (decorative rings/core are children and must not count)
    const intersects = this._raycaster.intersectObjects(meshes, false);

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

  /* ---------- Mouse Look ---------- */

  _handleMouseMove(ev) {
    if (!this._pointerLocked || this._paused || this._stopped || !this._camera) return;
    if (this._skipMoves > 0) { this._skipMoves--; return; }

    this._yaw -= ev.movementX * this._radPerCount;
    this._pitch -= ev.movementY * this._radPerCount;

    // Clamp pitch
    this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch));

    this._camera.rotation.y = this._yaw;
    this._camera.rotation.x = this._pitch;
  }

  _handlePointerLockChange() {
    const wasLocked = this._pointerLocked;
    this._pointerLocked = document.pointerLockElement === this.canvas;
    if (this._pointerLocked && !wasLocked) {
      this._ignoreClicksUntil = Date.now() + 250;
      this._skipMoves = 2;
    }
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
    this.canvas.addEventListener('mousedown', this._onClick);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('resize', this._onResize);
    this.canvas.style.cursor = 'crosshair';
  }

  _unbindEvents() {
    document.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onClick);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('resize', this._onResize);

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
        t.ring.material.opacity = easedOpacity * 0.25;
        if (t.innerRing) t.innerRing.material.opacity = easedOpacity * 0.15;

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
            // Transition back to teal
            const transition = (0.8 - t.hitAnim) / 0.3;
            t.mesh.scale.setScalar(1.4 - transition * 0.3);
            t.mesh.material.emissiveIntensity = 3 - transition * 2;
            const colorLerp = transition;
            t.mesh.material.color.setRGB(
              0 + colorLerp * 0,
              0.88 * (1 - colorLerp) + colorLerp * 0.88,
              0.82 * (1 - colorLerp) + colorLerp * 0.82
            );
          } else {
            // Shrink and fade
            const shrink = t.hitAnim / 0.5;
            t.mesh.scale.setScalar(shrink * 1.1);
            t.mesh.material.opacity = shrink * 0.6;
            t.mesh.material.emissiveIntensity = shrink;
            t.mesh.material.color.setHex(0x00e0d0);
          }
          t.core.material.opacity = t.hitAnim * 0.5;
          t.ring.material.opacity = t.hitAnim * 0.2;
          if (t.innerRing) t.innerRing.material.opacity = t.hitAnim * 0.1;
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
