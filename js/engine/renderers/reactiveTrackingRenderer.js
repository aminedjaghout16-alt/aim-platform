/* ============================================
   Reactive Tracking Renderer — 3D
   Extends ThreeArenaRenderer to reuse the arena,
   weapon system, mouse look, and effects.
   Target spawns stationary, then moves unpredictably.
   Player must track and shoot the moving target.
   ============================================ */
VantageEngine.Renderers.ReactiveTrackingRenderer = class ReactiveTrackingRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Fixed spawn area in front of player
    this._spawnGrid = this._buildSpawnGrid();
    this._currentSpawnIndex = -1;

    // Movement state
    this._target = null;
    this._movementActive = false;
    this._movementStartTime = 0;
    this._stationaryDuration = 800; // ms before movement starts

    // Velocity-based movement
    this._velocity = { x: 0, y: 0 };
    this._maxSpeed = 3.5; // units per second
    this._acceleration = 8.0; // how fast velocity changes
    this._directionChangeInterval = 0;
    this._nextDirectionChange = 0;

    // Movement bounds (relative to spawn position)
    this._moveBounds = {
      minX: -2.5,
      maxX: 2.5,
      minY: -1.0,
      maxY: 1.0,
    };

    // Stats tracking
    this._trackingTimes = []; // time from movement start to hit
    this._targetsDestroyed = 0;

    // Override target radius
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius * 1.1; // slightly larger for tracking
  }

  /* ---------- Spawn Grid ---------- */

  _buildSpawnGrid() {
    // 4 columns × 3 rows = 12 positions in front of player
    var cols = [-3, -1, 1, 3];
    var rows = [1.5, 2.5, 3.5];
    var z = -10;

    var grid = [];
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < cols.length; c++) {
        grid.push({ x: cols[c], y: rows[r], z: z });
      }
    }
    return grid;
  }

  _getNextSpawnPosition() {
    // Pick a random position different from current
    var available = [];
    for (var i = 0; i < this._spawnGrid.length; i++) {
      if (i !== this._currentSpawnIndex) {
        available.push(i);
      }
    }
    var chosen = available[Math.floor(Math.random() * available.length)];
    this._currentSpawnIndex = chosen;
    return this._spawnGrid[chosen];
  }

  /* ---------- Lifecycle ---------- */

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._trackingTimes = [];
    this._targetsDestroyed = 0;
    this._currentSpawnIndex = -1;
    this._spawnPending = false;

    this._spawnTarget();
    this._loop();
  }

  pause() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._trackingTimes = [];
    this._targetsDestroyed = 0;
    this._movementActive = false;
  }

  /* ---------- Target Spawning ---------- */

  _spawnTarget() {
    if (!this.running) return;

    // Clear existing target
    if (this._target) {
      this._clearTarget();
    }

    var pos = this._getNextSpawnPosition();

    // Reset movement state
    this._movementActive = false;
    this._movementStartTime = 0;
    this._velocity = { x: 0, y: 0 };
    this._directionChangeInterval = 0;
    this._nextDirectionChange = 0;

    var radius = this.targetBaseRadius;

    // Target sphere
    var targetGeo = new THREE.SphereGeometry(radius, 24, 24);
    var targetMat = new THREE.MeshStandardMaterial({
      color: this._targetColor,
      emissive: this._targetColor,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });
    var targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMesh.position.set(pos.x, pos.y, pos.z);

    // Inner core
    var coreGeo = new THREE.SphereGeometry(radius * 0.4, 16, 16);
    var coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    var core = new THREE.Mesh(coreGeo, coreMat);
    targetMesh.add(core);

    // Outer ring
    var ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.7, 48);
    var ringMat = new THREE.MeshBasicMaterial({
      color: this._targetColor, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    targetMesh.add(ring);

    // Inner ring
    var innerRingGeo = new THREE.RingGeometry(radius * 0.7, radius * 0.85, 48);
    var innerRingMat = new THREE.MeshBasicMaterial({
      color: this._targetColor, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    var innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    targetMesh.add(innerRing);

    this._scene.add(targetMesh);

    this._target = {
      mesh: targetMesh,
      core: core,
      ring: ring,
      innerRing: innerRing,
      radius: radius,
      spawnTime: Date.now(),
      spawnPos: { x: pos.x, y: pos.y, z: pos.z },
      alive: true,
      opacity: 0,
      hitAnim: 0,
    };

    this._targets.push(this._target);
  }

  _clearTarget() {
    if (!this._target) return;
    var idx = this._targets.indexOf(this._target);
    if (idx !== -1) {
      this._targets.splice(idx, 1);
    }
    if (this._target.mesh.parent) {
      this._target.mesh.parent.remove(this._target.mesh);
    }
    this._target.mesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
        else child.material.dispose();
      }
    });
    this._target = null;
  }

  /* ---------- Movement ---------- */

  _updateMovement(dt) {
    if (!this._target || !this._target.alive) return;

    var now = Date.now();
    var elapsed = now - this._target.spawnTime;

    // Start movement after stationary duration
    if (!this._movementActive && elapsed >= this._stationaryDuration) {
      this._movementActive = true;
      this._movementStartTime = now;
      this._nextDirectionChange = now + 300 + Math.random() * 700; // 300-1000ms
      this._changeDirection();
    }

    if (!this._movementActive) return;

    // Change direction periodically
    if (now >= this._nextDirectionChange) {
      this._changeDirection();
      this._nextDirectionChange = now + 400 + Math.random() * 800; // 400-1200ms
    }

    // Apply velocity with acceleration
    var targetMesh = this._target.mesh;
    var currentPos = targetMesh.position;

    // Calculate new position
    var newX = currentPos.x + this._velocity.x * dt;
    var newY = currentPos.y + this._velocity.y * dt;

    // Bounds checking (relative to spawn position)
    var spawnPos = this._target.spawnPos;
    var relX = newX - spawnPos.x;
    var relY = newY - spawnPos.y;

    // Clamp to bounds
    if (relX < this._moveBounds.minX) {
      relX = this._moveBounds.minX;
      this._velocity.x = Math.abs(this._velocity.x) * 0.5; // bounce
    } else if (relX > this._moveBounds.maxX) {
      relX = this._moveBounds.maxX;
      this._velocity.x = -Math.abs(this._velocity.x) * 0.5;
    }

    if (relY < this._moveBounds.minY) {
      relY = this._moveBounds.minY;
      this._velocity.y = Math.abs(this._velocity.y) * 0.5;
    } else if (relY > this._moveBounds.maxY) {
      relY = this._moveBounds.maxY;
      this._velocity.y = -Math.abs(this._velocity.y) * 0.5;
    }

    targetMesh.position.x = spawnPos.x + relX;
    targetMesh.position.y = spawnPos.y + relY;
  }

  _changeDirection() {
    // Random direction change
    var angle = Math.random() * Math.PI * 2;
    var speed = 1.5 + Math.random() * (this._maxSpeed - 1.5);

    this._velocity.x = Math.cos(angle) * speed;
    this._velocity.y = Math.sin(angle) * speed * 0.5; // less vertical movement
  }

  /* ---------- Override: fire handling ---------- */

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;
    if (!this._target || !this._target.alive) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    // Fire weapon effects
    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    // Raycast
    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    this._applyShotSpread();

    var meshes = [this._target.mesh];
    var intersects = this._raycaster.intersectObjects(meshes, false);

    // Tracer and recoil
    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      while (hitObj.parent && hitObj.parent !== this._scene) {
        hitObj = hitObj.parent;
      }

      if (hitObj === this._target.mesh && this._target.alive) {
        this._target.alive = false;
        this._target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsDestroyed++;

        // Create particle burst
        this._createHitParticles(this._target.mesh.position.clone());

        // Calculate tracking time if movement was active
        if (this._movementActive && this._movementStartTime > 0) {
          var trackingTime = now - this._movementStartTime;
          this._trackingTimes.push(trackingTime);
        }

        // Report hit
        var reactionTime = this._movementActive ? (now - this._movementStartTime) : 0;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        // Spawn replacement after delay
        var self = this;
        setTimeout(function () {
          if (self._stopped) return;
          self._clearTarget();
          if (self.running) {
            self._spawnTarget();
          }
        }, 150);
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  /* ---------- Override: update loop ---------- */

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);

    // Update movement
    this._updateMovement(dt);

    // Update target visuals
    if (this._target && this._target.alive) {
      var t = this._target;

      // Fade in
      t.opacity = Math.min(1, t.opacity + dt * 8);
      var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;
      t.mesh.material.opacity = easedOpacity;
      t.core.material.opacity = easedOpacity * 0.9;
      t.ring.material.opacity = easedOpacity * 0.7;
      if (t.innerRing) t.innerRing.material.opacity = easedOpacity * 0.5;

      // Billboard rings
      if (this._camera) {
        var camPos = this._camera.position.clone();
        var localCamPos = t.mesh.worldToLocal(camPos);
        t.ring.lookAt(localCamPos);
        if (t.innerRing) t.innerRing.lookAt(localCamPos);
      }

      // Pulse effect
      var pulse = 0.5 + Math.sin(now * 0.005) * 0.1;
      t.mesh.material.emissiveIntensity = pulse;
    } else if (this._target && !this._target.alive) {
      // Hit animation
      var t = this._target;
      t.hitAnim -= dt * 6;
      if (t.hitAnim <= 0) {
        // Will be cleared by timeout
      } else {
        if (t.hitAnim > 0.8) {
          var flash = (1 - t.hitAnim) / 0.2;
          t.mesh.scale.setScalar(1 + flash * 0.4);
          t.mesh.material.emissiveIntensity = 0.6 + flash * 3;
          t.mesh.material.color.setHex(0xffffff);
          t.core.material.opacity = 1;
        } else if (t.hitAnim > 0.5) {
          var transition = (0.8 - t.hitAnim) / 0.3;
          t.mesh.scale.setScalar(1.4 - transition * 0.3);
          t.mesh.material.emissiveIntensity = 3 - transition * 2;
          var colorLerp = transition;
          t.mesh.material.color.setHex(0xffffff).lerp(new THREE.Color(this._targetColor), colorLerp);
        } else {
          var shrink = t.hitAnim / 0.5;
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

    // Safety net
    if (this.running && !this._target) {
      this._spawnTarget();
    }
  }

  /* ---------- Stats Export ---------- */

  getReactiveTrackingStats() {
    var avgTrackingTime = 0;
    if (this._trackingTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._trackingTimes.length; i++) {
        sum += this._trackingTimes[i];
      }
      avgTrackingTime = Math.round(sum / this._trackingTimes.length);
    }

    return {
      targetsDestroyed: this._targetsDestroyed,
      avgTrackingTime: avgTrackingTime,
      trackingTimeCount: this._trackingTimes.length,
    };
  }

  getProgression() {
    if (!this._sessionStartTime) return 0;
    var hits = this._hitCount;
    var totalShots = hits + (this._missCount || 0);
    if (totalShots === 0) return 0;
    return hits / totalShots;
  }
};
