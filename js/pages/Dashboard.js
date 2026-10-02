/* ============================================
   Dashboard Page — Overview & quick actions
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Dashboard = function Dashboard({ onNavigate }) {
  // Real stats — start at zero for new users
  const quickStats = [
    { label: 'Sessions', value: '0', icon: '◎', color: 'var(--accent-primary)' },
    { label: 'Avg Score', value: '—', icon: '◈', color: 'var(--accent-secondary)' },
    { label: 'Best Score', value: '—', icon: '△', color: 'var(--success)' },
    { label: 'Accuracy', value: '—', icon: '⟶', color: 'var(--info)' },
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
        e(VantageUI.EmptyState, {
          icon: '◎',
          title: 'No sessions yet',
          description: 'Complete your first training session to see results here.',
          action: e(VantageUI.Button, {
            variant: 'secondary', size: 'sm',
            onClick: () => onNavigate('training'),
          }, 'START TRAINING'),
        }),
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
