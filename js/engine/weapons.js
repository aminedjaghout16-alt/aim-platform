/* ============================================
   Weapon System — Reusable weapon collection
   Each weapon has: 3D model builder, fire mode, fire rate,
   recoil profile, sound profile, and muzzle flash settings.
   Designed for future training modes to share this system.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Weapons = (function () {
  /* ---------- Weapon Definitions ---------- */

  // RECOIL TUNING (per weapon, in each weapon's `recoil` block)
  //   vertical / horizontal / recovery / pattern : legacy values. `vertical` also drives the
  //       Armory stat bar and `recovery` the gun-model kick animation. Not used for the camera.
  //   view : the CAMERA/CROSSHAIR recoil. All angles are in DEGREES.
  //       pitch     upward kick added per shot
  //       yaw       max random sideways kick per shot (0 = no horizontal recoil)
  //       maxPitch  cap on the total accumulated upward recoil (spray can't climb forever)
  //       maxYaw    cap on the total accumulated sideways recoil (+/-)
  //       recovery  how fast the view returns to the real aim point (higher = faster)
  //       delay     seconds after the last shot before recovery starts. Keep it a bit above the
  //                 weapon's shot interval on automatics so holding fire keeps climbing.
  //       snap      how fast the view follows each kick (higher = snappier)
  //   Recoil is a temporary offset on top of the player's aim; it always returns to exactly 0.

  const WEAPONS = [
    {
      id: 'vandal',
      name: 'Vandal',
      category: 'Rifle',
      description: 'Full-power automatic rifle. High damage, moderate recoil.',
      fireMode: 'auto',       // auto | semi | sniper
      fireRate: 600,          // rounds per minute
      recoil: {
        vertical: 0.08,       // upward kick (radians)
        horizontal: 0.02,     // sideways drift
        recovery: 6,          // recovery speed
        pattern: 'steady',    // steady | burst | wild
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 0.55, yaw: 0.18, maxPitch: 5.0, maxYaw: 2.0,
          recovery: 9, delay: 0.13, snap: 45,
        },
      },
      model: {
        restPos: [0.30, -0.25, -0.50],
        restRot: [-0.03, -0.06, 0.01],
        scale: 1.0,
      },
      sound: {
        thumpFreq: [160, 45],
        crackFreq: [900, 180],
        noiseFreq: 2000,
        noiseDur: 0.07,
        pingFreq: [2600, 1300],
        gain: 0.55,
      },
      muzzleFlash: {
        size: 0.10,
        color: 0xffcc33,
        duration: 0.06,
      },
      accentColor: 0x44bbff,
    },
    {
      id: 'phantom',
      name: 'Phantom',
      category: 'Rifle',
      description: 'Suppressed automatic rifle. Fast fire rate, low recoil.',
      fireMode: 'auto',
      fireRate: 666,
      recoil: {
        vertical: 0.06,
        horizontal: 0.015,
        recovery: 7,
        pattern: 'steady',
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 0.4, yaw: 0.14, maxPitch: 4.0, maxYaw: 1.6,
          recovery: 10, delay: 0.12, snap: 45,
        },
      },
      model: {
        restPos: [0.30, -0.25, -0.50],
        restRot: [-0.03, -0.06, 0.01],
        scale: 1.0,
      },
      sound: {
        thumpFreq: [130, 40],
        crackFreq: [700, 150],
        noiseFreq: 1400,
        noiseDur: 0.05,
        pingFreq: [2200, 1100],
        gain: 0.40,  // suppressed = quieter
      },
      muzzleFlash: {
        size: 0.06,
        color: 0xffaa22,
        duration: 0.04,
      },
      accentColor: 0x8844ff,
    },
    {
      id: 'sheriff',
      name: 'Sheriff',
      category: 'Pistol',
      description: 'Heavy revolver. Devastating damage, slow fire rate.',
      fireMode: 'semi',
      fireRate: 250,
      recoil: {
        vertical: 0.14,
        horizontal: 0.03,
        recovery: 4,
        pattern: 'wild',
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 1.8, yaw: 0.35, maxPitch: 6.0, maxYaw: 2.0,
          recovery: 7, delay: 0.06, snap: 50,
        },
      },
      model: {
        restPos: [0.28, -0.22, -0.45],
        restRot: [-0.05, -0.08, 0.02],
        scale: 1.0,
      },
      sound: {
        thumpFreq: [200, 35],
        crackFreq: [1100, 150],
        noiseFreq: 2200,
        noiseDur: 0.09,
        pingFreq: [3000, 1400],
        gain: 0.65,
      },
      muzzleFlash: {
        size: 0.14,
        color: 0xffdd44,
        duration: 0.08,
      },
      accentColor: 0xff6633,
    },
    {
      id: 'ghost',
      name: 'Ghost',
      category: 'Pistol',
      description: 'Compact suppressed pistol. Precise and fast.',
      fireMode: 'semi',
      fireRate: 333,
      recoil: {
        vertical: 0.05,
        horizontal: 0.01,
        recovery: 8,
        pattern: 'steady',
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 0.7, yaw: 0.15, maxPitch: 4.0, maxYaw: 1.5,
          recovery: 11, delay: 0.04, snap: 50,
        },
      },
      model: {
        restPos: [0.28, -0.22, -0.45],
        restRot: [-0.05, -0.08, 0.02],
        scale: 0.9,
      },
      sound: {
        thumpFreq: [120, 40],
        crackFreq: [650, 160],
        noiseFreq: 1200,
        noiseDur: 0.04,
        pingFreq: [2000, 1000],
        gain: 0.35,
      },
      muzzleFlash: {
        size: 0.05,
        color: 0xffbb33,
        duration: 0.03,
      },
      accentColor: 0x33ddcc,
    },
    {
      id: 'operator',
      name: 'Operator',
      category: 'Sniper',
      description: 'Bolt-action sniper rifle. One-shot kill, very slow rate.',
      fireMode: 'sniper',
      fireRate: 60,
      recoil: {
        vertical: 0.22,
        horizontal: 0.04,
        recovery: 2.5,
        pattern: 'wild',
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 3.5, yaw: 0.6, maxPitch: 8.0, maxYaw: 2.5,
          recovery: 4.5, delay: 0.12, snap: 55,
        },
      },
      model: {
        restPos: [0.32, -0.28, -0.55],
        restRot: [-0.02, -0.05, 0.01],
        scale: 1.2,
      },
      sound: {
        thumpFreq: [250, 25],
        crackFreq: [1400, 100],
        noiseFreq: 2800,
        noiseDur: 0.14,
        pingFreq: [3500, 1600],
        gain: 0.80,
      },
      muzzleFlash: {
        size: 0.18,
        color: 0xffee55,
        duration: 0.12,
      },
      accentColor: 0xffcc00,
    },
    {
      id: 'classic',
      name: 'Classic',
      category: 'Pistol',
      description: 'Standard-issue pistol. Reliable and balanced.',
      fireMode: 'semi',
      fireRate: 400,
      recoil: {
        vertical: 0.07,
        horizontal: 0.015,
        recovery: 7,
        pattern: 'steady',
        view: {            // camera recoil, degrees (see RECOIL TUNING above)
          pitch: 1.0, yaw: 0.2, maxPitch: 5.0, maxYaw: 1.8,
          recovery: 9, delay: 0.05, snap: 50,
        },
      },
      model: {
        restPos: [0.28, -0.22, -0.45],
        restRot: [-0.05, -0.08, 0.02],
        scale: 1.0,
      },
      sound: {
        thumpFreq: [150, 40],
        crackFreq: [800, 200],
        noiseFreq: 1800,
        noiseDur: 0.08,
        pingFreq: [2400, 1200],
        gain: 0.50,
      },
      muzzleFlash: {
        size: 0.08,
        color: 0xffdd44,
        duration: 0.06,
      },
      accentColor: 0x00e0d0,
    },
  ];

  /* ---------- Lookup helpers ---------- */

  function getById(id) {
    return WEAPONS.find(function (w) { return w.id === id; }) || WEAPONS[WEAPONS.length - 1];
  }

  function getAll() { return WEAPONS.slice(); }

  function getIntervalMs(weapon) {
    return 60000 / (weapon.fireRate || 400);
  }

  /* ---------- 3D Model Builders ---------- */
  // Each builder returns a THREE.Group with the weapon model.
  // The group's origin is the "hold point" that attaches to the camera.
  // Materials use the weapon's accent color for visual identity.

  function makeMaterials(accent) {
    return {
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.5, metalness: 0.25 }),
      medMetal: new THREE.MeshStandardMaterial({ color: 0x3d4048, roughness: 0.5, metalness: 0.25 }),
      lightMetal: new THREE.MeshStandardMaterial({ color: 0x5a5f69, roughness: 0.4, metalness: 0.3 }),
      gripMat: new THREE.MeshStandardMaterial({ color: 0x1f2024, roughness: 0.8, metalness: 0.1 }),
      skinMat: new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.7, metalness: 0.05 }),
      sleeveMat: new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.75, metalness: 0.1 }),
      accentMat: new THREE.MeshStandardMaterial({
        color: accent, roughness: 0.3, metalness: 0.6,
        emissive: accent, emissiveIntensity: 0.15,
      }),
    };
  }

  function addHand(group, M, gripY, gripZ) {
    // Palm
    var palmGeo = new THREE.BoxGeometry(0.055, 0.04, 0.07);
    var palm = new THREE.Mesh(palmGeo, M.skinMat);
    palm.position.set(0, gripY, gripZ);
    palm.rotation.x = 0.2;
    group.add(palm);
    // Fingers
    for (var i = 0; i < 4; i++) {
      var fg = new THREE.BoxGeometry(0.012, 0.015, 0.04);
      var f = new THREE.Mesh(fg, M.skinMat);
      f.position.set(-0.018 + i * 0.012, gripY - 0.025, gripZ - 0.015 - i * 0.005);
      f.rotation.x = 0.4;
      group.add(f);
    }
    // Thumb
    var tg = new THREE.BoxGeometry(0.015, 0.012, 0.045);
    var th = new THREE.Mesh(tg, M.skinMat);
    th.position.set(0.03, gripY + 0.02, gripZ - 0.01);
    th.rotation.z = -0.3; th.rotation.x = 0.15;
    group.add(th);
    // Wrist
    var wg = new THREE.BoxGeometry(0.05, 0.035, 0.12);
    var wr = new THREE.Mesh(wg, M.skinMat);
    wr.position.set(0, gripY - 0.005, gripZ + 0.08);
    wr.rotation.x = 0.1;
    group.add(wr);
    // Sleeve
    var sg = new THREE.BoxGeometry(0.058, 0.042, 0.1);
    var sl = new THREE.Mesh(sg, M.sleeveMat);
    sl.position.set(0, gripY - 0.007, gripZ + 0.16);
    sl.rotation.x = 0.08;
    group.add(sl);
  }

  function addMuzzleFlash(group, weapon) {
    var mf = weapon.muzzleFlash;
    var flashGeo = new THREE.PlaneGeometry(mf.size, mf.size);
    var flashMat = new THREE.MeshBasicMaterial({
      color: mf.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    var flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, 0.025, -0.32);
    group.add(flash);

    var f2Geo = new THREE.PlaneGeometry(mf.size * 0.75, mf.size * 0.75);
    var f2Mat = new THREE.MeshBasicMaterial({
      color: mf.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    var f2 = new THREE.Mesh(f2Geo, f2Mat);
    f2.position.set(0, 0.025, -0.32);
    f2.rotation.y = Math.PI / 2;
    group.add(f2);

    return { flash: flash, flash2: f2 };
  }

  function disableRaycast(group) {
    group.traverse(function (child) { child.raycast = function () {}; });
  }

  function addEdgeOutlines(group) {
    var edgeMat = new THREE.LineBasicMaterial({ color: 0x9aa0ab, transparent: true, opacity: 0.5 });
    var boxes = [];
    group.traverse(function (c) {
      if (c.isMesh && c.geometry && c.geometry.type === 'BoxGeometry' && c.material && c.material.isMeshStandardMaterial) boxes.push(c);
    });
    for (var i = 0; i < boxes.length; i++) {
      var m = boxes[i];
      var edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat);
      edges.position.copy(m.position);
      edges.rotation.copy(m.rotation);
      edges.scale.copy(m.scale);
      m.parent.add(edges);
    }
  }

  /* --- Classic (standard pistol — the original model) --- */
  function buildClassic(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Receiver
    var bodyGeo = new THREE.BoxGeometry(0.045, 0.06, 0.22);
    var body = new THREE.Mesh(bodyGeo, M.medMetal);
    body.position.set(0, 0, -0.04);
    group.add(body);
    // Slide
    var slideGeo = new THREE.BoxGeometry(0.04, 0.025, 0.24);
    var slide = new THREE.Mesh(slideGeo, M.darkMetal);
    slide.position.set(0, 0.042, -0.04);
    group.add(slide);
    // Barrel
    var barrelGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.14, 8);
    var barrel = new THREE.Mesh(barrelGeo, M.lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.24);
    group.add(barrel);
    // Shroud
    var shroudGeo = new THREE.BoxGeometry(0.035, 0.035, 0.1);
    var shroud = new THREE.Mesh(shroudGeo, M.darkMetal);
    shroud.position.set(0, 0.025, -0.2);
    group.add(shroud);
    // Grip
    var gripGeo = new THREE.BoxGeometry(0.038, 0.09, 0.045);
    var grip = new THREE.Mesh(gripGeo, M.gripMat);
    grip.position.set(0, -0.065, 0.04);
    grip.rotation.x = 0.2;
    group.add(grip);
    // Magazine
    var magGeo = new THREE.BoxGeometry(0.03, 0.055, 0.035);
    var mag = new THREE.Mesh(magGeo, M.darkMetal);
    mag.position.set(0, -0.06, 0.01);
    group.add(mag);
    // Trigger guard
    var guardGeo = new THREE.TorusGeometry(0.018, 0.003, 6, 12, Math.PI);
    var guard = new THREE.Mesh(guardGeo, M.medMetal);
    guard.position.set(0, -0.035, -0.01);
    guard.rotation.y = Math.PI / 2;
    group.add(guard);
    // Accent line
    var accentGeo = new THREE.BoxGeometry(0.042, 0.003, 0.06);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.055, -0.08);
    group.add(accent);
    // Sights
    var fSightGeo = new THREE.BoxGeometry(0.005, 0.012, 0.005);
    var fSight = new THREE.Mesh(fSightGeo, M.darkMetal);
    fSight.position.set(0, 0.062, -0.15);
    group.add(fSight);
    var rSightGeo = new THREE.BoxGeometry(0.025, 0.01, 0.008);
    var rSight = new THREE.Mesh(rSightGeo, M.darkMetal);
    rSight.position.set(0, 0.06, 0.05);
    group.add(rSight);

    addHand(group, M, -0.065, 0.04);
    var mf = addMuzzleFlash(group, weapon);
    addEdgeOutlines(group);
    disableRaycast(group);

    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Vandal (assault rifle) --- */
  function buildVandal(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Main receiver (longer, wider)
    var bodyGeo = new THREE.BoxGeometry(0.05, 0.065, 0.34);
    var body = new THREE.Mesh(bodyGeo, M.medMetal);
    body.position.set(0, 0, -0.06);
    group.add(body);
    // Upper receiver / rail
    var railGeo = new THREE.BoxGeometry(0.042, 0.018, 0.30);
    var rail = new THREE.Mesh(railGeo, M.darkMetal);
    rail.position.set(0, 0.042, -0.06);
    group.add(rail);
    // Barrel
    var barrelGeo = new THREE.CylinderGeometry(0.009, 0.010, 0.20, 8);
    var barrel = new THREE.Mesh(barrelGeo, M.lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.020, -0.33);
    group.add(barrel);
    // Barrel shroud / handguard
    var hgGeo = new THREE.BoxGeometry(0.042, 0.042, 0.16);
    var hg = new THREE.Mesh(hgGeo, M.darkMetal);
    hg.position.set(0, 0.015, -0.26);
    group.add(hg);
    // Magazine (curved)
    var magGeo = new THREE.BoxGeometry(0.032, 0.09, 0.04);
    var mag = new THREE.Mesh(magGeo, M.darkMetal);
    mag.position.set(0, -0.07, -0.04);
    mag.rotation.x = 0.12;
    group.add(mag);
    // Grip
    var gripGeo = new THREE.BoxGeometry(0.035, 0.07, 0.035);
    var grip = new THREE.Mesh(gripGeo, M.gripMat);
    grip.position.set(0, -0.065, 0.06);
    grip.rotation.x = 0.25;
    group.add(grip);
    // Stock
    var stockGeo = new THREE.BoxGeometry(0.04, 0.05, 0.12);
    var stock = new THREE.Mesh(stockGeo, M.darkMetal);
    stock.position.set(0, 0.01, 0.18);
    group.add(stock);
    var stockEnd = new THREE.BoxGeometry(0.042, 0.065, 0.02);
    var stockEndM = new THREE.Mesh(stockEnd, M.medMetal);
    stockEndM.position.set(0, 0.01, 0.24);
    group.add(stockEndM);
    // Accent stripe
    var accentGeo = new THREE.BoxGeometry(0.052, 0.003, 0.12);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.052, -0.10);
    group.add(accent);
    // Front sight
    var fSightGeo = new THREE.BoxGeometry(0.005, 0.015, 0.005);
    var fSight = new THREE.Mesh(fSightGeo, M.darkMetal);
    fSight.position.set(0, 0.06, -0.22);
    group.add(fSight);
    // Rear sight
    var rSightGeo = new THREE.BoxGeometry(0.03, 0.012, 0.008);
    var rSight = new THREE.Mesh(rSightGeo, M.darkMetal);
    rSight.position.set(0, 0.058, 0.04);
    group.add(rSight);

    // Hand (holding grip, more forward for rifle)
    addHand(group, M, -0.065, 0.06);
    // Support hand on handguard
    var spGeo = new THREE.BoxGeometry(0.05, 0.035, 0.06);
    var sp = new THREE.Mesh(spGeo, M.skinMat);
    sp.position.set(0, -0.01, -0.22);
    group.add(sp);
    for (var i = 0; i < 4; i++) {
      var fg = new THREE.BoxGeometry(0.011, 0.012, 0.035);
      var f = new THREE.Mesh(fg, M.skinMat);
      f.position.set(-0.016 + i * 0.011, -0.03, -0.22);
      group.add(f);
    }

    var mf = addMuzzleFlash(group, weapon);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Phantom (suppressed rifle) --- */
  function buildPhantom(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Receiver (slightly shorter than Vandal)
    var bodyGeo = new THREE.BoxGeometry(0.048, 0.060, 0.30);
    var body = new THREE.Mesh(bodyGeo, M.medMetal);
    body.position.set(0, 0, -0.05);
    group.add(body);
    // Upper rail
    var railGeo = new THREE.BoxGeometry(0.040, 0.016, 0.26);
    var rail = new THREE.Mesh(railGeo, M.darkMetal);
    rail.position.set(0, 0.040, -0.05);
    group.add(rail);
    // Suppressor (large cylinder)
    var suppGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.14, 12);
    var supp = new THREE.Mesh(suppGeo, M.darkMetal);
    supp.rotation.x = Math.PI / 2;
    supp.position.set(0, 0.018, -0.32);
    group.add(supp);
    // Suppressor rings
    for (var r = 0; r < 3; r++) {
      var ringGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.006, 12);
      var ring = new THREE.Mesh(ringGeo, M.lightMetal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.018, -0.27 - r * 0.04);
      group.add(ring);
    }
    // Handguard
    var hgGeo = new THREE.BoxGeometry(0.040, 0.040, 0.12);
    var hg = new THREE.Mesh(hgGeo, M.darkMetal);
    hg.position.set(0, 0.012, -0.22);
    group.add(hg);
    // Magazine
    var magGeo = new THREE.BoxGeometry(0.030, 0.085, 0.038);
    var mag = new THREE.Mesh(magGeo, M.darkMetal);
    mag.position.set(0, -0.068, -0.03);
    mag.rotation.x = 0.10;
    group.add(mag);
    // Grip
    var gripGeo = new THREE.BoxGeometry(0.034, 0.065, 0.034);
    var grip = new THREE.Mesh(gripGeo, M.gripMat);
    grip.position.set(0, -0.062, 0.06);
    grip.rotation.x = 0.25;
    group.add(grip);
    // Stock (collapsible look)
    var stockGeo = new THREE.BoxGeometry(0.035, 0.045, 0.10);
    var stock = new THREE.Mesh(stockGeo, M.darkMetal);
    stock.position.set(0, 0.008, 0.16);
    group.add(stock);
    // Accent
    var accentGeo = new THREE.BoxGeometry(0.050, 0.003, 0.10);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.050, -0.08);
    group.add(accent);
    // Sights
    var fSightGeo = new THREE.BoxGeometry(0.005, 0.013, 0.005);
    var fSight = new THREE.Mesh(fSightGeo, M.darkMetal);
    fSight.position.set(0, 0.057, -0.18);
    group.add(fSight);
    var rSightGeo = new THREE.BoxGeometry(0.028, 0.011, 0.008);
    var rSight = new THREE.Mesh(rSightGeo, M.darkMetal);
    rSight.position.set(0, 0.055, 0.04);
    group.add(rSight);

    addHand(group, M, -0.062, 0.06);
    var spGeo = new THREE.BoxGeometry(0.048, 0.032, 0.055);
    var sp = new THREE.Mesh(spGeo, M.skinMat);
    sp.position.set(0, -0.008, -0.20);
    group.add(sp);

    var mf = addMuzzleFlash(group, weapon);
    // Move flash to end of suppressor
    if (mf.flash) mf.flash.position.set(0, 0.018, -0.40);
    if (mf.flash2) mf.flash2.position.set(0, 0.018, -0.40);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Sheriff (heavy revolver) --- */
  function buildSheriff(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Frame
    var frameGeo = new THREE.BoxGeometry(0.048, 0.055, 0.14);
    var frame = new THREE.Mesh(frameGeo, M.medMetal);
    frame.position.set(0, 0, -0.02);
    group.add(frame);
    // Cylinder (revolver chamber)
    var cylGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12);
    var cyl = new THREE.Mesh(cylGeo, M.lightMetal);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(0, 0.005, -0.06);
    group.add(cyl);
    // Barrel (long)
    var barrelGeo = new THREE.CylinderGeometry(0.010, 0.011, 0.18, 8);
    var barrel = new THREE.Mesh(barrelGeo, M.lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.20);
    group.add(barrel);
    // Barrel shroud
    var shroudGeo = new THREE.BoxGeometry(0.035, 0.030, 0.14);
    var shroud = new THREE.Mesh(shroudGeo, M.darkMetal);
    shroud.position.set(0, 0.012, -0.16);
    group.add(shroud);
    // Top strap
    var strapGeo = new THREE.BoxGeometry(0.020, 0.008, 0.16);
    var strap = new THREE.Mesh(strapGeo, M.darkMetal);
    strap.position.set(0, 0.035, -0.12);
    group.add(strap);
    // Grip (wood-like)
    var gripMat = new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.85, metalness: 0.05 });
    var gripGeo = new THREE.BoxGeometry(0.040, 0.10, 0.045);
    var grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.072, 0.04);
    grip.rotation.x = 0.3;
    group.add(grip);
    // Hammer
    var hamGeo = new THREE.BoxGeometry(0.008, 0.020, 0.015);
    var ham = new THREE.Mesh(hamGeo, M.darkMetal);
    ham.position.set(0, 0.040, 0.04);
    group.add(ham);
    // Trigger guard
    var guardGeo = new THREE.TorusGeometry(0.016, 0.003, 6, 12, Math.PI);
    var guard = new THREE.Mesh(guardGeo, M.medMetal);
    guard.position.set(0, -0.035, -0.01);
    guard.rotation.y = Math.PI / 2;
    group.add(guard);
    // Accent line
    var accentGeo = new THREE.BoxGeometry(0.050, 0.003, 0.04);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.040, -0.02);
    group.add(accent);
    // Front sight
    var fSightGeo = new THREE.BoxGeometry(0.005, 0.014, 0.005);
    var fSight = new THREE.Mesh(fSightGeo, M.darkMetal);
    fSight.position.set(0, 0.048, -0.24);
    group.add(fSight);

    addHand(group, M, -0.072, 0.04);
    var mf = addMuzzleFlash(group, weapon);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Ghost (compact suppressed pistol) --- */
  function buildGhost(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Slide (compact)
    var slideGeo = new THREE.BoxGeometry(0.036, 0.028, 0.18);
    var slide = new THREE.Mesh(slideGeo, M.darkMetal);
    slide.position.set(0, 0.038, -0.04);
    group.add(slide);
    // Frame / receiver (shorter)
    var bodyGeo = new THREE.BoxGeometry(0.038, 0.048, 0.14);
    var body = new THREE.Mesh(bodyGeo, M.medMetal);
    body.position.set(0, -0.002, -0.02);
    group.add(body);
    // Suppressor (integrated, slim)
    var suppGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.08, 10);
    var supp = new THREE.Mesh(suppGeo, M.darkMetal);
    supp.rotation.x = Math.PI / 2;
    supp.position.set(0, 0.020, -0.20);
    group.add(supp);
    // Barrel (internal, short)
    var barrelGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.08, 8);
    var barrel = new THREE.Mesh(barrelGeo, M.lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.020, -0.14);
    group.add(barrel);
    // Grip (compact)
    var gripGeo = new THREE.BoxGeometry(0.034, 0.075, 0.038);
    var grip = new THREE.Mesh(gripGeo, M.gripMat);
    grip.position.set(0, -0.058, 0.03);
    grip.rotation.x = 0.18;
    group.add(grip);
    // Magazine
    var magGeo = new THREE.BoxGeometry(0.026, 0.045, 0.028);
    var mag = new THREE.Mesh(magGeo, M.darkMetal);
    mag.position.set(0, -0.050, 0.01);
    group.add(mag);
    // Accent
    var accentGeo = new THREE.BoxGeometry(0.038, 0.003, 0.05);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.054, -0.06);
    group.add(accent);
    // Sights (low profile)
    var fSightGeo = new THREE.BoxGeometry(0.004, 0.008, 0.004);
    var fSight = new THREE.Mesh(fSightGeo, M.darkMetal);
    fSight.position.set(0, 0.058, -0.12);
    group.add(fSight);
    var rSightGeo = new THREE.BoxGeometry(0.020, 0.008, 0.006);
    var rSight = new THREE.Mesh(rSightGeo, M.darkMetal);
    rSight.position.set(0, 0.056, 0.04);
    group.add(rSight);

    addHand(group, M, -0.058, 0.03);
    var mf = addMuzzleFlash(group, weapon);
    if (mf.flash) mf.flash.position.set(0, 0.020, -0.25);
    if (mf.flash2) mf.flash2.position.set(0, 0.020, -0.25);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Operator (bolt-action sniper) --- */
  function buildOperator(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Long receiver
    var bodyGeo = new THREE.BoxGeometry(0.048, 0.058, 0.40);
    var body = new THREE.Mesh(bodyGeo, M.medMetal);
    body.position.set(0, 0, -0.08);
    group.add(body);
    // Bolt handle
    var boltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8);
    var bolt = new THREE.Mesh(boltGeo, M.lightMetal);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.03, 0.02, 0.02);
    group.add(bolt);
    var knobGeo = new THREE.SphereGeometry(0.012, 8, 8);
    var knob = new THREE.Mesh(knobGeo, M.lightMetal);
    knob.position.set(0.05, 0.02, 0.02);
    group.add(knob);
    // Long barrel
    var barrelGeo = new THREE.CylinderGeometry(0.010, 0.012, 0.35, 8);
    var barrel = new THREE.Mesh(barrelGeo, M.lightMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.45);
    group.add(barrel);
    // Barrel shroud
    var shroudGeo = new THREE.BoxGeometry(0.038, 0.038, 0.18);
    var shroud = new THREE.Mesh(shroudGeo, M.darkMetal);
    shroud.position.set(0, 0.012, -0.32);
    group.add(shroud);
    // Scope (prominent)
    var scopeBodyGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12);
    var scopeBody = new THREE.Mesh(scopeBodyGeo, M.darkMetal);
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.position.set(0, 0.065, -0.06);
    group.add(scopeBody);
    // Scope lens (front)
    var lensGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.008, 12);
    var lensMat = new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.6 });
    var lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.065, -0.14);
    group.add(lens);
    // Scope rings
    for (var sr = 0; sr < 2; sr++) {
      var srGeo = new THREE.CylinderGeometry(0.021, 0.021, 0.012, 12);
      var srMesh = new THREE.Mesh(srGeo, M.medMetal);
      srMesh.rotation.x = Math.PI / 2;
      srMesh.position.set(0, 0.065, -0.02 + sr * 0.08);
      group.add(srMesh);
    }
    // Magazine
    var magGeo = new THREE.BoxGeometry(0.032, 0.06, 0.05);
    var mag = new THREE.Mesh(magGeo, M.darkMetal);
    mag.position.set(0, -0.058, -0.04);
    group.add(mag);
    // Grip
    var gripGeo = new THREE.BoxGeometry(0.034, 0.075, 0.036);
    var grip = new THREE.Mesh(gripGeo, M.gripMat);
    grip.position.set(0, -0.065, 0.06);
    grip.rotation.x = 0.22;
    group.add(grip);
    // Stock (long)
    var stockGeo = new THREE.BoxGeometry(0.042, 0.055, 0.18);
    var stock = new THREE.Mesh(stockGeo, M.darkMetal);
    stock.position.set(0, 0.005, 0.24);
    group.add(stock);
    // Buttpad
    var padGeo = new THREE.BoxGeometry(0.044, 0.065, 0.015);
    var pad = new THREE.Mesh(padGeo, M.gripMat);
    pad.position.set(0, 0.005, 0.33);
    group.add(pad);
    // Accent stripe
    var accentGeo = new THREE.BoxGeometry(0.050, 0.003, 0.14);
    var accent = new THREE.Mesh(accentGeo, M.accentMat);
    accent.position.set(0, 0.040, -0.10);
    group.add(accent);
    // Bipod (folded)
    for (var bp = -1; bp <= 1; bp += 2) {
      var bpGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6);
      var bpMesh = new THREE.Mesh(bpGeo, M.lightMetal);
      bpMesh.position.set(bp * 0.02, -0.03, -0.28);
      bpMesh.rotation.z = bp * 0.15;
      group.add(bpMesh);
    }

    addHand(group, M, -0.065, 0.06);
    // Support hand forward
    var spGeo = new THREE.BoxGeometry(0.048, 0.032, 0.055);
    var sp = new THREE.Mesh(spGeo, M.skinMat);
    sp.position.set(0, -0.01, -0.26);
    group.add(sp);

    var mf = addMuzzleFlash(group, weapon);
    if (mf.flash) mf.flash.position.set(0, 0.015, -0.63);
    if (mf.flash2) mf.flash2.position.set(0, 0.015, -0.63);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* ---------- Model builder dispatch ---------- */

  var BUILDERS = {
    classic: buildClassic,
    vandal: buildVandal,
    phantom: buildPhantom,
    sheriff: buildSheriff,
    ghost: buildGhost,
    operator: buildOperator,
  };

  function buildModel(weapon) {
    var builder = BUILDERS[weapon.id] || buildClassic;
    return builder(weapon);
  }

  /* ---------- Sound dispatch ---------- */
  // Each weapon has unique sound parameters.
  // Returns a function that plays the weapon fire sound given an Audio context.

  function createFireSound(weapon) {
    var s = weapon.sound;
    return function playWeaponFire(audioCtx, sfxBus) {
      if (!audioCtx || audioCtx.state !== 'running') return;
      var t0 = audioCtx.currentTime;

      // Layer 1: Low-end thump
      var thump = audioCtx.createOscillator();
      var thumpGain = audioCtx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(s.thumpFreq[0], t0);
      thump.frequency.exponentialRampToValueAtTime(s.thumpFreq[1], t0 + 0.12);
      thumpGain.gain.setValueAtTime(s.gain, t0);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
      thump.connect(thumpGain);
      thumpGain.connect(sfxBus);
      thump.start(t0);
      thump.stop(t0 + 0.17);

      // Layer 2: Mid crack
      var crack = audioCtx.createOscillator();
      var crackGain = audioCtx.createGain();
      crack.type = 'sawtooth';
      crack.frequency.setValueAtTime(s.crackFreq[0], t0);
      crack.frequency.exponentialRampToValueAtTime(s.crackFreq[1], t0 + 0.06);
      crackGain.gain.setValueAtTime(s.gain * 0.45, t0);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
      crack.connect(crackGain);
      crackGain.connect(sfxBus);
      crack.start(t0);
      crack.stop(t0 + 0.1);

      // Layer 3: Noise burst
      var bufferSize = Math.floor(audioCtx.sampleRate * (s.noiseDur + 0.02));
      var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      var noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      var noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(s.gain * 0.6, t0);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + s.noiseDur);
      var noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = s.noiseFreq;
      noiseFilter.Q.value = 0.8;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(sfxBus);
      noise.start(t0);
      noise.stop(t0 + s.noiseDur + 0.02);

      // Layer 4: High-frequency ping
      var ping = audioCtx.createOscillator();
      var pingGain = audioCtx.createGain();
      ping.type = 'square';
      ping.frequency.setValueAtTime(s.pingFreq[0], t0);
      ping.frequency.exponentialRampToValueAtTime(s.pingFreq[1], t0 + 0.04);
      pingGain.gain.setValueAtTime(s.gain * 0.12, t0);
      pingGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
      ping.connect(pingGain);
      pingGain.connect(sfxBus);
      ping.start(t0);
      ping.stop(t0 + 0.06);
    };
  }

  /* ---------- Public API ---------- */

  return {
    WEAPONS: WEAPONS,
    getById: getById,
    getAll: getAll,
    getIntervalMs: getIntervalMs,
    buildModel: buildModel,
    createFireSound: createFireSound,
  };
})();
