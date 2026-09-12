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
        { label: 'Total Sessions', value: '24', icon: '◎', color: 'var(--accent-primary)', subtext: '+3 this week' },
        { label: 'Average Score', value: '712', icon: '◈', color: 'var(--accent-secondary)', subtext: '+18 from last week' },
        { label: 'Best Score', value: '842', icon: '△', color: 'var(--success)', subtext: 'Static Flicking' },
        { label: 'Total Time', value: '24m', icon: '⟶', color: 'var(--info)', subtext: 'Across all sessions' },
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
        e('div', { className: 'vchart-empty' },
          e('span', { className: 'text-secondary' }, 'Performance chart will appear here after training sessions'),
          e('div', { className: 'vchart-bars' },
            [65, 72, 68, 78, 74, 82, 86].map((h, i) =>
              e('div', {
                key: i,
                className: 'vchart-bar',
                style: { height: `${h}%`, animationDelay: `${i * 0.1}s` },
              })
            ),
          ),
        ),
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
                value: cat.id === 'flicking' ? 72 : 0,
                height: '4px',
                color: cat.color,
              }),
            ),
            e('span', { className: 'vstats-cat-score' },
              cat.id === 'flicking' ? '72' : '—'
            ),
          )
        ),
      ),
    ),
  );
};
