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
      woodMat: new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.85, metalness: 0.05 }),
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

  /* ---------- Shape helpers for the model builders ---------- */
  // box: w,h,d at x,y,z with optional rotations. cyl: runs along Z (barrel axis).
  // NOTE: Z is forward (negative = toward the muzzle). Positive rx tilts a part's
  // bottom toward the muzzle; negative rx tilts it back toward the shooter.
  function box(g, mat, w, h, d, x, y, z, rx, ry, rz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    g.add(m);
    return m;
  }
  // rFront is the radius at the muzzle (-z) end, rBack at the shooter (+z) end.
  function cyl(g, mat, rFront, rBack, len, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rBack, rFront, len, seg || 12), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  function trigger(g, M, y, zGuardFront, zGuardBack, w) {
    // Box-built trigger guard + trigger so the edge outlines pick them up.
    var len = zGuardBack - zGuardFront;
    box(g, M.medMetal, w, 0.005, len, 0, y - 0.02, (zGuardFront + zGuardBack) / 2);
    box(g, M.medMetal, w, 0.024, 0.005, 0, y - 0.008, zGuardFront);
    box(g, M.lightMetal, 0.005, 0.018, 0.006, 0, y - 0.004, zGuardBack - 0.012, 0.3);
  }

  /* --- Classic: slim blocky sidearm, dark slide on a lighter frame --- */
  function buildClassic(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Lighter frame with under-barrel rail
    box(group, M.lightMetal, 0.036, 0.034, 0.17, 0, -0.012, -0.03);
    box(group, M.darkMetal, 0.028, 0.008, 0.07, 0, -0.033, -0.075);
    // Slide + ejection port
    box(group, M.darkMetal, 0.036, 0.036, 0.21, 0, 0.024, -0.05);
    box(group, M.gripMat, 0.004, 0.014, 0.05, 0.0185, 0.03, -0.03);
    // Slide serrations (rear and front)
    for (var i = 0; i < 4; i++) box(group, M.medMetal, 0.038, 0.03, 0.003, 0, 0.026, 0.025 + i * 0.008);
    for (var j = 0; j < 3; j++) box(group, M.medMetal, 0.038, 0.03, 0.003, 0, 0.026, -0.13 - j * 0.008);
    // Barrel tip
    cyl(group, M.lightMetal, 0.0075, 0.0075, 0.03, 0, 0.024, -0.168, 10);
    // Grip, leaning back like a real handgun
    box(group, M.gripMat, 0.036, 0.095, 0.05, 0, -0.075, 0.035, -0.2);
    box(group, M.darkMetal, 0.034, 0.008, 0.052, 0, -0.123, 0.045, -0.2);
    // Hammer + trigger group
    box(group, M.darkMetal, 0.006, 0.012, 0.012, 0, 0.038, 0.052);
    trigger(group, M, -0.03, -0.045, -0.005, 0.006);
    // Accent
    box(group, M.accentMat, 0.038, 0.003, 0.05, 0, 0.043, -0.09);
    // Sights
    box(group, M.darkMetal, 0.005, 0.01, 0.008, 0, 0.047, -0.145);
    box(group, M.darkMetal, 0.007, 0.01, 0.008, -0.01, 0.046, 0.04);
    box(group, M.darkMetal, 0.007, 0.01, 0.008, 0.01, 0.046, 0.04);

    addHand(group, M, -0.065, 0.04);
    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.024, -0.2);
    mf.flash2.position.set(0, 0.024, -0.2);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Vandal: AK-style rifle — banana mag, gas tube, wood furniture --- */
  function buildVandal(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Receiver + dust cover
    box(group, M.darkMetal, 0.044, 0.056, 0.22, 0, 0, -0.02);
    box(group, M.medMetal, 0.040, 0.010, 0.20, 0, 0.033, -0.02);
    // Wood handguards (lower + upper) and gas tube above the barrel
    box(group, M.woodMat, 0.046, 0.040, 0.12, 0, -0.008, -0.20);
    box(group, M.woodMat, 0.038, 0.018, 0.12, 0, 0.026, -0.20);
    cyl(group, M.lightMetal, 0.008, 0.008, 0.14, 0, 0.042, -0.20, 8);
    // Barrel, gas block, slanted front sight, muzzle device
    cyl(group, M.lightMetal, 0.0085, 0.0085, 0.20, 0, 0.012, -0.34, 8);
    box(group, M.darkMetal, 0.014, 0.026, 0.016, 0, 0.026, -0.31);
    box(group, M.darkMetal, 0.004, 0.022, 0.006, 0, 0.05, -0.31, 0.25);
    cyl(group, M.darkMetal, 0.012, 0.012, 0.03, 0, 0.012, -0.43, 8);
    // Banana magazine (curves toward the muzzle)
    for (var i = 0; i < 4; i++) {
      box(group, M.darkMetal, 0.03, 0.036, 0.042,
          0, -0.05 - i * 0.032, -0.07 - i * 0.012 - i * i * 0.003, 0.14 + i * 0.12);
    }
    // Pistol grip + trigger group
    box(group, M.gripMat, 0.034, 0.075, 0.036, 0, -0.065, 0.075, -0.35);
    trigger(group, M, -0.028, -0.04, 0.02, 0.006);
    // Stock (wood) + buttplate
    box(group, M.woodMat, 0.036, 0.055, 0.17, 0, -0.012, 0.19, -0.05);
    box(group, M.darkMetal, 0.038, 0.07, 0.014, 0, -0.016, 0.28, -0.05);
    // Accent + rear sight
    box(group, M.accentMat, 0.046, 0.003, 0.05, 0, 0.0295, -0.14);
    box(group, M.darkMetal, 0.022, 0.010, 0.010, 0, 0.044, -0.05);

    addHand(group, M, -0.065, 0.075);
    box(group, M.skinMat, 0.05, 0.035, 0.06, 0, -0.03, -0.20);
    for (var f = 0; f < 4; f++) box(group, M.skinMat, 0.011, 0.012, 0.035, -0.016 + f * 0.011, -0.05, -0.20);

    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.012, -0.47);
    mf.flash2.position.set(0, 0.012, -0.47);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Phantom: sleek suppressed carbine — finned suppressor, rails, cheek stock --- */
  function buildPhantom(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Receiver + long top rail with teeth
    box(group, M.medMetal, 0.044, 0.058, 0.22, 0, 0, -0.02);
    box(group, M.darkMetal, 0.036, 0.012, 0.32, 0, 0.035, -0.08);
    for (var t = 0; t < 9; t++) box(group, M.lightMetal, 0.038, 0.004, 0.008, 0, 0.043, -0.2 + t * 0.03);
    // Handguard
    box(group, M.darkMetal, 0.042, 0.046, 0.14, 0, 0.0, -0.19);
    box(group, M.medMetal, 0.044, 0.01, 0.1, 0, -0.026, -0.19);
    // Integrated suppressor with fins and vents
    cyl(group, M.darkMetal, 0.02, 0.02, 0.16, 0, 0.012, -0.33, 14);
    for (var r = 0; r < 4; r++) cyl(group, M.lightMetal, 0.0225, 0.0225, 0.006, 0, 0.012, -0.275 - r * 0.035, 14);
    cyl(group, M.gripMat, 0.012, 0.012, 0.012, 0, 0.012, -0.413, 10);
    // Magazine (gentle curve)
    box(group, M.darkMetal, 0.03, 0.05, 0.04, 0, -0.05, -0.03, 0.05);
    box(group, M.darkMetal, 0.03, 0.05, 0.04, 0, -0.095, -0.04, 0.2);
    // Grip + trigger
    box(group, M.gripMat, 0.034, 0.07, 0.034, 0, -0.065, 0.065, -0.3);
    trigger(group, M, -0.028, -0.04, 0.02, 0.006);
    // Buffer tube, stock body, cheek riser
    cyl(group, M.darkMetal, 0.014, 0.014, 0.1, 0, 0.005, 0.15, 10);
    box(group, M.darkMetal, 0.036, 0.062, 0.09, 0, -0.005, 0.235, -0.08);
    box(group, M.medMetal, 0.034, 0.016, 0.08, 0, 0.034, 0.22);
    box(group, M.gripMat, 0.038, 0.066, 0.012, 0, -0.008, 0.285, -0.08);
    // Accent + flip-up sights
    box(group, M.accentMat, 0.046, 0.003, 0.1, 0, 0.0305, -0.10);
    box(group, M.darkMetal, 0.005, 0.016, 0.006, 0, 0.056, -0.25);
    box(group, M.darkMetal, 0.024, 0.014, 0.008, 0, 0.054, 0.04);

    addHand(group, M, -0.062, 0.065);
    box(group, M.skinMat, 0.048, 0.032, 0.055, 0, -0.03, -0.20);

    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.012, -0.44);
    mf.flash2.position.set(0, 0.012, -0.44);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Sheriff: big magnum revolver — fluted cylinder, underlug, wood grip --- */
  function buildSheriff(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Frame + top strap
    box(group, M.medMetal, 0.04, 0.058, 0.10, 0, 0.0, 0.0);
    box(group, M.darkMetal, 0.026, 0.01, 0.12, 0, 0.034, -0.04);
    // Fluted cylinder (6 flutes)
    cyl(group, M.lightMetal, 0.027, 0.027, 0.06, 0, 0.008, -0.07, 14);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2;
      box(group, M.darkMetal, 0.007, 0.007, 0.05, Math.cos(a) * 0.027, 0.008 + Math.sin(a) * 0.027, -0.07, 0, 0, a);
    }
    // Heavy barrel, top rib, underlug + ejector rod
    cyl(group, M.lightMetal, 0.0105, 0.0105, 0.17, 0, 0.02, -0.20, 10);
    box(group, M.darkMetal, 0.012, 0.008, 0.17, 0, 0.034, -0.20);
    cyl(group, M.darkMetal, 0.011, 0.011, 0.12, 0, -0.008, -0.18, 10);
    cyl(group, M.lightMetal, 0.004, 0.004, 0.10, 0, -0.024, -0.18, 6);
    // Sights + big hammer
    box(group, M.darkMetal, 0.005, 0.014, 0.006, 0, 0.046, -0.28);
    box(group, M.darkMetal, 0.018, 0.008, 0.01, 0, 0.044, 0.03);
    box(group, M.darkMetal, 0.01, 0.03, 0.014, 0, 0.038, 0.06, -0.5);
    // Wood grip + steel butt cap
    box(group, M.woodMat, 0.042, 0.105, 0.05, 0, -0.078, 0.05, -0.3);
    box(group, M.darkMetal, 0.044, 0.012, 0.056, 0, -0.132, 0.062, -0.3);
    trigger(group, M, -0.03, -0.035, 0.0, 0.006);
    // Brass-toned accent bands
    box(group, M.accentMat, 0.042, 0.004, 0.04, 0, 0.0305, 0.0);
    box(group, M.accentMat, 0.044, 0.004, 0.012, 0, 0.008, -0.1);

    addHand(group, M, -0.072, 0.05);
    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.02, -0.31);
    mf.flash2.position.set(0, 0.02, -0.31);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Ghost: slim pistol with a long integrated suppressor --- */
  function buildGhost(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Slide with top vents, frame below
    box(group, M.darkMetal, 0.030, 0.032, 0.20, 0, 0.03, -0.06);
    for (var v = 0; v < 3; v++) box(group, M.lightMetal, 0.020, 0.003, 0.016, 0, 0.0475, -0.02 - v * 0.03);
    box(group, M.medMetal, 0.030, 0.032, 0.14, 0, -0.005, -0.03);
    box(group, M.darkMetal, 0.024, 0.008, 0.06, 0, -0.026, -0.07);
    // Integrated suppressor: tube, rings, end cap
    cyl(group, M.darkMetal, 0.0135, 0.0135, 0.10, 0, 0.027, -0.21, 12);
    for (var r = 0; r < 3; r++) cyl(group, M.lightMetal, 0.015, 0.015, 0.005, 0, 0.027, -0.17 - r * 0.03, 12);
    cyl(group, M.gripMat, 0.008, 0.008, 0.008, 0, 0.027, -0.264, 8);
    // Angled grip + magazine base
    box(group, M.gripMat, 0.032, 0.085, 0.04, 0, -0.062, 0.03, -0.22);
    box(group, M.darkMetal, 0.030, 0.008, 0.044, 0, -0.108, 0.04, -0.22);
    trigger(group, M, -0.024, -0.04, 0.0, 0.005);
    // Accent
    box(group, M.accentMat, 0.032, 0.003, 0.05, 0, 0.0475, -0.12);
    // Tall sights to clear the suppressor
    box(group, M.darkMetal, 0.004, 0.012, 0.005, 0, 0.056, -0.10);
    box(group, M.darkMetal, 0.020, 0.010, 0.006, 0, 0.052, 0.03);

    addHand(group, M, -0.058, 0.03);
    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.027, -0.285);
    mf.flash2.position.set(0, 0.027, -0.285);
    addEdgeOutlines(group);
    disableRaycast(group);
    return { group: group, muzzleFlash: mf.flash, muzzleFlash2: mf.flash2 };
  }

  /* --- Operator: bolt-action sniper — big scope, muzzle brake, chunky stock --- */
  function buildOperator(weapon) {
    var group = new THREE.Group();
    var M = makeMaterials(weapon.accentColor);

    // Receiver + magazine
    box(group, M.medMetal, 0.046, 0.058, 0.34, 0, 0, -0.02);
    box(group, M.darkMetal, 0.032, 0.06, 0.05, 0, -0.058, -0.03);
    // Barrel inside a heavy cylindrical shroud, underside rail
    cyl(group, M.lightMetal, 0.011, 0.011, 0.38, 0, 0.012, -0.37, 10);
    cyl(group, M.darkMetal, 0.017, 0.017, 0.22, 0, 0.012, -0.30, 12);
    box(group, M.darkMetal, 0.016, 0.01, 0.16, 0, -0.012, -0.30);
    // Muzzle brake with slots
    box(group, M.darkMetal, 0.028, 0.028, 0.06, 0, 0.012, -0.55);
    for (var s = 0; s < 2; s++) box(group, M.gripMat, 0.03, 0.006, 0.01, 0, 0.012, -0.54 - s * 0.02);
    // Scope: mounts, tube, front bell, eyepiece, front lens, turrets
    box(group, M.medMetal, 0.016, 0.022, 0.02, 0, 0.046, -0.10);
    box(group, M.medMetal, 0.016, 0.022, 0.02, 0, 0.046, 0.02);
    cyl(group, M.darkMetal, 0.02, 0.02, 0.20, 0, 0.07, -0.04, 14);
    cyl(group, M.darkMetal, 0.028, 0.02, 0.05, 0, 0.07, -0.165, 14);
    cyl(group, M.darkMetal, 0.02, 0.026, 0.04, 0, 0.07, 0.07, 14);
    var lensMat = new THREE.MeshBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.6 });
    cyl(group, lensMat, 0.026, 0.026, 0.006, 0, 0.07, -0.19, 14);
    var topT = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), M.lightMetal);
    topT.position.set(0, 0.098, -0.05);
    group.add(topT);
    var sideT = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), M.lightMetal);
    sideT.rotation.z = Math.PI / 2;
    sideT.position.set(0.027, 0.07, -0.05);
    group.add(sideT);
    // Bolt body, handle, knob
    cyl(group, M.lightMetal, 0.01, 0.01, 0.06, 0, 0.018, 0.0, 8);
    var handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), M.lightMetal);
    handle.rotation.z = Math.PI / 2 + 0.4;
    handle.position.set(0.035, 0.008, 0.025);
    group.add(handle);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), M.lightMetal);
    knob.position.set(0.057, -0.002, 0.025);
    group.add(knob);
    // Grip, chunky stock with cheek riser, buttpad
    box(group, M.gripMat, 0.034, 0.08, 0.036, 0, -0.066, 0.075, -0.3);
    trigger(group, M, -0.028, -0.04, 0.025, 0.006);
    box(group, M.darkMetal, 0.044, 0.062, 0.17, 0, -0.004, 0.24, -0.04);
    box(group, M.medMetal, 0.038, 0.022, 0.12, 0, 0.04, 0.23);
    box(group, M.gripMat, 0.046, 0.074, 0.016, 0, -0.01, 0.335, -0.04);
    // Accent
    box(group, M.accentMat, 0.048, 0.003, 0.12, 0, 0.0305, -0.16);

    addHand(group, M, -0.065, 0.075);
    box(group, M.skinMat, 0.048, 0.032, 0.055, 0, -0.025, -0.26);

    var mf = addMuzzleFlash(group, weapon);
    mf.flash.position.set(0, 0.012, -0.61);
    mf.flash2.position.set(0, 0.012, -0.61);
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
