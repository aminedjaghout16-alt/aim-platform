/* ============================================
   Moving Enemy Renderer — 3D
   Targets move with different patterns: linear,
   erratic, and strafing. Tracks per-pattern
   accuracy and crosshair tracking error.
   ============================================ */
VantageEngine.Renderers.MovingEnemyRenderer = class MovingEnemyRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    this._target = null;
    this._targetSpawnTime = 0;
    this._currentPattern = 'linear';

    this._movementBounds = {
      minX: -5,
      maxX: 5,
      minY: 1.0,
      maxY: 3.0,
      z: -10,
    };

    this._velocity = { x: 0, y: 0 };
    this._currentSpeed = 0;
    this._maxSpeed = 3.0;
    this._direction = 1;
    this._patternTimer = 0;
    this._nextDirectionChange = 0;

    this._moveState = 'IDLE';
    this._moveStateTimer = 0;
    this._targetVelocity = { x: 0, y: 0 };
    this._acceleration = 6.0;
    this._deceleration = 8.0;
    this._strafeDuration = 0;
    this._strafeTimer = 0;

    this._stats = {
      linear: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
      erratic: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
      strafing: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
    };

    this._shotsFired = 0;
    this._targetsKilled = 0;
    this._hitTimes = [];

    this._botHP = 4;
    this._maxBotHP = 4;

    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';

    if (diffId === 'easy') {
      this._maxSpeed = 2.0;
      this._patterns = ['linear', 'linear', 'strafing'];
    } else if (diffId === 'hard') {
      this._maxSpeed = 5.0;
      this._patterns = ['linear', 'erratic', 'strafing'];
    } else {
      this._maxSpeed = 3.5;
      this._patterns = ['linear', 'erratic', 'strafing'];
    }

    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius * 1.1;
  }

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._target = null;
    this._targetSpawnTime = 0;
    this._shotsFired = 0;
    this._targetsKilled = 0;
    this._hitTimes = [];
    this._botHP = this._maxBotHP;

    this._stats = {
      linear: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
      erratic: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
      strafing: { shots: 0, hits: 0, trackingError: 0, trackingSamples: 0 },
    };

    this._patternIndex = 0;
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
    this._target = null;
  }

  _getNextPattern() {
    var pattern = this._patterns[this._patternIndex % this._patterns.length];
    this._patternIndex++;
    return pattern;
  }

  _spawnTarget() {
    if (!this.running) return;

    if (this._target) {
      this._clearTarget();
    }

    this._botHP = this._maxBotHP;
    this._currentPattern = this._getNextPattern();

    var x = this._movementBounds.minX + Math.random() * (this._movementBounds.maxX - this._movementBounds.minX);
    var y = this._movementBounds.minY + Math.random() * (this._movementBounds.maxY - this._movementBounds.minY);
    var z = this._movementBounds.z;

    this._targetSpawnTime = Date.now();

    this._velocity = { x: 0, y: 0 };
    this._currentSpeed = 0;
    this._direction = Math.random() < 0.5 ? -1 : 1;
    this._moveState = 'IDLE';
    this._moveStateTimer = Date.now() + 200 + Math.random() * 300;

    var radius = this.targetBaseRadius;
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

  _clearTarget() {
    if (!this._target) return;
    var idx = this._targets.indexOf(this._target);
    if (idx !== -1) this._targets.splice(idx, 1);
    if (this._target.mesh.parent) this._target.mesh.parent.remove(this._target.mesh);
    this._target.mesh.traverse(function(child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function(m) { m.dispose(); });
        else child.material.dispose();
      }
    });
    this._target = null;
    this._targetSpawnTime = 0;
  }

  _buildHumanoidBot(radius) {
    var group = new THREE.Group();

    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });

    var headMat = new THREE.MeshStandardMaterial({
      color: 0xe0f4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });

    var accentMat = new THREE.MeshStandardMaterial({
      color: 0x0088aa,
      emissive: 0x0088aa,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.7,
      transparent: true,
      opacity: 0,
    });

    var visorMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
    });

    var scale = radius / 0.4;

    var headGeo = new THREE.SphereGeometry(0.18 * scale, 16, 16);
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.85 * scale;
    head.userData.hitZone = 'head';
    group.add(head);

    var visorGeo = new THREE.BoxGeometry(0.25 * scale, 0.06 * scale, 0.05 * scale);
    var visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.85 * scale, -0.15 * scale);
    visor.userData.hitZone = 'head';
    group.add(visor);

    var torsoGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.25 * scale);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.45 * scale;
    torso.userData.hitZone = 'body';
    group.add(torso);

    var chestAccentGeo = new THREE.BoxGeometry(0.42 * scale, 0.08 * scale, 0.26 * scale);
    var chestAccent = new THREE.Mesh(chestAccentGeo, accentMat);
    chestAccent.position.y = 0.55 * scale;
    chestAccent.userData.hitZone = 'body';
    group.add(chestAccent);

    var shoulderGeo = new THREE.SphereGeometry(0.1 * scale, 12, 12);
    var leftShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    leftShoulder.position.set(-0.25 * scale, 0.65 * scale, 0);
    leftShoulder.userData.hitZone = 'body';
    group.add(leftShoulder);

    var rightShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    rightShoulder.position.set(0.25 * scale, 0.65 * scale, 0);
    rightShoulder.userData.hitZone = 'body';
    group.add(rightShoulder);

    var armGeo = new THREE.CylinderGeometry(0.06 * scale, 0.06 * scale, 0.4 * scale, 8);
    var leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.28 * scale, 0.4 * scale, 0);
    leftArm.userData.hitZone = 'body';
    group.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.28 * scale, 0.4 * scale, 0);
    rightArm.userData.hitZone = 'body';
    group.add(rightArm);

    var hipsGeo = new THREE.BoxGeometry(0.35 * scale, 0.15 * scale, 0.22 * scale);
    var hips = new THREE.Mesh(hipsGeo, bodyMat);
    hips.position.y = 0.15 * scale;
    hips.userData.hitZone = 'body';
    group.add(hips);

    var legGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.5 * scale, 8);
    var leftLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.12 * scale, -0.2 * scale, 0);
    leftLeg.userData.hitZone = 'body';
    group.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, bodyMat);
    rightLeg.position.set(0.12 * scale, -0.2 * scale, 0);
    rightLeg.userData.hitZone = 'body';
    group.add(rightLeg);

    group.userData.materials = [bodyMat, headMat, accentMat, visorMat];

    return group;
  }

  _updateMovement(dt) {
    if (!this._target || !this._target.alive) return;

    var now = Date.now();

    switch (this._currentPattern) {
      case 'linear':
        this._updateLinearMovement(dt, now);
        break;
      case 'erratic':
        this._updateErraticMovement(dt, now);
        break;
      case 'strafing':
        this._updateStrafingMovement(dt, now);
        break;
    }

    var targetMesh = this._target.mesh;
    var newX = targetMesh.position.x + this._velocity.x * dt;
    var newY = targetMesh.position.y + this._velocity.y * dt;

    if (newX < this._movementBounds.minX) {
      newX = this._movementBounds.minX;
      this._direction = 1;
      this._velocity.x = Math.abs(this._velocity.x);
    } else if (newX > this._movementBounds.maxX) {
      newX = this._movementBounds.maxX;
      this._direction = -1;
      this._velocity.x = -Math.abs(this._velocity.x);
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

  _updateLinearMovement(dt, now) {
    this._velocity.x = this._direction * this._maxSpeed;
    this._velocity.y = 0;
  }

  _updateErraticMovement(dt, now) {
    if (now >= this._nextDirectionChange) {
      this._direction = Math.random() < 0.5 ? -1 : 1;
      var speed = (0.5 + Math.random() * 0.5) * this._maxSpeed;
      this._velocity.x = this._direction * speed;
      this._velocity.y = (Math.random() - 0.5) * this._maxSpeed * 0.3;
      this._nextDirectionChange = now + 500 + Math.random() * 1000;
    }
  }

  _updateStrafingMovement(dt, now) {
    switch (this._moveState) {
      case 'IDLE':
        if (now >= this._moveStateTimer) {
          this._startNewStrafe(now);
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
        this._velocity.x = this._direction * this._currentSpeed;
        this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
        if (now >= this._strafeTimer) {
          this._moveState = 'DECELERATING';
        }
        break;
      case 'DECELERATING':
        var decelAmount = this._deceleration * dt;
        if (this._currentSpeed > decelAmount) {
          this._currentSpeed -= decelAmount;
        } else {
          this._currentSpeed = 0;
          this._velocity.x = 0;
          this._velocity.y = 0;
          this._moveState = 'IDLE';
          this._moveStateTimer = now + 100 + Math.random() * 300;
        }
        this._velocity.x = this._direction * this._currentSpeed;
        this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
        break;
    }
  }

  _startNewStrafe(now) {
    var pattern = Math.random();
    if (pattern < 0.3) {
      this._strafeDuration = 300 + Math.random() * 400;
      this._maxSpeed = 2.5 + Math.random() * 1.5;
    } else if (pattern < 0.7) {
      this._strafeDuration = 600 + Math.random() * 800;
      this._maxSpeed = 3.0 + Math.random() * 1.5;
    } else {
      this._strafeDuration = 1200 + Math.random() * 1000;
      this._maxSpeed = 3.5 + Math.random() * 1.0;
    }

    if (Math.random() < 0.6) {
      this._direction = -this._direction;
    }

    this._targetVelocity.x = this._direction * this._maxSpeed;
    this._targetVelocity.y = (Math.random() - 0.5) * 0.5;
    this._moveState = 'ACCELERATING';
  }

  _accelerateToTarget(dt) {
    var speedDiff = this._maxSpeed - this._currentSpeed;
    var accelAmount = this._acceleration * dt;
    if (speedDiff > accelAmount) {
      this._currentSpeed += accelAmount;
    } else {
      this._currentSpeed = this._maxSpeed;
    }
    this._velocity.x = this._direction * this._currentSpeed;
    this._velocity.y = this._targetVelocity.y * (this._currentSpeed / this._maxSpeed);
  }

  _updateTrackingError() {
    if (!this._target || !this._target.alive || !this._camera) return;

    var camPos = this._camera.position;
    var targetPos = this._target.mesh.position;

    var toTarget = new THREE.Vector3().subVectors(targetPos, camPos).normalize();
    var crosshairDir = new THREE.Vector3(0, 0, -1);
    crosshairDir.applyEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));

    var dot = Math.min(1, Math.max(-1, crosshairDir.dot(toTarget)));
    var angleDeg = Math.acos(dot) * 180 / Math.PI;

    var patternStats = this._stats[this._currentPattern];
    patternStats.trackingError += angleDeg;
    patternStats.trackingSamples++;
  }

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;
    if (!this._target || !this._target.alive) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    this._shotsFired++;
    var patternStats = this._stats[this._currentPattern];
    patternStats.shots++;

    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    this._applyShotSpread();

    var botMeshes = [];
    this._target.mesh.traverse(function(child) {
      if (child.isMesh) botMeshes.push(child);
    });

    var intersects = this._raycaster.intersectObjects(botMeshes, false);

    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      var isPartOfBot = false;
      var current = hitObj;
      while (current) {
        if (current === this._target.mesh) { isPartOfBot = true; break; }
        current = current.parent;
      }

      if (isPartOfBot && this._target.alive) {
        var hitZone = hitObj.userData.hitZone || 'body';
        var isHeadshot = (hitZone === 'head');

        if (isHeadshot) {
          this._botHP = 0;
        } else {
          this._botHP--;
        }

        this._createHitParticles(this._target.mesh.position.clone());

        if (this._botHP <= 0) {
          this._target.alive = false;
          this._target.hitAnim = 1.0;
          this._hitCount++;
          this._targetsKilled++;
          patternStats.hits++;

          if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
            VantageEngine.Audio.playKillSound();
          }

          var survivalTime = now - this._targetSpawnTime;
          this._hitTimes.push(survivalTime);

          if (this._onHit) this._onHit(survivalTime);
          hit = true;

          var self = this;
          setTimeout(function() {
            if (self._stopped) return;
            self._clearTarget();
            if (self.running) self._spawnTarget();
          }, 150);
        } else {
          this._target.hitAnim = 0.5;
          hit = true;
          var survivalTime = now - this._targetSpawnTime;
          if (this._onHit) this._onHit(survivalTime);
        }
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);
    this._updateMovement(dt);
    this._updateTrackingError();

    if (this._target && this._target.alive) {
      var t = this._target;
      t.opacity = Math.min(1, t.opacity + dt * 8);
      var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;

      if (t.mesh.userData.materials) {
        for (var i = 0; i < t.mesh.userData.materials.length; i++) {
          t.mesh.userData.materials[i].opacity = easedOpacity;
        }
      }

      if (this._camera) {
        var camPos = this._camera.position.clone();
        var botPos = t.mesh.position.clone();
        var direction = new THREE.Vector3().subVectors(camPos, botPos);
        direction.y = 0;
        var angle = Math.atan2(direction.x, direction.z);
        t.mesh.rotation.y = angle;
      }

      if (t.hitAnim > 0 && this._botHP > 0) {
        t.hitAnim -= dt * 6;
        if (t.hitAnim > 0) {
          var flash = t.hitAnim * 2;
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) mat.emissiveIntensity = 0.3 + flash * 1.5;
            }
          }
        } else {
          t.hitAnim = 0;
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) mat.emissiveIntensity = 0.3;
            }
          }
        }
      }
    } else if (this._target && !this._target.alive) {
      var t = this._target;
      t.hitAnim -= dt * 6;
      if (t.hitAnim > 0) {
        if (t.hitAnim > 0.8) {
          var flash = (1 - t.hitAnim) / 0.2;
          t.mesh.scale.setScalar(1 + flash * 0.4);
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) mat.emissiveIntensity = 0.3 + flash * 3;
              mat.opacity = 1;
            }
          }
        } else if (t.hitAnim > 0.5) {
          var transition = (0.8 - t.hitAnim) / 0.3;
          t.mesh.scale.setScalar(1.4 - transition * 0.3);
          if (t.mesh.userData.materials) {
            for (var i = 0; i < t.mesh.userData.materials.length; i++) {
              var mat = t.mesh.userData.materials[i];
              if (mat.emissive) mat.emissiveIntensity = 3 - transition * 2;
            }
          }
        } else {
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

    if (this.running && !this._target) {
      this._spawnTarget();
    }
  }

  getMovingEnemyStats() {
    var perPattern = {};
    var patterns = ['linear', 'erratic', 'strafing'];

    for (var p = 0; p < patterns.length; p++) {
      var key = patterns[p];
      var s = this._stats[key];
      perPattern[key] = {
        shots: s.shots,
        hits: s.hits,
        accuracy: s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0,
        avgTrackingError: s.trackingSamples > 0 ? (s.trackingError / s.trackingSamples).toFixed(2) : 0,
      };
    }

    var avgHitTime = 0;
    if (this._hitTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._hitTimes.length; i++) sum += this._hitTimes[i];
      avgHitTime = Math.round(sum / this._hitTimes.length);
    }

    return {
      targetsKilled: this._targetsKilled,
      shotsFired: this._shotsFired,
      avgHitTime: avgHitTime,
      perPattern: perPattern,
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
