/* ============================================
   Results Page — Real session history from saved results
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Results = function Results({ onNavigate, user, latestResultId, onQuickStart }) {
  const [results, setResults] = useState(null); // null = loading

  const uid = (user && user.uid) || 'dev-user-001';

  useEffect(() => {
    let cancelled = false;
    VantageServices.DatabaseService.getUserResults(uid)
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));
        setResults(sorted);
      })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [uid]);

  const gradeColor = (g) => {
    const map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const header = e(VantageUI.PageHeader, {
    title: 'Results',
    subtitle: 'Your training session history',
  });

  if (results === null) {
    return e('div', { className: 'vpage-results' }, header);
  }

  if (results.length === 0) {
    return e('div', { className: 'vpage-results' },
      header,
      e(VantageUI.EmptyState, {
        icon: '◎',
        title: 'No sessions yet',
        description: 'Finish a training session and your results will show up here.',
        action: e(VantageUI.Button, { variant: 'primary', onClick: () => onNavigate('training') }, 'GO TO TRAINING'),
      }),
    );
  }

  const agg = VantageEngine.Scoring.aggregateStats(results);

  return e('div', { className: 'vpage-results' },
    e(VantageUI.PageHeader, {
      title: 'Results',
      subtitle: 'Your training session history',
      action: e(VantageUI.Button, { variant: 'primary', onClick: () => onNavigate('training') }, 'TRAIN AGAIN'),
    }),

    // Summary stats (computed from saved sessions)
    e('div', { className: 'vstats-grid' },
      [
        { label: 'Total Sessions', value: agg.totalSessions, icon: '◎', color: 'var(--accent-primary)' },
        { label: 'Average Score', value: agg.averageScore, icon: '◈', color: 'var(--accent-secondary)' },
        { label: 'Best Score', value: agg.bestScore, icon: '△', color: 'var(--success)' },
        { label: 'Avg Accuracy', value: agg.averageAccuracy + '%', icon: '⟶', color: 'var(--info)' },
      ].map((s, i) =>
        e('div', { key: i, className: `animate-in stagger-${i + 1}` },
          e(VantageUI.StatCard, s),
        )
      ),
    ),

    // Results table
    e(VantageUI.Card, { className: 'vresults-table-card animate-in stagger-5' },
      e('div', { className: 'vresults-table' },
        e('div', { className: 'vresults-table-header' },
          e('span', null, 'Scenario'),
          e('span', null, 'Score'),
          e('span', null, 'Grade'),
          e('span', null, 'Accuracy'),
          e('span', null, 'Avg RT'),
          e('span', null, 'Hits'),
          e('span', null, 'Date'),
        ),
        results.map(r => {
          const sc = VantageEngine.Scenarios.getById(r.scenarioId);
          const st = r.stats || {};
          const isLatest = r.id === latestResultId;
          return e('div', { key: r.id, className: `vresults-table-row ${isLatest ? 'vresults-table-row-latest' : ''}` },
            e('span', { className: 'vresults-table-scenario' },
              e('span', { className: 'vresult-icon' }, '◎'),
              sc ? sc.name : r.scenarioId,
              isLatest && e('span', { className: 'vresults-latest-tag' }, 'LATEST'),
            ),
            e('span', { className: 'vresults-table-score' }, r.score),
            e('span', { style: { color: gradeColor(r.grade), fontWeight: 600 } }, r.grade),
            e('span', null, (st.accuracy || 0) + '%'),
            e('span', null, st.hits > 0 ? st.avgReactionTime + 'ms' : '—'),
            e('span', null, (st.hits || 0) + '/' + ((st.hits || 0) + (st.misses || 0))),
            e('span', { className: 'text-secondary' }, formatDate(r.timestamp || r.createdAt)),
          );
        }),
      ),
    ),
  );
};
