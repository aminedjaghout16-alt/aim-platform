/* ============================================
   Results Page — Session history & details
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Results = function Results({ onNavigate }) {
  // Mock results for display
  const mockResults = [
    { id: '1', scenarioId: 'static-flicking', scenario: 'Static Flicking', score: 742, grade: 'A', accuracy: 89, avgRT: 285, hits: 42, misses: 5, streak: 12, date: '2026-09-12', duration: 60 },
    { id: '2', scenarioId: 'smooth-tracking', scenario: 'Smooth Tracking', score: 685, grade: 'B', accuracy: 82, avgRT: 320, hits: 38, misses: 8, streak: 9, date: '2026-09-11', duration: 60 },
    { id: '3', scenarioId: 'micro-adjustments', scenario: 'Micro Adjustments', score: 710, grade: 'A', accuracy: 86, avgRT: 298, hits: 40, misses: 6, streak: 11, date: '2026-09-10', duration: 60 },
  ];

  const gradeColor = (g) => {
    const map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  return e('div', { className: 'vpage-results' },
    e(VantageUI.PageHeader, {
      title: 'Results',
      subtitle: 'Your training session history',
    }),

    // Summary stats
    e('div', { className: 'vstats-grid' },
      [
        { label: 'Total Sessions', value: mockResults.length, icon: '◎', color: 'var(--accent-primary)' },
        { label: 'Average Score', value: Math.round(mockResults.reduce((s, r) => s + r.score, 0) / mockResults.length), icon: '◈', color: 'var(--accent-secondary)' },
        { label: 'Best Score', value: Math.max(...mockResults.map(r => r.score)), icon: '△', color: 'var(--success)' },
        { label: 'Avg Accuracy', value: Math.round(mockResults.reduce((s, r) => s + r.accuracy, 0) / mockResults.length) + '%', icon: '⟶', color: 'var(--info)' },
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
        mockResults.map(r =>
          e('div', { key: r.id, className: 'vresults-table-row' },
            e('span', { className: 'vresults-table-scenario' },
              e('span', { className: 'vresult-icon' }, '◎'),
              r.scenario,
            ),
            e('span', { className: 'vresults-table-score' }, r.score),
            e('span', { style: { color: gradeColor(r.grade), fontWeight: 600 } }, r.grade),
            e('span', null, r.accuracy + '%'),
            e('span', null, r.avgRT + 'ms'),
            e('span', null, r.hits + '/' + (r.hits + r.misses)),
            e('span', { className: 'text-secondary' }, r.date),
          )
        ),
      ),
    ),
  );
};
