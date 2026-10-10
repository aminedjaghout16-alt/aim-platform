/* ============================================
   Performance Dashboard — Comprehensive analytics
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.PerformanceDashboard = function PerformanceDashboard({ onNavigate, user }) {
  var uid = user ? user.uid : null;

  var _s1 = useState(true);
  var loading = _s1[0];
  var setLoading = _s1[1];

  var _s2 = useState([]);
  var allResults = _s2[0];
  var setAllResults = _s2[1];

  var _s3 = useState('30');
  var timeRange = _s3[0];
  var setTimeRange = _s3[1];

  var _s4 = useState('all');
  var selectedExercise = _s4[0];
  var setSelectedExercise = _s4[1];

  var _s5 = useState(1);
  var currentPage = _s5[0];
  var setCurrentPage = _s5[1];

  var _s6 = useState('');
  var searchQuery = _s6[0];
  var setSearchQuery = _s6[1];

  var _s7 = useState(null);
  var benchmarkSummary = _s7[0];
  var setBenchmarkSummary = _s7[1];

  var _s8 = useState(null);
  var todayPlan = _s8[0];
  var setTodayPlan = _s8[1];

  var _s9 = useState(null);
  var error = _s9[0];
  var setError = _s9[1];

  useEffect(function () {
    if (!uid) { setLoading(false); return; }
    var cancelled = false;
    var DB = VantageServices.DatabaseService;

    DB.getUserResults(uid).then(function (results) {
      if (cancelled) return;
      setAllResults(results || []);
      setLoading(false);
    }).catch(function (err) {
      if (!cancelled) {
        setError('Failed to load results');
        setLoading(false);
      }
    });

    try {
      VantageServices.BenchmarkService.getBenchmarkSummary(uid).then(function (summary) {
        if (!cancelled) setBenchmarkSummary(summary);
      }).catch(function () {});

      VantageServices.DailyPlanService.getTodayPlan(uid).then(function (plan) {
        if (!cancelled) setTodayPlan(plan);
      }).catch(function () {});
    } catch (e) {}

    return function () { cancelled = true; };
  }, [uid]);

  var now = new Date();
  var filteredResults = allResults.filter(function (r) {
    if (timeRange === 'all') return true;
    var days = parseInt(timeRange, 10);
    var cutoff = new Date(now.getTime() - days * 86400000);
    return new Date(r.timestamp).getTime() >= cutoff.getTime();
  });

  var exercises = VantageEngine.Scenarios.getEnabled();
  var exerciseOptions = [{ value: 'all', label: 'All Exercises' }].concat(
    exercises.map(function (s) { return { value: s.id, label: s.name }; })
  );

  var exerciseResults = selectedExercise === 'all'
    ? filteredResults
    : filteredResults.filter(function (r) { return r.scenarioId === selectedExercise; });

  var totalSessions = filteredResults.length;

  var totalTime = filteredResults.reduce(function (s, r) {
    return s + ((r.stats && r.stats.duration) || 0);
  }, 0);

  var avgScore = totalSessions > 0
    ? Math.round(filteredResults.reduce(function (s, r) { return s + (r.score || 0); }, 0) / totalSessions)
    : 0;

  var avgAccuracy = totalSessions > 0
    ? Math.round(filteredResults.reduce(function (s, r) {
        return s + ((r.stats && r.stats.accuracy) || 0);
      }, 0) / totalSessions)
    : 0;

  var personalBests = {};
  filteredResults.forEach(function (r) {
    if (!personalBests[r.scenarioId] || r.score > personalBests[r.scenarioId].score) {
      personalBests[r.scenarioId] = r;
    }
  });
  var pbList = Object.keys(personalBests).map(function (k) { return personalBests[k]; });

  var recent10 = filteredResults.slice(0, 10);
  var prev10 = filteredResults.slice(10, 20);
  var recentAvg = recent10.length
    ? Math.round(recent10.reduce(function (s, r) { return s + (r.score || 0); }, 0) / recent10.length)
    : 0;
  var prevAvg = prev10.length
    ? Math.round(prev10.reduce(function (s, r) { return s + (r.score || 0); }, 0) / prev10.length)
    : 0;
  var trendDelta = prevAvg > 0 ? recentAvg - prevAvg : 0;

  var last7 = allResults.filter(function (r) {
    return new Date(r.timestamp).getTime() >= now.getTime() - 7 * 86400000;
  });

  var weaknesses = [];
  try {
    if (allResults.length > 0 && VantageEngine.AimAnalysis) {
      weaknesses = VantageEngine.AimAnalysis.detectWeaknesses(allResults) || [];
    }
  } catch (e) {}

  var bestTrend = null;
  var worstTrend = null;
  var bestTrendVal = -Infinity;
  var worstTrendVal = Infinity;
  for (var wi = 0; wi < weaknesses.length; wi++) {
    var w = weaknesses[wi];
    if (w.categoryId === 'consistency' || w.categoryId === 'reaction') continue;
    var slope = 0;
    if (w.recentPerformance && w.recentPerformance.trend === 'improving') slope = 1;
    else if (w.recentPerformance && w.recentPerformance.trend === 'declining') slope = -1;
    if (slope > bestTrendVal) { bestTrendVal = slope; bestTrend = w; }
    if (slope < worstTrendVal) { worstTrendVal = slope; worstTrend = w; }
  }

  function formatTime(sec) {
    if (!sec) return '0m';
    if (sec < 60) return sec + 's';
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatShortDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function gradeColor(g) {
    var map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  }

  function trendArrow(trend) {
    if (trend === 'improving') return { symbol: '▲', color: 'var(--success, #00e676)' };
    if (trend === 'declining') return { symbol: '▼', color: 'var(--danger, #ff3d5a)' };
    return { symbol: '►', color: 'var(--text-secondary)' };
  }

  var scoreData = exerciseResults.slice().reverse().map(function (r) {
    return { x: r.timestamp, y: r.score || 0 };
  });

  var accuracyData = exerciseResults.slice().reverse().map(function (r) {
    return { x: r.timestamp, y: (r.stats && r.stats.accuracy) || 0 };
  });

  var activityMap = {};
  filteredResults.forEach(function (r) {
    var dk = formatShortDate(r.timestamp);
    if (!activityMap[dk]) activityMap[dk] = { label: dk, value: 0 };
    activityMap[dk].value++;
  });
  var activityData = Object.keys(activityMap).map(function (k) { return activityMap[k]; }).slice(-14);

  var skillCategories = VantageEngine.AimAnalysis ? VantageEngine.AimAnalysis.getSkillCategories() : {};
  var radarData = [];
  var skillCatKeys = Object.keys(skillCategories);
  for (var sci = 0; sci < skillCatKeys.length; sci++) {
    var catId = skillCatKeys[sci];
    var cat = skillCategories[catId];
    var catResults = [];
    for (var ei = 0; ei < cat.exercises.length; ei++) {
      var exRes = filteredResults.filter(function (r) { return r.scenarioId === cat.exercises[ei]; });
      catResults = catResults.concat(exRes);
    }
    var catAvg = catResults.length
      ? Math.round(catResults.reduce(function (s, r) { return s + (r.score || 0); }, 0) / catResults.length / 10)
      : 0;
    radarData.push({ label: cat.label, value: Math.min(100, catAvg) });
  }

  var pbProgression = [];
  var runningPB = 0;
  var sortedAsc = filteredResults.slice().reverse();
  for (var pbi = 0; pbi < sortedAsc.length; pbi++) {
    if (sortedAsc[pbi].score > runningPB) {
      runningPB = sortedAsc[pbi].score;
      pbProgression.push({ date: sortedAsc[pbi].timestamp, value: runningPB });
    }
  }

  var PAGE_SIZE = 50;
  var tableFiltered = exerciseResults;
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    tableFiltered = tableFiltered.filter(function (r) {
      var sc = VantageEngine.Scenarios.getById(r.scenarioId);
      var name = sc ? sc.name.toLowerCase() : r.scenarioId.toLowerCase();
      return name.indexOf(q) !== -1 || (r.grade || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  var tablePages = Math.max(1, Math.ceil(tableFiltered.length / PAGE_SIZE));
  var tablePage = Math.min(currentPage, tablePages);
  var tableSlice = tableFiltered.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);

  if (loading) {
    return e('div', { className: 'vpage-performance' },
      e(VantageUI.PageHeader, { title: 'Performance', subtitle: 'Loading your data...' }),
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', flexDirection: 'column', gap: '12px' } },
        e('span', { style: { fontSize: '32px', color: 'var(--accent-primary)' } }, '▽'),
        e('span', { style: { color: 'var(--text-secondary)', fontSize: '13px', letterSpacing: '2px' } }, 'LOADING...'),
      ),
    );
  }

  if (error) {
    return e('div', { className: 'vpage-performance' },
      e(VantageUI.PageHeader, { title: 'Performance' }),
      e(VantageUI.EmptyState, {
        icon: '⚠', title: 'Error', description: error,
        action: e(VantageUI.Button, { variant: 'secondary', size: 'sm', onClick: function () { window.location.reload(); } }, 'RETRY'),
      }),
    );
  }

  var timeFilters = [
    { id: '7', label: '7 Days' },
    { id: '30', label: '30 Days' },
    { id: '90', label: '90 Days' },
    { id: 'all', label: 'All Time' },
  ];

  var overviewStats = [
    { label: 'Sessions', value: String(totalSessions), icon: '◎', color: 'var(--accent-primary)', subtext: timeRange === 'all' ? 'All time' : 'Last ' + timeRange + ' days' },
    { label: 'Training Time', value: formatTime(totalTime), icon: '⟶', color: 'var(--info, #448aff)' },
    { label: 'Avg Score', value: totalSessions > 0 ? String(avgScore) : '—', icon: '◈', color: 'var(--accent-secondary)',
      subtext: trendDelta !== 0 ? (trendDelta > 0 ? '+' : '') + trendDelta + ' vs prev' : '' },
    { label: 'Avg Accuracy', value: totalSessions > 0 ? avgAccuracy + '%' : '—', icon: '⊕', color: 'var(--success, #00e676)' },
    { label: 'Personal Bests', value: String(pbList.length), icon: '△', color: 'var(--accent-secondary)' },
    { label: 'Last 7 Days', value: String(last7.length), icon: '◇', color: 'var(--info, #448aff)', subtext: 'sessions' },
  ];

  return e('div', { className: 'vpage-performance' },
    e(VantageUI.PageHeader, {
      title: 'Performance',
      subtitle: 'Comprehensive aim training analytics',
      action: e(VantageUI.Button, { variant: 'primary', onClick: function () { onNavigate('training'); } }, 'TRAIN NOW'),
    }),

    e('div', { style: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' } },
      timeFilters.map(function (tf) {
        return e(VantageUI.Button, {
          key: tf.id,
          variant: timeRange === tf.id ? 'primary' : 'ghost',
          size: 'sm',
          onClick: function () { setTimeRange(tf.id); setCurrentPage(1); },
        }, tf.label);
      }),
      e('div', { style: { flex: 1 } }),
      e(VantageUI.Select, {
        value: selectedExercise,
        onChange: function (v) { setSelectedExercise(v); setCurrentPage(1); },
        options: exerciseOptions,
        className: 'vperf-exercise-select',
      }),
    ),

    e('div', { className: 'vstats-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } },
      overviewStats.map(function (s, i) {
        return e('div', { key: i, className: 'animate-in stagger-' + Math.min(i + 1, 6) },
          e(VantageUI.StatCard, s),
        );
      })
    ),

    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' } },
      bestTrend && e(VantageUI.Card, { className: 'animate-in stagger-1', style: { padding: '16px' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
          e('span', { style: { color: 'var(--success, #00e676)', fontSize: '18px' } }, '▲'),
          e('span', { style: { color: 'var(--text-secondary)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' } }, 'Most Improved'),
        ),
        e('div', { style: { fontWeight: 600, fontSize: '15px' } }, bestTrend.category),
        e('div', { style: { color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' } }, bestTrend.recommendation),
      ),
      worstTrend && worstTrend !== bestTrend && e(VantageUI.Card, { className: 'animate-in stagger-2', style: { padding: '16px' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
          e('span', { style: { color: 'var(--danger, #ff3d5a)', fontSize: '18px' } }, '▼'),
          e('span', { style: { color: 'var(--text-secondary)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' } }, 'Needs Attention'),
        ),
        e('div', { style: { fontWeight: 600, fontSize: '15px' } }, worstTrend.category),
        e('div', { style: { color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' } }, worstTrend.recommendation),
      ),
    ),

    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginTop: '20px' } },
      e(VantageUI.Card, { className: 'animate-in stagger-3' },
        e(VantageCharts.LineChart, {
          data: scoreData,
          title: 'Score Progression',
          color: 'var(--accent-primary)',
          height: 220,
          showArea: true,
          yLabel: 'Score',
        }),
      ),
      e(VantageUI.Card, { className: 'animate-in stagger-4' },
        e(VantageCharts.LineChart, {
          data: accuracyData,
          title: 'Accuracy Trend',
          color: 'var(--accent-secondary)',
          height: 220,
          showDots: true,
          yLabel: '%',
        }),
      ),
    ),

    e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginTop: '16px' } },
      e(VantageUI.Card, { className: 'animate-in stagger-5' },
        e(VantageCharts.BarChart, {
          data: activityData,
          title: 'Training Activity',
          color: 'var(--info, #448aff)',
          height: 200,
        }),
      ),
      e(VantageUI.Card, { className: 'animate-in stagger-6' },
        e(VantageCharts.RadarChart, {
          data: radarData,
          title: 'Skill Performance',
          height: 260,
          fillColor: 'var(--accent-primary)',
        }),
      ),
    ),

    pbProgression.length > 0 && e('div', { style: { marginTop: '16px' } },
      e(VantageUI.Card, { className: 'animate-in stagger-1' },
        e(VantageCharts.ProgressChart, {
          data: pbProgression,
          title: 'Personal Best Progression',
          color: 'var(--success, #00e676)',
          height: 180,
        }),
      ),
    ),

    e('div', { style: { marginTop: '24px' } },
      e(VantageUI.Card, { className: 'animate-in stagger-2' },
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' } },
          e('h3', { style: { margin: 0, fontSize: '16px' } }, 'Exercise History'),
          e('input', {
            type: 'text',
            placeholder: 'Search exercises...',
            value: searchQuery,
            onChange: function (ev) { setSearchQuery(ev.target.value); setCurrentPage(1); },
            style: {
              background: 'var(--bg-input, rgba(255,255,255,0.05))',
              border: '1px solid var(--border-primary, rgba(255,255,255,0.1))',
              borderRadius: '6px', padding: '6px 12px', color: 'var(--text-primary)',
              fontSize: '13px', outline: 'none', width: '200px',
            },
          }),
        ),

        tableFiltered.length === 0
          ? e(VantageUI.EmptyState, {
              icon: '◎', title: 'No sessions found',
              description: timeRange !== 'all' ? 'Try expanding the time range or selecting a different exercise.' : 'Complete training sessions to see your history here.',
              action: e(VantageUI.Button, { variant: 'secondary', size: 'sm', onClick: function () { onNavigate('training'); } }, 'START TRAINING'),
            })
          : e('div', null,
              e('div', { className: 'vresults-table' },
                e('div', { className: 'vresults-table-row', style: { fontWeight: 600, fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.08))' } },
                  e('span', { style: { flex: 2 } }, 'Exercise'),
                  e('span', { style: { flex: 1 } }, 'Date'),
                  e('span', { style: { flex: 0.7, textAlign: 'right' } }, 'Score'),
                  e('span', { style: { flex: 0.6, textAlign: 'right' } }, 'Acc'),
                  e('span', { style: { flex: 0.5, textAlign: 'right' } }, 'Time'),
                  e('span', { style: { flex: 0.4, textAlign: 'center' } }, 'Grade'),
                  e('span', { style: { flex: 0.4, textAlign: 'center' } }, 'PB'),
                ),
                tableSlice.map(function (r) {
                  var sc = VantageEngine.Scenarios.getById(r.scenarioId);
                  var isPB = personalBests[r.scenarioId] && personalBests[r.scenarioId].id === r.id;
                  var diff = (r.config && r.config.difficulty) || '—';
                  return e('div', {
                    key: r.id,
                    className: 'vresults-table-row',
                    style: { cursor: 'pointer' },
                    onClick: function () { onNavigate('results'); },
                  },
                    e('span', { style: { flex: 2, display: 'flex', alignItems: 'center', gap: '6px' } },
                      e('span', { className: 'vresult-icon' }, '◎'),
                      e('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sc ? sc.name : r.scenarioId),
                    ),
                    e('span', { style: { flex: 1, color: 'var(--text-secondary)', fontSize: '13px' } }, formatShortDate(r.timestamp)),
                    e('span', { style: { flex: 0.7, textAlign: 'right', fontWeight: 600 } }, r.score),
                    e('span', { style: { flex: 0.6, textAlign: 'right', color: 'var(--text-secondary)' } },
                      (r.stats && r.stats.accuracy !== undefined) ? r.stats.accuracy + '%' : '—'),
                    e('span', { style: { flex: 0.5, textAlign: 'right', color: 'var(--text-secondary)', fontSize: '13px' } },
                      formatTime(r.stats && r.stats.duration)),
                    e('span', { style: { flex: 0.4, textAlign: 'center', fontWeight: 600, color: gradeColor(r.grade) } }, r.grade),
                    e('span', { style: { flex: 0.4, textAlign: 'center' } },
                      isPB ? e('span', { style: { color: 'var(--accent-secondary)', fontSize: '12px' } }, '★') : null),
                  );
                }),
              ),
              tablePages > 1 && e('div', { style: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' } },
                e(VantageUI.Button, { variant: 'ghost', size: 'sm', disabled: tablePage <= 1,
                  onClick: function () { setCurrentPage(tablePage - 1); } }, '←'),
                e('span', { style: { color: 'var(--text-secondary)', fontSize: '13px' } },
                  'Page ' + tablePage + ' of ' + tablePages),
                e(VantageUI.Button, { variant: 'ghost', size: 'sm', disabled: tablePage >= tablePages,
                  onClick: function () { setCurrentPage(tablePage + 1); } }, '→'),
              ),
            ),
      ),
    ),

    pbList.length > 0 && e('div', { style: { marginTop: '24px' } },
      e('h3', { style: { fontSize: '16px', marginBottom: '12px' } }, 'Personal Bests'),
      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' } },
        pbList.map(function (r, i) {
          var sc = VantageEngine.Scenarios.getById(r.scenarioId);
          var isNew = false;
          try {
            var cutoff30 = new Date(now.getTime() - 30 * 86400000);
            isNew = new Date(r.timestamp).getTime() >= cutoff30.getTime();
          } catch (e) {}
          return e('div', { key: r.id || i },
            e(VantageUI.Card, {
              className: 'animate-in stagger-' + Math.min(i + 1, 6) + (isNew ? ' vperf-new-pb' : ''),
              style: { padding: '16px', position: 'relative', overflow: 'hidden' },
            },
              isNew && e('div', { style: {
                position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                background: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))',
              } }),
              e('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                sc ? sc.name : r.scenarioId),
              e('div', { style: { fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)', lineHeight: 1 } }, r.score),
              e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } },
                e('span', { style: { fontSize: '12px', color: 'var(--text-secondary)' } }, formatShortDate(r.timestamp)),
                e('span', { style: { fontWeight: 600, color: gradeColor(r.grade), fontSize: '14px' } }, r.grade),
              ),
            ),
          );
        }),
      ),
    ),

    weaknesses.length > 0 && e('div', { style: { marginTop: '24px' } },
      e('h3', { style: { fontSize: '16px', marginBottom: '12px' } }, 'Skill Breakdown'),
      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' } },
        weaknesses.filter(function (w) { return w.categoryId !== 'consistency' && w.categoryId !== 'reaction'; }).map(function (w, i) {
          var ta = trendArrow(w.recentPerformance ? w.recentPerformance.trend : 'stable');
          var catInfo = VantageEngine.Categories.getById(
            w.categoryId === 'flicking' ? 'flicking' :
            w.categoryId === 'tracking' ? 'tracking' :
            w.categoryId === 'reactive' ? 'tracking' :
            w.categoryId === 'switching' ? 'target_switching' : w.categoryId
          ) || {};
          var suggestedScenario = w.suggestedExercise ? VantageEngine.Scenarios.getById(w.suggestedExercise) : null;
          return e(VantageUI.Card, { key: w.categoryId || i, className: 'animate-in stagger-' + Math.min(i + 1, 6), style: { padding: '16px' } },
            e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
              e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                e('span', { style: { color: catInfo.color || 'var(--accent-primary)', fontSize: '16px' } }, catInfo.icon || '◆'),
                e('span', { style: { fontWeight: 600, fontSize: '14px' } }, w.category),
              ),
              e('span', { style: { color: ta.color, fontSize: '14px' } }, ta.symbol),
            ),
            e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' } },
              e('div', null,
                e('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' } }, 'Avg'),
                e('div', { style: { fontSize: '18px', fontWeight: 600 } }, w.recentPerformance ? w.recentPerformance.avgScore : '—'),
              ),
              e('div', null,
                e('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' } }, 'Best'),
                e('div', { style: { fontSize: '18px', fontWeight: 600, color: 'var(--accent-secondary)' } }, w.metrics ? w.metrics.bestScore : '—'),
              ),
              e('div', null,
                e('div', { style: { fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' } }, 'Sessions'),
                e('div', { style: { fontSize: '18px', fontWeight: 600 } }, w.recentPerformance ? w.recentPerformance.sessions : '—'),
              ),
            ),
            e('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '10px' } }, w.recommendation),
            suggestedScenario && e(VantageUI.Button, {
              variant: 'ghost', size: 'sm',
              onClick: function () { onNavigate('details', w.suggestedExercise); },
            }, 'PRACTICE ' + suggestedScenario.shortName.toUpperCase()),
          );
        }),
      ),
    ),

    e('div', { style: { marginTop: '24px' } },
      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' } },
        e(VantageUI.Card, { className: 'animate-in stagger-1', style: { padding: '16px' } },
          e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
            e('h3', { style: { margin: 0, fontSize: '15px' } }, 'Daily Plan'),
            e(VantageUI.Button, { variant: 'ghost', size: 'sm', onClick: function () { onNavigate('daily'); } }, 'OPEN →'),
          ),
          todayPlan
            ? e('div', null,
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
                  e(VantageUI.Badge, {
                    color: todayPlan.status === 'completed' ? 'var(--success, #00e676)' : 'var(--accent-secondary)',
                    variant: 'filled',
                  }, todayPlan.status === 'completed' ? 'COMPLETED' : todayPlan.status === 'in_progress' ? 'IN PROGRESS' : 'READY'),
                  e('span', { style: { color: 'var(--text-secondary)', fontSize: '13px' } },
                    todayPlan.exercises ? todayPlan.exercises.length + ' exercises' : ''),
                ),
                todayPlan.completedExercises && e(VantageUI.ProgressBar, {
                  value: todayPlan.completedExercises.length,
                  max: todayPlan.exercises ? todayPlan.exercises.length : 1,
                  label: 'Progress',
                  showValue: true,
                  height: '4px',
                }),
              )
            : e('div', { style: { color: 'var(--text-secondary)', fontSize: '13px' } },
                'No plan for today. Generate one to stay on track.'),
        ),

        e(VantageUI.Card, { className: 'animate-in stagger-2', style: { padding: '16px' } },
          e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
            e('h3', { style: { margin: 0, fontSize: '15px' } }, 'Benchmark'),
            e(VantageUI.Button, { variant: 'ghost', size: 'sm', onClick: function () { onNavigate('benchmark'); } }, 'OPEN →'),
          ),
          benchmarkSummary && benchmarkSummary.latest
            ? e('div', null,
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
                  e('div', { style: { fontSize: '32px', fontWeight: 700, color: benchmarkSummary.latest.rankColor || 'var(--accent-primary)', lineHeight: 1 } },
                    benchmarkSummary.latest.overallScore),
                  e('div', null,
                    e('div', { style: { fontWeight: 600, color: benchmarkSummary.latest.rankColor || 'var(--accent-primary)' } },
                      benchmarkSummary.latest.rankName || 'Unranked'),
                    e('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } },
                      formatShortDate(benchmarkSummary.latest.timestamp)),
                  ),
                ),
                e('div', { style: { fontSize: '12px', color: 'var(--text-secondary)' } },
                  benchmarkSummary.totalAttempts + ' attempt' + (benchmarkSummary.totalAttempts !== 1 ? 's' : '') + ' total'),
              )
            : e('div', { style: { color: 'var(--text-secondary)', fontSize: '13px' } },
                'No benchmark completed yet. Take one to get your rank.'),
        ),
      ),
    ),

    e('div', { style: { height: '40px' } }),
  );
};
