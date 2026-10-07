/* ============================================
   Target Switching Renderer — 3D Multi-Target
   Extends ThreeArenaRenderer to reuse the arena,
   weapon system, mouse look, and effects.
   Maintains exactly 5 simultaneous stationary targets.
   Shooting one instantly spawns a replacement.
   Tracks switch times between consecutive hits.
   ============================================ */
VantageEngine.Renderers.TargetSwitchingRenderer = class TargetSwitchingRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Fixed target count
    this._targetCount = 5;

    // Switch time tracking
    this._lastHitTime = 0;         // timestamp of last successful hit
    this._switchTimes = [];        // array of switch times in ms
    this._bestSwitchTime = Infinity;
    this._targetsDestroyed = 0;

    // Position history to avoid predictable patterns
    this._tsRecentPositions = [];

    // Override: no difficulty progression for target switching
    // Use fixed target size from settings
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius;
  }

  /* ---------- Lifecycle overrides ---------- */

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._lastHitTime = 0;
    this._switchTimes = [];
    this._bestSwitchTime = Infinity;
    this._targetsDestroyed = 0;
    this._tsRecentPositions = [];
    this._spawnPending = false;

    // Spawn initial 5 targets
    this._spawnInitialTargets();
    this._loop();
  }

  pause() {
    // Call parent pause (releases pointer lock, starts idle render loop)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    // Call parent resume (restarts game loop)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    // Call parent stop (full cleanup of scene, events, etc.)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._lastHitTime = 0;
    this._switchTimes = [];
    this._bestSwitchTime = Infinity;
    this._targetsDestroyed = 0;
    this._tsRecentPositions = [];
  }

  /* ---------- Target spawning ---------- */

  _spawnInitialTargets() {
    for (var i = 0; i < this._targetCount; i++) {
      this._spawnSingleTarget(true);
    }
  }

  // Generate a position for target switching mode.
  // Ensures variety: short/medium/long distances, varied heights, angular separation.
  _generateTSPosition() {
    var ARENA_HALF = this.constructor.ARENA_HALF;
    var MIN_Y = this.constructor.ARENA_MIN_Y;
    var MAX_Y = this.constructor.ARENA_MAX_Y;

    // Distance zones: short, medium, long
    var zones = [
      { minDist: 4, maxDist: 7, weight: 0.30 },   // Close
      { minDist: 7, maxDist: 12, weight: 0.40 },   // Mid
      { minDist: 12, maxDist: 17, weight: 0.30 },  // Far
    ];

    // Select zone
    var totalWeight = zones.reduce(function (sum, z) { return sum + z.weight; }, 0);
    var rand = Math.random() * totalWeight;
    var selectedZone = zones[0];
    for (var i = 0; i < zones.length; i++) {
      rand -= zones[i].weight;
      if (rand <= 0) { selectedZone = zones[i]; break; }
    }

    var distance = selectedZone.minDist + Math.random() * (selectedZone.maxDist - selectedZone.minDist);

    // Full 360° angle (targets all around the player)
    var angle = Math.random() * Math.PI * 2;

    var x = Math.sin(angle) * distance;
    var z = -Math.cos(angle) * distance;

    // Height: varied, weighted toward eye level but including low and high
    var heightZones = [
      { min: 0.5, max: 1.2, weight: 0.15 },
      { min: 1.2, max: 2.2, weight: 0.45 },
      { min: 2.2, max: 3.2, weight: 0.25 },
      { min: 3.2, max: 4.2, weight: 0.15 },
    ];
    var totalHW = heightZones.reduce(function (sum, z) { return sum + z.weight; }, 0);
    var hRand = Math.random() * totalHW;
    var selectedHZ = heightZones[0];
    for (var j = 0; j < heightZones.length; j++) {
      hRand -= heightZones[j].weight;
      if (hRand <= 0) { selectedHZ = heightZones[j]; break; }
    }
    var y = selectedHZ.min + Math.random() * (selectedHZ.max - selectedHZ.min);

    // Clamp to arena
    x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, x));
    z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, z));
    y = Math.max(MIN_Y, Math.min(MAX_Y, y));

    // Ensure minimum separation from existing recent positions
    var maxAttempts = 25;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      var tooClose = false;
      for (var k = 0; k < this._tsRecentPositions.length; k++) {
        var rp = this._tsRecentPositions[k];
        var dx = x - rp.x;
        var dz = z - rp.z;
        var sep = Math.sqrt(dx * dx + dz * dz);
        if (sep < 2.5) { tooClose = true; break; }
      }
      if (!tooClose) break;

      // Regenerate
      angle = Math.random() * Math.PI * 2;
      distance = selectedZone.minDist + Math.random() * (selectedZone.maxDist - selectedZone.minDist);
      x = Math.sin(angle) * distance;
      z = -Math.cos(angle) * distance;
      x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, x));
      z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, z));
    }

    // Also ensure separation from currently alive targets
    for (var a = 0; a < this._targets.length; a++) {
      var t = this._targets[a];
      if (!t.alive) continue;
      var tdx = x - t.mesh.position.x;
      var tdz = z - t.mesh.position.z;
      var tSep = Math.sqrt(tdx * tdx + tdz * tdz);
      if (tSep < 2.0) {
        // Nudge the position
        angle += 0.4;
        x = Math.sin(angle) * distance;
        z = -Math.cos(angle) * distance;
        x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, x));
        z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, z));
      }
    }

    return { x: x, y: y, z: z, distance: distance, angle: angle };
  }

  _spawnSingleTarget(isInitial) {
    if (!this.running && !isInitial) return;

    var pos = this._generateTSPosition();

    // Track recent positions
    this._tsRecentPositions.push({ x: pos.x, z: pos.z });
    if (this._tsRecentPositions.length > 10) this._tsRecentPositions.shift();

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

    // Outer ring (billboard)
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

  // Override parent's _spawnTarget to prevent it from being called
  _spawnTarget() {
    // No-op: target switching manages its own spawning via _spawnSingleTarget
  }

  /* ---------- Override: fire handling ---------- */

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;
    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    // Fire weapon visual/audio effects
    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    // Raycast from center of screen
    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    this._applyShotSpread();

    var meshes = this._targets.filter(function (t) { return t.alive; }).map(function (t) { return t.mesh; });

    var intersects = meshes.length > 0 ? this._raycaster.intersectObjects(meshes, false) : [];

    // Tracer and recoil
    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    if (meshes.length === 0) return;

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      while (hitObj.parent && hitObj.parent !== this._scene) {
        hitObj = hitObj.parent;
      }
      var target = null;
      for (var i = 0; i < this._targets.length; i++) {
        if (this._targets[i].mesh === hitObj && this._targets[i].alive) {
          target = this._targets[i];
          break;
        }
      }

      if (target) {
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsDestroyed++;

        // Create particle burst
        this._createHitParticles(target.mesh.position.clone());

        // Calculate switch time
        var switchTime = 0;
        if (this._lastHitTime > 0) {
          switchTime = now - this._lastHitTime;
          this._switchTimes.push(switchTime);
          if (switchTime < this._bestSwitchTime) {
            this._bestSwitchTime = switchTime;
          }
        }
        this._lastHitTime = now;

        // Report hit to engine (use switch time as reaction time if available, else 0)
        var reactionTime = switchTime > 0 ? switchTime : 0;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        // INSTANT replacement: remove the dead target and spawn a new one
        // We do this after a very short delay so the hit animation plays
        var self = this;
        setTimeout(function () {
          if (self._stopped) return;
          // Remove the dead target from the array
          var idx = self._targets.indexOf(target);
          if (idx !== -1) {
            self._targets.splice(idx, 1);
            self._disposeTarget(target);
          }
          // Spawn replacement to maintain exactly 5
          var aliveCount = self._targets.filter(function (t) { return t.alive; }).length;
          if (aliveCount < self._targetCount) {
            self._spawnSingleTarget(false);
          }
        }, 100); // Short delay for hit animation visibility
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  /* ---------- Override: update loop ---------- */

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    // Update particles
    this._updateParticles(dt);

    // Update weapon animations
    this._updateWeapon(dt);

    // Safety net: ensure we always have exactly 5 alive targets
    var aliveCount = 0;
    for (var a = 0; a < this._targets.length; a++) {
      if (this._targets[a].alive) aliveCount++;
    }
    while (aliveCount < this._targetCount && this.running) {
      this._spawnSingleTarget(false);
      aliveCount++;
    }

    // Collect dead targets to remove
    var toRemove = [];

    for (var i = 0; i < this._targets.length; i++) {
      var t = this._targets[i];
      if (t.alive) {
        // Smooth fade in
        t.opacity = Math.min(1, t.opacity + dt * 8);
        var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;
        t.mesh.material.opacity = easedOpacity;
        t.core.material.opacity = easedOpacity * 0.9;
        t.ring.material.opacity = easedOpacity * 0.7;
        if (t.innerRing) t.innerRing.material.opacity = easedOpacity * 0.5;

        // Billboard rings to face camera
        if (this._camera) {
          var camPos = this._camera.position.clone();
          var localCamPos = t.mesh.worldToLocal(camPos);
          t.ring.lookAt(localCamPos);
          if (t.innerRing) t.innerRing.lookAt(localCamPos);
        }

        // Subtle hover bob
        var bobSpeed = 0.0025;
        var bobAmount = 0.03; // Slightly less bob than static flick for stability
        t.mesh.position.y = t.baseY + Math.sin(now * bobSpeed + t.spawnTime * 0.001) * bobAmount;

        // Subtle pulse on emissive
        var pulse = 0.5 + Math.sin(now * 0.005) * 0.1;
        t.mesh.material.emissiveIntensity = pulse;
      } else {
        // Hit animation
        t.hitAnim -= dt * 6;
        if (t.hitAnim <= 0) {
          toRemove.push(t);
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

    // Remove finished dead targets (only those not already handled by the replacement timeout)
    for (var r = 0; r < toRemove.length; r++) {
      var deadTarget = toRemove[r];
      var deadIdx = this._targets.indexOf(deadTarget);
      if (deadIdx !== -1) {
        this._targets.splice(deadIdx, 1);
        this._disposeTarget(deadTarget);
      }
    }
  }

  /* ---------- Override: progression indicator ---------- */

  getProgression() {
    // For target switching, progression is based on how well the player is doing
    // Use accuracy as the progression indicator
    if (!this._sessionStartTime) return 0;
    var hits = this._hitCount;
    var totalShots = hits + (this._missCount || 0);
    if (totalShots === 0) return 0;
    return hits / totalShots;
  }

  /* ---------- Target switching stats export ---------- */

  getSwitchingStats() {
    var switchTimes = this._switchTimes;
    var avgSwitchTime = 0;
    if (switchTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < switchTimes.length; i++) sum += switchTimes[i];
      avgSwitchTime = Math.round(sum / switchTimes.length);
    }
    var bestSwitchTime = this._bestSwitchTime === Infinity ? 0 : Math.round(this._bestSwitchTime);

    return {
      avgSwitchTime: avgSwitchTime,
      bestSwitchTime: bestSwitchTime,
      targetsDestroyed: this._targetsDestroyed,
      switchTimeCount: switchTimes.length,
    };
  }
};
