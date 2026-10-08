/* ============================================
   Adjustshot Renderer — 3D
   Flick → Micro-correction → Accurate shot training.
   Two targets with subtle movement, requiring precise adjustment.
   ============================================ */
VantageEngine.Renderers.AdjustshotRenderer = class AdjustshotRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    // Wide horizontal play area (similar to Valorant/Aimlabs)
    this._playArea = {
      minX: -6,
      maxX: 6,
      minY: 1.0,
      maxY: 3.0,
      z: -10,
    };

    // Target management - always 2 active
    this._targets = [];
    this._maxTargets = 2;

    // Stats tracking
    this._targetsKilled = 0;
    this._shotsFired = 0;
    this._hitTimes = [];

    // Target size
    var S = VantageEngine.Settings;
    var sizeSetting = S.getTargetSize(config.targetSize || 'medium');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.36;
    this.targetBaseRadius = baseRadius * 0.9; // Slightly smaller for precision training
  }

  /* ---------- Lifecycle ---------- */

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._targetsKilled = 0;
    this._shotsFired = 0;
    this._hitTimes = [];

    // Spawn initial 2 targets
    this._spawnInitialTargets();
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
    this._targets = [];
    this._targetsKilled = 0;
    this._shotsFired = 0;
    this._hitTimes = [];
  }

  /* ---------- Target Spawning ---------- */

  _spawnInitialTargets() {
    // Spawn 2 targets at different positions
    for (var i = 0; i < this._maxTargets; i++) {
      this._spawnTarget();
    }
  }

  _spawnTarget() {
    if (!this.running) return;
    if (this._targets.length >= this._maxTargets) return;

    // Find a good spawn position (not overlapping, not too close to crosshair)
    var pos = this._findSpawnPosition();

    // Create target data
    var target = {
      mesh: null,
      radius: this.targetBaseRadius,
      spawnTime: Date.now(),
      position: pos,
      alive: true,
      opacity: 0,
      hitAnim: 0,
      
      // Movement state
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      moveTimer: 0,
      moveDuration: 800 + Math.random() * 1200, // 0.8-2.0s between direction changes
    };

    // Build circle target
    var targetMesh = this._buildCircleTarget(this.targetBaseRadius);
    targetMesh.position.set(pos.x, pos.y, pos.z);
    this._scene.add(targetMesh);
    target.mesh = targetMesh;

    this._targets.push(target);
  }

  _findSpawnPosition() {
    var attempts = 0;
    var maxAttempts = 20;
    var pos = null;

    while (attempts < maxAttempts) {
      // Random position in play area
      var x = this._playArea.minX + Math.random() * (this._playArea.maxX - this._playArea.minX);
      var y = this._playArea.minY + Math.random() * (this._playArea.maxY - this._playArea.minY);
      var z = this._playArea.z;

      var candidate = { x: x, y: y, z: z };

      // Check distance from other targets
      var tooClose = false;
      for (var i = 0; i < this._targets.length; i++) {
        var other = this._targets[i];
        if (!other.alive) continue;
        
        var dx = candidate.x - other.position.x;
        var dy = candidate.y - other.position.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        
        // Minimum distance between targets (3 units)
        if (dist < 3.0) {
          tooClose = true;
          break;
        }
      }

      // Check distance from center (avoid spawning directly in front of crosshair)
      var centerDist = Math.abs(candidate.x);
      if (centerDist < 1.5 && attempts < 10) {
        // Try again to avoid center spawn
        attempts++;
        continue;
      }

      if (!tooClose) {
        pos = candidate;
        break;
      }

      attempts++;
    }

    // Fallback position
    if (!pos) {
      pos = {
        x: this._playArea.minX + Math.random() * (this._playArea.maxX - this._playArea.minX),
        y: this._playArea.minY + Math.random() * (this._playArea.maxY - this._playArea.minY),
        z: this._playArea.z,
      };
    }

    return pos;
  }

  /* ---------- Build Circle Target ---------- */

  _buildCircleTarget(radius) {
    var group = new THREE.Group();
    
    // Cyan color scheme to match the game's aesthetic
    var targetColor = 0x00d4ff;
    
    // Main sphere (entire circle is one hit zone)
    var sphereGeo = new THREE.SphereGeometry(radius, 24, 24);
    var sphereMat = new THREE.MeshStandardMaterial({
      color: targetColor,
      emissive: targetColor,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });
    var sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    // Inner core (visual only, same hit zone)
    var coreRadius = radius * 0.35;
    var coreGeo = new THREE.SphereGeometry(coreRadius, 16, 16);
    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    var core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Outer ring (decorative)
    var ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.7, 48);
    var ringMat = new THREE.MeshBasicMaterial({
      color: targetColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Inner ring (decorative)
    var innerRingGeo = new THREE.RingGeometry(radius * 0.7, radius * 0.85, 48);
    var innerRingMat = new THREE.MeshBasicMaterial({
      color: targetColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    var innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    group.add(innerRing);

    // Store materials for opacity animation
    group.userData.materials = [sphereMat, coreMat, ringMat, innerRingMat];
    group.userData.core = core;
    group.userData.ring = ring;
    group.userData.innerRing = innerRing;

    return group;
  }

  /* ---------- Target Movement ---------- */

  _updateTargetMovement(dt) {
    var now = Date.now();

    for (var i = 0; i < this._targets.length; i++) {
      var target = this._targets[i];
      if (!target.alive) continue;

      // Update movement timer
      if (now >= target.moveTimer) {
        // Choose new target velocity
        this._chooseNewMovement(target);
        target.moveTimer = now + target.moveDuration;
      }

      // Smoothly interpolate toward target velocity
      var lerpFactor = 1 - Math.exp(-4 * dt); // Smooth interpolation
      target.velocity.x += (target.targetVelocity.x - target.velocity.x) * lerpFactor;
      target.velocity.y += (target.targetVelocity.y - target.velocity.y) * lerpFactor;

      // Apply velocity
      var newX = target.mesh.position.x + target.velocity.x * dt;
      var newY = target.mesh.position.y + target.velocity.y * dt;

      // Bounds checking
      if (newX < this._playArea.minX) {
        newX = this._playArea.minX;
        target.velocity.x = Math.abs(target.velocity.x) * 0.5;
        target.targetVelocity.x = Math.abs(target.targetVelocity.x);
      } else if (newX > this._playArea.maxX) {
        newX = this._playArea.maxX;
        target.velocity.x = -Math.abs(target.velocity.x) * 0.5;
        target.targetVelocity.x = -Math.abs(target.targetVelocity.x);
      }

      if (newY < this._playArea.minY) {
        newY = this._playArea.minY;
        target.velocity.y = Math.abs(target.velocity.y) * 0.5;
        target.targetVelocity.y = Math.abs(target.targetVelocity.y);
      } else if (newY > this._playArea.maxY) {
        newY = this._playArea.maxY;
        target.velocity.y = -Math.abs(target.velocity.y) * 0.5;
        target.targetVelocity.y = -Math.abs(target.targetVelocity.y);
      }

      target.mesh.position.x = newX;
      target.mesh.position.y = newY;
      target.position.x = newX;
      target.position.y = newY;
    }
  }

  _chooseNewMovement(target) {
    // Small, subtle movements (not tracking-level)
    var maxSpeed = 0.8; // Units per second (slow)
    
    // Horizontal movement (primary)
    var horizontalSpeed = (Math.random() - 0.5) * 2 * maxSpeed;
    
    // Occasional vertical movement (less frequent, smaller)
    var verticalSpeed = 0;
    if (Math.random() < 0.3) {
      verticalSpeed = (Math.random() - 0.5) * 2 * maxSpeed * 0.4;
    }

    target.targetVelocity.x = horizontalSpeed;
    target.targetVelocity.y = verticalSpeed;
    
    // Randomize duration until next direction change
    target.moveDuration = 600 + Math.random() * 1400; // 0.6-2.0s
  }

  /* ---------- Fire Handling ---------- */

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;
    this._shotsFired++;

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

    // Collect all meshes from all targets
    var allMeshes = [];
    var meshToTarget = new Map();
    
    for (var i = 0; i < this._targets.length; i++) {
      var target = this._targets[i];
      if (!target.alive) continue;
      
      target.mesh.traverse(function (child) {
        if (child.isMesh) {
          allMeshes.push(child);
          meshToTarget.set(child, target);
        }
      });
    }

    var intersects = this._raycaster.intersectObjects(allMeshes, false);

    // Tracer and recoil
    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      var target = meshToTarget.get(hitObj);

      if (target && target.alive) {
        // Instant kill on any hit
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsKilled++;

        // Create particle burst
        this._createHitParticles(target.mesh.position.clone());

        // Play kill sound
        if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
          VantageEngine.Audio.playKillSound();
        }

        // Record hit time
        var survivalTime = now - target.spawnTime;
        this._hitTimes.push(survivalTime);

        // Report hit
        if (this._onHit) this._onHit(survivalTime);
        hit = true;

        // Respawn this target after death animation
        var self = this;
        setTimeout(function () {
          if (self._stopped) return;
          // Remove dead target
          var idx = self._targets.indexOf(target);
          if (idx !== -1) {
            self._targets.splice(idx, 1);
          }
          if (target.mesh.parent) {
            target.mesh.parent.remove(target.mesh);
          }
          target.mesh.traverse(function (child) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) child.material.forEach(function (m) { m.dispose(); });
              else child.material.dispose();
            }
          });

          // Spawn new target
          if (self.running) {
            self._spawnTarget();
          }
        }, 200);
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  /* ---------- Update Loop ---------- */

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);

    // Update target movement
    this._updateTargetMovement(dt);

    // Update target visuals
    for (var i = 0; i < this._targets.length; i++) {
      var target = this._targets[i];

      if (target.alive) {
        // Fade in
        target.opacity = Math.min(1, target.opacity + dt * 8);
        var easedOpacity = target.opacity < 1 ? 1 - Math.pow(1 - target.opacity, 3) : 1;
        
        if (target.mesh.userData.materials) {
          for (var j = 0; j < target.mesh.userData.materials.length; j++) {
            target.mesh.userData.materials[j].opacity = easedOpacity;
          }
        }

        // Billboard the rings to face camera
        if (this._camera) {
          var camPos = this._camera.position.clone();
          var targetPos = target.mesh.position.clone();
          var direction = new THREE.Vector3().subVectors(camPos, targetPos);
          // Make rings face the camera
          if (target.mesh.userData.ring) {
            target.mesh.userData.ring.lookAt(camPos);
          }
          if (target.mesh.userData.innerRing) {
            target.mesh.userData.innerRing.lookAt(camPos);
          }
        }
      } else {
        // Death animation
        target.hitAnim -= dt * 6;
        if (target.hitAnim > 0) {
          if (target.hitAnim > 0.8) {
            var flash = (1 - target.hitAnim) / 0.2;
            target.mesh.scale.setScalar(1 + flash * 0.4);
            if (target.mesh.userData.materials) {
              for (var j = 0; j < target.mesh.userData.materials.length; j++) {
                var mat = target.mesh.userData.materials[j];
                if (mat.emissive) {
                  mat.emissiveIntensity = 0.3 + flash * 3;
                }
                mat.opacity = 1;
              }
            }
          } else if (target.hitAnim > 0.5) {
            var transition = (0.8 - target.hitAnim) / 0.3;
            target.mesh.scale.setScalar(1.4 - transition * 0.3);
            if (target.mesh.userData.materials) {
              for (var j = 0; j < target.mesh.userData.materials.length; j++) {
                var mat = target.mesh.userData.materials[j];
                if (mat.emissive) {
                  mat.emissiveIntensity = 3 - transition * 2;
                }
              }
            }
          } else {
            var shrink = target.hitAnim / 0.5;
            target.mesh.scale.setScalar(shrink * 1.1);
            if (target.mesh.userData.materials) {
              for (var j = 0; j < target.mesh.userData.materials.length; j++) {
                target.mesh.userData.materials[j].opacity = shrink * 0.6;
              }
            }
          }
        }
      }
    }

    // Safety net - ensure we always have 2 targets
    if (this.running) {
      var aliveCount = 0;
      for (var i = 0; i < this._targets.length; i++) {
        if (this._targets[i].alive) aliveCount++;
      }
      if (aliveCount < this._maxTargets) {
        this._spawnTarget();
      }
    }
  }

  /* ---------- Stats Export ---------- */

  getAdjustshotStats() {
    var avgReactionTime = 0;
    if (this._hitTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._hitTimes.length; i++) {
        sum += this._hitTimes[i];
      }
      avgReactionTime = Math.round(sum / this._hitTimes.length);
    }

    var accuracy = 0;
    if (this._shotsFired > 0) {
      accuracy = Math.round((this._hitCount / this._shotsFired) * 100);
    }

    var elapsed = (Date.now() - this._sessionStartTime) / 1000;
    var killsPerSecond = elapsed > 0 ? (this._targetsKilled / elapsed).toFixed(2) : 0;

    return {
      targetsKilled: this._targetsKilled,
      shotsFired: this._shotsFired,
      accuracy: accuracy,
      killsPerSecond: killsPerSecond,
      avgReactionTime: avgReactionTime,
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
