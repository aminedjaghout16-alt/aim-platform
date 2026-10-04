/* ============================================
   Training Details — Scenario info, purpose, skills, settings
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingDetails = function TrainingDetails({ scenarioId, onNavigate, onStartSetup, onQuickStart }) {
  const scenario = VantageEngine.Scenarios.getById(scenarioId);
  if (!scenario) {
    return e(VantageUI.EmptyState, {
      icon: '✕',
      title: 'Scenario not found',
      action: e(VantageUI.Button, { variant: 'secondary', onClick: () => onNavigate('training') }, 'BACK TO LIBRARY'),
    });
  }

  const category = VantageEngine.Categories.getById(scenario.category);
  const Settings = VantageEngine.Settings;
  const game = Settings.getGame(scenario.recommendedGame);
  const difficulty = Settings.getDifficulty(scenario.difficulty);

  const getDifficultyColor = (diff) => {
    const map = { easy: '#00e676', medium: '#ffb830', hard: '#ff3d5a', extreme: '#b388ff' };
    return map[diff] || '#8b8fa3';
  };

  return e('div', { className: 'vpage-details' },
    e(VantageUI.PageHeader, {
      title: scenario.name,
      breadcrumb: e('span', null,
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('training'); } }, 'Training Library'),
        ' / ',
        e('span', { className: 'text-accent' }, scenario.name),
      ),
    }),

    e('div', { className: 'vdetails-layout' },
      // Left column: main info
      e('div', { className: 'vdetails-main-col' },
        // Hero card
        e(VantageUI.Card, { className: 'vdetails-hero-card animate-in' },
          e('div', { className: 'vdetails-hero-header' },
            e('div', {
              className: 'vdetails-hero-icon',
              style: {
                color: category ? category.color : 'var(--accent-primary)',
                background: category ? `${category.color}15` : 'var(--accent-primary-dim)',
              },
            }, category ? category.icon : '◎'),
            e('div', { className: 'vdetails-hero-info' },
              e('h2', null, scenario.name),
              e('div', { className: 'vdetails-hero-badges' },
                category && e(VantageUI.Badge, { color: category.color, variant: 'outline' }, category.name),
                e(VantageUI.Badge, { color: getDifficultyColor(scenario.difficulty), variant: 'outline' }, scenario.difficulty),
                e(VantageUI.Badge, { variant: 'outline', color: 'var(--text-secondary)' }, scenario.trainingType),
              ),
            ),
          ),
          e('p', { className: 'vdetails-description' }, scenario.description),
        ),

        // Purpose
        e(VantageUI.Card, { className: 'vdetails-section animate-in stagger-1' },
          e('h4', { className: 'vdetails-section-title' }, 'PURPOSE'),
          e('p', { className: 'vdetails-purpose-text' }, scenario.purpose),
        ),

        // Skills trained
        e(VantageUI.Card, { className: 'vdetails-section animate-in stagger-2' },
          e('h4', { className: 'vdetails-section-title' }, 'SKILLS TRAINED'),
          e('div', { className: 'vdetails-skills-grid' },
            scenario.skillsTrained.map((skill, i) =>
              e('div', { key: skill, className: 'vdetails-skill-item' },
                e('span', { className: 'vdetails-skill-icon', style: { color: category ? category.color : 'var(--accent-primary)' } }, '◆'),
                e('span', null, skill),
              )
            ),
          ),
        ),
      ),

      // Right column: settings & actions
      e('div', { className: 'vdetails-side-col' },
        // Quick info
        e(VantageUI.Card, { className: 'vdetails-quickinfo animate-in stagger-1' },
          e('h4', { className: 'vdetails-section-title' }, 'OVERVIEW'),
          e('div', { className: 'vdetails-quickinfo-list' },
            e('div', { className: 'vdetails-quickinfo-row' },
              e('span', { className: 'vdetails-quickinfo-label' }, 'Category'),
              e('span', { className: 'vdetails-quickinfo-value', style: { color: category ? category.color : 'var(--text-primary)' } }, category ? category.name : '—'),
            ),
            e('div', { className: 'vdetails-quickinfo-row' },
              e('span', { className: 'vdetails-quickinfo-label' }, 'Difficulty'),
              e('span', { className: 'vdetails-quickinfo-value', style: { color: getDifficultyColor(scenario.difficulty) } }, difficulty ? difficulty.label : '—'),
            ),
            e('div', { className: 'vdetails-quickinfo-row' },
              e('span', { className: 'vdetails-quickinfo-label' }, 'Recommended Game'),
              e('span', { className: 'vdetails-quickinfo-value' }, game ? game.name : '—'),
            ),
            e('div', { className: 'vdetails-quickinfo-row' },
              e('span', { className: 'vdetails-quickinfo-label' }, 'Est. Duration'),
              e('span', { className: 'vdetails-quickinfo-value' }, scenario.estimatedDuration),
            ),
            e('div', { className: 'vdetails-quickinfo-row' },
              e('span', { className: 'vdetails-quickinfo-label' }, 'Training Type'),
              e('span', { className: 'vdetails-quickinfo-value' }, scenario.trainingType),
            ),
          ),
        ),

        // Recommended settings
        e(VantageUI.Card, { className: 'vdetails-quickinfo animate-in stagger-2' },
          e('h4', { className: 'vdetails-section-title' }, 'RECOMMENDED SETTINGS'),
          e('div', { className: 'vdetails-settings-list' },
            scenario.recommendedSettings && Object.entries(scenario.recommendedSettings).map(([key, val]) =>
              e('div', { key, className: 'vdetails-setting-row' },
                e('span', { className: 'vdetails-setting-label' },
                  key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
                ),
                e('span', { className: 'vdetails-setting-value' }, val),
              )
            ),
          ),
        ),

        // Default settings
        e(VantageUI.Card, { className: 'vdetails-quickinfo animate-in stagger-3' },
          e('h4', { className: 'vdetails-section-title' }, 'DEFAULT CONFIG'),
          e('div', { className: 'vdetails-settings-list' },
            e('div', { className: 'vdetail-row' },
              e('span', { className: 'text-secondary' }, 'Target Size'),
              e('span', null, (Settings.getTargetSize(scenario.defaults.targetSize) || {}).label || 'Medium'),
            ),
            e('div', { className: 'vdetail-row' },
              e('span', { className: 'text-secondary' }, 'Target Speed'),
              e('span', null, (Settings.getTargetSpeed(scenario.defaults.targetSpeed) || {}).label || 'Normal'),
            ),
            e('div', { className: 'vdetail-row' },
              e('span', { className: 'text-secondary' }, 'Duration'),
              e('span', null, (Settings.getDuration(scenario.defaults.duration) || {}).label || '60s'),
            ),
          ),
        ),

        // Action buttons
        e('div', { className: 'vdetails-actions-col animate-in stagger-4' },
          e(VantageUI.Button, {
            variant: 'primary', size: 'lg',
            onClick: () => onQuickStart(scenario.id),
            style: { width: '100%' },
          }, 'START'),
          e(VantageUI.Button, {
            variant: 'secondary',
            onClick: () => onStartSetup(scenario.id),
            style: { width: '100%' },
          }, 'CUSTOMIZE SETTINGS'),
          e(VantageUI.Button, {
            variant: 'ghost',
            onClick: () => onNavigate('training'),
            style: { width: '100%' },
          }, '← BACK TO LIBRARY'),
        ),
      ),
    ),
  );
};
