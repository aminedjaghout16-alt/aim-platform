/* ============================================
   Training Library — Browse, search, filter scenarios
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingLibrary = function TrainingLibrary({ onNavigate, onSelectScenario, onQuickStart, onCreatePlaylist, user }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterGame, setFilterGame] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showPlaylistCreator, setShowPlaylistCreator] = useState(false);

  const categories = VantageEngine.Categories.getAll();
  const allScenarios = VantageEngine.Scenarios.getEnabled();
  const Settings = VantageEngine.Settings;

  // Build filter options
  const difficultyOptions = [
    { value: 'all', label: 'All Difficulties' },
    ...Settings.getAllDifficulties().map(d => ({ value: d.id, label: d.label })),
  ];

  const gameOptions = [
    { value: 'all', label: 'All Games' },
    ...Settings.getAllGames().map(g => ({ value: g.id, label: g.name })),
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'accuracy', label: 'Accuracy' },
    { value: 'speed', label: 'Speed' },
    { value: 'smoothness', label: 'Smoothness' },
    { value: 'reaction', label: 'Reaction' },
    { value: 'precision', label: 'Precision' },
  ];

  // Apply filters
  const filtered = allScenarios.filter(s => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.skillsTrained.some(sk => sk.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    // Category
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    // Difficulty
    if (filterDifficulty !== 'all' && s.difficulty !== filterDifficulty) return false;
    // Game
    if (filterGame !== 'all' && s.recommendedGame !== filterGame) return false;
    // Type
    if (filterType !== 'all' && s.trainingType !== filterType) return false;
    return true;
  });

  const hasActiveFilters = filterCategory !== 'all' || filterDifficulty !== 'all' || filterGame !== 'all' || filterType !== 'all' || searchQuery;

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCategory('all');
    setFilterDifficulty('all');
    setFilterGame('all');
    setFilterType('all');
  };

  const getDifficultyColor = (diff) => {
    const map = { easy: '#00e676', medium: '#ffb830', hard: '#ff3d5a', extreme: '#b388ff' };
    return map[diff] || '#8b8fa3';
  };

  return e('div', { className: 'vpage-training' },
    e(VantageUI.PageHeader, {
      title: 'Training Library',
      subtitle: `${filtered.length} scenario${filtered.length !== 1 ? 's' : ''} available`,
      action: e(VantageUI.Button, { 
        variant: 'accent', 
        onClick: () => setShowPlaylistCreator(true) 
      }, 'CREATE PLAYLIST'),
    }),

    // Tactical Scenarios Banner
    e('div', { 
      className: 'vtactical-banner animate-in',
      onClick: () => onNavigate('tactical-scenarios'),
      style: { cursor: 'pointer' }
    },
      e('div', { className: 'vtactical-banner-content' },
        e('div', { className: 'vtactical-banner-badge' }, 'NEW MODE'),
        e('h2', { className: 'vtactical-banner-title' }, 'TACTICAL SCENARIOS'),
        e('p', { className: 'vtactical-banner-desc' }, 'VALORANT-style training: counter-strafe, peek, micro-adjust, track movers, and duel with pistols'),
        e('div', { className: 'vtactical-banner-action' },
          e(VantageUI.Button, { variant: 'accent', size: 'sm', onClick: (ev) => { ev.stopPropagation(); onNavigate('tactical-scenarios'); } }, 'OPEN SCENARIOS'),
        ),
      ),
    ),

    showPlaylistCreator && e(VantageComponents.PlaylistCreator, {
      onNavigate: onNavigate,
      onStartPlaylist: (playlist) => {
        setShowPlaylistCreator(false);
        if (onCreatePlaylist) onCreatePlaylist(playlist);
      },
      onClose: () => setShowPlaylistCreator(false),
      user: user,
    }),

    // Search & Filters Bar
    e('div', { className: 'vlibrary-filters animate-in' },
      // Search
      e('div', { className: 'vlibrary-search' },
        e('span', { className: 'vlibrary-search-icon' }, '⌕'),
        e('input', {
          type: 'text',
          className: 'vlibrary-search-input',
          placeholder: 'Search scenarios, skills, tags...',
          value: searchQuery,
          onChange: (ev) => setSearchQuery(ev.target.value),
        }),
        searchQuery && e('button', {
          className: 'vlibrary-search-clear',
          onClick: () => setSearchQuery(''),
        }, '×'),
      ),

      // Filter dropdowns
      e('div', { className: 'vlibrary-filter-row' },
        e('select', {
          className: 'vlibrary-filter-select',
          value: filterCategory,
          onChange: (ev) => setFilterCategory(ev.target.value),
        },
          e('option', { value: 'all' }, 'All Categories'),
          categories.map(c => e('option', { key: c.id, value: c.id }, c.name)),
        ),
        e('select', {
          className: 'vlibrary-filter-select',
          value: filterDifficulty,
          onChange: (ev) => setFilterDifficulty(ev.target.value),
        }, difficultyOptions.map(o => e('option', { key: o.value, value: o.value }, o.label))),
        e('select', {
          className: 'vlibrary-filter-select',
          value: filterGame,
          onChange: (ev) => setFilterGame(ev.target.value),
        }, gameOptions.map(o => e('option', { key: o.value, value: o.value }, o.label))),
        e('select', {
          className: 'vlibrary-filter-select',
          value: filterType,
          onChange: (ev) => setFilterType(ev.target.value),
        }, typeOptions.map(o => e('option', { key: o.value, value: o.value }, o.label))),

        hasActiveFilters && e('button', {
          className: 'vlibrary-clear-btn',
          onClick: clearFilters,
        }, 'Clear Filters'),
      ),
    ),

    // Scenario Grid
    filtered.length > 0
      ? e('div', { className: 'vscenario-grid' },
          filtered.map((s, i) => {
            const cat = VantageEngine.Categories.getById(s.category);
            const game = Settings.getGame(s.recommendedGame);
            return e('div', { key: s.id, className: `animate-in stagger-${Math.min(i + 1, 6)}` },
              e(VantageUI.Card, {
                className: 'vscenario-card',
                hover: true,
                onClick: () => onSelectScenario(s.id),
              },
                // Card header with icon and category badge
                e('div', { className: 'vscenario-card-header' },
                  e('div', {
                    className: 'vscenario-icon',
                    style: { color: cat ? cat.color : 'var(--accent-primary)' },
                  }, cat ? cat.icon : '◎'),
                  e('div', { className: 'vscenario-badges' },
                    cat && e(VantageUI.Badge, {
                      color: cat.color,
                      variant: 'outline',
                    }, cat.shortName),
                    e(VantageUI.Badge, {
                      color: getDifficultyColor(s.difficulty),
                      variant: 'outline',
                    }, s.difficulty),
                  ),
                ),

                // Name and description
                e('h3', { className: 'vscenario-name' }, s.name),
                e('p', { className: 'vscenario-desc' }, s.description),

                // Skills trained
                e('div', { className: 'vscenario-skills' },
                  e('span', { className: 'vscenario-skills-label' }, 'SKILLS'),
                  e('div', { className: 'vscenario-skills-list' },
                    s.skillsTrained.slice(0, 3).map(skill =>
                      e('span', { key: skill, className: 'vscenario-skill' }, skill)
                    ),
                  ),
                ),

                // Meta row: game, duration, type
                e('div', { className: 'vscenario-meta' },
                  game && e('div', { className: 'vscenario-meta-item' },
                    e('span', { className: 'vscenario-meta-label' }, 'GAME'),
                    e('span', { className: 'vscenario-meta-value' }, game.name),
                  ),
                  e('div', { className: 'vscenario-meta-item' },
                    e('span', { className: 'vscenario-meta-label' }, 'DURATION'),
                    e('span', { className: 'vscenario-meta-value' }, s.estimatedDuration),
                  ),
                  e('div', { className: 'vscenario-meta-item' },
                    e('span', { className: 'vscenario-meta-label' }, 'TYPE'),
                    e('span', { className: 'vscenario-meta-value' }, s.trainingType),
                  ),
                ),

                // Footer with start button
                e('div', { className: 'vscenario-footer' },
                  e(VantageUI.Button, {
                    variant: 'primary', size: 'sm',
                    onClick: (ev) => { ev.stopPropagation(); (onQuickStart || onSelectScenario)(s.id); },
                  }, 'START'),
                ),
              ),
            );
          })
        )
      : e(VantageUI.EmptyState, {
          icon: '⌕',
          title: hasActiveFilters ? 'No matching scenarios' : 'No scenarios yet',
          description: hasActiveFilters
            ? 'Try adjusting your filters or search query.'
            : 'Scenarios will be added soon.',
          action: hasActiveFilters
            ? e(VantageUI.Button, { variant: 'secondary', size: 'sm', onClick: clearFilters }, 'CLEAR FILTERS')
            : null,
        }),
  );
};
