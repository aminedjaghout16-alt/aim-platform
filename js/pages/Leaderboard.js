/* ============================================
   Leaderboard Page — Scenario rankings
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Leaderboard = function Leaderboard({ onNavigate, user }) {
  const [entries, setEntries] = useState(null); // null = loading
  const [selectedScenario, setSelectedScenario] = useState('static-flicking');
  const [timeRange, setTimeRange] = useState('all');
  const [userEntry, setUserEntry] = useState(null);
  const [userRank, setUserRank] = useState(null);
  const [error, setError] = useState(null);

  var uid = user ? user.uid : null;
  var DB = VantageServices.DatabaseService;

  // Get all enabled scenarios for the filter dropdown
  var scenarios = (VantageEngine.Scenarios.REGISTRY || []).filter(function (s) {
    return s.enabled !== false;
  });

  // Load leaderboard data when filters change
  useEffect(function () {
    if (!uid) { setEntries([]); return; }

    var cancelled = false;
    setError(null);
    setEntries(null); // Show loading state

    Promise.all([
      DB.getLeaderboardTop(selectedScenario, 50, timeRange),
      DB.getUserLeaderboardEntry(uid, selectedScenario),
      DB.getUserLeaderboardRank(uid, selectedScenario),
    ]).then(function (results) {
      if (cancelled) return;
      setEntries(results[0] || []);
      setUserEntry(results[1]);
      setUserRank(results[2]);
    }).catch(function (err) {
      if (!cancelled) {
        console.error('Leaderboard load error:', err);
        setError('Failed to load leaderboard. Please try again.');
        setEntries([]);
      }
    });

    return function () { cancelled = true; };
  }, [uid, selectedScenario, timeRange]);

  var formatDate = function (timestamp) {
    if (!timestamp) return '—';
    var d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  var gradeColor = function (g) {
    var map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  var header = e(VantageUI.PageHeader, {
    title: 'Leaderboard',
    subtitle: 'Compete for the top score in each scenario',
  });

  // Filters section
  var filters = e('div', { className: 'vleaderboard-filters animate-in' },
    // Scenario selector
    e('div', { className: 'vfilter-group' },
      e('label', { className: 'vfilter-label' }, 'Scenario'),
      e('select', {
        className: 'vfilter-select',
        value: selectedScenario,
        onChange: function (e) { setSelectedScenario(e.target.value); },
      },
        scenarios.map(function (s) {
          return e('option', { key: s.id, value: s.id }, s.name);
        })
      ),
    ),
    // Time range selector
    e('div', { className: 'vfilter-group' },
      e('label', { className: 'vfilter-label' }, 'Time Range'),
      e('div', { className: 'vfilter-tabs' },
        e('button', {
          className: 'vfilter-tab ' + (timeRange === 'all' ? 'vfilter-tab-active' : ''),
          onClick: function () { setTimeRange('all'); },
        }, 'All Time'),
        e('button', {
          className: 'vfilter-tab ' + (timeRange === 'week' ? 'vfilter-tab-active' : ''),
          onClick: function () { setTimeRange('week'); },
        }, 'This Week'),
      ),
    ),
  );

  // Loading state
  if (entries === null) {
    return e('div', { className: 'vpage-leaderboard' },
      header,
      filters,
      e('div', { className: 'vleaderboard-loading' },
        e('div', { className: 'vleaderboard-spinner' }),
        e('span', null, 'Loading leaderboard...'),
      ),
    );
  }

  // Error state
  if (error) {
    return e('div', { className: 'vpage-leaderboard' },
      header,
      filters,
      e(VantageUI.EmptyState, {
        icon: '⚠',
        title: 'Error',
        description: error,
        action: e(VantageUI.Button, {
          variant: 'secondary',
          onClick: function () { setSelectedScenario(selectedScenario); }, // Trigger reload
        }, 'RETRY'),
      }),
    );
  }

  // Empty state
  if (entries.length === 0) {
    return e('div', { className: 'vpage-leaderboard' },
      header,
      filters,
      e(VantageUI.EmptyState, {
        icon: '△',
        title: 'No entries yet',
        description: 'Be the first to set a score for this scenario!',
        action: e(VantageUI.Button, {
          variant: 'primary',
          onClick: function () { onNavigate('training'); },
        }, 'START TRAINING'),
      }),
    );
  }

  // Check if current user is in top 50
  var userInTop50 = entries.some(function (entry) { return entry.id === uid; });

  return e('div', { className: 'vpage-leaderboard' },
    e(VantageUI.PageHeader, {
      title: 'Leaderboard',
      subtitle: 'Compete for the top score in each scenario',
      action: e(VantageUI.Button, {
        variant: 'primary',
        onClick: function () { onNavigate('training'); },
      }, 'TRAIN'),
    }),

    filters,

    // Leaderboard table
    e(VantageUI.Card, { className: 'vleaderboard-table-card animate-in stagger-2' },
      e('div', { className: 'vleaderboard-table' },
        // Table header
        e('div', { className: 'vleaderboard-table-header' },
          e('span', { className: 'vleaderboard-col-rank' }, 'Rank'),
          e('span', { className: 'vleaderboard-col-player' }, 'Player'),
          e('span', { className: 'vleaderboard-col-score' }, 'Score'),
          e('span', { className: 'vleaderboard-col-accuracy' }, 'Accuracy'),
          e('span', { className: 'vleaderboard-col-grade' }, 'Grade'),
          e('span', { className: 'vleaderboard-col-date' }, 'Date'),
        ),
        // Table rows
        entries.map(function (entry, index) {
          var rank = index + 1;
          var isCurrentUser = entry.id === uid;
          var rowClass = 'vleaderboard-table-row' +
            (isCurrentUser ? ' vleaderboard-row-highlight' : '') +
            (rank <= 3 ? ' vleaderboard-row-top3' : '');

          return e('div', { key: entry.id, className: rowClass },
            e('span', { className: 'vleaderboard-col-rank vleaderboard-rank' },
              rank <= 3 ? e('span', { className: 'vleaderboard-medal vleaderboard-medal-' + rank }, rank) : rank
            ),
            e('span', { className: 'vleaderboard-col-player' },
              e('span', { className: 'vleaderboard-player-name' }, entry.displayName || 'Operator'),
              isCurrentUser && e('span', { className: 'vleaderboard-you-tag' }, 'YOU'),
            ),
            e('span', { className: 'vleaderboard-col-score vleaderboard-score' }, entry.score),
            e('span', { className: 'vleaderboard-col-accuracy' }, (entry.accuracy || 0) + '%'),
            e('span', { className: 'vleaderboard-col-grade', style: { color: gradeColor(entry.grade) } }, entry.grade || '—'),
            e('span', { className: 'vleaderboard-col-date text-secondary' }, formatDate(entry.createdAt)),
          );
        }),
      ),
    ),

    // Show current user's rank if they're outside top 50
    !userInTop50 && userEntry && userRank && e('div', { className: 'vleaderboard-your-rank animate-in stagger-3' },
      e(VantageUI.Card, null,
        e('div', { className: 'vleaderboard-your-rank-content' },
          e('span', { className: 'vleaderboard-your-rank-label' }, 'Your Rank'),
          e('span', { className: 'vleaderboard-your-rank-number' }, '#' + userRank),
          e('span', { className: 'vleaderboard-your-rank-score' }, 'Score: ' + userEntry.score),
          e('span', { className: 'vleaderboard-your-rank-accuracy' }, 'Accuracy: ' + (userEntry.accuracy || 0) + '%'),
        ),
      ),
    ),
  );
};
