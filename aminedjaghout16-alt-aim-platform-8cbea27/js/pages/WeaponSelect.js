/* ============================================
   Weapon Selection — Armory / Weapon Collection
   Users choose their weapon before training.
   Shows weapon name, category, stats, and 3D preview.
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.WeaponSelect = function WeaponSelect({ onNavigate, onSelect, scenarioId, config }) {
  var Weapons = VantageEngine.Weapons;
  var Prefs = VantageEngine.PlayerPrefs;
  var allWeapons = Weapons.getAll();
  var currentPrefs = Prefs.get();
  // Game-mode weapon lock: only these weapons can be picked for this scenario
  var allowedIds = Weapons.getAllowedIds(scenarioId);
  var savedWeaponId = Weapons.isAllowed(currentPrefs.selectedWeapon, scenarioId)
    ? currentPrefs.selectedWeapon
    : Weapons.resolveForScenario(currentPrefs.selectedWeapon, scenarioId).id;

  var _s = useState(savedWeaponId);
  var selectedId = _s[0];
  var setSelectedId = _s[1];

  var _preview = useState(null);
  var previewCanvasRef = _preview[0] === null ? null : null;
  var previewRef = useRef(null);
  var previewSceneRef = useRef(null);

  var selectedWeapon = Weapons.getById(selectedId);

  // 3D Preview of selected weapon
  useEffect(function () {
    if (!previewRef.current || typeof THREE === 'undefined') return;
    if (!Weapons) return;

    var container = previewRef.current;
    var w = container.clientWidth || 300;
    var h = container.clientHeight || 200;

    // Clean up previous
    if (previewSceneRef.current) {
      previewSceneRef.current.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
    }

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12131a);
    previewSceneRef.current = scene;

    var camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 10);
    camera.position.set(0.3, 0.1, 0.6);
    camera.lookAt(0, 0, -0.1);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    var dLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
    dLight.position.set(2, 3, 2);
    scene.add(dLight);
    var pLight = new THREE.PointLight(0x00e0d0, 0.6, 5);
    pLight.position.set(-1, 0.5, 1);
    scene.add(pLight);

    // Build weapon model
    var weapon = Weapons.getById(selectedId);
    var result = Weapons.buildModel(weapon);
    var group = result.group;

    // Remove hand from preview (just show the weapon)
    var toRemove = [];
    group.traverse(function (child) {
      if (child.isMesh && child.material && child.material.color) {
        var c = child.material.color;
        // Skin-colored meshes (hand parts)
        if (Math.abs(c.r - 0.784) < 0.05 && Math.abs(c.g - 0.584) < 0.05 && Math.abs(c.b - 0.424) < 0.05) {
          toRemove.push(child);
        }
      }
    });
    toRemove.forEach(function (m) { if (m.parent) m.parent.remove(m); });

    // Disable raycasting
    group.traverse(function (child) { child.raycast = function () {}; });

    scene.add(group);

    // Slow rotation animation
    var animId = null;
    var startTime = Date.now();
    function animate() {
      var elapsed = (Date.now() - startTime) / 1000;
      group.rotation.y = Math.sin(elapsed * 0.5) * 0.3 - 0.1;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    }
    animate();

    // Handle resize
    var onResize = function () {
      var nw = container.clientWidth || 300;
      var nh = container.clientHeight || 200;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return function () {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [selectedId]);

  var handleSelect = function () {
    if (!Weapons.isAllowed(selectedId, scenarioId)) return; // locked in this mode
    Prefs.set({ selectedWeapon: selectedId });
    if (onSelect) onSelect(selectedId);
  };

  var handleConfirm = function () {
    handleSelect();
    if (scenarioId && config) {
      onNavigate('gameplay', scenarioId);
    }
  };

  var fireModeLabel = function (mode) {
    if (mode === 'auto') return 'Automatic';
    if (mode === 'sniper') return 'Bolt-Action';
    return 'Semi-Auto';
  };

  var fireRateLabel = function (w) {
    if (w.fireRate >= 500) return 'Very Fast';
    if (w.fireRate >= 350) return 'Fast';
    if (w.fireRate >= 200) return 'Moderate';
    return 'Slow';
  };

  var recoilLabel = function (w) {
    var v = w.recoil.vertical;
    if (v >= 0.18) return 'Heavy';
    if (v >= 0.10) return 'Moderate';
    if (v >= 0.06) return 'Light';
    return 'Minimal';
  };

  return e('div', { className: 'vpage-armory' },
    e('div', { className: 'varmory-header' },
      e('div', { className: 'varmory-title-row' },
        e('button', {
          className: 'varmory-back',
          onClick: function () { onNavigate(scenarioId ? 'setup' : 'training'); },
        }, e('span', null, '\u2190'), ' BACK'),
        e('div', null,
          e('h1', { className: 'varmory-title' }, 'ARMORY'),
          e('p', { className: 'varmory-subtitle' }, allowedIds.length < allWeapons.length
            ? 'Single-shot weapons only in this mode \u2014 the rest unlock in other game modes'
            : 'Select your weapon before training'),
        ),
      ),
    ),

    e('div', { className: 'varmory-content' },
      // Weapon grid
      e('div', { className: 'varmory-grid' },
        allWeapons.map(function (weapon, idx) {
          var isSelected = selectedId === weapon.id;
          var isLocked = allowedIds.indexOf(weapon.id) < 0;
          var accentHex = '#' + (weapon.accentColor || 0x00e0d0).toString(16).padStart(6, '0');
          return e('button', {
            key: weapon.id,
            className: 'varmory-card' + (isSelected ? ' varmory-card-selected' : '') + (isLocked ? ' varmory-card-locked' : '') + ' animate-in',
            disabled: isLocked,
            'aria-disabled': isLocked,
            title: isLocked ? 'Locked \u2014 not available in this game mode' : undefined,
            style: {
              '--weapon-accent': accentHex,
              animationDelay: (idx * 0.06) + 's',
            },
            onClick: function () { if (!isLocked) setSelectedId(weapon.id); },
          },
            e('div', { className: 'varmory-card-accent' }),
            e('div', { className: 'varmory-card-category' }, weapon.category.toUpperCase()),
            e('div', { className: 'varmory-card-name' }, weapon.name),
            e('div', { className: 'varmory-card-mode' },
              e('span', { className: 'varmory-mode-dot' }),
              fireModeLabel(weapon.fireMode),
            ),
            isLocked && e('div', { className: 'varmory-card-lock' }, '\uD83D\uDD12 LOCKED'),
            isSelected && e('div', { className: 'varmory-card-check' }, '\u2713'),
          );
        }),
      ),

      // Weapon detail panel
      e('div', { className: 'varmory-detail animate-in' },
        e('div', { className: 'varmory-preview-wrap' },
          e('div', { className: 'varmory-preview', ref: previewRef }),
        ),
        e('div', { className: 'varmory-info' },
          e('h2', { className: 'varmory-weapon-name' }, selectedWeapon.name),
          e('p', { className: 'varmory-weapon-desc' }, selectedWeapon.description),

          e('div', { className: 'varmory-stats' },
            e('div', { className: 'varmory-stat' },
              e('span', { className: 'varmory-stat-label' }, 'Fire Mode'),
              e('span', { className: 'varmory-stat-value' }, fireModeLabel(selectedWeapon.fireMode)),
            ),
            e('div', { className: 'varmory-stat' },
              e('span', { className: 'varmory-stat-label' }, 'Fire Rate'),
              e('div', { className: 'varmory-stat-bar-wrap' },
                e('div', {
                  className: 'varmory-stat-bar',
                  style: { width: Math.min(100, (selectedWeapon.fireRate / 700) * 100) + '%' },
                }),
              ),
              e('span', { className: 'varmory-stat-value' }, fireRateLabel(selectedWeapon)),
            ),
            e('div', { className: 'varmory-stat' },
              e('span', { className: 'varmory-stat-label' }, 'Recoil'),
              e('div', { className: 'varmory-stat-bar-wrap' },
                e('div', {
                  className: 'varmory-stat-bar varmory-stat-bar-recoil',
                  style: { width: Math.min(100, (selectedWeapon.recoil.vertical / 0.25) * 100) + '%' },
                }),
              ),
              e('span', { className: 'varmory-stat-value' }, recoilLabel(selectedWeapon)),
            ),
            e('div', { className: 'varmory-stat' },
              e('span', { className: 'varmory-stat-label' }, 'RPM'),
              e('span', { className: 'varmory-stat-value' }, selectedWeapon.fireRate),
            ),
          ),

          e('div', { className: 'varmory-actions' },
            e(VantageUI.Button, {
              variant: 'ghost',
              onClick: function () { onNavigate(scenarioId ? 'setup' : 'training'); },
            }, 'CANCEL'),
            e(VantageUI.Button, {
              variant: 'primary', size: 'lg',
              onClick: handleConfirm,
            }, 'CONFIRM & TRAIN'),
          ),
        ),
      ),
    ),
  );
};
