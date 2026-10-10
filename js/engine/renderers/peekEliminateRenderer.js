/* ============================================
   Peek Eliminate Renderer — 3D
   Lane-based peek simulation. Player peeks around
   cover walls using A/D or mouse. Targets hide behind
   cover and must be eliminated before they "shoot back".
   ============================================ */
VantageEngine.Renderers.PeekEliminateRenderer = class PeekEliminateRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    this._lanes = [];
    this._coverWalls = [];
    this._rounds = [];
    this._currentRound = 0;
    this._totalRounds = 5;
    this._reactionWindow = 2000;

    this._peeksPerformed = 0;
    this._targetsEliminated = 0;
    this._damageTaken = 0;
    this._eliminationTimes = [];
    this._exposureTimes = [];

    this._roundActive = false;
    this._roundTargets = [];
    this._roundStartTime = 0;

    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';

    if (diffId === 'easy') {
      this._totalRounds = 3;
      this._reactionWindow = 2000;
    } else if (diffId === 'hard') {
      this._totalRounds = 7;
      this._reactionWindow = 800;
    } else {
      this._totalRounds = 5;
      this._reactionWindow = 1400;
    }

    this._lanePositions = [
      { x: -6, z: -12, yaw: 0.35 },
      { x: 0, z: -14, yaw: 0 },
      { x: 6, z: -12, yaw: -0.35 },
    ];
  }

  init() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.init.call(this);
    this._buildCoverWalls();
  }

  start(sessionData) {
    this._stopIdleLoop();
    this._resetRecoil();
    this.running = true;
    this._hitCount = 0;
    this._sessionStartTime = Date.now();
    this._peeksPerformed = 0;
    this._targetsEliminated = 0;
    this._damageTaken = 0;
    this._eliminationTimes = [];
    this._exposureTimes = [];
    this._currentRound = 0;
    this._roundTargets = [];
    this._roundActive = false;
    this._startNextRound();
    this._loop();
  }

  pause() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    this._clearRoundTargets();
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._coverWalls = [];
    this._roundTargets = [];
  }

  _buildCoverWalls() {
    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e,
      roughness: 0.85,
      metalness: 0.1,
    });

    for (var i = 0; i < this._lanePositions.length; i++) {
      var lane = this._lanePositions[i];
      var wallGeo = new THREE.BoxGeometry(3.5, 4, 0.4);
      var wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(lane.x, 2, lane.z + 4);
      this._scene.add(wall);
      this._coverWalls.push(wall);

      var trimGeo = new THREE.BoxGeometry(3.6, 0.1, 0.45);
      var trimMat = new THREE.MeshStandardMaterial({ color: 0x444448, roughness: 0.7, metalness: 0.2 });
      var topTrim = new THREE.Mesh(trimGeo, trimMat);
      topTrim.position.set(lane.x, 4.05, lane.z + 4);
      this._scene.add(topTrim);
      var botTrim = new THREE.Mesh(trimGeo, trimMat);
      botTrim.position.set(lane.x, 0.05, lane.z + 4);
      this._scene.add(botTrim);
    }
  }

  _startNextRound() {
    if (!this.running) return;
    this._currentRound++;
    if (this._currentRound > this._totalRounds) {
      this.running = false;
      return;
    }

    this._clearRoundTargets();
    this._roundActive = true;
    this._roundStartTime = Date.now();

    var numTargets = 1 + Math.floor(Math.random() * 2);
    var usedLanes = [];

    for (var i = 0; i < numTargets; i++) {
      var laneIdx;
      do {
        laneIdx = Math.floor(Math.random() * this._lanePositions.length);
      } while (usedLanes.indexOf(laneIdx) !== -1);
      usedLanes.push(laneIdx);

      var lane = this._lanePositions[laneIdx];
      var delay = i === 0 ? 0 : 300 + Math.random() * 700;

      var self = this;
      (function(li, ln, d) {
        setTimeout(function() {
          if (!self.running || self._stopped) return;
          self._spawnRoundTarget(li, ln);
        }, d);
      })(laneIdx, lane, delay);
    }
  }

  _spawnRoundTarget(laneIdx, lane) {
    if (!this.running) return;

    var radius = this.targetBaseRadius;
    var botGroup = this._buildHumanoidBot(radius);
    botGroup.position.set(lane.x, 1.7, lane.z);
    this._scene.add(botGroup);

    var target = {
      mesh: botGroup,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      hitAnim: 0,
      laneIdx: laneIdx,
      revealed: false,
      revealTime: 0,
      penaltyApplied: false,
    };

    this._roundTargets.push(target);
    this._targets.push(target);
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

  _isTargetVisible(target) {
    var camYaw = this._yaw;
    var lane = this._lanePositions[target.laneIdx];
    var toTargetAngle = Math.atan2(lane.x, -(lane.z));
    var angleDiff = Math.abs(camYaw - toTargetAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

    var coverHalfWidth = 1.75;
    var coverDist = Math.abs(lane.z + 4);
    var coverAngularWidth = Math.atan2(coverHalfWidth, coverDist);

    return angleDiff > coverAngularWidth * 0.8;
  }

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

    var intersects = this._raycaster.intersectObjects(allMeshes, false);

    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      var target = meshToTarget.get(hitObj);

      if (target && target.alive) {
        target.alive = false;
        target.hitAnim = 1.0;
        this._hitCount++;
        this._targetsEliminated++;

        this._createHitParticles(target.mesh.position.clone());

        if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
          VantageEngine.Audio.playKillSound();
        }

        var eliminationTime = now - target.revealTime;
        this._eliminationTimes.push(eliminationTime);

        if (this._onHit) this._onHit(eliminationTime);
        hit = true;

        var self = this;
        setTimeout(function() {
          if (self._stopped) return;
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
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  _checkRoundComplete() {
    var aliveCount = 0;
    for (var i = 0; i < this._roundTargets.length; i++) {
      if (this._roundTargets[i].alive) aliveCount++;
    }
    if (aliveCount === 0 && this._roundActive) {
      this._roundActive = false;
      var self = this;
      setTimeout(function() {
        if (self._stopped) return;
        self._startNextRound();
      }, 1000);
    }
  }

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);

    for (var i = 0; i < this._roundTargets.length; i++) {
      var t = this._roundTargets[i];

      if (t.alive) {
        var visible = this._isTargetVisible(t);
        if (visible && !t.revealed) {
          t.revealed = true;
          t.revealTime = now;
          this._peeksPerformed++;
        }

        t.opacity = Math.min(1, t.opacity + dt * 8);
        var easedOpacity = t.opacity < 1 ? 1 - Math.pow(1 - t.opacity, 3) : 1;

        if (t.mesh.userData.materials) {
          for (var j = 0; j < t.mesh.userData.materials.length; j++) {
            t.mesh.userData.materials[j].opacity = easedOpacity;
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

        if (t.revealed && !t.penaltyApplied) {
          var elapsed = now - t.revealTime;
          if (elapsed > this._reactionWindow) {
            t.penaltyApplied = true;
            this._damageTaken++;
          }
        }

        if (t.revealed) {
          this._exposureTimes.push(dt * 1000);
        }
      } else {
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

  getPeekEliminateStats() {
    var avgElimTime = 0;
    if (this._eliminationTimes.length > 0) {
      var sum = 0;
      for (var i = 0; i < this._eliminationTimes.length; i++) sum += this._eliminationTimes[i];
      avgElimTime = Math.round(sum / this._eliminationTimes.length);
    }

    var totalExposure = 0;
    for (var j = 0; j < this._exposureTimes.length; j++) totalExposure += this._exposureTimes[j];

    return {
      peeksPerformed: this._peeksPerformed,
      targetsEliminated: this._targetsEliminated,
      avgEliminationTime: avgElimTime,
      damageTaken: this._damageTaken,
      totalExposureTime: Math.round(totalExposure),
      roundsCompleted: Math.min(this._currentRound, this._totalRounds),
      totalRounds: this._totalRounds,
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
