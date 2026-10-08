/* ============================================
   Bot Strafe Renderer — 3D
   Extends ThreeArenaRenderer to reuse the arena,
   weapon system, mouse look, and effects.
   Target moves with human-like strafing patterns.
   ============================================ */
VantageEngine.Renderers.BotStrafeRenderer = class BotStrafeRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Movement area bounds (in front of player)
    this._movementBounds = {
      minX: -4,
      maxX: 4,
      minY: 1.2,
      maxY: 3.2,
      z: -10,
    };

    // Target state
    this._target = null;
    this._targetSpawnTime = 0;

    // Movement state machine
    this._moveState = 'IDLE';
    this._moveStateTimer = 0;
    this._velocity = { x: 0, y: 0 };
    this._targetVelocity = { x: 0, y: 0 };
    this._currentSpeed = 0;
    this._maxSpeed = 3.5; // units per second
    this._acceleration = 6.0; // how fast to reach target speed
    this._deceleration = 8.0; // how fast to slow down

    // Movement pattern tracking
    this._currentDirection = 0; // -1 = left, 1 = right, 0 = stopped
    this._strafeDuration = 0;
    this._strafeTimer = 0;

    // Stats tracking
    this._targetSurvivalTimes = []; // time each target was alive
    this._hitTimes = []; // time from spawn to hit
    this._targetsDestroyed = 0;

    // Override target radius
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius * 1.1; // slightly larger for tracking
  }

  /* ---------- Lifecycle ---------- */

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._targetSurvivalTimes = [];
    this._hitTimes = [];
    this._targetsDestroyed = 0;
    this._target = null;
    this._targetSpawnTime = 0;

    // Initialize movement state
    this._moveState = 'IDLE';
    this._moveStateTimer = 0;
    this._velocity = { x: 0, y: 0 };
    this._targetVelocity = { x: 0, y: 0 };
    this._currentSpeed = 0;
    this._currentDirection = 0;

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
    this._targetSurvivalTimes = [];
    this._hitTimes = [];
    this._targetsDestroyed = 0;
    this._target = null;
  }

  /* ---------- Target Spawning ---------- */

  _spawnTarget() {
    if (!this.running) return;

    // Clear existing target
    if (this._target) {
      this._clearTarget();
    }

    // Random position within movement bounds
    var x = this._movementBounds.minX + Math.random() * (this._movementBounds.maxX - this._movementBounds.minX);
    var y = this._movementBounds.minY + Math.random() * (this._movementBounds.maxY - this._movementBounds.minY);
    var z = this._movementBounds.z;

    // Record spawn time
    this._targetSpawnTime = Date.now();

    // Reset movement state
    this._moveState = 'IDLE';
    this._moveStateTimer = Date.now() + 200 + Math.random() * 300; // 200-500ms idle
    this._velocity = { x: 0, y: 0 };
    this._targetVelocity = { x: 0, y: 0 };
    this._currentSpeed = 0;
    this._currentDirection = 0;

    var radius = this.targetBaseRadius;

    // Build humanoid bot target
    var botGroup = this._buildHumanoidBot(radius);
    botGroup.position.set(x, y, z);

    this._scene.add(botGroup);

    this._target = {
      mesh: botGroup,
      radius: radius,
      spawnTime: this._targetSpawnTime,
      spawnPos: { x: x, y: y, z: z },
      alive: true,
      opacity: 0,
      hitAnim: 0,
    };

    this._targets.push(this._target);
  }

  /* ---------- Build Humanoid Bot ---------- */

  _buildHumanoidBot(radius) {
    var group = new THREE.Group();
    
    // High-visibility cyan color scheme
    // Main body: bright electric cyan
    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });
    
    // Head: bright white with cyan tint
    var headMat = new THREE.MeshStandardMaterial({
      color: 0xe0f4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });
    
    // Armor/details: darker blue-cyan for contrast
    var accentMat = new THREE.MeshStandardMaterial({
      color: 0x0088aa,
      emissive: 0x0088aa,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.7,
      transparent: true,
      opacity: 0,
    });
    
    // Visor: bright glowing cyan
    var visorMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
    });

    // Scale factor based on radius
    var scale = radius / 0.4;

    // HEAD - sphere (bright white with cyan tint)
    var headGeo = new THREE.SphereGeometry(0.18 * scale, 16, 16);
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.85 * scale;
    group.add(head);

    // Visor - flat box across face (bright glowing cyan)
    var visorGeo = new THREE.BoxGeometry(0.25 * scale, 0.06 * scale, 0.05 * scale);
    var visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.85 * scale, -0.15 * scale);
    group.add(visor);

    // TORSO - box
    var torsoGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.25 * scale);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.45 * scale;
    group.add(torso);

    // Chest accent - orange stripe
    var chestAccentGeo = new THREE.BoxGeometry(0.42 * scale, 0.08 * scale, 0.26 * scale);
    var chestAccent = new THREE.Mesh(chestAccentGeo, accentMat);
    chestAccent.position.y = 0.55 * scale;
    group.add(chestAccent);

    // SHOULDERS - two spheres
    var shoulderGeo = new THREE.SphereGeometry(0.1 * scale, 12, 12);
    var leftShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    leftShoulder.position.set(-0.25 * scale, 0.65 * scale, 0);
    group.add(leftShoulder);

    var rightShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    rightShoulder.position.set(0.25 * scale, 0.65 * scale, 0);
    group.add(rightShoulder);

    // ARMS - cylinders
    var armGeo = new THREE.CylinderGeometry(0.06 * scale, 0.06 * scale, 0.4 * scale, 8);
    var leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.28 * scale, 0.4 * scale, 0);
    group.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.28 * scale, 0.4 * scale, 0);
    group.add(rightArm);

    // HIPS - box
    var hipsGeo = new THREE.BoxGeometry(0.35 * scale, 0.15 * scale, 0.22 * scale);
    var hips = new THREE.Mesh(hipsGeo, bodyMat);
    hips.position.y = 0.15 * scale;
    group.add(hips);

    // LEGS - cylinders
    var legGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.5 * scale, 8);
    var leftLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.12 * scale, -0.2 * scale, 0);
    group.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, bodyMat);
    rightLeg.position.set(0.12 * scale, -0.2 * scale, 0);
    group.add(rightLeg);

    // KNEE accents - orange circles
    var kneeGeo = new THREE.SphereGeometry(0.05 * scale, 8, 8);
    var leftKnee = new THREE.Mesh(kneeGeo, accentMat);
    leftKnee.position.set(-0.12 * scale, -0.05 * scale, 0.08 * scale);
    group.add(leftKnee);

    var rightKnee = new THREE.Mesh(kneeGeo, accentMat);
    rightKnee.position.set(0.12 * scale, -0.05 * scale, 0.08 * scale);
    group.add(rightKnee);

    // Store materials for opacity animation
    group.userData.materials = [bodyMat, headMat, accentMat, visorMat];

    return group;
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

  /* ---------- Human-like Movement ---------- */

  _updateMovement(dt) {
    if (!this._target || !this._target.alive) return;

    var now = Date.now();

    // State machine for movement
    switch (this._moveState) {
      case 'IDLE':
        if (now >= this._moveStateTimer) {
          this._startNewStrafe();
        }
        break;

      case 'ACCELERATING':
        this._accelerateToTarget(dt);
        if (this._currentSpeed >= this._maxSpeed * 0.9) {
          this._moveState = 'STRAFING';
          this._strafeTimer = now + this._strafeDuration;
        }
        break;

      case 'STRAFING':
        this._maintainSpeed(dt);
        if (now >= this._strafeTimer) {
          this._moveState = 'DECELERATING';
        }
        break;

      case 'DECELERATING':
        this._decelerate(dt);
        if (this._currentSpeed < 0.2) {
          this._currentSpeed = 0;
          this._velocity.x = 0;
          this._velocity.y = 0;
          this._moveState = 'IDLE';
          this._moveStateTimer = now + 100 + Math.random() * 300; // 100-400ms pause
        }
        break;
    }

    // Apply velocity to position
    var targetMesh = this._target.mesh;
    var newX = targetMesh.position.x + this._velocity.x * dt;
    var newY = targetMesh.position.y + this._velocity.y * dt;

    // Bounds checking
    if (newX < this._movementBounds.minX) {
      newX = this._movementBounds.minX;
      this._currentDirection = 1; // force right
      this._targetVelocity.x = Math.abs(this._targetVelocity.x);
    } else if (newX > this._movementBounds.maxX) {
      newX = this._movementBounds.maxX;
      this._currentDirection = -1; // force left
      this._targetVelocity.x = -Math.abs(this._targetVelocity.x);
    }

    if (newY < this._movementBounds.minY) {
      newY = this._movementBounds.minY;
      this._velocity.y = Math.abs(this._velocity.y) * 0.5;
    } else if (newY > this._movementBounds.maxY) {
      newY = this._movementBounds.maxY;
      this._velocity.y = -Math.abs(this._velocity.y) * 0.5;
    }

    targetMesh.position.x = newX;
    targetMesh.position.y = newY;
  }

  _startNewStrafe() {
    var now = Date.now();

    // Decide on movement pattern
    var pattern = Math.random();

    if (pattern < 0.3) {
      // Quick counter-strafe (short duration)
      this._strafeDuration = 300 + Math.random() * 400; // 300-700ms
      this._maxSpeed = 2.5 + Math.random() * 1.5; // 2.5-4.0 units/sec
    } else if (pattern < 0.7) {
      // Normal strafe (medium duration)
      this._strafeDuration = 600 + Math.random() * 800; // 600-1400ms
      this._maxSpeed = 3.0 + Math.random() * 1.5; // 3.0-4.5 units/sec
    } else {
      // Long committed strafe
      this._strafeDuration = 1200 + Math.random() * 1000; // 1200-2200ms
      this._maxSpeed = 3.5 + Math.random() * 1.0; // 3.5-4.5 units/sec
    }

    // Choose direction (opposite of current if possible)
    if (this._currentDirection === 0) {
      this._currentDirection = Math.random() < 0.5 ? -1 : 1;
    } else {
      // 60% chance to counter-strafe, 40% to continue same direction
      if (Math.random() < 0.6) {
        this._currentDirection = -this._currentDirection;
      }
    }

    // Set target velocity
    this._targetVelocity.x = this._currentDirection * this._maxSpeed;
    this._targetVelocity.y = (Math.random() - 0.5) * 0.5; // slight vertical variation

    this._moveState = 'ACCELERATING';
  }

  _accelerateToTarget(dt) {
    // Smoothly accelerate toward target velocity
    var speedDiff = this._maxSpeed - this._currentSpeed;
    var accelAmount = this._acceleration * dt;

    if (speedDiff > accelAmount) {
      this._currentSpeed += accelAmount;
    } else {
      this._currentSpeed = this._maxSpeed;
    }

    this._velocity.x = this._currentDirection * this._currentSpeed;
    this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
  }

  _maintainSpeed(dt) {
    // Keep current speed with slight variation
    this._velocity.x = this._currentDirection * this._currentSpeed;
    this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
  }

  _decelerate(dt) {
    // Smoothly decelerate
    var decelAmount = this._deceleration * dt;

    if (this._currentSpeed > decelAmount) {
      this._currentSpeed -= decelAmount;
    } else {
      this._currentSpeed = 0;
    }

    this._velocity.x = this._currentDirection * this._currentSpeed;
    this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
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

    // Collect all meshes from the bot group for raycasting
    var botMeshes = [];
    this._target.mesh.traverse(function (child) {
      if (child.isMesh) {
        botMeshes.push(child);
      }
    });

    var intersects = this._raycaster.intersectObjects(botMeshes, false);

    // Tracer and recoil
    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      // Check if the hit object is part of our bot group
      var isPartOfBot = false;
      var current = hitObj;
      while (current) {
        if (current === this._target.mesh) {
          isPartOfBot = true;
          break;
        }
        current = current.parent;
      }

      if (isPartOfBot && this._target.alive) {
        this._target.alive = false;
        this._target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsDestroyed++;

        // Create particle burst
        this._createHitParticles(this._target.mesh.position.clone());

        // Calculate survival time and hit time
        var survivalTime = now - this._targetSpawnTime;
        this._targetSurvivalTimes.push(survivalTime);
        this._hitTimes.push(survivalTime);

        // Report hit
        if (this._onHit) this._onHit(survivalTime);
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

      // Fade in - update all materials in the bot group
      t.opacity = Math.min(1, t.opacity + dt * 8);
      var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;
      
      // Update all materials stored in the group
      if (t.mesh.userData.materials) {
        for (var i = 0; i < t.mesh.userData.materials.length; i++) {
          t.mesh.userData.materials[i].opacity = easedOpacity;
        }
      }

      // Make bot face the camera (billboard on Y axis only)
      if (this._camera) {
        var camPos = this._camera.position.clone();
        var botPos = t.mesh.position.clone();
        // Only rotate around Y axis to keep bot upright
        var direction = new THREE.Vector3().subVectors(camPos, botPos);
        direction.y = 0; // Keep upright
        var angle = Math.atan2(direction.x, direction.z);
        t.mesh.rotation.y = angle;
      }
    } else if (this._target && !this._target.alive) {
      // Hit animation
      var t = this._target;
      t.hitAnim -= dt * 6;
      if (t.hitAnim <= 0) {
        // Will be cleared by timeout
      } else {
        if (t.hitAnim > 0.8) {
          // Initial flash - scale up and brighten
          var flash = (1 - t.hitAnim) / 0.2;
          t.mesh.scale.setScalar(1 + flash * 0.4);
          // Flash all materials white
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) {
                mat.emissiveIntensity = 0.3 + flash * 3;
              }
              mat.opacity = 1;
            }
          }
        } else if (t.hitAnim > 0.5) {
          // Transition phase - start shrinking
          var transition = (0.8 - t.hitAnim) / 0.3;
          t.mesh.scale.setScalar(1.4 - transition * 0.3);
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) {
                mat.emissiveIntensity = 3 - transition * 2;
              }
            }
          }
        } else {
          // Final shrink and fade out
          var shrink = t.hitAnim / 0.5;
          t.mesh.scale.setScalar(shrink * 1.1);
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              t.mesh.userData.materials[i].opacity = shrink * 0.6;
            }
          }
        }
      }
    }

    // Safety net
    if (this.running && !this._target) {
      this._spawnTarget();
    }
  }

  /* ---------- Stats Export ---------- */

  getBotStrafeStats() {
    var avgSurvivalTime = 0;
    var avgHitTime = 0;

    if (this._targetSurvivalTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._targetSurvivalTimes.length; i++) {
        sum += this._targetSurvivalTimes[i];
      }
      avgSurvivalTime = Math.round(sum / this._targetSurvivalTimes.length);
    }

    if (this._hitTimes.length > 0) {
      var hitSum = 0;
      for (var j = 0; j < this._hitTimes.length; j++) {
        hitSum += this._hitTimes[j];
      }
      avgHitTime = Math.round(hitSum / this._hitTimes.length);
    }

    return {
      targetsDestroyed: this._targetsDestroyed,
      avgSurvivalTime: avgSurvivalTime,
      avgHitTime: avgHitTime,
      survivalTimeCount: this._targetSurvivalTimes.length,
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
