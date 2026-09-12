/* ============================================
   Training Setup — Configure before starting
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingSetup = function TrainingSetup({ scenarioId, onNavigate, onStartTraining }) {
  const scenario = VantageEngine.Scenarios.getById(scenarioId);
  const Settings = VantageEngine.Settings;

  const [config, setConfig] = useState({
    ...Settings.DEFAULT_CONFIG,
    ...(scenario ? scenario.defaults : {}),
  });

  if (!scenario) {
    return e(VantageUI.EmptyState, {
      icon: '✕', title: 'Scenario not found',
      action: e(VantageUI.Button, { variant: 'secondary', onClick: () => onNavigate('training') }, 'BACK'),
    });
  }

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  return e('div', { className: 'vpage-setup' },
    e(VantageUI.PageHeader, {
      title: 'Training Setup',
      subtitle: scenario.name,
      breadcrumb: e('span', null,
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('training'); } }, 'Training'),
        ' / ',
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('details', scenarioId); } }, scenario.name),
        ' / ',
        e('span', { className: 'text-accent' }, 'Setup'),
      ),
    }),

    e('div', { className: 'vsetup-grid' },
      // Game & Sensitivity
      e(VantageUI.Card, { className: 'vsetup-section animate-in' },
        e('h4', { className: 'vsetup-section-title' }, 'GAME'),
        e(VantageUI.Select, {
          label: 'Target Game',
          value: config.game,
          onChange: (v) => {
            const game = Settings.getGame(v);
            update('game', v);
            if (game) update('sensitivity', game.defaultSensitivity);
          },
          options: Settings.getAllGames().map(g => ({ value: g.id, label: g.name })),
        }),
        e(VantageUI.Slider, {
          label: 'In-Game Sensitivity',
          value: config.sensitivity,
          onChange: (v) => update('sensitivity', v),
          min: 0.05, max: 20, step: 0.05,
        }),
        e(VantageUI.Slider, {
          label: 'Mouse DPI',
          value: config.dpi,
          onChange: (v) => update('dpi', v),
          min: 200, max: 3200, step: 50,
        }),
      ),

      // Difficulty & Duration
      e(VantageUI.Card, { className: 'vsetup-section animate-in stagger-1' },
        e('h4', { className: 'vsetup-section-title' }, 'DIFFICULTY'),
        e(VantageUI.Select, {
          label: 'Difficulty',
          value: config.difficulty,
          onChange: (v) => update('difficulty', v),
          options: Settings.getAllDifficulties().map(d => ({ value: d.id, label: `${d.label} — ${d.description}` })),
        }),
        e(VantageUI.Select, {
          label: 'Duration',
          value: config.duration,
          onChange: (v) => update('duration', v),
          options: Settings.getAllDurations().map(d => ({ value: d.id, label: d.label })),
        }),
      ),

      // Target settings
      e(VantageUI.Card, { className: 'vsetup-section animate-in stagger-2' },
        e('h4', { className: 'vsetup-section-title' }, 'TARGETS'),
        e(VantageUI.Select, {
          label: 'Target Size',
          value: config.targetSize,
          onChange: (v) => update('targetSize', v),
          options: Settings.getAllTargetSizes().map(s => ({ value: s.id, label: `${s.label} (${s.px}px)` })),
        }),
        e(VantageUI.Select, {
          label: 'Target Speed',
          value: config.targetSpeed,
          onChange: (v) => update('targetSpeed', v),
          options: Settings.getAllTargetSpeeds().map(s => ({ value: s.id, label: s.label })),
        }),
      ),
    ),

    // Actions
    e('div', { className: 'vsetup-actions animate-in stagger-3' },
      e(VantageUI.Button, {
        variant: 'ghost',
        onClick: () => onNavigate('details', scenarioId),
      }, '← BACK'),
      e(VantageUI.Button, {
        variant: 'primary', size: 'lg',
        onClick: () => onStartTraining(scenarioId, config),
      }, 'BEGIN TRAINING'),
    ),
  );
};
