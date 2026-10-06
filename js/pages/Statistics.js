/* ============================================
   Statistics Page — Firebase-powered analytics
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Statistics = function Statistics({ onNavigate, user }) {
  const [stats, setStats] = useState(null);
  const [categoryStats, setCategoryStats] = useState({});
  const [loading, setLoading] = useState(true);

  var uid = user ? user.uid : null;

  useEffect(function () {
    if (!uid) { setLoading(false); return; }
    var cancelled = false;
    var DB = VantageServices.DatabaseService;

    Promise.all([
      DB.getUserStats(uid),
      DB.getCategoryStats(uid),
    ]).then(function (results) {
      if (cancelled) return;
      setStats(results[0]);
      setCategoryStats(results[1]);
      setLoading(false);
    }).catch(function () {
      if (!cancelled) setLoading(false);
    });

    return function () { cancelled = true; };
  }, [uid]);

  var formatTime = function (sec) {
    if (!sec) return '0m';
    if (sec < 60) return sec + 's';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + 'm' + (s > 0 ? ' ' + s + 's' : '');
  };

  var statCards = stats ? [
    { label: 'Total Sessions', value: String(stats.totalSessions), icon: '◎', color: 'var(--accent-primary)', subtext: stats.totalSessions === 0 ? 'No sessions yet' : '' },
    { label: 'Average Score', value: stats.totalSessions > 0 ? String(stats.averageScore) : '—', icon: '◈', color: 'var(--accent-secondary)', subtext: stats.totalSessions === 0 ? 'Complete a session' : '' },
    { label: 'Best Score', value: stats.totalSessions > 0 ? String(stats.bestScore) : '—', icon: '△', color: 'var(--success)', subtext: stats.totalSessions === 0 ? 'No data yet' : '' },
    { label: 'Total Time', value: formatTime(stats.totalTime), icon: '⟶', color: 'var(--info)', subtext: 'Across all sessions' },
  ] : [
    { label: 'Total Sessions', value: '—', icon: '◎', color: 'var(--accent-primary)', subtext: 'Loading...' },
    { label: 'Average Score', value: '—', icon: '◈', color: 'var(--accent-secondary)', subtext: '' },
    { label: 'Best Score', value: '—', icon: '△', color: 'var(--success)', subtext: '' },
    { label: 'Total Time', value: '—', icon: '⟶', color: 'var(--info)', subtext: '' },
  ];

  var categories = VantageEngine.Categories.getAll();

  return e('div', { className: 'vpage-stats' },
    e(VantageUI.PageHeader, {
      title: 'Statistics',
      subtitle: 'Track your aim training progress over time',
    }),

    e('div', { className: 'vstats-grid' },
      statCards.map(function (s, i) {
        return e('div', { key: i, className: 'animate-in stagger-' + (i + 1) },
          e(VantageUI.StatCard, s),
        );
      })
    ),

    // Score progression chart area
    e(VantageUI.Card, { className: 'vstats-chart animate-in stagger-5' },
      e('h3', null, 'Score Progression'),
      e('div', { className: 'vstats-chart-placeholder' },
        loading
          ? e('div', { style: { padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' } }, 'Loading...')
          : stats && stats.totalSessions > 0
            ? e(VantageUI.EmptyState, {
                icon: '◈',
                title: stats.totalSessions + ' sessions recorded',
                description: 'Your score progression data is stored in Firebase and synced across devices.',
                action: e(VantageUI.Button, {
                  variant: 'secondary', size: 'sm',
                  onClick: function () { onNavigate('results'); },
                }, 'VIEW ALL RESULTS'),
              })
            : e(VantageUI.EmptyState, {
                icon: '◈',
                title: 'No data yet',
                description: 'Complete training sessions to see your performance chart here.',
                action: e(VantageUI.Button, {
                  variant: 'secondary', size: 'sm',
                  onClick: function () { onNavigate('training'); },
                }, 'START TRAINING'),
              }),
      ),
    ),

    // Category breakdown
    e(VantageUI.Card, { className: 'vstats-breakdown animate-in stagger-6' },
      e('h3', null, 'Category Performance'),
      e('div', { className: 'vstats-categories' },
        categories.map(function (cat) {
          var catData = categoryStats[cat.id];
          var avgScore = catData ? Math.round(catData.totalScore / catData.count) : 0;
          var pct = catData ? Math.min(100, Math.round((avgScore / 1000) * 100)) : 0;
          return e('div', { key: cat.id, className: 'vstats-category-row' },
            e('span', { className: 'vstats-cat-icon', style: { color: cat.color } }, cat.icon),
            e('span', { className: 'vstats-cat-name' }, cat.name),
            e('div', { className: 'vstats-cat-bar' },
              e(VantageUI.ProgressBar, {
                value: pct,
                height: '4px',
                color: cat.color,
              }),
            ),
            e('span', { className: 'vstats-cat-score' }, catData ? String(avgScore) : '—'),
          );
        })
      ),
    ),
  );
};
