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

    // Three.js objects (initialized in _initScene)
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
    this._onContextMenu = (e) => e.preventDefault();
  }

  /* ---------- Lifecycle ---------- */

  start(sessionData) {
    this.running = true;
    this._initScene();
    this._buildArena();
    this._bindEvents();
    this._clock = new THREE.Clock();
    this._spawnTarget();
    this._loop();
  }

  pause() {
    this.running = false;
    clearTimeout(this._spawnTimer);
    if (this._clock) this._clock.stop();
  }

  resume() {
    this.running = true;
    if (this._clock) this._clock.start();
    this._spawnTarget();
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this._spawnTimer);
    cancelAnimationFrame(this._animFrame);
    this._unbindEvents();
    this._clearTargets();

    // Dispose Three.js resources
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
  }

  setCallbacks({ onHit, onMiss }) {
    this._onHit = onHit;
    this._onMiss = onMiss;
  }

  /* ---------- Scene Initialization ---------- */

  _initScene() {
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;

    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x080a10);
    this._scene.fog = new THREE.Fog(0x080a10, 20, 60);

    // Camera
    this._camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 100);
    this._camera.position.set(0, 1.7, 0); // Eye height

    // Renderer
    this._renderer3d = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this._renderer3d.setSize(w, h);
    this._renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer3d.shadowMap.enabled = true;
    this._renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer3d.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer3d.toneMappingExposure = 1.0;

    // Raycaster
    this._raycaster = new THREE.Raycaster();

    // Arena group
    this._arenaGroup = new THREE.Group();
    this._scene.add(this._arenaGroup);
  }

  /* ---------- Arena Construction ---------- */

  _buildArena() {
    const arena = this._arenaGroup;

    // --- Floor ---
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e14,
      roughness: 0.85,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arena.add(floor);

    // Floor grid lines
    const gridHelper = new THREE.GridHelper(40, 40, 0x1a1d2e, 0x12141e);
    gridHelper.position.y = 0.01;
    arena.add(gridHelper);

    // --- Walls ---
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x10131c,
      roughness: 0.9,
      metalness: 0.1,
    });
    const wallHeight = 6;
    const arenaSize = 20;

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(40, wallHeight), wallMat);
    backWall.position.set(0, wallHeight / 2, -arenaSize);
    arena.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(40, wallHeight), wallMat);
    frontWall.position.set(0, wallHeight / 2, arenaSize);
    frontWall.rotation.y = Math.PI;
    arena.add(frontWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(40, wallHeight), wallMat);
    leftWall.position.set(-arenaSize, wallHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    arena.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(40, wallHeight), wallMat);
    rightWall.position.set(arenaSize, wallHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    arena.add(rightWall);

    // --- Ceiling (subtle) ---
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c12,
      roughness: 1.0,
      metalness: 0.0,
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    arena.add(ceiling);

    // --- Accent trim lines on walls ---
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x00e0d0, transparent: true, opacity: 0.15 });
    const trimGeo = new THREE.PlaneGeometry(40, 0.03);

    const trim1 = new THREE.Mesh(trimGeo, trimMat);
    trim1.position.set(0, 1.0, -arenaSize + 0.01);
    arena.add(trim1);

    const trim2 = new THREE.Mesh(trimGeo, trimMat.clone());
    trim2.position.set(0, 1.0, arenaSize - 0.01);
    trim2.rotation.y = Math.PI;
    arena.add(trim2);

    // --- Lighting ---
    // Ambient
    const ambient = new THREE.AmbientLight(0x303850, 0.6);
    this._scene.add(ambient);

    // Main overhead light
    const mainLight = new THREE.DirectionalLight(0xd0e8ff, 0.8);
    mainLight.position.set(2, 8, 3);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(1024, 1024);
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 30;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    this._scene.add(mainLight);

    // Accent point lights (teal)
    const accentLight1 = new THREE.PointLight(0x00e0d0, 0.6, 25);
    accentLight1.position.set(-8, 3, -8);
    this._scene.add(accentLight1);

    const accentLight2 = new THREE.PointLight(0x00e0d0, 0.4, 25);
    accentLight2.position.set(8, 3, 8);
    this._scene.add(accentLight2);

    // Warm fill from behind
    const fillLight = new THREE.PointLight(0xffb830, 0.2, 30);
    fillLight.position.set(0, 4, -15);
    this._scene.add(fillLight);

    // --- Decorative pillars ---
    const pillarGeo = new THREE.BoxGeometry(0.4, wallHeight, 0.4);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x161925,
      roughness: 0.7,
      metalness: 0.3,
    });
    const pillarPositions = [
      [-12, 0, -12], [12, 0, -12], [-12, 0, 12], [12, 0, 12],
    ];
    for (const [px, py, pz] of pillarPositions) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, wallHeight / 2, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      arena.add(pillar);
    }
  }

  /* ---------- Target Management ---------- */

  _spawnTarget() {
    if (!this.running) return;

    // Clear existing targets
    this._clearTargets();

    // Random position in the arena (in front of the player)
    const distance = 5 + Math.random() * 12; // 5-17 units away
    const angle = (Math.random() - 0.5) * Math.PI * 0.8; // Spread across ~144 degrees
    const height = 0.8 + Math.random() * 3.0; // Between knee and head height

    const x = Math.sin(angle) * distance;
    const z = -Math.cos(angle) * distance;
    const y = height;

    // Create target sphere
    const radius = this.targetBaseRadius;
    const targetGeo = new THREE.SphereGeometry(radius, 24, 24);
    const targetMat = new THREE.MeshStandardMaterial({
      color: 0x00e0d0,
      emissive: 0x00e0d0,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(x, y, z);
    targetMesh.castShadow = true;

    // Outer glow ring
    const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00e0d0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.lookAt(this._camera.position);
    targetMesh.add(ring);

    this._scene.add(targetMesh);

    this._targets.push({
      mesh: targetMesh,
      ring: ring,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      hitAnim: 0,
    });
  }

  _clearTargets() {
    for (const t of this._targets) {
      if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    }
    this._targets = [];
  }

  _removeTarget(target) {
    const idx = this._targets.indexOf(target);
    if (idx !== -1) this._targets.splice(idx, 1);
    if (target.mesh.parent) target.mesh.parent.remove(target.mesh);
    target.mesh.geometry.dispose();
    target.mesh.material.dispose();
  }

  /* ---------- Hit Detection ---------- */

  _handleClick(e) {
    if (!this.running) return;

    // Request pointer lock on first click if not locked
    if (!this._pointerLocked) {
      this.canvas.requestPointerLock();
      return;
    }

    // Raycast from center of screen (crosshair)
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);

    const meshes = this._targets.filter(t => t.alive).map(t => t.mesh);
    const intersects = this._raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const target = this._targets.find(t => t.mesh === hitMesh && t.alive);
      if (target) {
        target.alive = false;
        target.hitAnim = 1.0;
        const reactionTime = Date.now() - target.spawnTime;
        if (this._onHit) this._onHit(reactionTime);

        // Spawn next target after short delay
        clearTimeout(this._spawnTimer);
        this._spawnTimer = setTimeout(() => this._spawnTarget(), 200);
      }
    } else {
      if (this._onMiss) this._onMiss();
    }
  }

  /* ---------- Mouse Look ---------- */

  _handleMouseMove(e) {
    if (!this._pointerLocked || !this.running) return;

    const sensitivity = 0.002;
    this._yaw -= e.movementX * sensitivity;
    this._pitch -= e.movementY * sensitivity;

    // Clamp pitch to prevent flipping
    this._pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this._pitch));

    // Apply rotation
    this._camera.rotation.order = 'YXZ';
    this._camera.rotation.y = this._yaw;
    this._camera.rotation.x = this._pitch;
  }

  _handlePointerLockChange() {
    this._pointerLocked = document.pointerLockElement === this.canvas;
  }

  _handleResize() {
    if (!this._camera || !this._renderer3d) return;
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
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
  }

  /* ---------- Render Loop ---------- */

  _loop() {
    if (!this.running && this._targets.length === 0) return;
    this._update();
    this._render();
    this._animFrame = requestAnimationFrame(() => this._loop());
  }

  _update() {
    const dt = this._clock ? this._clock.getDelta() : 0.016;

    for (const t of this._targets) {
      if (t.alive) {
        // Fade in
        t.opacity = Math.min(1, t.opacity + dt * 5);
        t.mesh.material.opacity = t.opacity;
        t.ring.material.opacity = t.opacity * 0.25;

        // Billboard the ring to face camera
        t.ring.lookAt(this._camera.position);

        // Subtle hover animation
        t.mesh.position.y += Math.sin(Date.now() * 0.003 + t.spawnTime) * 0.001;
      } else {
        // Hit animation — shrink and fade
        t.hitAnim -= dt * 4;
        if (t.hitAnim <= 0) {
          this._removeTarget(t);
        } else {
          const s = t.hitAnim;
          t.mesh.scale.set(s, s, s);
          t.mesh.material.opacity = t.hitAnim * 0.5;
          t.mesh.material.emissiveIntensity = 1.0;
        }
      }
    }
  }

  _render() {
    if (this._renderer3d && this._scene && this._camera) {
      this._renderer3d.render(this._scene, this._camera);
    }
  }
};
