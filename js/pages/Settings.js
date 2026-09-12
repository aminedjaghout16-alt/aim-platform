/* ============================================
   Settings Page — User preferences
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Settings = function Settings({ onNavigate }) {
  const [settings, setSettings] = useState({
    game: 'valorant',
    sensitivity: 0.35,
    dpi: 800,
    soundEnabled: true,
    showFPS: false,
  });

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));
  const games = VantageEngine.Settings.getAllGames();

  return e('div', { className: 'vpage-settings' },
    e(VantageUI.PageHeader, {
      title: 'Settings',
      subtitle: 'Configure your training preferences',
    }),

    e('div', { className: 'vsettings-grid' },
      // Game settings
      e(VantageUI.Card, { className: 'vsettings-section animate-in' },
        e('h4', { className: 'vsettings-section-title' }, 'GAME CONFIGURATION'),
        e(VantageUI.Select, {
          label: 'Primary Game',
          value: settings.game,
          onChange: (v) => {
            const game = VantageEngine.Settings.getGame(v);
            update('game', v);
            if (game) { update('sensitivity', game.defaultSensitivity); update('dpi', game.defaultDPI); }
          },
          options: games.map(g => ({ value: g.id, label: g.name })),
        }),
        e(VantageUI.Slider, {
          label: 'In-Game Sensitivity',
          value: settings.sensitivity,
          onChange: (v) => update('sensitivity', v),
          min: 0.05, max: 20, step: 0.05,
        }),
        e(VantageUI.Slider, {
          label: 'Mouse DPI',
          value: settings.dpi,
          onChange: (v) => update('dpi', v),
          min: 200, max: 3200, step: 50,
        }),
      ),

      // Display settings
      e(VantageUI.Card, { className: 'vsettings-section animate-in stagger-1' },
        e('h4', { className: 'vsettings-section-title' }, 'DISPLAY'),
        e('div', { className: 'vsettings-toggle' },
          e('span', null, 'Sound Effects'),
          e('button', {
            className: `vtoggle ${settings.soundEnabled ? 'vtoggle-on' : ''}`,
            onClick: () => update('soundEnabled', !settings.soundEnabled),
          }, e('span', { className: 'vtoggle-knob' })),
        ),
        e('div', { className: 'vsettings-toggle' },
          e('span', null, 'Show FPS Counter'),
          e('button', {
            className: `vtoggle ${settings.showFPS ? 'vtoggle-on' : ''}`,
            onClick: () => update('showFPS', !settings.showFPS),
          }, e('span', { className: 'vtoggle-knob' })),
        ),
      ),

      // Account
      e(VantageUI.Card, { className: 'vsettings-section animate-in stagger-2' },
        e('h4', { className: 'vsettings-section-title' }, 'ACCOUNT'),
        e('p', { className: 'text-secondary', style: { marginBottom: '16px' } },
          'Account management will be available after Firebase integration.'),
        e(VantageUI.Button, { variant: 'danger', size: 'sm', onClick: () => onNavigate('landing') },
          'SIGN OUT'),
      ),
    ),
  );
};
