/* ============================================
   Peek Eliminate Renderer — 3D
   VALORANT-style angle-clearing exercise.
   Player peeks around cover with A/D, identifies
   enemies, and eliminates them before they shoot back.
   ============================================ */
VantageEngine.Renderers.PeekEliminateRenderer = class PeekEliminateRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  // ─── Peek Movement Constants ─────────────────────────
  static PEEK_MAX_OFFSET   = 2.8;   // max lateral offset from center
  static PEEK_SPEED        = 8.0;   // units/sec peek speed
  static PEEK_RETURN_SPEED = 10.0;  // units/sec return to center
  static PEEK_BOUNDARY_MIN = -3.5;  // min X offset (can't go through left cover)
  static PEEK_BOUNDARY_MAX = 3.5;   // max X offset (can't go through right cover)

  // Minimum scale for humanoid bots so they are always visible at training distances
  static BOT_MIN_SCALE = 1.8;

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // ─── Peek state ────────────────────────────────────
    this._peekOffsetX = 0;        // current lateral offset
    this._peekTargetX = 0;        // target offset (from input)
    this._keysDown = {};

    // ─── Round/lanes state ─────────────────────────────
    this._lanes = [];
    this._coverWalls = [];
    this._rounds = [];
    this._currentRound = 0;
    this._totalRounds = 5;
    this._reactionWindow = 2000;  // ms — time before penalty

    this._peeksPerformed = 0;
    this._targetsEliminated = 0;
    this._damageTaken = 0;
    this._eliminationTimes = [];  // ms from reveal to elimination (valid engagements only)
    this._totalExposureMs = 0;   // cumulative ms targets were visible

    this._roundActive = false;
    this._roundTargets = [];
    this._roundStartTime = 0;

    // ─── Scoring state (authoritative) ─────────────────
    this._totalTargetsSpawned = 0;
    this._missCount = 0;

    // ─── Timer management ──────────────────────────────
    this._pendingTimeouts = [];    // tracked setTimeout IDs for cancellation
    this._roundId = 0;             // monotonically increasing; invalidates stale callbacks
    this._pauseTime = 0;           // Date.now() when pause began (0 = not paused)
    this._pausedTotalMs = 0;       // accumulated paused duration for this session

    // ─── Difficulty settings ───────────────────────────
    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';

    if (diffId === 'easy') {
      this._totalRounds = 3;
      this._reactionWindow = 2500;
    } else if (diffId === 'hard') {
      this._totalRounds = 7;
      this._reactionWindow = 1000;
    } else {
      this._totalRounds = 5;
      this._reactionWindow = 1600;
    }

    // ─── Lane configuration ────────────────────────────
    this._lanePositions = [
      { x: -5, z: -14, coverX: -3, coverZ: -8, coverWidth: 1.2 },  // Left lane
      { x: 0,  z: -16, coverX: 0,  coverZ: -8, coverWidth: 1.2 },  // Center lane
      { x: 5,  z: -14, coverX: 3,  coverZ: -8, coverWidth: 1.2 },  // Right lane
    ];

    // ─── Bound handlers ────────────────────────────────
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);
  }

  init() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.init.call(this);
    this._buildCoverWalls();
  }

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._stopped = false;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._peeksPerformed = 0;
    this._targetsEliminated = 0;
    this._damageTaken = 0;
    this._eliminationTimes = [];
    this._totalExposureMs = 0;
    this._currentRound = 0;
    this._roundTargets = [];
    this._roundActive = false;
    this._peekOffsetX = 0;
    this._peekTargetX = 0;
    this._keysDown = {};
    this._totalTargetsSpawned = 0;
    this._missCount = 0;
    this._pendingTimeouts = [];
    this._roundId = 0;
    this._pauseTime = 0;
    this._pausedTotalMs = 0;

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    this._startNextRound();
    this._loop();
  }

  pause() {
    this._keysDown = {};
    this._peekTargetX = 0;
    this._pauseTime = Date.now();
    // Cancel all pending timeouts — they will not be re-created on resume
    // because the round state is frozen.
    this._cancelAllPendingTimeouts();
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    // Calculate how long we were paused
    var pausedMs = 0;
    if (this._pauseTime) {
      pausedMs = Date.now() - this._pauseTime;
      this._pausedTotalMs += pausedMs;
    }

    // Shift ALL time-dependent timestamps forward so elapsed-time calculations
    // (which use Date.now() - timestamp) remain correct after a pause.
    if (pausedMs > 0) {
      this._sessionStartTime += pausedMs;
      this._roundStartTime += pausedMs;
      for (var i = 0; i < this._roundTargets.length; i++) {
        var t = this._roundTargets[i];
        if (t.spawnTime) t.spawnTime += pausedMs;
        if (t.revealTime) t.revealTime += pausedMs;
      }
    }

    this._pauseTime = 0;

    // Prevent the parent from double-shifting timestamps and from spawning
    // its own single-target (we manage rounds ourselves).
    this._pauseStart = 0;

    // Determine round state before calling parent resume (which may call _spawnTarget)
    var aliveInRound = 0;
    var deadInRound = 0;
    for (var k = 0; k < this._roundTargets.length; k++) {
      if (this._roundTargets[k].alive) aliveInRound++;
      else deadInRound++;
    }
    var roundWasComplete = this._roundActive && aliveInRound === 0;

    // Temporarily override running to prevent parent's _spawnTarget from acting
    var wasRunning = this.running;
    this.running = false;

    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);

    // Restore running state
    this.running = wasRunning || true;

    // Remove any stray targets the parent may have spawned
    for (var j = this._targets.length - 1; j >= 0; j--) {
      if (this._roundTargets.indexOf(this._targets[j]) === -1) {
        var extra = this._targets[j];
        if (extra.mesh && extra.mesh.parent) extra.mesh.parent.remove(extra.mesh);
        this._targets.splice(j, 1);
      }
    }

    // Clean up dead targets whose removal timeouts were cancelled during pause
    for (var m = this._roundTargets.length - 1; m >= 0; m--) {
      var rt = this._roundTargets[m];
      if (!rt.alive && rt.hitAnim <= 0) {
        var idx = this._targets.indexOf(rt);
        if (idx !== -1) this._targets.splice(idx, 1);
        if (rt.mesh.parent) rt.mesh.parent.remove(rt.mesh);
        this._roundTargets.splice(m, 1);
      }
    }

    // Re-evaluate round completion: if the round was complete (or became complete
    // while dead targets were being cleaned), start the next round after a short delay.
    var aliveAfter = 0;
    for (var n = 0; n < this._roundTargets.length; n++) {
      if (this._roundTargets[n].alive) aliveAfter++;
    }
    if (this._roundActive && aliveAfter === 0) {
      // Round is complete — transition to next round
      this._roundActive = false;
      var capturedRoundId = this._roundId;
      var self = this;
      this._scheduleTimeout(function() {
        if (self._stopped) return;
        if (self._roundId !== capturedRoundId) return;
        self._startNextRound();
      }, 800);
    }
  }

  // Override parent's _spawnTarget to prevent it from spawning sphere targets
  // in PeekEliminate mode (we manage our own round-based spawning).
  _spawnTarget() {
    // No-op: PeekEliminate uses _spawnRoundTarget via _startNextRound
  }

  stop() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._cancelAllPendingTimeouts();
    this._clearRoundTargets();
    this._keysDown = {};
    this._pauseTime = 0;
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._coverWalls = [];
    this._roundTargets = [];
  }

  // ─── Timeout Management ──────────────────────────────

  _scheduleTimeout(fn, delayMs) {
    var id = setTimeout(fn, delayMs);
    this._pendingTimeouts.push(id);
    return id;
  }

  _cancelAllPendingTimeouts() {
    for (var i = 0; i < this._pendingTimeouts.length; i++) {
      clearTimeout(this._pendingTimeouts[i]);
    }
    this._pendingTimeouts = [];
  }

  // ─── Input Safety ────────────────────────────────────

  _handleBlur() {
    this._keysDown = {};
    this._peekTargetX = 0;
  }

  // ─── Key Handlers ────────────────────────────────────

  _handleKeyDown(ev) {
    if (this._paused || this._stopped || !this.running) return;
    var key = ev.key.toLowerCase();
    if (key === 'a' || key === 'd') {
      this._keysDown[key] = true;
      this._updatePeekTarget();
    }
  }

  _handleKeyUp(ev) {
    if (this._paused || this._stopped || !this.running) return;
    var key = ev.key.toLowerCase();
    if (key === 'a' || key === 'd') {
      this._keysDown[key] = false;
      this._updatePeekTarget();
    }
  }

  _updatePeekTarget() {
    var left = !!this._keysDown['a'];
    var right = !!this._keysDown['d'];

    if (left && !right) {
      this._peekTargetX = -this.constructor.PEEK_MAX_OFFSET;
    } else if (right && !left) {
      this._peekTargetX = this.constructor.PEEK_MAX_OFFSET;
    } else {
      this._peekTargetX = 0;
    }
  }

  // ─── Peek Movement ───────────────────────────────────

  _updatePeekMovement(dt) {
    var C = this.constructor;
    var diff = this._peekTargetX - this._peekOffsetX;

    if (Math.abs(diff) > 0.01) {
      var speed = (this._peekTargetX === 0) ? C.PEEK_RETURN_SPEED : C.PEEK_SPEED;
      var step = speed * dt;
      if (step > Math.abs(diff)) step = Math.abs(diff);
      this._peekOffsetX += Math.sign(diff) * step;
    } else {
      this._peekOffsetX = this._peekTargetX;
    }

    // Clamp to boundaries
    this._peekOffsetX = Math.max(C.PEEK_BOUNDARY_MIN, Math.min(C.PEEK_BOUNDARY_MAX, this._peekOffsetX));

    // Update camera position
    if (this._camera) {
      this._camera.position.x = this._peekOffsetX;
    }
  }

  // ─── Cover and Visibility ────────────────────────────

  _buildCoverWalls() {
    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3e,
      roughness: 0.85,
      metalness: 0.1,
    });

    for (var i = 0; i < this._lanePositions.length; i++) {
      var lane = this._lanePositions[i];
      var wallGeo = new THREE.BoxGeometry(lane.coverWidth, 4, 0.5);
      var wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(lane.coverX, 2, lane.coverZ);
      wall.userData.isCover = true;
      this._scene.add(wall);
      this._coverWalls.push(wall);

      // Trim for visual clarity
      var trimGeo = new THREE.BoxGeometry(lane.coverWidth + 0.1, 0.1, 0.55);
      var trimMat = new THREE.MeshStandardMaterial({ color: 0x555558, roughness: 0.7, metalness: 0.2 });
      var topTrim = new THREE.Mesh(trimGeo, trimMat);
      topTrim.position.set(lane.coverX, 4.05, lane.coverZ);
      this._scene.add(topTrim);
      var botTrim = new THREE.Mesh(trimGeo, trimMat);
      botTrim.position.set(lane.coverX, 0.05, lane.coverZ);
      this._scene.add(botTrim);
    }
  }

  _isTargetVisible(target) {
    if (!this._camera) return false;

    var lane = this._lanePositions[target.laneIdx];
    var camPos = this._camera.position.clone();
    var targetPos = new THREE.Vector3(lane.x, 1.7, lane.z);

    // Direction from camera to target
    var direction = new THREE.Vector3().subVectors(targetPos, camPos).normalize();
    var distance = camPos.distanceTo(targetPos);

    // Raycast from camera toward target
    this._raycaster.set(camPos, direction);
    this._raycaster.far = distance;

    // Check if ray hits any cover wall before reaching target
    var coverIntersects = this._raycaster.intersectObjects(this._coverWalls, false);

    // If ray hits cover before reaching target, target is not visible
    if (coverIntersects.length > 0 && coverIntersects[0].distance < distance - 0.1) {
      return false;
    }

    return true;
  }

  // ─── Round Management ────────────────────────────────

  _startNextRound() {
    if (!this.running || this._stopped) return;
    this._currentRound++;
    if (this._currentRound > this._totalRounds) {
      this.running = false;
      return;
    }

    // Increment round ID to invalidate any stale callbacks from previous rounds
    this._roundId++;

    this._clearRoundTargets();
    this._roundActive = true;
    this._roundStartTime = Date.now();

    var numTargets = 1 + Math.floor(Math.random() * 2);
    var usedLanes = [];
    var capturedRoundId = this._roundId;
    var self = this;

    for (var i = 0; i < numTargets; i++) {
      var laneIdx;
      do {
        laneIdx = Math.floor(Math.random() * this._lanePositions.length);
      } while (usedLanes.indexOf(laneIdx) !== -1 && usedLanes.length < this._lanePositions.length);
      usedLanes.push(laneIdx);

      var lane = this._lanePositions[laneIdx];
      var delay = i === 0 ? 0 : 400 + Math.random() * 600;

      (function(li, ln, d) {
        self._scheduleTimeout(function() {
          // Validate this callback is still for the current round
          if (!self.running || self._stopped) return;
          if (self._roundId !== capturedRoundId) return;
          self._spawnRoundTarget(li, ln);
        }, d);
      })(laneIdx, lane, delay);
    }
  }

  _spawnRoundTarget(laneIdx, lane) {
    if (!this.running || this._stopped) return;

    var radius = this.targetBaseRadius;
    var botGroup = this._buildHumanoidBot(radius);
    botGroup.position.set(lane.x, 0, lane.z);
    this._scene.add(botGroup);

    var target = {
      mesh: botGroup,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      scored: false,         // ensures one enemy awards points only once
      opacity: 0,
      hitAnim: 0,
      laneIdx: laneIdx,
      revealed: false,
      revealTime: 0,
      penaltyApplied: false,
    };

    this._roundTargets.push(target);
    this._targets.push(target);
    this._totalTargetsSpawned++;
  }

  _clearRoundTargets() {
    for (var i = 0; i < this._roundTargets.length; i++) {
      var t = this._roundTargets[i];
      var idx = this._targets.indexOf(t);
      if (idx !== -1) this._targets.splice(idx, 1);
      if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
      t.mesh.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(function(m) { m.dispose(); });
          else child.material.dispose();
        }
      });
    }
    this._roundTargets = [];
  }

  _checkRoundComplete() {
    var aliveCount = 0;
    for (var i = 0; i < this._roundTargets.length; i++) {
      if (this._roundTargets[i].alive) aliveCount++;
    }
    if (aliveCount === 0 && this._roundActive) {
      this._roundActive = false;
      var capturedRoundId = this._roundId;
      var self = this;
      this._scheduleTimeout(function() {
        if (self._stopped) return;
        // Only proceed if this is still the same round
        if (self._roundId !== capturedRoundId) return;
        self._startNextRound();
      }, 1200);
    }
  }

  // ─── Shooting ────────────────────────────────────────

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    this._applyShotSpread();

    // Collect meshes from alive targets (revealed or not — they exist in the world)
    // But only revealed targets should be hittable (player must peek to see them)
    var allMeshes = [];
    var meshToTarget = new Map();

    for (var i = 0; i < this._roundTargets.length; i++) {
      var target = this._roundTargets[i];
      if (!target.alive || !target.revealed) continue;

      target.mesh.traverse(function(child) {
        if (child.isMesh) {
          allMeshes.push(child);
          meshToTarget.set(child, target);
        }
      });
    }

    // Also check cover walls to prevent shooting through them
    var coverMeshes = this._coverWalls.slice();
    var allShootable = allMeshes.concat(coverMeshes);

    var intersects = this._raycaster.intersectObjects(allShootable, false);

    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;

      // Check if we hit cover first
      if (coverMeshes.indexOf(hitObj) !== -1) {
        // Hit cover — counts as a miss
        this._missCount++;
        if (this._onMiss) this._onMiss();
        return;
      }

      var target = meshToTarget.get(hitObj);

      if (target && target.alive && !target.scored) {
        // Mark as scored IMMEDIATELY to prevent double-awarding
        target.scored = true;
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsEliminated++;

        this._createHitParticles(target.mesh.position.clone());

        if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
          VantageEngine.Audio.playKillSound();
        }

        // Reaction time = ms from when enemy became visible until this hit
        // Uses revealTime (when enemy first became visible to the player)
        var reactionTimeMs = now - (target.revealTime || target.spawnTime);
        this._eliminationTimes.push(reactionTimeMs);

        if (this._onHit) this._onHit(reactionTimeMs);
        hit = true;

        var self = this;
        var capturedRoundId = this._roundId;
        this._scheduleTimeout(function() {
          if (self._stopped) return;
          // Only remove if still in the same round context
          var idx = self._targets.indexOf(target);
          if (idx !== -1) self._targets.splice(idx, 1);
          var rIdx = self._roundTargets.indexOf(target);
          if (rIdx !== -1) self._roundTargets.splice(rIdx, 1);
          if (target.mesh.parent) target.mesh.parent.remove(target.mesh);
          target.mesh.traverse(function(child) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) child.material.forEach(function(m) { m.dispose(); });
              else child.material.dispose();
            }
          });

          self._checkRoundComplete();
        }, 200);
      } else if (target && !target.alive) {
        // Shot hit an already-eliminated target — count as miss, no points
        this._missCount++;
        if (this._onMiss) this._onMiss();
      }
    }

    if (!hit) {
      this._missCount++;
      if (this._onMiss) this._onMiss();
    }
  }

  // ─── Update Loop ─────────────────────────────────────

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    // Update peek movement
    this._updatePeekMovement(dt);

    this._updateParticles(dt);
    this._updateWeapon(dt);

    // Update targets
    for (var i = 0; i < this._roundTargets.length; i++) {
      var t = this._roundTargets[i];

      if (t.alive) {
        // Check visibility based on peek position
        var visible = this._isTargetVisible(t);
        if (visible && !t.revealed) {
          t.revealed = true;
          t.revealTime = now;
          this._peeksPerformed++;
        }

        // Fade in
        t.opacity = Math.min(1, t.opacity + dt * 8);
        var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;

        if (t.mesh.userData.materials) {
          for (var j = 0; j < t.mesh.userData.materials.length; j++) {
            t.mesh.userData.materials[j].opacity = easedOpacity;
          }
        }

        // Face the player
        if (this._camera) {
          var camPos = this._camera.position.clone();
          var botPos = t.mesh.position.clone();
          var direction = new THREE.Vector3().subVectors(camPos, botPos);
          direction.y = 0;
          var angle = Math.atan2(direction.x, direction.z);
          t.mesh.rotation.y = angle;
        }

        // Check reaction window penalty
        if (t.revealed && !t.penaltyApplied) {
          var elapsed = now - t.revealTime;
          if (elapsed > this._reactionWindow) {
            t.penaltyApplied = true;
            this._damageTaken++;
          }
        }

        // Track total exposure time (ms this frame the target was visible)
        if (t.revealed) {
          this._totalExposureMs += dt * 1000;
        }
      } else {
        // Hit animation
        t.hitAnim -= dt * 6;
        if (t.hitAnim > 0) {
          if (t.hitAnim > 0.8) {
            var flash = (1 - t.hitAnim) / 0.2;
            t.mesh.scale.setScalar(1 + flash * 0.4);
            if (t.mesh.userData.materials) {
              for (var j = 0; j < t.mesh.userData.materials.length; j++) {
                var mat = t.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 0.3 + flash * 3;
                mat.opacity = 1;
              }
            }
          } else if (t.hitAnim > 0.5) {
            var transition = (0.8 - t.hitAnim) / 0.3;
            t.mesh.scale.setScalar(1.4 - transition * 0.3);
            if (t.mesh.userData.materials) {
              for (var j = 0; j < t.mesh.userData.materials.length; j++) {
                var mat = t.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 3 - transition * 2;
              }
            }
          } else {
            var shrink = t.hitAnim / 0.5;
            t.mesh.scale.setScalar(shrink * 1.1);
            if (t.mesh.userData.materials) {
              for (var j = 0; j < t.mesh.userData.materials.length; j++) {
                t.mesh.userData.materials[j].opacity = shrink * 0.6;
              }
            }
          }
        }
      }
    }
  }

  // ─── Humanoid Bot Builder ────────────────────────────
  // Targets are scaled to be clearly visible at 14-16 unit distance.
  // The scale ensures a minimum on-screen size suitable for FPS training.
  // Hitboxes match the visible geometry exactly.

  _buildHumanoidBot(radius) {
    var group = new THREE.Group();

    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0xff2222,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });

    var headMat = new THREE.MeshStandardMaterial({
      color: 0xffdddd,
      emissive: 0xff4444,
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });

    var accentMat = new THREE.MeshStandardMaterial({
      color: 0xaa2222,
      emissive: 0xaa2222,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.7,
      transparent: true,
      opacity: 0,
    });

    var visorMat = new THREE.MeshBasicMaterial({
      color: 0xff6666,
      transparent: true,
      opacity: 0,
    });

    // Use the larger of the radius-based scale or a minimum scale
    // so targets are always visible at training distances.
    var scale = Math.max(this.constructor.BOT_MIN_SCALE, radius / 0.2);

    // ── Head (distinct sphere) ──
    var headGeo = new THREE.SphereGeometry(0.22 * scale, 16, 16);
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.0 * scale;
    head.userData.hitZone = 'head';
    group.add(head);

    // ── Visor (bright strip across the face) ──
    var visorGeo = new THREE.BoxGeometry(0.30 * scale, 0.07 * scale, 0.06 * scale);
    var visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.0 * scale, -0.18 * scale);
    visor.userData.hitZone = 'head';
    group.add(visor);

    // ── Neck ──
    var neckGeo = new THREE.CylinderGeometry(0.08 * scale, 0.10 * scale, 0.12 * scale, 8);
    var neck = new THREE.Mesh(neckGeo, bodyMat);
    neck.position.y = 0.82 * scale;
    neck.userData.hitZone = 'body';
    group.add(neck);

    // ── Torso (large box — primary aim area) ──
    var torsoGeo = new THREE.BoxGeometry(0.50 * scale, 0.55 * scale, 0.30 * scale);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.50 * scale;
    torso.userData.hitZone = 'body';
    group.add(torso);

    // ── Chest accent plate ──
    var chestAccentGeo = new THREE.BoxGeometry(0.52 * scale, 0.10 * scale, 0.32 * scale);
    var chestAccent = new THREE.Mesh(chestAccentGeo, accentMat);
    chestAccent.position.y = 0.60 * scale;
    chestAccent.userData.hitZone = 'body';
    group.add(chestAccent);

    // ── Shoulders ──
    var shoulderGeo = new THREE.SphereGeometry(0.12 * scale, 12, 12);
    var leftShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    leftShoulder.position.set(-0.30 * scale, 0.72 * scale, 0);
    leftShoulder.userData.hitZone = 'body';
    group.add(leftShoulder);

    var rightShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    rightShoulder.position.set(0.30 * scale, 0.72 * scale, 0);
    rightShoulder.userData.hitZone = 'body';
    group.add(rightShoulder);

    // ── Arms ──
    var armGeo = new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.45 * scale, 8);
    var leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.34 * scale, 0.45 * scale, 0);
    leftArm.userData.hitZone = 'body';
    group.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.34 * scale, 0.45 * scale, 0);
    rightArm.userData.hitZone = 'body';
    group.add(rightArm);

    // ── Hips ──
    var hipsGeo = new THREE.BoxGeometry(0.40 * scale, 0.18 * scale, 0.26 * scale);
    var hips = new THREE.Mesh(hipsGeo, bodyMat);
    hips.position.y = 0.18 * scale;
    hips.userData.hitZone = 'body';
    group.add(hips);

    // ── Legs ──
    var legGeo = new THREE.CylinderGeometry(0.09 * scale, 0.09 * scale, 0.55 * scale, 8);
    var leftLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.14 * scale, -0.22 * scale, 0);
    leftLeg.userData.hitZone = 'body';
    group.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, bodyMat);
    rightLeg.position.set(0.14 * scale, -0.22 * scale, 0);
    rightLeg.userData.hitZone = 'body';
    group.add(rightLeg);

    group.userData.materials = [bodyMat, headMat, accentMat, visorMat];

    return group;
  }

  // ─── Stats and Progression ───────────────────────────
  // Returns the authoritative stats object used by the scoring pipeline.
  // All fields needed by calculatePeekEliminateScore are included here.

  getPeekEliminateStats() {
    var avgElimTime = 0;
    if (this._eliminationTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._eliminationTimes.length; i++) sum += this._eliminationTimes[i];
      avgElimTime = Math.round(sum / this._eliminationTimes.length);
    }

    var hits = this._hitCount;
    var misses = this._missCount;
    var totalTargets = this._totalTargetsSpawned;

    return {
      peeksPerformed: this._peeksPerformed,
      targetsEliminated: this._targetsEliminated,
      avgTimeToEliminate: avgElimTime,
      avgEliminationTime: avgElimTime,  // alias for backward compatibility
      damageTaken: this._damageTaken,
      totalExposureTime: Math.round(this._totalExposureMs),
      roundsCompleted: Math.min(this._currentRound, this._totalRounds),
      totalRounds: this._totalRounds,
      totalTargets: totalTargets,
      hits: hits,
      misses: misses,
      avgReactionTime: avgElimTime,
    };
  }

  getProgression() {
    if (!this._sessionStartTime) return 0;
    var hits = this._hitCount;
    var totalShots = hits + this._missCount;
    if (totalShots === 0) return 0;
    return hits / totalShots;
  }

  isScenarioComplete() {
    return !this.running && this._currentRound > this._totalRounds;
  }
};
