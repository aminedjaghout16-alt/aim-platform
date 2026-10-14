/* ============================================
   Results Page — Firebase session history
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Results = function Results({ onNavigate, user, latestResultId, onQuickStart, selectedResultId }) {
  const [results, setResults] = useState(null);

  var uid = user ? user.uid : null;

  useEffect(function () {
    if (!uid) { setResults([]); return; }
    var unsub = VantageServices.DatabaseService.onResultsChanged(uid, function (rows) {
      setResults(rows || []);
    });
    return function () { if (unsub) unsub(); };
  }, [uid]);

  var gradeColor = function (g) {
    var map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  var formatDate = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  var header = e(VantageUI.PageHeader, {
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
        action: e(VantageUI.Button, { variant: 'primary', onClick: function () { onNavigate('training'); } }, 'GO TO TRAINING'),
      }),
    );
  }

  if (selectedResultId) {
    var selectedResult = null;
    for (var si = 0; si < results.length; si++) {
      if (results[si].id === selectedResultId) { selectedResult = results[si]; break; }
    }

    if (selectedResult) {
      var sc = VantageEngine.Scenarios.getById(selectedResult.scenarioId);
      var st = selectedResult.stats || {};
      var cfg = selectedResult.config || {};
      var statKeys = Object.keys(st);

      return e('div', { className: 'vpage-results' },
        e(VantageUI.PageHeader, {
          title: 'Session Details',
          subtitle: sc ? sc.name : selectedResult.scenarioId,
          action: e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('results'); } }, '← BACK TO HISTORY'),
        }),

        e('div', { className: 'vstats-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } },
          [
            { label: 'Score', value: selectedResult.score, icon: '◈', color: 'var(--accent-primary)' },
            { label: 'Grade', value: selectedResult.grade, icon: '△', color: gradeColor(selectedResult.grade) },
            { label: 'Accuracy', value: (st.accuracy || 0) + '%', icon: '⟶', color: 'var(--info)' },
            { label: 'Hits', value: st.hits || 0, icon: '◎', color: 'var(--success)' },
            { label: 'Misses', value: st.misses || 0, icon: '⊗', color: 'var(--danger, #ff3d5a)' },
            { label: 'Best Streak', value: st.bestStreak || 0, icon: '◇', color: 'var(--accent-secondary)' },
          ].map(function (s, i) {
            return e('div', { key: i, className: 'animate-in stagger-' + (i + 1) },
              e(VantageUI.StatCard, s),
            );
          })
        ),

        st.avgReactionTime ? e(VantageUI.Card, { className: 'animate-in stagger-3', style: { padding: '16px', marginTop: '16px' } },
          e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' } },
            [
              { label: 'Avg Reaction Time', value: st.avgReactionTime + 'ms' },
              { label: 'Duration', value: st.duration ? Math.round(st.duration) + 's' : '—' },
              { label: 'Difficulty', value: cfg.difficulty || '—' },
            ].map(function (item, i) {
              return e('div', { key: i },
                e('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' } }, item.label),
                e('div', { style: { fontSize: '18px', fontWeight: 600 } }, item.value),
              );
            })
          ),
        ) : null,

        statKeys.length > 0 ? e(VantageUI.Card, { className: 'animate-in stagger-4', style: { padding: '16px', marginTop: '16px' } },
          e('h3', { style: { margin: '0 0 12px 0', fontSize: '14px' } }, 'All Stats'),
          e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' } },
            statKeys.map(function (key) {
              return e('div', { key: key, style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.06))' } },
                e('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, key),
                e('span', { style: { fontSize: '12px', fontWeight: 600 } }, st[key]),
              );
            })
          ),
        ) : null,

        e('div', { style: { marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' } },
          'Session ID: ' + selectedResult.id + ' · ' + formatDate(selectedResult.timestamp || selectedResult.createdAt)
        ),
      );
    }
  }

  var agg = VantageEngine.Scoring.aggregateStats(results);

  return e('div', { className: 'vpage-results' },
    e(VantageUI.PageHeader, {
      title: 'Results',
      subtitle: 'Your training session history',
      action: e(VantageUI.Button, { variant: 'primary', onClick: function () { onNavigate('training'); } }, 'TRAIN AGAIN'),
    }),

    e('div', { className: 'vstats-grid' },
      [
        { label: 'Total Sessions', value: agg.totalSessions, icon: '◎', color: 'var(--accent-primary)' },
        { label: 'Average Score', value: agg.averageScore, icon: '◈', color: 'var(--accent-secondary)' },
        { label: 'Best Score', value: agg.bestScore, icon: '△', color: 'var(--success)' },
        { label: 'Avg Accuracy', value: agg.averageAccuracy + '%', icon: '⟶', color: 'var(--info)' },
      ].map(function (s, i) {
        return e('div', { key: i, className: 'animate-in stagger-' + (i + 1) },
          e(VantageUI.StatCard, s),
        );
      })
    ),

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
        results.map(function (r) {
          var sc = VantageEngine.Scenarios.getById(r.scenarioId);
          var st = r.stats || {};
          var isLatest = r.id === latestResultId;
          return e('div', {
            key: r.id,
            className: 'vresults-table-row ' + (isLatest ? 'vresults-table-row-latest' : ''),
            style: { cursor: 'pointer' },
            onClick: function () { onNavigate('results', r.id); },
          },
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
