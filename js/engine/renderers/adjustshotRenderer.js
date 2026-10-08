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
    this._headshots = 0;
    this._bodyKills = 0;
    this._shotsFired = 0;
    this._hitTimes = [];

    // Bot health system (reuse from BotStrafe)
    this._botHP = 4;
    this._maxBotHP = 4;

    // Combat indicators
    this._combatIndicator = null;
    this._combatIndicatorTimer = null;
    this._combatIndicatorStyle = null;

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
    this._headshots = 0;
    this._bodyKills = 0;
    this._shotsFired = 0;
    this._hitTimes = [];
    this._combatIndicator = null;

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
    this._headshots = 0;
    this._bodyKills = 0;
    this._shotsFired = 0;
    this._hitTimes = [];
    this._combatIndicator = null;
    this._combatIndicatorStyle = null;
    if (this._combatIndicatorTimer) {
      clearTimeout(this._combatIndicatorTimer);
      this._combatIndicatorTimer = null;
    }
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
      hp: this._maxBotHP,
      
      // Movement state
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      moveTimer: 0,
      moveDuration: 800 + Math.random() * 1200, // 0.8-2.0s between direction changes
    };

    // Build humanoid bot
    var botGroup = this._buildHumanoidBot(this.targetBaseRadius);
    botGroup.position.set(pos.x, pos.y, pos.z);
    this._scene.add(botGroup);
    target.mesh = botGroup;

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

  /* ---------- Build Humanoid Bot ---------- */

  _buildHumanoidBot(radius) {
    var group = new THREE.Group();
    
    // High-visibility cyan color scheme
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

    // HEAD
    var headGeo = new THREE.SphereGeometry(0.18 * scale, 16, 16);
    var head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.85 * scale;
    head.userData.hitZone = 'head';
    group.add(head);

    // Visor
    var visorGeo = new THREE.BoxGeometry(0.25 * scale, 0.06 * scale, 0.05 * scale);
    var visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.85 * scale, -0.15 * scale);
    visor.userData.hitZone = 'head';
    group.add(visor);

    // TORSO
    var torsoGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.25 * scale);
    var torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.45 * scale;
    torso.userData.hitZone = 'body';
    group.add(torso);

    // Chest accent
    var chestAccentGeo = new THREE.BoxGeometry(0.42 * scale, 0.08 * scale, 0.26 * scale);
    var chestAccent = new THREE.Mesh(chestAccentGeo, accentMat);
    chestAccent.position.y = 0.55 * scale;
    chestAccent.userData.hitZone = 'body';
    group.add(chestAccent);

    // SHOULDERS
    var shoulderGeo = new THREE.SphereGeometry(0.1 * scale, 12, 12);
    var leftShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    leftShoulder.position.set(-0.25 * scale, 0.65 * scale, 0);
    leftShoulder.userData.hitZone = 'body';
    group.add(leftShoulder);

    var rightShoulder = new THREE.Mesh(shoulderGeo, accentMat);
    rightShoulder.position.set(0.25 * scale, 0.65 * scale, 0);
    rightShoulder.userData.hitZone = 'body';
    group.add(rightShoulder);

    // ARMS
    var armGeo = new THREE.CylinderGeometry(0.06 * scale, 0.06 * scale, 0.4 * scale, 8);
    var leftArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.28 * scale, 0.4 * scale, 0);
    leftArm.userData.hitZone = 'body';
    group.add(leftArm);

    var rightArm = new THREE.Mesh(armGeo, bodyMat);
    rightArm.position.set(0.28 * scale, 0.4 * scale, 0);
    rightArm.userData.hitZone = 'body';
    group.add(rightArm);

    // HIPS
    var hipsGeo = new THREE.BoxGeometry(0.35 * scale, 0.15 * scale, 0.22 * scale);
    var hips = new THREE.Mesh(hipsGeo, bodyMat);
    hips.position.y = 0.15 * scale;
    hips.userData.hitZone = 'body';
    group.add(hips);

    // LEGS
    var legGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.5 * scale, 8);
    var leftLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.12 * scale, -0.2 * scale, 0);
    leftLeg.userData.hitZone = 'body';
    group.add(leftLeg);

    var rightLeg = new THREE.Mesh(legGeo, bodyMat);
    rightLeg.position.set(0.12 * scale, -0.2 * scale, 0);
    rightLeg.userData.hitZone = 'body';
    group.add(rightLeg);

    // KNEES
    var kneeGeo = new THREE.SphereGeometry(0.05 * scale, 8, 8);
    var leftKnee = new THREE.Mesh(kneeGeo, accentMat);
    leftKnee.position.set(-0.12 * scale, -0.05 * scale, 0.08 * scale);
    leftKnee.userData.hitZone = 'body';
    group.add(leftKnee);

    var rightKnee = new THREE.Mesh(kneeGeo, accentMat);
    rightKnee.position.set(0.12 * scale, -0.05 * scale, 0.08 * scale);
    rightKnee.userData.hitZone = 'body';
    group.add(rightKnee);

    group.userData.materials = [bodyMat, headMat, accentMat, visorMat];

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
        // Determine hit zone
        var hitZone = hitObj.userData.hitZone || 'body';
        var isHeadshot = (hitZone === 'head');

        // Apply damage
        if (isHeadshot) {
          target.hp = 0;
          this._showCombatIndicator('HEADSHOT');
        } else {
          target.hp--;
          if (target.hp <= 0) {
            this._showCombatIndicator('BODY');
          } else {
            this._showCombatIndicator('BODY HIT');
          }
        }

        // Create particle burst
        this._createHitParticles(target.mesh.position.clone());

        // Check if target died
        if (target.hp <= 0) {
          target.alive = false;
          target.hitAnim = 1.0;
          this._hitCount++;
          this._targetsKilled++;

          if (isHeadshot) {
            this._headshots++;
          } else {
            this._bodyKills++;
          }

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
        } else {
          // Target survives
          target.hitAnim = 0.5;
          hit = true;
          
          var survivalTime = now - target.spawnTime;
          if (this._onHit) this._onHit(survivalTime);
        }
      }
    }

    if (!hit && this._onMiss) this._onMiss();
  }

  /* ---------- Combat Indicator ---------- */

  _showCombatIndicator(text) {
    // Only show emblem for kills
    if (text === 'BODY HIT') return;

    // Clear any existing indicator
    if (this._combatIndicatorTimer) {
      clearTimeout(this._combatIndicatorTimer);
      this._combatIndicatorTimer = null;
    }

    // Remove existing indicator element if present
    if (this._combatIndicator && this._combatIndicator.parentElement) {
      this._combatIndicator.parentElement.removeChild(this._combatIndicator);
    }

    // Create container
    var indicator = document.createElement('div');
    indicator.className = 'adjustshot-kill-emblem';
    
    var displayText = text === 'HEADSHOT' ? 'HEADSHOT' : 'KILL';
    var accentColor = text === 'HEADSHOT' ? '#ff3366' : '#00d4ff';
    
    var svgMarkup = this._createSkullEmblemSVG(accentColor);
    
    indicator.innerHTML = 
      '<div class="kill-emblem-icon">' + svgMarkup + '</div>' +
      '<div class="kill-emblem-text">' + displayText + '</div>';
    
    // Position LOWER on screen
    indicator.style.position = 'absolute';
    indicator.style.left = '50%';
    indicator.style.top = '72%';
    indicator.style.transform = 'translate(-50%, -50%) scale(0.5)';
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '1000';
    indicator.style.opacity = '0';
    indicator.style.display = 'flex';
    indicator.style.flexDirection = 'column';
    indicator.style.alignItems = 'center';
    indicator.style.gap = '4px';
    
    var iconStyle = document.createElement('style');
    iconStyle.textContent = 
      '.adjustshot-kill-emblem .kill-emblem-icon { ' +
      '  width: 48px; ' +
      '  height: 48px; ' +
      '  filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.6)); ' +
      '} ' +
      '.adjustshot-kill-emblem .kill-emblem-text { ' +
      '  font-family: "Arial", sans-serif; ' +
      '  font-size: 14px; ' +
      '  font-weight: 700; ' +
      '  letter-spacing: 2px; ' +
      '  color: ' + accentColor + '; ' +
      '  text-shadow: 0 0 10px rgba(0, 0, 0, 0.9), 0 0 20px ' + accentColor + '40; ' +
      '  text-transform: uppercase; ' +
      '}';
    
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.appendChild(iconStyle);
      this.canvas.parentElement.appendChild(indicator);
      this._combatIndicator = indicator;
      this._combatIndicatorStyle = iconStyle;

      requestAnimationFrame(function() {
        indicator.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease-out';
        indicator.style.transform = 'translate(-50%, -50%) scale(1)';
        indicator.style.opacity = '1';
      });

      var self = this;
      this._combatIndicatorTimer = setTimeout(function () {
        if (self._combatIndicator) {
          self._combatIndicator.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
          self._combatIndicator.style.opacity = '0';
          self._combatIndicator.style.transform = 'translate(-50%, -50%) scale(0.9)';
          setTimeout(function () {
            if (self._combatIndicator && self._combatIndicator.parentElement) {
              self._combatIndicator.parentElement.removeChild(self._combatIndicator);
            }
            if (self._combatIndicatorStyle && self._combatIndicatorStyle.parentElement) {
              self._combatIndicatorStyle.parentElement.removeChild(self._combatIndicatorStyle);
            }
            self._combatIndicator = null;
            self._combatIndicatorStyle = null;
          }, 300);
        }
      }, 800);
    }
  }

  _createSkullEmblemSVG(accentColor) {
    return '<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="24" cy="24" r="22" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.9"/>' +
      '<circle cx="24" cy="24" r="18" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>' +
      '<line x1="24" y1="0" x2="24" y2="6" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>' +
      '<line x1="24" y1="42" x2="24" y2="48" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>' +
      '<line x1="0" y1="24" x2="6" y2="24" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>' +
      '<line x1="42" y1="24" x2="48" y2="24" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>' +
      '<circle cx="24" cy="3" r="1.5" fill="' + accentColor + '" opacity="0.9"/>' +
      '<path d="M 24 12 Q 18 12 16 16 Q 14 20 16 24 L 18 26 L 18 28 L 20 28 L 20 26 L 22 26 L 22 28 L 26 28 L 26 26 L 28 26 L 28 28 L 30 28 L 30 26 L 32 24 Q 34 20 32 16 Q 30 12 24 12 Z" fill="#ffffff" opacity="0.95"/>' +
      '<ellipse cx="20" cy="19" rx="2.5" ry="3" fill="#0a0a0a" opacity="0.9"/>' +
      '<ellipse cx="28" cy="19" rx="2.5" ry="3" fill="#0a0a0a" opacity="0.9"/>' +
      '<path d="M 24 22 L 23 24 L 25 24 Z" fill="#0a0a0a" opacity="0.8"/>' +
      '<circle cx="24" cy="24" r="23" fill="none" stroke="' + accentColor + '" stroke-width="0.5" opacity="0.3"/>' +
    '</svg>';
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

        // Face camera
        if (this._camera) {
          var camPos = this._camera.position.clone();
          var botPos = target.mesh.position.clone();
          var direction = new THREE.Vector3().subVectors(camPos, botPos);
          direction.y = 0;
          var angle = Math.atan2(direction.x, direction.z);
          target.mesh.rotation.y = angle;
        }

        // Non-lethal hit animation
        if (target.hitAnim > 0 && target.hp > 0) {
          target.hitAnim -= dt * 6;
          if (target.hitAnim > 0) {
            var flash = target.hitAnim * 2;
            if (target.mesh.userData.materials) {
              for (var j = 0; j < target.mesh.userData.materials.length; j++) {
                var mat = target.mesh.userData.materials[j];
                if (mat.emissive) {
                  mat.emissiveIntensity = 0.3 + flash * 1.5;
                }
              }
            }
          } else {
            target.hitAnim = 0;
            if (target.mesh.userData.materials) {
              for (var j = 0; j < target.mesh.userData.materials.length; j++) {
                var mat = target.mesh.userData.materials[j];
                if (mat.emissive) {
                  mat.emissiveIntensity = 0.3;
                }
              }
            }
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

    var headshotPercentage = 0;
    if (this._targetsKilled > 0) {
      headshotPercentage = Math.round((this._headshots / this._targetsKilled) * 100);
    }

    var elapsed = (Date.now() - this._sessionStartTime) / 1000;
    var killsPerSecond = elapsed > 0 ? (this._targetsKilled / elapsed).toFixed(2) : 0;

    return {
      targetsKilled: this._targetsKilled,
      headshots: this._headshots,
      bodyKills: this._bodyKills,
      shotsFired: this._shotsFired,
      accuracy: accuracy,
      headshotPercentage: headshotPercentage,
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
