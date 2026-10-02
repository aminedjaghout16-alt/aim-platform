/* ============================================
   Three Arena Renderer — 3D FPS Training Environment
   Uses Three.js for a first-person aim training arena.
   Reusable engine: future scenarios share this renderer.
   ============================================ */
VantageEngine.Renderers.ThreeArenaRenderer = class {
  constructor(canvas, scenario, config) {
    this.canvas = canvas;
    this.scenario = scenario;
    this.config = config;
    this.running = false;
    this._animFrame = null;
    this._onHit = null;
    this._onMiss = null;

    // Resolve target size from settings
    const sizeSetting = VantageEngine.Settings.getTargetSize(config.targetSize || 'medium');
    this.targetBaseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;

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
  }

  /* ---------- Lifecycle ---------- */

  // Called early (during countdown) to build the 3D scene
  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._initScene();
    this._buildArena();
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
    this._stopIdleLoop();
    this.running = true;
    this._spawnPending = false;
    // Player must click canvas again to re-lock pointer
    this._spawnTarget();
    this._loop();
  }

  stop() {
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

    this._camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 100);
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

  /* ---------- Target Management ---------- */

  // Arena bounds (walls at ±20, keep targets 2 units inside)
  static ARENA_HALF = 18;
  static ARENA_MIN_Y = 0.4;
  static ARENA_MAX_Y = 4.5;

  // Calculate difficulty progression based on session progress
  _getDifficultyFactor() {
    const elapsed = (Date.now() - this._sessionStartTime) / 1000;
    // Smooth ramp: hits count more early, time catches up later
    const hitProgress = Math.min(this._hitCount / 40, 1);
    const timeProgress = Math.min(elapsed / 90, 1);
    // Blend: early session favors hit count, later session favors time
    return Math.min(1, hitProgress * 0.6 + timeProgress * 0.4);
  }

  // Get the player's current look direction as a world-space angle (yaw)
  _getPlayerLookYaw() {
    return this._yaw;
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
    if (!this.running) return;

    // Request pointer lock on first click if not locked
    if (!this._pointerLocked) {
      this.canvas.requestPointerLock();
      return;
    }

    // Raycast from center of screen (crosshair)
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);

    const meshes = this._targets.filter(t => t.alive).map(t => t.mesh);
    if (meshes.length === 0) {
      // No targets alive — don't count as miss
      return;
    }

    const intersects = this._raycaster.intersectObjects(meshes, true);

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
        const spawnDelay = baseDelay - (baseDelay - minDelay) * difficulty;
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
    if (!this._pointerLocked || !this.running) return;

    const sensitivity = 0.002;
    this._yaw -= ev.movementX * sensitivity;
    this._pitch -= ev.movementY * sensitivity;

    // Clamp pitch
    this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch));

    this._camera.rotation.y = this._yaw;
    this._camera.rotation.x = this._pitch;
  }

  _handlePointerLockChange() {
    this._pointerLocked = document.pointerLockElement === this.canvas;
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
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('resize', this._onResize);
    this.canvas.style.cursor = 'crosshair';
  }

  _unbindEvents() {
    document.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('click', this._onClick);
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
