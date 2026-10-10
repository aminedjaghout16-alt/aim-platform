/* ============================================
   Duel Practice Renderer — 3D
   Sheriff/Classic duel scenario. Limited ammo,
   1-3 enemies at varying distances. Sheriff:
   1-shot kill. Classic: headshot=kill, 3 body=kill.
   ============================================ */
VantageEngine.Renderers.DuelPracticeRenderer = class DuelPracticeRenderer extends VantageEngine.Renderers.ThreeArenaRenderer {

  constructor(canvas, scenario, config) {
    super(canvas, scenario, config);

    this._ammoRemaining = 0;
    this._maxAmmo = 0;
    this._shotsFired = 0;
    this._eliminations = 0;
    this._headshots = 0;

    this._enemies = [];
    this._enemiesToSpawn = 1;
    this._allEnemiesSpawned = false;

    this._isSheriff = true;
    this._bodyHitsForKill = 3;

    var S = VantageEngine.Settings;
    var diffSetting = S.getDifficulty(config.difficulty || 'medium');
    var diffId = diffSetting ? diffSetting.id : 'medium';

    if (diffId === 'easy') {
      this._enemiesToSpawn = 1;
      this._enemyMovement = 'stationary';
      this._minDistance = 5;
      this._maxDistance = 8;
    } else if (diffId === 'hard') {
      this._enemiesToSpawn = 3;
      this._enemyMovement = 'strafing';
      this._minDistance = 10;
      this._maxDistance = 15;
    } else {
      this._enemiesToSpawn = 2;
      this._enemyMovement = 'mixed';
      this._minDistance = 7;
      this._maxDistance = 12;
    }

    var weaponId = 'classic';
    if (VantageEngine.PlayerPrefs && VantageEngine.PlayerPrefs.get) {
      var prefs = VantageEngine.PlayerPrefs.get();
      weaponId = prefs.selectedWeapon || 'classic';
    }
    this._isSheriff = (weaponId === 'sheriff' || weaponId === 'shorty');

    if (this._isSheriff) {
      this._maxAmmo = 6;
    } else {
      this._maxAmmo = 12;
    }
    this._ammoRemaining = this._maxAmmo;

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
    this._shotsFired = 0;
    this._eliminations = 0;
    this._headshots = 0;
    this._ammoRemaining = this._maxAmmo;
    this._enemies = [];
    this._allEnemiesSpawned = false;

    this._spawnEnemies();
    this._loop();
  }

  pause() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.pause.call(this);
  }

  resume() {
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.resume.call(this);
  }

  stop() {
    this._clearAllEnemies();
    VantageEngine.Renderers.ThreeArenaRenderer.prototype.stop.call(this);
    this._enemies = [];
  }

  _spawnEnemies() {
    for (var i = 0; i < this._enemiesToSpawn; i++) {
      var delay = i * 400;
      var self = this;
      (function(idx) {
        setTimeout(function() {
          if (self._stopped || !self.running) return;
          self._spawnSingleEnemy(idx);
          if (idx === self._enemiesToSpawn - 1) {
            self._allEnemiesSpawned = true;
          }
        }, delay);
      })(i);
    }
  }

  _spawnSingleEnemy(index) {
    if (!this.running) return;

    var distance = this._minDistance + Math.random() * (this._maxDistance - this._minDistance);
    var angle = (Math.random() - 0.5) * Math.PI * 0.6;
    var x = Math.sin(angle) * distance;
    var z = -Math.cos(angle) * distance;
    var y = 1.7;

    var half = VantageEngine.Renderers.ThreeArenaRenderer.ARENA_HALF;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));

    var radius = this.targetBaseRadius;
    var botGroup = this._buildHumanoidBot(radius);
    botGroup.position.set(x, y, z);
    this._scene.add(botGroup);

    var isMoving = false;
    if (this._enemyMovement === 'strafing') {
      isMoving = true;
    } else if (this._enemyMovement === 'mixed') {
      isMoving = index > 0;
    }

    var enemy = {
      mesh: botGroup,
      radius: radius,
      spawnTime: Date.now(),
      alive: true,
      opacity: 0,
      hitAnim: 0,
      hp: this._isSheriff ? 1 : this._bodyHitsForKill,
      isMoving: isMoving,
      velocity: { x: 0, y: 0 },
      direction: Math.random() < 0.5 ? -1 : 1,
      speed: 1.5 + Math.random() * 1.5,
      moveBounds: {
        minX: x - 2,
        maxX: x + 2,
      },
      spawnX: x,
    };

    this._enemies.push(enemy);
    this._targets.push(enemy);
  }

  _clearAllEnemies() {
    for (var i = 0; i < this._enemies.length; i++) {
      var e = this._enemies[i];
      var idx = this._targets.indexOf(e);
      if (idx !== -1) this._targets.splice(idx, 1);
      if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
      e.mesh.traverse(function(child) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(function(m) { m.dispose(); });
          else child.material.dispose();
        }
      });
    }
    this._enemies = [];
  }

  _removeEnemy(enemy) {
    var idx = this._targets.indexOf(enemy);
    if (idx !== -1) this._targets.splice(idx, 1);
    var eIdx = this._enemies.indexOf(enemy);
    if (eIdx !== -1) this._enemies.splice(eIdx, 1);
    if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);
    enemy.mesh.traverse(function(child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(function(m) { m.dispose(); });
        else child.material.dispose();
      }
    });
  }

  _buildHumanoidBot(radius) {
    var group = new THREE.Group();

    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff6633,
      emissive: 0xff4411,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0,
    });

    var headMat = new THREE.MeshStandardMaterial({
      color: 0xffddcc,
      emissive: 0xff4411,
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });

    var accentMat = new THREE.MeshStandardMaterial({
      color: 0xcc3300,
      emissive: 0xcc3300,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.7,
      transparent: true,
      opacity: 0,
    });

    var visorMat = new THREE.MeshBasicMaterial({
      color: 0xff8844,
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

  _updateEnemyMovement(dt) {
    for (var i = 0; i < this._enemies.length; i++) {
      var enemy = this._enemies[i];
      if (!enemy.alive || !enemy.isMoving) continue;

      var newX = enemy.mesh.position.x + enemy.direction * enemy.speed * dt;

      if (newX < enemy.moveBounds.minX) {
        newX = enemy.moveBounds.minX;
        enemy.direction = 1;
      } else if (newX > enemy.moveBounds.maxX) {
        newX = enemy.moveBounds.maxX;
        enemy.direction = -1;
      }

      enemy.mesh.position.x = newX;
    }
  }

  _checkScenarioEnd() {
    var aliveEnemies = 0;
    for (var i = 0; i < this._enemies.length; i++) {
      if (this._enemies[i].alive) aliveEnemies++;
    }

    if (aliveEnemies === 0 && this._allEnemiesSpawned) {
      this.running = false;
      return true;
    }

    if (this._ammoRemaining <= 0 && aliveEnemies > 0) {
      this.running = false;
      return true;
    }

    return false;
  }

  _tryFire() {
    if (!this.running || this._paused || this._stopped) return;

    if (this._ammoRemaining <= 0) {
      this._checkScenarioEnd();
      return;
    }

    var now = Date.now();
    var weapon = this._weapon;
    var minInterval = weapon ? VantageEngine.Weapons.getIntervalMs(weapon) : 100;
    if (now - this._lastFireTime < minInterval - 5) return;
    this._lastFireTime = now;

    this._ammoRemaining--;
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

    var allMeshes = [];
    var meshToEnemy = new Map();

    for (var i = 0; i < this._enemies.length; i++) {
      var enemy = this._enemies[i];
      if (!enemy.alive) continue;

      enemy.mesh.traverse(function(child) {
        if (child.isMesh) {
          allMeshes.push(child);
          meshToEnemy.set(child, enemy);
        }
      });
    }

    var intersects = this._raycaster.intersectObjects(allMeshes, false);

    this._spawnTracer(intersects.length > 0 ? intersects[0].point : null);
    this._applyRecoilKick();

    var hit = false;
    if (intersects.length > 0) {
      var hitObj = intersects[0].object;
      var enemy = meshToEnemy.get(hitObj);

      if (enemy && enemy.alive) {
        var hitZone = hitObj.userData.hitZone || 'body';
        var isHeadshot = (hitZone === 'head');

        var killed = false;
        if (this._isSheriff) {
          killed = true;
          if (isHeadshot) this._headshots++;
        } else {
          if (isHeadshot) {
            killed = true;
            this._headshots++;
          } else {
            enemy.hp--;
            if (enemy.hp <= 0) {
              killed = true;
            }
          }
        }

        this._createHitParticles(enemy.mesh.position.clone());

        if (killed) {
          enemy.alive = false;
          enemy.hitAnim = 1.0;
          this._hitCount++;
          this._eliminations++;

          if (VantageEngine.Audio && VantageEngine.Audio.playKillSound) {
            VantageEngine.Audio.playKillSound();
          }

          var reactionTime = now - enemy.spawnTime;
          if (this._onHit) this._onHit(reactionTime);
          hit = true;

          var self = this;
          setTimeout(function() {
            if (self._stopped) return;
            self._removeEnemy(enemy);
            self._checkScenarioEnd();
          }, 300);
        } else {
          enemy.hitAnim = 0.5;
          hit = true;
          var reactionTime = now - enemy.spawnTime;
          if (this._onHit) this._onHit(reactionTime);
        }
      }
    }

    if (!hit && this._onMiss) this._onMiss();

    if (this._ammoRemaining <= 0) {
      var self = this;
      setTimeout(function() {
        self._checkScenarioEnd();
      }, 500);
    }
  }

  _update() {
    if (!this._clock) return;
    var dt = Math.min(this._clock.getDelta(), 0.1);
    var now = Date.now();

    this._updateParticles(dt);
    this._updateWeapon(dt);
    this._updateEnemyMovement(dt);

    for (var i = 0; i < this._enemies.length; i++) {
      var enemy = this._enemies[i];

      if (enemy.alive) {
        enemy.opacity = Math.min(1, enemy.opacity + dt * 8);
        var easedOpacity = enemy.opacity < 1 ? 1 - Math.pow(1 - enemy.opacity, 3) : 1;

        if (enemy.mesh.userData.materials) {
          for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
            enemy.mesh.userData.materials[j].opacity = easedOpacity;
          }
        }

        if (this._camera) {
          var camPos = this._camera.position.clone();
          var botPos = enemy.mesh.position.clone();
          var direction = new THREE.Vector3().subVectors(camPos, botPos);
          direction.y = 0;
          var angle = Math.atan2(direction.x, direction.z);
          enemy.mesh.rotation.y = angle;
        }

        if (enemy.hitAnim > 0) {
          enemy.hitAnim -= dt * 6;
          if (enemy.hitAnim > 0) {
            var flash = enemy.hitAnim * 2;
            if (enemy.mesh.userData.materials) {
              for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
                var mat = enemy.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 0.3 + flash * 1.5;
              }
            }
          } else {
            enemy.hitAnim = 0;
            if (enemy.mesh.userData.materials) {
              for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
                var mat = enemy.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 0.3;
              }
            }
          }
        }
      } else {
        enemy.hitAnim -= dt * 6;
        if (enemy.hitAnim > 0) {
          if (enemy.hitAnim > 0.8) {
            var flash = (1 - enemy.hitAnim) / 0.2;
            enemy.mesh.scale.setScalar(1 + flash * 0.4);
            if (enemy.mesh.userData.materials) {
              for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
                var mat = enemy.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 0.3 + flash * 3;
                mat.opacity = 1;
              }
            }
          } else if (enemy.hitAnim > 0.5) {
            var transition = (0.8 - enemy.hitAnim) / 0.3;
            enemy.mesh.scale.setScalar(1.4 - transition * 0.3);
            if (enemy.mesh.userData.materials) {
              for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
                var mat = enemy.mesh.userData.materials[j];
                if (mat.emissive) mat.emissiveIntensity = 3 - transition * 2;
              }
            }
          } else {
            var shrink = enemy.hitAnim / 0.5;
            enemy.mesh.scale.setScalar(shrink * 1.1);
            if (enemy.mesh.userData.materials) {
              for (var j = 0; j < enemy.mesh.userData.materials.length; j++) {
                enemy.mesh.userData.materials[j].opacity = shrink * 0.6;
              }
            }
          }
        }
      }
    }
  }

  getDuelPracticeStats() {
    return {
      ammoRemaining: this._ammoRemaining,
      maxAmmo: this._maxAmmo,
      shotsFired: this._shotsFired,
      eliminations: this._eliminations,
      headshots: this._headshots,
      isSheriff: this._isSheriff,
      totalEnemies: this._enemiesToSpawn,
      ammoUsed: this._maxAmmo - this._ammoRemaining,
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
