/* ============================================
   Micro Adjust Renderer — 3D
   Small targets spawn at small angular offsets from
   the crosshair. Player must make micro-corrections
   to land shots. Tracks first-shot accuracy and
   overcorrections.
   ============================================ */
VantageEngine.Renderers.MicroAdjustRenderer = class MicroAdjustRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    this._firstShotHits = 0;
    this._firstShotMisses = 0;
    this._overcorrections = 0;
    this._totalCorrectionAngle = 0;
    this._correctionCount = 0;
    this._shotsFired = 0;
    this._targetsHit = 0;

    this._currentTarget = null;
    this._targetSpawnPos = null;
    this._lastShotMissDirection = 0;

    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';

    if (diffId === 'easy') {
      this._minOffsetDeg = 1.0;
      this._maxOffsetDeg = 2.0;
      this._timeLimit = 60000;
    } else if (diffId === 'hard') {
      this._minOffsetDeg = 0.3;
      this._maxOffsetDeg = 1.0;
      this._timeLimit = 45000;
    } else {
      this._minOffsetDeg = 0.5;
      this._maxOffsetDeg = 1.5;
      this._timeLimit = 60000;
    }

    var sizeSetting = S.getTargetSize(config.targetSize || 'small');
    var baseRadius = sizeSetting ? sizeSetting.px / 100 : 0.24;
    this.targetBaseRadius = baseRadius * 0.7;
  }

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._firstShotHits = 0;
    this._firstShotMisses = 0;
    this._overcorrections = 0;
    this._totalCorrectionAngle = 0;
    this._correctionCount = 0;
    this._shotsFired = 0;
    this._targetsHit = 0;
    this._currentTarget = null;
    this._targetSpawnPos = null;
    this._lastShotMissDirection = 0;
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
    this._currentTarget = null;
  }

  _generateTargetPosition() {
    var offsetDeg = this._minOffsetDeg + Math.random() * (this._maxOffsetDeg - this._minOffsetDeg);
    var offsetRad = offsetDeg * Math.PI / 180;

    var direction = Math.random() * Math.PI * 2;
    var offsetX = Math.cos(direction) * offsetRad;
    var offsetY = (Math.random() - 0.5) * offsetRad * 0.5;

    var camDir = new THREE.Vector3(0, 0, -1);
    camDir.applyEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));

    var right = new THREE.Vector3(1, 0, 0);
    right.applyEuler(new THREE.Euler(0, this._yaw, 0, 'YXZ'));

    var up = new THREE.Vector3(0, 1, 0);

    var adjustedDir = camDir.clone();
    adjustedDir.addScaledVector(right, offsetX);
    adjustedDir.addScaledVector(up, offsetY);
    adjustedDir.normalize();

    var distance = 8 + Math.random() * 6;
    var pos = this._camera.position.clone().addScaledVector(adjustedDir, distance);

    var half = VantageEngine.Renderers.ThreeArenaRenderer.ARENA_HALF;
    pos.x = Math.max(-half, Math.min(half, pos.x));
    pos.z = Math.max(-half, Math.min(half, pos.z));
    pos.y = Math.max(VantageEngine.Renderers.ThreeArenaRenderer.ARENA_MIN_Y, Math.min(VantageEngine.Renderers.ThreeArenaRenderer.ARENA_MAX_Y, pos.y));

    this._lastSpawnOffsetDeg = offsetDeg;
    this._lastSpawnDirection = direction;

    return { x: pos.x, y: pos.y, z: pos.z, distance: distance, offsetDeg: offsetDeg };
  }

  _spawnTarget() {
    if (!this.running) return;

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

    var targetData = {
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
      isFirstShot: true,
    };

    this._targets.push(targetData);
    this._currentTarget = targetData;
    this._targetSpawnPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    this._shotsFired++;

    this._fireWeapon();
    if (VantageEngine.Audio && weapon) {
      VantageEngine.Audio.playWeaponFire(weapon);
    } else {
      VantageEngine.Audio.playShoot();
    }

    this._camera.updateMatrixWorld();
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
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
        this._targetsHit++;

        if (target.isFirstShot) {
          this._firstShotHits++;
        }

        this._createHitParticles(target.mesh.position.clone());

        if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
          VantageEngine.Audio.playKillSound();
        }

        var reactionTime = now - target.spawnTime;
        if (this._onHit) this._onHit(reactionTime);
        hit = true;

        clearTimeout(this._spawnTimer);
        var spawnDelay = 100 / this._speedMult;
        this._spawnPending = true;
        this._spawnTimer = setTimeout(function() {
          self._spawnPending = false;
          self._spawnTarget();
        }, spawnDelay);
      }
    }

    if (!hit) {
      if (this._currentTarget && this._currentTarget.isFirstShot) {
        this._firstShotMisses++;
        this._currentTarget.isFirstShot = false;
      }

      this._detectOvercorrection();
      if (this._onMiss) this._onMiss();
    }
  }

  _detectOvercorrection() {
    if (!this._targetSpawnPos || !this._camera) return;

    var camPos = this._camera.position;
    var targetDir = new THREE.Vector3(
      this._targetSpawnPos.x - camPos.x,
      this._targetSpawnPos.y - camPos.y,
      this._targetSpawnPos.z - camPos.z
    ).normalize();

    var crosshairDir = new THREE.Vector3(0, 0, -1);
    crosshairDir.applyEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));

    var right = new THREE.Vector3(1, 0, 0);
    right.applyEuler(new THREE.Euler(0, this._yaw, 0, 'YXZ'));

    var targetDotRight = targetDir.dot(right);
    var crosshairDotRight = crosshairDir.dot(right);

    var targetSide = targetDotRight > 0 ? 1 : -1;
    var crosshairSide = crosshairDotRight > 0 ? 1 : -1;

    if (this._lastShotMissDirection !== 0 && crosshairSide !== targetSide && this._lastShotMissDirection !== crosshairSide) {
      this._overcorrections++;
    }

    this._lastShotMissDirection = crosshairSide;

    var angle = Math.acos(Math.min(1, Math.max(-1, crosshairDir.dot(targetDir))));
    this._totalCorrectionAngle += angle * 180 / Math.PI;
    this._correctionCount++;
  }

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);

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
        var bobAmount = 0.02;
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

  getMicroAdjustStats() {
    var avgCorrectionAngle = this._correctionCount > 0
      ? (this._totalCorrectionAngle / this._correctionCount).toFixed(2) : 0;

    var firstShotAccuracy = 0;
    var totalFirstShots = this._firstShotHits + this._firstShotMisses;
    if (totalFirstShots > 0) {
      firstShotAccuracy = Math.round((this._firstShotHits / totalFirstShots) * 100);
    }

    return {
      firstShotHits: this._firstShotHits,
      firstShotMisses: this._firstShotMisses,
      firstShotAccuracy: firstShotAccuracy,
      overcorrections: this._overcorrections,
      avgCorrectionAngle: avgCorrectionAngle,
      shotsFired: this._shotsFired,
      targetsHit: this._targetsHit,
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
};
