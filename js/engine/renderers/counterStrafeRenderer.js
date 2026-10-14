/* ============================================
   Counter Strafe Renderer — 3D
   Extends ThreeArenaRenderer. Full WASD movement
   with real velocity-based physics. Movement is
   relative to the player's viewing direction.
   Counter-strafing (pressing opposite direction)
   decelerates and reverses movement. Shots while
   moving have spread penalty proportional to speed.
   Accuracy recovers only after the player has
   physically decelerated to a stop.
   ============================================ */
VantageEngine.Renderers.CounterStrafeRenderer = class CounterStrafeRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  // ─── Movement Physics Constants ──────────────────────
  static MOVE_MAX_SPEED     = 5.5;   // units/sec max strafe speed
  static MOVE_ACCEL         = 45.0;  // units/sec² acceleration when key held
  static MOVE_DECEL         = 35.0;  // units/sec² natural deceleration (no key)
  static MOVE_COUNTER_DECEL = 70.0;  // units/sec² counter-strafe deceleration
  static MOVE_STOP_THRESHOLD = 0.15; // below this speed = "stopped"
  static MOVE_BOUNDARY      = 12.0;  // max radial offset from arena center
  static CAMERA_BASE_Y      = 1.7;   // eye height
  static MOVE_BOB_AMOUNT    = 0.018; // subtle vertical bob while moving
  static MOVE_BOB_SPEED     = 10.0;  // bob oscillation frequency

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // ─── 2D movement state (world-space) ───────────────
    this._velX = 0;            // world-space velocity X
    this._velZ = 0;            // world-space velocity Z
    this._playerOffsetX = 0;   // world-space position offset X
    this._playerOffsetZ = 0;   // world-space position offset Z
    this._moveBobPhase = 0;    // phase accumulator for camera bob

    // ─── Key tracking ──────────────────────────────────
    this._keysDown = {};

    // ─── State labels (derived from velocity) ──────────
    this._moveState = 'stopped';
    this._moveDirection = 0;
    this._settlingUntil = 0;
    this._settlingDuration = 150;

    // ─── Shot statistics ───────────────────────────────
    this._shotsFired = 0;
    this._shotsWhileMoving = 0;
    this._shotsWhileStopped = 0;
    this._hitsWhileMoving = 0;
    this._hitsWhileStopped = 0;
    this._counterStrafeHits = 0;
    this._lastStopTime = 0;
    this._counterStrafeWindow = 500;

    // ─── Spread tuning ─────────────────────────────────
    this._movingSpreadDeg = 4.5;
    this._settlingSpreadDeg = 2.0;
    this._stoppedSpreadDeg = 0;

    // ─── Crosshair indicator ───────────────────────────
    this._crosshairEl = null;

    // ─── Bound handlers ────────────────────────────────
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onBlur = this._handleBlur.bind(this);

    // ─── Time limit from difficulty ────────────────────
    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';
    this._timeLimit = diffId === 'easy' ? 90000 : diffId === 'hard' ? 45000 : 60000;
  }

  init() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.init.call(this);
    this._createCrosshairIndicator();
  }

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._shotsFired = 0;
    this._shotsWhileMoving = 0;
    this._shotsWhileStopped = 0;
    this._hitsWhileMoving = 0;
    this._hitsWhileStopped = 0;
    this._counterStrafeHits = 0;
    this._moveState = 'stopped';
    this._moveDirection = 0;
    this._settlingUntil = 0;
    this._keysDown = {};
    this._lastStopTime = 0;

    // Reset movement physics
    this._velX = 0;
    this._velZ = 0;
    this._playerOffsetX = 0;
    this._playerOffsetZ = 0;
    this._moveBobPhase = 0;
    this._resetCameraPosition();

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this._spawnTarget();
    this._loop();
  }

  pause() {
    // Clear movement input so resuming doesn't carry stale key states
    this._clearMovementInput();
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._removeCrosshairIndicator();
    this._clearMovementInput();
    this._resetCameraPosition();
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
  }

  // ─── Input Safety ──────────────────────────────────────

  _clearMovementInput() {
    this._keysDown = {};
    this._velX = 0;
    this._velZ = 0;
  }

  _handleBlur() {
    // Window lost focus — release all keys to prevent stuck movement
    this._clearMovementInput();
  }

  // ─── Camera Position Management ────────────────────────

  _resetCameraPosition() {
    if (this._camera) {
      this._camera.position.set(0, this.constructor.CAMERA_BASE_Y, 0);
    }
  }

  // ─── Key Handlers ──────────────────────────────────────

  _handleKeyDown(ev) {
    if (this._paused || this._stopped || !this.running) return;
    var key = ev.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      this._keysDown[key] = true;
    }
  }

  _handleKeyUp(ev) {
    if (this._paused || this._stopped || !this.running) return;
    var key = ev.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      this._keysDown[key] = false;
    }
  }

  // ─── Movement Physics ──────────────────────────────────
  // Full 2D WASD movement relative to the player's view direction.
  // Called every frame from _update().
  //
  // 1. Read WASD keys → compute wish direction in camera-relative XZ
  // 2. Normalize wish direction (prevents faster diagonals)
  // 3. Transform wish direction to world space using _yaw
  // 4. Apply acceleration / counter-strafe / deceleration to world velocity
  // 5. Integrate velocity into world position
  // 6. Clamp position to arena boundary
  // 7. Update camera position

  _updateMovement(dt) {
    var C = this.constructor;
    var forward = !!this._keysDown['w'];
    var left    = !!this._keysDown['a'];
    var back    = !!this._keysDown['s'];
    var right   = !!this._keysDown['d'];

    // ── Step 1: Compute wish direction in camera space ──
    // Camera-relative: forward = -Z, right = +X
    var wishX = 0; // camera-right component
    var wishZ = 0; // camera-forward component

    if (forward) wishZ -= 1;
    if (back)    wishZ += 1;
    if (left)    wishX -= 1;
    if (right)   wishX += 1;

    // ── Step 2: Normalize (prevents faster diagonals) ───
    var wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
    var hasInput = wishLen > 0.001;
    if (hasInput) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    // ── Step 3: Transform wish direction to world space ──
    // Camera yaw: _yaw is the horizontal look angle.
    // World forward (where camera looks, projected to XZ): (-sin(yaw), 0, -cos(yaw))
    // World right: (cos(yaw), 0, -sin(yaw))
    // World wish = wishX * right + (-wishZ) * forward
    //   because wishZ is in camera-forward which is -Z in camera space
    var yaw = this._yaw;
    var cosY = Math.cos(yaw);
    var sinY = Math.sin(yaw);

    // Right vector in world XZ: (cosY, 0, -sinY)
    // Forward vector in world XZ: (-sinY, 0, -cosY)
    // wishX is along right, wishZ is along forward (negative Z in cam space = forward)
    var worldWishX = wishX * cosY + (-wishZ) * (-sinY);
    var worldWishZ = wishX * (-sinY) + (-wishZ) * (-cosY);

    // ── Step 4: Apply physics to world-space velocity ───
    var prevSpeed = Math.sqrt(this._velX * this._velX + this._velZ * this._velZ);

    if (hasInput) {
      // Desired velocity along wish direction
      var targetVx = worldWishX * C.MOVE_MAX_SPEED;
      var targetVz = worldWishZ * C.MOVE_MAX_SPEED;

      // Check if input opposes current velocity (counter-strafe)
      var dot = worldWishX * this._velX + worldWishZ * this._velZ;
      var isCounterStrafe = dot < -0.1 && prevSpeed > C.MOVE_STOP_THRESHOLD;

      var accel = isCounterStrafe ? C.MOVE_COUNTER_DECEL : C.MOVE_ACCEL;

      // Accelerate velocity toward target
      var dvx = targetVx - this._velX;
      var dvz = targetVz - this._velZ;
      var dLen = Math.sqrt(dvx * dvx + dvz * dvz);

      if (dLen > 0.001) {
        var step = accel * dt;
        if (step > dLen) step = dLen; // don't overshoot
        this._velX += (dvx / dLen) * step;
        this._velZ += (dvz / dLen) * step;
      }
    } else {
      // No input — decelerate toward zero
      var speed = Math.sqrt(this._velX * this._velX + this._velZ * this._velZ);
      if (speed > C.MOVE_STOP_THRESHOLD) {
        var decelStep = C.MOVE_DECEL * dt;
        if (decelStep >= speed) {
          this._velX = 0;
          this._velZ = 0;
        } else {
          this._velX -= (this._velX / speed) * decelStep;
          this._velZ -= (this._velZ / speed) * decelStep;
        }
      } else if (speed > 0.001) {
        this._velX = 0;
        this._velZ = 0;
      }
    }

    // ── Step 5: Integrate position ──────────────────────
    this._playerOffsetX += this._velX * dt;
    this._playerOffsetZ += this._velZ * dt;

    // ── Step 6: Clamp to arena boundary ─────────────────
    var dist = Math.sqrt(
      this._playerOffsetX * this._playerOffsetX +
      this._playerOffsetZ * this._playerOffsetZ
    );
    if (dist > C.MOVE_BOUNDARY) {
      var scale = C.MOVE_BOUNDARY / dist;
      this._playerOffsetX *= scale;
      this._playerOffsetZ *= scale;

      // Kill velocity component pointing outward
      var nx = this._playerOffsetX / C.MOVE_BOUNDARY;
      var nz = this._playerOffsetZ / C.MOVE_BOUNDARY;
      var velDot = this._velX * nx + this._velZ * nz;
      if (velDot > 0) {
        this._velX -= nx * velDot;
        this._velZ -= nz * velDot;
      }
    }

    // ── Step 7: Update camera position ──────────────────
    var curSpeed = Math.sqrt(this._velX * this._velX + this._velZ * this._velZ);
    var now = Date.now();

    // Detect when the player has just stopped
    var wasMoving = prevSpeed > C.MOVE_STOP_THRESHOLD;
    var isNowStopped = curSpeed <= C.MOVE_STOP_THRESHOLD;
    if (wasMoving && isNowStopped) {
      this._lastStopTime = now;
      this._settlingUntil = now + this._settlingDuration;
    }

    if (this._camera) {
      this._camera.position.x = this._playerOffsetX;
      this._camera.position.z = this._playerOffsetZ;

      // Subtle vertical bob while moving
      if (curSpeed > C.MOVE_STOP_THRESHOLD) {
        var speedFrac = curSpeed / C.MOVE_MAX_SPEED;
        this._moveBobPhase += dt * C.MOVE_BOB_SPEED * (speedFrac + 0.5);
        var bobY = Math.sin(this._moveBobPhase) * C.MOVE_BOB_AMOUNT * speedFrac;
        this._camera.position.y = C.CAMERA_BASE_Y + bobY;
      } else {
        // Smoothly return to base height
        this._camera.position.y += (C.CAMERA_BASE_Y - this._camera.position.y) * Math.min(1, dt * 12);
        this._moveBobPhase = 0;
      }
    }

    // Update state labels
    this._updateMoveStateFromVelocity(now, curSpeed);
  }

  _updateMoveStateFromVelocity(now, speed) {
    var C = this.constructor;
    if (speed > C.MOVE_STOP_THRESHOLD) {
      this._moveState = 'moving';
    } else if (now < this._settlingUntil) {
      this._moveState = 'stopped';
    } else {
      this._moveState = 'stopped';
    }
  }

  // ─── Spread & State (velocity-based) ───────────────────

  _getSpeed() {
    return Math.sqrt(this._velX * this._velX + this._velZ * this._velZ);
  }

  _getCurrentSpread() {
    var speed = this._getSpeed();
    var C = this.constructor;

    if (speed <= C.MOVE_STOP_THRESHOLD) {
      var now = Date.now();
      if (now < this._settlingUntil) return this._settlingSpreadDeg;
      return this._stoppedSpreadDeg;
    }

    // Interpolate spread linearly from settling to max based on speed fraction
    var speedFraction = Math.min(1, speed / C.MOVE_MAX_SPEED);
    return this._settlingSpreadDeg + (this._movingSpreadDeg - this._settlingSpreadDeg) * speedFraction;
  }

  _getEffectiveMoveState() {
    var speed = this._getSpeed();
    var C = this.constructor;
    var now = Date.now();

    if (speed > C.MOVE_STOP_THRESHOLD) return 'moving';
    if (now < this._settlingUntil) return 'settling';
    return 'stopped';
  }

  // ─── Crosshair Indicator ───────────────────────────────

  _createCrosshairIndicator() {
    if (!this.canvas || !this.canvas.parentElement) return;
    var el = document.createElement('div');
    el.className = 'cs-crosshair-indicator';
    el.style.position = 'absolute';
    el.style.bottom = '12%';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '999';
    el.style.fontFamily = 'Arial, sans-serif';
    el.style.fontSize = '11px';
    el.style.fontWeight = '600';
    el.style.letterSpacing = '1px';
    el.style.textTransform = 'uppercase';
    el.style.color = '#00ff88';
    el.style.textShadow = '0 0 6px rgba(0,255,136,0.5)';
    el.style.transition = 'color 0.15s, text-shadow 0.15s';
    el.textContent = 'STABLE';
    this.canvas.parentElement.appendChild(el);
    this._crosshairEl = el;
  }

  _removeCrosshairIndicator() {
    if (this._crosshairEl && this._crosshairEl.parentElement) {
      this._crosshairEl.parentElement.removeChild(this._crosshairEl);
    }
    this._crosshairEl = null;
  }

  _updateCrosshairIndicator() {
    if (!this._crosshairEl) return;
    var state = this._getEffectiveMoveState();
    if (state === 'moving') {
      this._crosshairEl.textContent = 'MOVING';
      this._crosshairEl.style.color = '#ff4444';
      this._crosshairEl.style.textShadow = '0 0 6px rgba(255,68,68,0.5)';
    } else if (state === 'settling') {
      this._crosshairEl.textContent = 'SETTLING';
      this._crosshairEl.style.color = '#ffaa00';
      this._crosshairEl.style.textShadow = '0 0 6px rgba(255,170,0,0.5)';
    } else {
      this._crosshairEl.textContent = 'STABLE';
      this._crosshairEl.style.color = '#00ff88';
      this._crosshairEl.style.textShadow = '0 0 6px rgba(0,255,136,0.5)';
    }
  }

  // ─── Target Spawning ───────────────────────────────────

  _generateTargetPosition() {
    var distance = 6 + Math.random() * 12;
    var angle = (Math.random() - 0.5) * Math.PI * 0.8;
    var height = 0.8 + Math.random() * 2.5;

    var x = Math.sin(angle) * distance;
    var z = -Math.cos(angle) * distance;

    var half = VantageEngine.Renderers.ThreeArenaRenderer.ARENA_HALF;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    height = Math.max(VantageEngine.Renderers.ThreeArenaRenderer.ARENA_MIN_Y, Math.min(VantageEngine.Renderers.ThreeArenaRenderer.ARENA_MAX_Y, height));

    return { x: x, y: height, z: z, distance: distance, angle: angle };
  }

  _spawnTarget() {
    if (!this.running) return;

    var aliveCount = this._targets.filter(function(t) { return t.alive; }).length;
    if (aliveCount > 0) return;

    this._clearAliveTargets();

    var pos = this._generateTargetPosition();
    this._lastTargetPos = { x: pos.x, z: pos.z };
    this._spawnPending = false;

    var radius = this.targetBaseRadius;

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

    var coreGeo = new THREE.SphereGeometry(radius * 0.4, 16, 16);
    var coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    var core = new THREE.Mesh(coreGeo, coreMat);
    targetMesh.add(core);

    var ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.7, 48);
    var ringMat = new THREE.MeshBasicMaterial({
      color: this._targetColor, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    targetMesh.add(ring);

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

  // ─── Shooting ──────────────────────────────────────────

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    this._shotsFired++;
    var effectiveState = this._getEffectiveMoveState();
    if (effectiveState === 'moving') {
      this._shotsWhileMoving++;
    } else {
      this._shotsWhileStopped++;
    }

    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);

    var spread = this._getCurrentSpread();
    if (spread > 0.001) {
      var spreadRad = spread * Math.PI / 180 * Math.sqrt(Math.random());
      var spreadAngle = Math.random() * Math.PI * 2;
      var dir = new THREE.Vector3(0, 0, -1);
      dir.applyEuler(new THREE.Euler(Math.sin(spreadAngle) * spreadRad, Math.cos(spreadAngle) * spreadRad, 0, 'YXZ'));
      dir.applyQuaternion(this._camera.quaternion).normalize();
      this._raycaster.ray.direction.copy(dir);
    }

    this._applyShotSpread();

    var meshes = this._targets.filter(function(t) { return t.alive; }).map(function(t) { return t.mesh; });
    var intersects = meshes.length > 0 ? this._raycaster.intersectObjects(meshes, false) : [];

    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    if (meshes.length === 0) return;

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      while (hitObj.parent && hitObj.parent !== this._scene) {
        hitObj = hitObj.parent;
      }
      var self = this;
      var target = this._targets.find(function(t) { return t.mesh === hitObj && t.alive; });
      if (target) {
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;

        if (effectiveState === 'moving') {
          this._hitsWhileMoving++;
        } else {
          this._hitsWhileStopped++;
          if (this._lastStopTime > 0 && (now - this._lastStopTime) <= this._counterStrafeWindow) {
            this._counterStrafeHits++;
          }
        }

        this._createHitParticles(target.mesh.position.clone());

        if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
          VantageEngine.Audio.playKillSound();
        }

        var reactionTime = now - target.spawnTime;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        clearTimeout(this._spawnTimer);
        var spawnDelay = 200 / this._speedMult;
        this._spawnPending = true;
        this._spawnTimer = setTimeout(function() {
          self._spawnPending = false;
          self._spawnTarget();
        }, spawnDelay);
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  // ─── Per-Frame Update ──────────────────────────────────

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    // Update player movement physics (moves the camera in 3D space)
    this._updateMovement(dt);

    this._updateParticles(dt);
    this._updateWeapon(dt);
    this._updateCrosshairIndicator();

    if (this.running && !this._spawnPending) {
      var aliveCount = this._targets.filter(function(t) { return t.alive; }).length;
      if (aliveCount === 0) {
        this._spawnTarget();
      }
    }

    var toRemove = [];

    for (var i = 0; i < this._targets.length; i++) {
      var t = this._targets[i];
      if (t.alive) {
        t.opacity = Math.min(1, t.opacity + dt * 8);
        var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;
        t.mesh.material.opacity = easedOpacity;
        t.core.material.opacity = easedOpacity * 0.9;
        t.ring.material.opacity = easedOpacity * 0.7;
        if (t.innerRing) t.innerRing.material.opacity = easedOpacity * 0.5;

        if (this._camera) {
          var camPos = this._camera.position.clone();
          var localCamPos = t.mesh.worldToLocal(camPos);
          t.ring.lookAt(localCamPos);
          if (t.innerRing) t.innerRing.lookAt(localCamPos);
        }

        var bobSpeed = 0.0025;
        var bobAmount = 0.05;
        t.mesh.position.y = t.baseY + Math.sin(now * bobSpeed + t.spawnTime * 0.001) * bobAmount;

        var pulse = 0.5 + Math.sin(now * 0.005) * 0.1;
        t.mesh.material.emissiveIntensity = pulse;
      } else {
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

    for (var j = 0; j < toRemove.length; j++) {
      var idx = this._targets.indexOf(toRemove[j]);
      if (idx !== -1) this._targets.splice(idx, 1);
      this._disposeTarget(toRemove[j]);
    }
  }

  // ─── Stats & Progression ───────────────────────────────

  getCounterStrafeStats() {
    var accuracyMoving = this._shotsWhileMoving > 0
      ? Math.round((this._hitsWhileMoving / this._shotsWhileMoving) * 100) : 0;
    var accuracyStopped = this._shotsWhileStopped > 0
      ? Math.round((this._hitsWhileStopped / this._shotsWhileStopped) * 100) : 0;

    return {
      shotsFired: this._shotsFired,
      shotsWhileMoving: this._shotsWhileMoving,
      shotsWhileStopped: this._shotsWhileStopped,
      hitsWhileMoving: this._hitsWhileMoving,
      hitsWhileStopped: this._hitsWhileStopped,
      counterStrafeHits: this._counterStrafeHits,
      accuracyMoving: accuracyMoving,
      accuracyStopped: accuracyStopped,
      timeLimit: this._timeLimit,
    };
  }

  getProgression() {
    if (!this._sessionStartTime) return 0;
    var hits = this._hitCount;
    var totalShots = hits + (this._missCount || 0);
    if (totalShots === 0) return 0;
    return hits / totalShots;
  }

  isScenarioComplete() {
    if (!this._sessionStartTime || !this.running) return false;
    return (Date.now() - this._sessionStartTime) >= this._timeLimit;
  }
};
