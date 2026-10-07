/* ============================================
   Strafe Tracking Renderer — 3D Moving Target
   Extends ThreeArenaRenderer to reuse the arena,
   weapon system, mouse look, and effects.
   Adds a continuously moving target with tracking
   accuracy metrics.
   ============================================ */
VantageEngine.Renderers.StrafeTrackingRenderer = class StrafeTrackingRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Override target radius: tracking uses a consistent, reasonably-sized target.
    // Difficulty mainly changes movement, not target size.
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius * 1.15; // slightly larger for tracking

    // Movement state
    this._trackingTarget = null;
    this._movementTime = 0;
    this._targetFrozen = false;
    this._targetCenter = { x: 0, y: 1.7, z: -10 };
    this._movementParams = null;

    // Tracking metrics (sampled every frame)
    this._trackingStats = {
      totalSamples: 0,
      onTargetSamples: 0,
      sumAngularError: 0,
      currentStreakFrames: 0,
      bestStreakFrames: 0,
    };
    this._isOnTarget = false;
    this._prevOnTarget = false;

    // Glow mesh for on-target feedback
    this._glowMesh = null;

    // Reusable vectors to avoid per-frame allocations
    this._tmpVec1 = new THREE.Vector3();
    this._tmpVec2 = new THREE.Vector3();
  }

  /* ---------- Difficulty-based movement parameters ---------- */

  _getDifficultyParams() {
    var diff = (this.config.difficulty || 'medium').toLowerCase();
    // Map scenario difficulty to movement parameters
    var presets = {
      easy: {
        primaryAmpX: 3.5, primaryFreqX: 0.35,
        secondaryAmpX: 1.2, secondaryFreqX: 0.8,
        ampY: 0, freqY: 0,
        ampZ: 0.8, freqZ: 0.25,
        jitterAmp: 0, jitterFreq: 0,
      },
      medium: {
        primaryAmpX: 5.5, primaryFreqX: 0.55,
        secondaryAmpX: 2.2, secondaryFreqX: 1.1,
        ampY: 0.7, freqY: 0.4,
        ampZ: 1.2, freqZ: 0.35,
        jitterAmp: 0.4, jitterFreq: 1.8,
      },
      hard: {
        primaryAmpX: 7.5, primaryFreqX: 0.85,
        secondaryAmpX: 3.2, secondaryFreqX: 1.6,
        ampY: 1.4, freqY: 0.65,
        ampZ: 1.8, freqZ: 0.45,
        jitterAmp: 0.9, jitterFreq: 2.8,
      },
      extreme: {
        primaryAmpX: 10, primaryFreqX: 1.15,
        secondaryAmpX: 4.5, secondaryFreqX: 2.2,
        ampY: 2.2, freqY: 0.9,
        ampZ: 2.2, freqZ: 0.6,
        jitterAmp: 1.8, jitterFreq: 3.5,
      },
    };
    var p = presets[diff] || presets.medium;
    // Add random phases so each session feels different
    p.phaseX1 = Math.random() * Math.PI * 2;
    p.phaseX2 = Math.random() * Math.PI * 2;
    p.phaseX3 = Math.random() * Math.PI * 2;
    p.phaseY = Math.random() * Math.PI * 2;
    p.phaseZ = Math.random() * Math.PI * 2;
    return p;
  }

  /* ---------- Lifecycle overrides ---------- */

  start(sessionData) {
    // Call parent to set up running state, stop idle loop, reset recoil
    // But we override target spawning — parent spawns a static target, we want a moving one.
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._movementTime = 0;
    this._targetFrozen = false;
    this._movementParams = this._getDifficultyParams();
    this._trackingStats = {
      totalSamples: 0,
      onTargetSamples: 0,
      sumAngularError: 0,
      currentStreakFrames: 0,
      bestStreakFrames: 0,
    };
    this._isOnTarget = false;
    this._prevOnTarget = false;
    this._spawnMovingTarget();
    this._loop();
  }

  pause() {
    this._targetFrozen = true;
    // Call parent pause (releases pointer lock, starts idle render loop)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    this._targetFrozen = false;
    // Call parent resume (restarts game loop)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    this._clearTrackingTarget();
    this._removeGlowMesh();
    this._movementTime = 0;
    this._targetFrozen = false;
    // Call parent stop (full cleanup of scene, events, etc.)
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
  }

  /* ---------- Moving target ---------- */

  _spawnMovingTarget() {
    if (this._trackingTarget) this._clearTrackingTarget();

    var radius = this.targetBaseRadius;
    var pos = this._targetCenter;

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

    this._trackingTarget = {
      mesh: targetMesh,
      core: core,
      ring: ring,
      innerRing: innerRing,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      baseEmissive: 0.6,
    };

    // Also add to parent's _targets array so setTargetColor() works
    this._targets.push(this._trackingTarget);

    // Build glow mesh for on-target feedback
    this._buildGlowMesh(radius);
  }

  _buildGlowMesh(radius) {
    this._removeGlowMesh();
    var glowGeo = new THREE.RingGeometry(radius * 1.8, radius * 2.4, 48);
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    var glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.visible = false;
    glowMesh.raycast = function () {}; // never participate in hit detection
    this._scene.add(glowMesh);
    this._glowMesh = glowMesh;
  }

  _removeGlowMesh() {
    if (this._glowMesh) {
      if (this._glowMesh.parent) this._glowMesh.parent.remove(this._glowMesh);
      this._glowMesh.geometry.dispose();
      this._glowMesh.material.dispose();
      this._glowMesh = null;
    }
  }

  _clearTrackingTarget() {
    if (!this._trackingTarget) return;
    // Remove from parent's _targets array
    var idx = this._targets.indexOf(this._trackingTarget);
    if (idx !== -1) this._targets.splice(idx, 1);
    // Dispose mesh hierarchy
    var t = this._trackingTarget;
    if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
    t.mesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
        else child.material.dispose();
      }
    });
    this._trackingTarget = null;
  }

  /* ---------- Movement ---------- */

  _updateMovement(dt) {
    if (this._targetFrozen || !this._trackingTarget) return;

    this._movementTime += dt;
    var t = this._movementTime;
    var p = this._movementParams;
    var TWO_PI = Math.PI * 2;
    var center = this._targetCenter;

    // Primary horizontal strafe
    var x = center.x + p.primaryAmpX * Math.sin(TWO_PI * p.primaryFreqX * t + p.phaseX1);
    // Secondary horizontal (adds natural deceleration/acceleration at direction changes)
    x += p.secondaryAmpX * Math.sin(TWO_PI * p.secondaryFreqX * t + p.phaseX2);
    // Jitter layer (unpredictability at higher difficulties)
    if (p.jitterAmp > 0) {
      x += p.jitterAmp * Math.sin(TWO_PI * p.jitterFreq * t + p.phaseX3);
    }

    // Vertical movement (higher difficulties)
    var y = center.y;
    if (p.ampY > 0) {
      y += p.ampY * Math.sin(TWO_PI * p.freqY * t + p.phaseY);
    }

    // Slight depth variation
    var z = center.z;
    if (p.ampZ > 0) {
      z += p.ampZ * Math.sin(TWO_PI * p.freqZ * t + p.phaseZ);
    }

    // Clamp to arena bounds (stay well inside walls)
    x = Math.max(-16, Math.min(16, x));
    y = Math.max(0.5, Math.min(4.0, y));
    z = Math.max(-16, Math.min(-3, z));

    this._trackingTarget.mesh.position.set(x, y, z);
  }

  /* ---------- Tracking metrics ---------- */

  _updateTrackingMetrics() {
    if (!this._trackingTarget || !this._camera || this._targetFrozen) return;

    var targetPos = this._trackingTarget.mesh.position;
    var camPos = this._camera.position;

    // Vector from camera to target center
    var toTarget = this._tmpVec1.subVectors(targetPos, camPos);
    var distance = toTarget.length();
    if (distance < 0.1) return;

    // Camera forward direction (where the crosshair points)
    var camForward = this._tmpVec2.set(0, 0, -1);
    camForward.applyQuaternion(this._camera.quaternion);

    // Angular error: angle between crosshair and target center
    var dotProduct = camForward.dot(toTarget.normalize());
    var angularError = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    // Target's angular radius as seen from the camera
    var angularRadius = Math.atan2(this._trackingTarget.radius, distance);

    // Is the crosshair within the target?
    var onTarget = angularError <= angularRadius;

    // Accumulate stats
    this._trackingStats.totalSamples++;
    if (onTarget) {
      this._trackingStats.onTargetSamples++;
      this._trackingStats.currentStreakFrames++;
      if (this._trackingStats.currentStreakFrames > this._trackingStats.bestStreakFrames) {
        this._trackingStats.bestStreakFrames = this._trackingStats.currentStreakFrames;
      }
    } else {
      this._trackingStats.currentStreakFrames = 0;
    }
    this._trackingStats.sumAngularError += angularError;

    this._prevOnTarget = this._isOnTarget;
    this._isOnTarget = onTarget;
  }

  /* ---------- Visual feedback ---------- */

  _updateTrackingFeedback(dt) {
    if (!this._trackingTarget || !this._glowMesh) return;

    var targetMesh = this._trackingTarget.mesh;
    var glowMesh = this._glowMesh;

    // Position glow ring at target location, billboarded to camera
    glowMesh.position.copy(targetMesh.position);
    if (this._camera) {
      var camPos = this._camera.position.clone();
      var localCamPos = targetMesh.worldToLocal(camPos);
      glowMesh.lookAt(localCamPos);
      // Convert back to world-space lookAt
      glowMesh.position.copy(targetMesh.position);
      glowMesh.lookAt(this._camera.position);
    }

    // Smoothly transition glow opacity based on crosshair position
    var targetOpacity = this._isOnTarget ? 0.35 : 0;
    var currentOpacity = glowMesh.material.opacity;
    var lerpSpeed = 8;
    glowMesh.material.opacity += (targetOpacity - currentOpacity) * Math.min(1, dt * lerpSpeed);
    glowMesh.visible = glowMesh.material.opacity > 0.01;

    // Subtle emissive boost when on target
    var targetEmissive = this._isOnTarget ? 1.0 : 0.6;
    var currentEmissive = targetMesh.material.emissiveIntensity;
    targetMesh.material.emissiveIntensity += (targetEmissive - currentEmissive) * Math.min(1, dt * lerpSpeed);
  }

  /* ---------- Override: update loop ---------- */

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    // Reuse parent's particle and weapon updates
    this._updateParticles(dt);
    this._updateWeapon(dt);

    // Move the target
    this._updateMovement(dt);

    // Track accuracy metrics (every frame while running)
    if (this.running && !this._targetFrozen) {
      this._updateTrackingMetrics();
    }

    // Update visual feedback
    this._updateTrackingFeedback(dt);

    // Update the tracking target visuals (fade in, billboard rings)
    if (this._trackingTarget && this._trackingTarget.alive) {
      var t = this._trackingTarget;
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

      // Subtle pulse on emissive (only the base pulse; on-target boost is in _updateTrackingFeedback)
      if (!this._isOnTarget) {
        var pulse = 0.5 + Math.sin(now * 0.005) * 0.1;
        t.mesh.material.emissiveIntensity = pulse;
      }
    }

    // Safety net: ensure tracking target exists
    if (this.running && !this._trackingTarget) {
      this._spawnMovingTarget();
    }
  }

  /* ---------- Override: fire handling (disabled — tracking is passive) ---------- */

  _tryFire() {
    // No shooting in Strafe Tracking. Clicks are ignored; the weapon is visible
    // but purely cosmetic. Score is earned entirely by keeping the crosshair on target.
  }

  /* ---------- Tracking stats export ---------- */

  // Flag so the gameplay page can detect this is a tracking-only mode
  get isTrackingMode() { return true; }

  // Returns the current tracking accuracy % (updated live each frame)
  getLiveTrackingAccuracy() {
    var ts = this._trackingStats;
    if (ts.totalSamples === 0) return 0;
    return Math.round((ts.onTargetSamples / ts.totalSamples) * 100);
  }

  getTrackingStats() {
    var ts = this._trackingStats;
    var totalSamples = Math.max(1, ts.totalSamples);
    var trackingAccuracy = Math.round((ts.onTargetSamples / totalSamples) * 100);
    var avgTrackingError = ts.totalSamples > 0
      ? (ts.sumAngularError / ts.totalSamples) * (180 / Math.PI) // convert to degrees
      : 0;
    // Convert best streak from frames to seconds (approximate at ~60fps)
    var bestStreakSec = Math.round(ts.bestStreakFrames / 60 * 10) / 10;

    return {
      trackingAccuracy: trackingAccuracy,
      timeOnTarget: trackingAccuracy, // same percentage
      avgTrackingError: Math.round(avgTrackingError * 10) / 10,
      bestTrackingStreak: bestStreakSec,
      bestTrackingStreakFrames: ts.bestStreakFrames,
    };
  }

  /* ---------- Override: progression indicator ---------- */

  getProgression() {
    // For tracking mode, progression = time on target ratio (how well the player is doing)
    if (this._trackingStats.totalSamples === 0) return 0;
    return this._trackingStats.onTargetSamples / this._trackingStats.totalSamples;
  }
};
