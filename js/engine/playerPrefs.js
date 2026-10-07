/* ============================================
   Player Preferences — in-training settings
   FOV, audio mix and crosshair. Kept in memory for the whole
   page session and mirrored to localStorage when available.
   (Sensitivity and target settings live in the training config.)
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.PlayerPrefs = (function () {
  const KEY = 'vantage.trainingPrefs.v1';

  const DEFAULTS = {
    fov: 75,
    masterVolume: 80,
    musicVolume: 30,
    sfxVolume: 70,
    selectedWeapon: 'classic',
    crosshair: {
      color: '#00e0d0',
      length: 7,
      thickness: 2,
      gap: 5,
      opacity: 90,
      dot: true,
    },
  };

  const RANGES = {
    fov: [60, 110],
    masterVolume: [0, 100],
    musicVolume: [0, 100],
    sfxVolume: [0, 100],
    length: [1, 20],
    thickness: [1, 6],
    gap: [0, 15],
    opacity: [20, 100],
  };

  const clamp = (v, [lo, hi], fallback) => {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  };

  function sanitize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const ch = src.crosshair && typeof src.crosshair === 'object' ? src.crosshair : {};
    const d = DEFAULTS, dc = DEFAULTS.crosshair;
    // Validate weapon ID against the Weapons registry if available
    var validWeapons = ['classic', 'vandal', 'phantom', 'sheriff', 'ghost', 'operator'];
    var weaponId = validWeapons.indexOf(src.selectedWeapon) >= 0 ? src.selectedWeapon : d.selectedWeapon;
    return {
      fov: clamp(src.fov, RANGES.fov, d.fov),
      masterVolume: clamp(src.masterVolume, RANGES.masterVolume, d.masterVolume),
      musicVolume: clamp(src.musicVolume, RANGES.musicVolume, d.musicVolume),
      sfxVolume: clamp(src.sfxVolume, RANGES.sfxVolume, d.sfxVolume),
      selectedWeapon: weaponId,
      crosshair: {
        color: /^#[0-9a-f]{6}$/i.test(ch.color) ? ch.color : dc.color,
        length: clamp(ch.length, RANGES.length, dc.length),
        thickness: clamp(ch.thickness, RANGES.thickness, dc.thickness),
        gap: clamp(ch.gap, RANGES.gap, dc.gap),
        opacity: clamp(ch.opacity, RANGES.opacity, dc.opacity),
        dot: ch.dot === undefined ? dc.dot : !!ch.dot,
      },
    };
  }

  let current = null;

  function load() {
    let raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(KEY)); } catch (err) { /* unavailable/corrupt */ }
    current = sanitize(raw);
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch (err) { /* ignore */ }
  }

  return {
    DEFAULTS,
    RANGES,
    get() {
      if (!current) load();
      return current;
    },
    // Shallow-merge a patch (crosshair is merged one level deep), persist, return the new prefs
    set(patch) {
      const base = this.get();
      current = sanitize({
        ...base,
        ...patch,
        crosshair: { ...base.crosshair, ...((patch && patch.crosshair) || {}) },
      });
      save();
      return current;
    },
    defaults() { return sanitize(DEFAULTS); },
  };
})();
