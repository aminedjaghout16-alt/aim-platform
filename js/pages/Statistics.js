/* ============================================
   Statistics Page — Performance analytics
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Statistics = function Statistics({ onNavigate }) {
  return e('div', { className: 'vpage-stats' },
    e(VantageUI.PageHeader, {
      title: 'Statistics',
      subtitle: 'Track your aim training progress over time',
    }),

    e('div', { className: 'vstats-grid' },
      [
        { label: 'Total Sessions', value: '0', icon: '◎', color: 'var(--accent-primary)', subtext: 'No sessions yet' },
        { label: 'Average Score', value: '—', icon: '◈', color: 'var(--accent-secondary)', subtext: 'Complete a session' },
        { label: 'Best Score', value: '—', icon: '△', color: 'var(--success)', subtext: 'No data yet' },
        { label: 'Total Time', value: '0m', icon: '⟶', color: 'var(--info)', subtext: 'Across all sessions' },
      ].map((s, i) =>
        e('div', { key: i, className: `animate-in stagger-${i + 1}` },
          e(VantageUI.StatCard, s),
        )
      ),
    ),

    // Chart placeholder
    e(VantageUI.Card, { className: 'vstats-chart animate-in stagger-5' },
      e('h3', null, 'Score Progression'),
      e('div', { className: 'vstats-chart-placeholder' },
        e(VantageUI.EmptyState, {
          icon: '◈',
          title: 'No data yet',
          description: 'Complete training sessions to see your performance chart here.',
          action: e(VantageUI.Button, {
            variant: 'secondary', size: 'sm',
            onClick: () => onNavigate('training'),
          }, 'START TRAINING'),
        }),
      ),
    ),

    // Category breakdown
    e(VantageUI.Card, { className: 'vstats-breakdown animate-in stagger-6' },
      e('h3', null, 'Category Performance'),
      e('div', { className: 'vstats-categories' },
        VantageEngine.Categories.getAll().map(cat =>
          e('div', { key: cat.id, className: 'vstats-category-row' },
            e('span', { className: 'vstats-cat-icon', style: { color: cat.color } }, cat.icon),
            e('span', { className: 'vstats-cat-name' }, cat.name),
            e('div', { className: 'vstats-cat-bar' },
              e(VantageUI.ProgressBar, {
                value: 0,
                height: '4px',
                color: cat.color,
              }),
            ),
            e('span', { className: 'vstats-cat-score' }, '—'),
          )
        ),
      ),
    ),
  );
};
