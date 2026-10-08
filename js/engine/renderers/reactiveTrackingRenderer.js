/* ============================================
   Reactive Tracking Renderer — 3D
   Extends ThreeArenaRenderer to reuse the arena,
   weapon system, mouse look, and effects.
   Target appears suddenly after random delay.
   Player must react quickly and shoot.
   ============================================ */
VantageEngine.Renderers.ReactiveTrackingRenderer = class ReactiveTrackingRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Fixed spawn area in front of player
    this._spawnGrid = this._buildSpawnGrid();
    this._currentSpawnIndex = -1;

    // Target state
    this._target = null;
    this._targetSpawnTime = 0;

    // Spawn delay logic
    this._spawnDelayTimer = null;
    this._minSpawnDelay = 800;  // ms
    this._maxSpawnDelay = 2000; // ms

    // Stats tracking
    this._reactionTimes = []; // time from spawn to hit
    this._targetsDestroyed = 0;

    // Override target radius
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius;
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
    this._reactionTimes = [];
    this._targetsDestroyed = 0;
    this._currentSpawnIndex = -1;
    this._spawnPending = false;
    this._target = null;
    this._targetSpawnTime = 0;

    // Start the spawn delay cycle
    this._scheduleNextSpawn();
    this._loop();
  }

  pause() {
    // Clear spawn timer when pausing
    if (this._spawnDelayTimer) {
      clearTimeout(this._spawnDelayTimer);
      this._spawnDelayTimer = null;
    }
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
    // If no target is active, schedule next spawn
    if (!this._target && this.running) {
      this._scheduleNextSpawn();
    }
  }

  stop() {
    // Clear spawn timer
    if (this._spawnDelayTimer) {
      clearTimeout(this._spawnDelayTimer);
      this._spawnDelayTimer = null;
    }
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._reactionTimes = [];
    this._targetsDestroyed = 0;
    this._target = null;
  }

  /* ---------- Spawn Delay Logic ---------- */

  _scheduleNextSpawn() {
    if (!this.running) return;

    // Clear any existing timer
    if (this._spawnDelayTimer) {
      clearTimeout(this._spawnDelayTimer);
    }

    // Random delay between min and max
    var delay = this._minSpawnDelay + Math.random() * (this._maxSpawnDelay - this._minSpawnDelay);

    var self = this;
    this._spawnDelayTimer = setTimeout(function () {
      if (self.running && !self._target) {
        self._spawnTarget();
      }
    }, delay);
  }

  /* ---------- Target Spawning ---------- */

  _spawnTarget() {
    if (!this.running) return;

    // Clear existing target if any
    if (this._target) {
      this._clearTarget();
    }

    var pos = this._getNextSpawnPosition();

    // Record spawn time for reaction tracking
    this._targetSpawnTime = Date.now();

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
      spawnTime: this._targetSpawnTime,
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
    this._targetSpawnTime = 0;
  }

  /* ---------- Override: fire handling ---------- */

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;
    if (!this._target || !this._target.alive) {
      // No target to shoot at, but still count as miss
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

      // Raycast (will miss since no target)
      this._camera.updateMatrixWorld();
      this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
      this._applyShotSpread();
      this._spawnTracer(null);
      this._applyRecoilKick();

      if (this._onMiss) this._onMiss();
      return;
    }

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

        // Calculate reaction time (time from spawn to hit)
        var reactionTime = now - this._targetSpawnTime;
        this._reactionTimes.push(reactionTime);

        // Report hit
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        // Clear target and schedule next spawn
        var self = this;
        setTimeout(function () {
          if (self._stopped) return;
          self._clearTarget();
          if (self.running) {
            self._scheduleNextSpawn();
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

    // Update target visuals (stationary, no movement)
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
  }

  /* ---------- Stats Export ---------- */

  getReactiveTrackingStats() {
    var avgReactionTime = 0;
    if (this._reactionTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._reactionTimes.length; i++) {
        sum += this._reactionTimes[i];
      }
      avgReactionTime = Math.round(sum / this._reactionTimes.length);
    }

    return {
      targetsDestroyed: this._targetsDestroyed,
      avgTrackingTime: avgReactionTime, // Keep same name for compatibility
      trackingTimeCount: this._reactionTimes.length,
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
