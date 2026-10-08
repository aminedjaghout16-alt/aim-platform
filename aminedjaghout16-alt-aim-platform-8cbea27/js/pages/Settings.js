/* ============================================
   Settings Page — Firebase-persisted preferences
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Settings = function Settings({ onNavigate, user, onLogout }) {
  const [settings, setSettings] = useState({
    game: 'valorant',
    sensitivity: 0.35,
    dpi: 800,
    soundEnabled: true,
    showFPS: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  var uid = user ? user.uid : null;

  // Load settings from Firebase on mount
  useEffect(function () {
    if (!uid) { setLoaded(true); return; }
    VantageServices.DatabaseService.getUserSettings(uid).then(function (s) {
      if (s && typeof s === 'object' && Object.keys(s).length > 0) {
        setSettings(function (prev) { return Object.assign({}, prev, s); });
      }
      setLoaded(true);
    }).catch(function () { setLoaded(true); });
  }, [uid]);

  // Auto-save settings to Firebase when they change (debounced)
  var saveTimer = null;
  var update = function (key, val) {
    setSettings(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = val;
      // Debounced save to Firebase
      if (uid) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          setSaving(true);
          VantageServices.DatabaseService.saveUserSettings(uid, next).then(function () {
            setSaving(false);
            setSaveMessage('Saved');
            setTimeout(function () { setSaveMessage(''); }, 2000);
          }).catch(function () { setSaving(false); });
        }, 500);
      }
      return next;
    });
  };

  var games = VantageEngine.Settings.getAllGames();

  // Target color (stored in the browser via PlayerPrefs, used by the 3D arena)
  var targetColors = [
    { id: '#ff2d95', label: 'Hot pink' },
    { id: '#39ff14', label: 'Neon green' },
    { id: '#1e6bff', label: 'Electric blue' },
    { id: '#ff7a00', label: 'Orange' },
    { id: '#ff2020', label: 'Red' },
    { id: '#00e0d0', label: 'Teal' },
    { id: '#ffe600', label: 'Yellow' },
    { id: '#a64dff', label: 'Purple' },
  ];
  var _tc = useState(VantageEngine.PlayerPrefs.get().targetColor || '#ff2d95');
  var targetColor = _tc[0];
  var setTargetColor = function (c) {
    VantageEngine.PlayerPrefs.set({ targetColor: c });
    _tc[1](c);
  };

  return e('div', { className: 'vpage-settings' },
    e(VantageUI.PageHeader, {
      title: 'Settings',
      subtitle: saving ? 'Saving...' : saveMessage || 'Configure your training preferences',
    }),

    e('div', { className: 'vsettings-grid' },
      // Game settings
      e(VantageUI.Card, { className: 'vsettings-section animate-in' },
        e('h4', { className: 'vsettings-section-title' }, 'GAME CONFIGURATION'),
        e(VantageUI.Select, {
          label: 'Primary Game',
          value: settings.game,
          onChange: function (v) {
            var game = VantageEngine.Settings.getGame(v);
            update('game', v);
            if (game) { update('sensitivity', game.defaultSensitivity); update('dpi', game.defaultDPI); }
          },
          options: games.map(function (g) { return { value: g.id, label: g.name }; }),
        }),
        e(VantageUI.Slider, {
          label: 'In-Game Sensitivity',
          value: settings.sensitivity,
          onChange: function (v) { update('sensitivity', v); },
          min: 0.05, max: 20, step: 0.05,
        }),
        e(VantageUI.Slider, {
          label: 'Mouse DPI',
          value: settings.dpi,
          onChange: function (v) { update('dpi', v); },
          min: 200, max: 3200, step: 50,
        }),
      ),

      // Display settings
      e(VantageUI.Card, { className: 'vsettings-section animate-in stagger-1' },
        e('h4', { className: 'vsettings-section-title' }, 'DISPLAY'),
        e('div', { className: 'vtm-swatch-row' },
          e('span', { className: 'vtm-label' }, 'Target Color'),
          e('div', { className: 'vtm-swatches' },
            targetColors.map(function (c) {
              return e('button', {
                key: c.id, type: 'button', title: c.label, 'aria-label': c.label,
                className: 'vtm-swatch ' + (targetColor.toLowerCase() === c.id ? 'vtm-swatch-on' : ''),
                style: { background: c.id },
                onClick: function () { setTargetColor(c.id); },
              });
            }),
            e('label', { className: 'vtm-swatch vtm-swatch-custom', title: 'Custom color' },
              e('input', {
                type: 'color', value: targetColor, 'aria-label': 'Custom target color',
                onChange: function (ev) { setTargetColor(ev.target.value); },
              }),
            ),
          ),
        ),
        e('div', { className: 'vsettings-toggle' },
          e('span', null, 'Sound Effects'),
          e('button', {
            className: 'vtoggle ' + (settings.soundEnabled ? 'vtoggle-on' : ''),
            onClick: function () { update('soundEnabled', !settings.soundEnabled); },
          }, e('span', { className: 'vtoggle-knob' })),
        ),
        e('div', { className: 'vsettings-toggle' },
          e('span', null, 'Show FPS Counter'),
          e('button', {
            className: 'vtoggle ' + (settings.showFPS ? 'vtoggle-on' : ''),
            onClick: function () { update('showFPS', !settings.showFPS); },
          }, e('span', { className: 'vtoggle-knob' })),
        ),
      ),

      // Account
      e(VantageUI.Card, { className: 'vsettings-section animate-in stagger-2' },
        e('h4', { className: 'vsettings-section-title' }, 'ACCOUNT'),
        e('p', { className: 'text-secondary', style: { marginBottom: '8px' } },
          user ? user.email : 'Not signed in'),
        e('p', { className: 'text-secondary', style: { marginBottom: '16px', fontSize: '12px' } },
          'Your settings are synced to your account and available on all devices.'),
        e(VantageUI.Button, {
          variant: 'danger', size: 'sm',
          onClick: function () { if (onLogout) onLogout(); },
        }, 'SIGN OUT'),
      ),
    ),
  );
};
