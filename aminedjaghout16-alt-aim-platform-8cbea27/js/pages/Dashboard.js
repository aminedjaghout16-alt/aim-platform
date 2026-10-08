/* ============================================
   Dashboard Page — Firebase-powered overview
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Dashboard = function Dashboard({ onNavigate, user }) {
  const [stats, setStats] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const uid = user ? user.uid : null;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    var cancelled = false;
    var DB = VantageServices.DatabaseService;

    Promise.all([
      DB.getUserStats(uid),
      DB.getRecentResults(uid, 5),
    ]).then(function (results) {
      if (cancelled) return;
      setStats(results[0]);
      setRecentResults(results[1]);
      setLoading(false);
    }).catch(function () {
      if (!cancelled) setLoading(false);
    });

    return function () { cancelled = true; };
  }, [uid]);

  var quickStats = [
    { label: 'Sessions', value: stats ? String(stats.totalSessions) : '—', icon: '◎', color: 'var(--accent-primary)' },
    { label: 'Avg Score', value: stats && stats.totalSessions > 0 ? String(stats.averageScore) : '—', icon: '◈', color: 'var(--accent-secondary)' },
    { label: 'Best Score', value: stats && stats.totalSessions > 0 ? String(stats.bestScore) : '—', icon: '△', color: 'var(--success)' },
    { label: 'Accuracy', value: stats && stats.totalSessions > 0 ? stats.averageAccuracy + '%' : '—', icon: '⟶', color: 'var(--info)' },
  ];

  var gradeColor = function (g) {
    var map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  var formatDate = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return e('div', { className: 'vpage-dashboard' },
    e(VantageUI.PageHeader, {
      title: 'Dashboard',
      subtitle: user ? 'Welcome back, ' + (user.displayName || 'Operator') : 'Your training overview',
      action: e(VantageUI.Button, {
        variant: 'primary',
        onClick: function () { onNavigate('training'); },
      }, 'QUICK TRAIN'),
    }),

    // Stats row
    e('div', { className: 'vstats-grid' },
      quickStats.map(function (s, i) {
        return e('div', { key: i, className: 'animate-in stagger-' + (i + 1) },
          e(VantageUI.StatCard, s),
        );
      })
    ),

    // Two-column layout
    e('div', { className: 'vdashboard-grid' },
      // Recent activity
      e(VantageUI.Card, { className: 'vdashboard-card animate-in stagger-5' },
        e('div', { className: 'vdashboard-card-header' },
          e('h3', null, 'Recent Sessions'),
          e('button', {
            className: 'vlink-btn',
            onClick: function () { onNavigate('results'); },
          }, 'View All →'),
        ),

        loading
          ? e('div', { style: { padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' } }, 'Loading...')
          : recentResults.length > 0
            ? e('div', { className: 'vresults-table' },
                recentResults.map(function (r) {
                  var sc = VantageEngine.Scenarios.getById(r.scenarioId);
                  return e('div', { key: r.id, className: 'vresults-table-row' },
                    e('span', { className: 'vresults-table-scenario' },
                      e('span', { className: 'vresult-icon' }, '◎'),
                      sc ? sc.name : r.scenarioId,
                    ),
                    e('span', { className: 'vresults-table-score' }, r.score),
                    e('span', { style: { color: gradeColor(r.grade), fontWeight: 600 } }, r.grade),
                    e('span', { className: 'text-secondary' }, formatDate(r.timestamp)),
                  );
                })
              )
            : e(VantageUI.EmptyState, {
                icon: '◎',
                title: 'No sessions yet',
                description: 'Complete your first training session to see results here.',
                action: e(VantageUI.Button, {
                  variant: 'secondary', size: 'sm',
                  onClick: function () { onNavigate('training'); },
                }, 'START TRAINING'),
              }),
      ),

      // Quick start
      e(VantageUI.Card, { className: 'vdashboard-card animate-in stagger-6' },
        e('div', { className: 'vdashboard-card-header' },
          e('h3', null, 'Training Library'),
          e('button', {
            className: 'vlink-btn',
            onClick: function () { onNavigate('training'); },
          }, 'Browse All →'),
        ),
        e(VantageUI.EmptyState, {
          icon: '◎',
          title: 'Start Training',
          description: 'Browse the training library to find scenarios for clicking, tracking, target switching, and more.',
          action: e(VantageUI.Button, {
            variant: 'secondary', size: 'sm',
            onClick: function () { onNavigate('training'); },
          }, 'OPEN LIBRARY'),
        }),
      ),
    ),
  );
};
