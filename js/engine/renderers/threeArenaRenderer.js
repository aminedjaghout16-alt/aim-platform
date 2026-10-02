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
    this._spawnTarget();
    this._loop();
  }

  pause() {
    this.running = false;
    clearTimeout(this._spawnTimer);
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
    // Player must click canvas again to re-lock pointer
    this._spawnTarget();
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this._spawnTimer);
    cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
    this._unbindEvents();
    this._clearTargets();

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

    // --- Floor ---
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e1018,
      roughness: 0.85,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    arena.add(floor);

    // Floor grid
    const gridHelper = new THREE.GridHelper(40, 40, 0x1a1d2e, 0x12141e);
    gridHelper.position.y = 0.01;
    arena.add(gridHelper);

    // --- Walls ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x10131c,
      roughness: 0.9,
      metalness: 0.1,
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
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1.0 });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallH;
    arena.add(ceiling);

    // --- Accent trim lines ---
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00e0d0, transparent: true, opacity: 0.18 });
    const trimGeo = new THREE.PlaneGeometry(40, 0.04);
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
    const sideTrimGeo = new THREE.PlaneGeometry(40, 0.04);
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

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0x404860, 0.7);
    this._scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xd0e8ff, 1.0);
    mainLight.position.set(2, 8, 3);
    this._scene.add(mainLight);

    // Teal accent lights
    const accent1 = new THREE.PointLight(0x00e0d0, 0.7, 30);
    accent1.position.set(-10, 3.5, -10);
    this._scene.add(accent1);

    const accent2 = new THREE.PointLight(0x00e0d0, 0.5, 30);
    accent2.position.set(10, 3.5, 10);
    this._scene.add(accent2);

    // Warm fill
    const fill = new THREE.PointLight(0xffb830, 0.25, 35);
    fill.position.set(0, 4, -15);
    this._scene.add(fill);

    // --- Decorative pillars ---
    const pillarGeo = new THREE.BoxGeometry(0.5, wallH, 0.5);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x161925,
      roughness: 0.7,
      metalness: 0.3,
    });
    const pillarPos = [
      [-12, wallH / 2, -12], [12, wallH / 2, -12],
      [-12, wallH / 2, 12], [12, wallH / 2, 12],
    ];
    for (const pp of pillarPos) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(...pp);
      arena.add(pillar);
    }

    // --- Floor accent markers (landing pads under target zones) ---
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0.04,
    });
    const markerGeo = new THREE.CircleGeometry(1.2, 32);
    const markerPositions = [
      [0, 0.02, -10], [-6, 0.02, -8], [6, 0.02, -8],
      [-4, 0.02, -14], [4, 0.02, -14], [0, 0.02, -6],
    ];
    for (const mp of markerPositions) {
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(...mp);
      arena.add(marker);
    }
  }

  /* ---------- Target Management ---------- */

  _spawnTarget() {
    if (!this.running) return;

    // Remove any existing alive targets
    this._clearAliveTargets();

    // Random position in the arena
    const distance = 5 + Math.random() * 12;
    const angle = (Math.random() - 0.5) * Math.PI * 0.9;
    const height = 0.6 + Math.random() * 3.2;

    const x = Math.sin(angle) * distance;
    const z = -Math.cos(angle) * distance;
    const y = height;

    const radius = this.targetBaseRadius;

    // Target sphere
    const targetGeo = new THREE.SphereGeometry(radius, 20, 20);
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0x00e0d0,
      emissive: 0x00e0d0,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(x, y, z);

    // Inner core (bright dot)
    const coreGeo = new THREE.SphereGeometry(radius * 0.35, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    targetMesh.add(core);

    // Outer ring (billboard)
    const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    targetMesh.add(ring);

    this._scene.add(targetMesh);

    this._targets.push({
      mesh: targetMesh,
      core: core,
      ring: ring,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      hitAnim: 0,
      baseY: y,
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
        const reactionTime = Date.now() - target.spawnTime;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        clearTimeout(this._spawnTimer);
        this._spawnTimer = setTimeout(() => this._spawnTarget(), 180);
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

    // Collect dead targets to remove (avoid mutating array during iteration)
    const toRemove = [];

    for (const t of this._targets) {
      if (t.alive) {
        // Fade in
        t.opacity = Math.min(1, t.opacity + dt * 6);
        t.mesh.material.opacity = t.opacity;
        t.core.material.opacity = t.opacity * 0.8;
        t.ring.material.opacity = t.opacity * 0.2;

        // Billboard the ring to face camera (in world space)
        const camPos = this._camera.position.clone();
        const localCamPos = t.mesh.worldToLocal(camPos);
        t.ring.lookAt(localCamPos);

        // Subtle hover bob
        t.mesh.position.y = t.baseY + Math.sin(now * 0.003 + t.spawnTime) * 0.06;
      } else {
        // Hit animation — expand briefly then shrink and fade
        t.hitAnim -= dt * 5;
        if (t.hitAnim <= 0) {
          toRemove.push(t);
        } else {
          const s = 1 + (1 - t.hitAnim) * 0.5; // Expand then shrink
          const fade = t.hitAnim;
          if (t.hitAnim > 0.7) {
            // Initial flash: expand slightly
            const flash = (1 - t.hitAnim) / 0.3;
            t.mesh.scale.setScalar(1 + flash * 0.3);
            t.mesh.material.emissiveIntensity = 0.5 + flash * 2;
          } else {
            // Shrink and fade
            t.mesh.scale.setScalar(t.hitAnim * 1.15);
            t.mesh.material.opacity = fade * 0.6;
            t.mesh.material.emissiveIntensity = fade;
          }
          t.core.material.opacity = fade * 0.5;
          t.ring.material.opacity = fade * 0.15;
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
