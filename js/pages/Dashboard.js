/* ============================================
   Dashboard Page — Overview & quick actions
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Dashboard = function Dashboard({ onNavigate }) {
  // Mock data
  const recentResults = [
    { scenario: 'Static Flicking', score: 742, grade: 'A', date: 'Today', accuracy: 89 },
    { scenario: 'Smooth Tracking', score: 685, grade: 'B', date: 'Yesterday', accuracy: 82 },
    { scenario: 'Micro Adjustments', score: 710, grade: 'A', date: '2 days ago', accuracy: 86 },
  ];

  const quickStats = [
    { label: 'Sessions', value: '24', icon: '◎', color: 'var(--accent-primary)' },
    { label: 'Avg Score', value: '712', icon: '◈', color: 'var(--accent-secondary)' },
    { label: 'Best Score', value: '842', icon: '△', color: 'var(--success)' },
    { label: 'Accuracy', value: '86%', icon: '⟶', color: 'var(--info)' },
  ];

  return e('div', { className: 'vpage-dashboard' },
    e(VantageUI.PageHeader, {
      title: 'Dashboard',
      subtitle: 'Your training overview',
      action: e(VantageUI.Button, {
        variant: 'primary',
        onClick: () => onNavigate('training'),
      }, 'QUICK TRAIN'),
    }),

    // Stats row
    e('div', { className: 'vstats-grid' },
      quickStats.map((s, i) =>
        e('div', { key: i, className: `animate-in stagger-${i + 1}` },
          e(VantageUI.StatCard, s),
        )
      ),
    ),

    // Two-column layout
    e('div', { className: 'vdashboard-grid' },
      // Recent activity
      e(VantageUI.Card, { className: 'vdashboard-card animate-in stagger-5' },
        e('div', { className: 'vdashboard-card-header' },
          e('h3', null, 'Recent Sessions'),
          e('button', {
            className: 'vlink-btn',
            onClick: () => onNavigate('stats'),
          }, 'View All →'),
        ),
        e('div', { className: 'vresults-list' },
          recentResults.map((r, i) =>
            e('div', { key: i, className: 'vresult-row' },
              e('div', { className: 'vresult-scenario' },
                e('span', { className: 'vresult-icon' }, '◎'),
                e('div', null,
                  e('div', { className: 'vresult-name' }, r.scenario),
                  e('div', { className: 'vresult-date text-secondary' }, r.date),
                ),
              ),
              e('div', { className: 'vresult-score' },
                e('span', { className: 'vresult-grade', style: { color: r.grade === 'A' ? 'var(--accent-primary)' : 'var(--accent-secondary)' } }, r.grade),
                e('span', { className: 'vresult-points' }, r.score),
              ),
              e(VantageUI.ProgressBar, {
                value: r.accuracy,
                height: '4px',
                color: 'var(--accent-primary)',
              }),
            )
          ),
        ),
      ),

      // Quick start
      e(VantageUI.Card, { className: 'vdashboard-card animate-in stagger-6' },
        e('div', { className: 'vdashboard-card-header' },
          e('h3', null, 'Training Library'),
          e('button', {
            className: 'vlink-btn',
            onClick: () => onNavigate('training'),
          }, 'Browse All →'),
        ),
        e(VantageUI.EmptyState, {
          icon: '◎',
          title: 'Start Training',
          description: 'Browse the training library to find scenarios for clicking, tracking, target switching, and more.',
          action: e(VantageUI.Button, {
            variant: 'secondary', size: 'sm',
            onClick: () => onNavigate('training'),
          }, 'OPEN LIBRARY'),
        }),
      ),
    ),
  );
};
