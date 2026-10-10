/* ============================================
   Aim Benchmark Page — Complete benchmark system
   States: dashboard | countdown | stage-transition | stage-result | final-result | history | detail | compare
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.AimBenchmark = function AimBenchmark({ user, onNavigate, onStartExercise, activeBenchmark, onBenchmarkStageComplete }) {
  var uid = user ? user.uid : null;
  var BConfig = VantageEngine.BenchmarkConfig;
  var BService = VantageServices.BenchmarkService;

  // Main view state
  var _s = useState('dashboard');
  var view = _s[0], setView = _s[1];

  // Data state
  var _sum = useState(null);
  var summary = _sum[0], setSummary = _sum[1];
  var _hist = useState([]);
  var history = _hist[0], setHistory = _hist[1];
  var _load = useState(true);
  var loading = _load[0], setLoading = _load[1];
  var _err = useState(null);
  var error = _err[0], setError = _err[1];

  // Benchmark execution state
  var _stageIdx = useState(0);
  var stageIndex = _stageIdx[0], setStageIndex = _stageIdx[1];
  var _stageResults = useState({});
  var stageResults = _stageResults[0], setStageResults = _stageResults[1];
  var _benchStart = useState(null);
  var benchmarkStartTime = _benchStart[0], setBenchmarkStartTime = _benchStart[1];
  var _saving = useState(false);
  var saving = _saving[0], setSaving = _saving[1];
  var _lastResult = useState(null);
  var lastResult = _lastResult[0], setLastResult = _lastResult[1];
  var _countdown = useState(3);
  var countdown = _countdown[0], setCountdown = _countdown[1];

  // History detail/compare state
  var _selBench = useState(null);
  var selectedBenchmark = _selBench[0], setSelectedBenchmark = _selBench[1];
  var _compareA = useState(null);
  var compareA = _compareA[0], setCompareA = _compareA[1];
  var _compareB = useState(null);
  var compareB = _compareB[0], setCompareB = _compareB[1];
  var _compareMode = useState(false);
  var compareMode = _compareMode[0], setCompareMode = _compareMode[1];

  // Refs for preventing duplicate operations
  var savingRef = useRef(false);
  var startedRef = useRef(false);

  // Load benchmark data
  useEffect(function() {
    if (!uid) { setLoading(false); return; }
    var cancelled = false;
    setLoading(true);
    setError(null);

    BService.getBenchmarkSummary(uid).then(function(s) {
      if (cancelled) return;
      setSummary(s);
      return BService.getUserBenchmarks(uid);
    }).then(function(h) {
      if (cancelled) return;
      setHistory(h || []);
      setLoading(false);
    }).catch(function(err) {
      if (cancelled) return;
      console.error('[Benchmark] Load error:', err);
      setError('Failed to load benchmark data. Please try again.');
      setLoading(false);
    });

    return function() { cancelled = true; };
  }, [uid]);

  // Handle benchmark stage completion from gameplay
  useEffect(function() {
    if (!activeBenchmark || !activeBenchmark.stageResult) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    var result = activeBenchmark.stageResult;
    var idx = activeBenchmark.completedStageIndex;
    var newResults = Object.assign({}, stageResults);
    newResults[BConfig.STAGES[idx].id] = result;
    setStageResults(newResults);
    setLastResult(result);

    // Check if all stages are done
    if (BConfig.isBenchmarkComplete(newResults)) {
      // Build final result and save
      var finalResult = BConfig.buildBenchmarkResult(newResults);
      var duration = benchmarkStartTime ? Math.round((Date.now() - benchmarkStartTime) / 1000) : 0;
      finalResult.duration = duration;

      BService.saveBenchmark(uid, finalResult).then(function(saved) {
        setLastResult(saved);
        setView('final-result');
        // Refresh summary
        return BService.getBenchmarkSummary(uid);
      }).then(function(s) {
        setSummary(s);
        return BService.getUserBenchmarks(uid);
      }).then(function(h) {
        setHistory(h || []);
        setSaving(false);
        savingRef.current = false;
      }).catch(function(err) {
        console.error('[Benchmark] Save error:', err);
        setError('Failed to save benchmark results. Please try again.');
        setSaving(false);
        savingRef.current = false;
      });
    } else {
      // Move to next stage transition
      setView('stage-result');
      setSaving(false);
      savingRef.current = false;
    }
  }, [activeBenchmark]);

  // Start benchmark
  var handleStartBenchmark = useCallback(function() {
    if (startedRef.current) return;
    startedRef.current = true;
    setStageIndex(0);
    setStageResults({});
    setLastResult(null);
    setBenchmarkStartTime(Date.now());
    setView('countdown');
    setCountdown(3);

    var count = 3;
    var timer = setInterval(function() {
      count--;
      if (count <= 0) {
        clearInterval(timer);
        startedRef.current = false;
        // Launch first stage
        launchStage(0);
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, []);

  // Launch a specific stage
  var launchStage = useCallback(function(idx) {
    if (idx >= BConfig.STAGES.length) return;
    setStageIndex(idx);
    setView('playing');
    var stage = BConfig.STAGES[idx];
    var config = {
      duration: stage.duration,
      difficulty: stage.difficulty,
      targetSize: stage.targetSize,
      targetSpeed: stage.targetSpeed,
    };
    if (onStartExercise) {
      onStartExercise(stage.scenarioId, config, idx);
    }
  }, [onStartExercise]);

  // Continue to next stage after seeing stage result
  var handleContinueToNextStage = useCallback(function() {
    var nextIdx = stageIndex + 1;
    if (nextIdx < BConfig.STAGES.length) {
      setView('countdown');
      setCountdown(3);
      var count = 3;
      var timer = setInterval(function() {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          launchStage(nextIdx);
        } else {
          setCountdown(count);
        }
      }, 1000);
    }
  }, [stageIndex, launchStage]);

  // Abandon benchmark
  var handleAbandonBenchmark = useCallback(function() {
    setView('dashboard');
    setStageIndex(0);
    setStageResults({});
    setLastResult(null);
    startedRef.current = false;
  }, []);

  // View history detail
  var handleViewDetail = useCallback(function(bench) {
    setSelectedBenchmark(bench);
    setView('detail');
  }, []);

  // Toggle compare mode
  var handleToggleCompare = useCallback(function() {
    setCompareMode(!compareMode);
    setCompareA(null);
    setCompareB(null);
  }, [compareMode]);

  var handleSelectForCompare = useCallback(function(bench) {
    if (!compareA) {
      setCompareA(bench);
    } else if (!compareB && bench.id !== compareA.id) {
      setCompareB(bench);
      setView('compare');
    }
  }, [compareA, compareB]);

  // Share results
  var handleShare = useCallback(function(benchData) {
    var data = benchData || lastResult || (summary && summary.latest);
    if (!data) return;

    var rank = BConfig.getRankForScore(data.overallScore);
    var text = 'VANTAGE Aim Benchmark\n' +
      'Score: ' + data.overallScore + ' / 1000\n' +
      'Rank: ' + rank.name + '\n' +
      'Precision: ' + (data.categoryScores.precision || 0) + '/100\n' +
      'Tracking: ' + (data.categoryScores.tracking || 0) + '/100\n' +
      'Reactive: ' + (data.categoryScores.reactive || 0) + '/100\n' +
      'Switching: ' + (data.categoryScores.switching || 0) + '/100';

    if (navigator.share) {
      navigator.share({ title: 'VANTAGE Aim Benchmark', text: text }).catch(function() {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        alert('Results copied to clipboard!');
      }).catch(function() {});
    }
  }, [lastResult, summary]);

  // Build training plan from benchmark
  var handleBuildTrainingPlan = useCallback(function() {
    onNavigate('daily');
  }, [onNavigate]);

  // Retake benchmark
  var handleRetake = useCallback(function() {
    setView('dashboard');
    setTimeout(function() {
      handleStartBenchmark();
    }, 100);
  }, [handleStartBenchmark]);

  // Format date
  var formatDate = function(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  var formatDuration = function(sec) {
    if (!sec) return '—';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + 'm ' + s + 's';
  };

  // ─── RENDER: COUNTDOWN ─────────────────────────────
  if (view === 'countdown') {
    var currentStage = BConfig.STAGES[stageIndex];
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { className: 'vbench-countdown' },
        e('div', { className: 'vbench-countdown-stage' },
          'STAGE ' + (stageIndex + 1) + ' / ' + BConfig.STAGES.length
        ),
        e('div', { className: 'vbench-countdown-name' }, currentStage.name),
        e('div', { key: countdown, className: 'vbench-countdown-number' }, countdown),
        e('div', { className: 'vbench-countdown-desc' }, currentStage.description),
        e('button', {
          className: 'vbtn vbtn-ghost vbtn-sm',
          onClick: handleAbandonBenchmark,
          style: { marginTop: '24px' },
        }, 'ABANDON BENCHMARK'),
      ),
    );
  }

  // ─── RENDER: STAGE RESULT ──────────────────────────
  if (view === 'stage-result') {
    var completedStage = BConfig.STAGES[stageIndex];
    var stageResult = stageResults[completedStage.id];
    var stageScore = stageResult ? stageResult.score : 0;
    var stageGrade = VantageEngine.Scoring.getGrade(stageScore);

    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { className: 'vresults-screen animate-in' },
        e('div', { className: 'vresults-scenario' }, completedStage.name + ' — Complete'),
        e('div', { className: 'vresults-grade', style: { color: stageGrade.color } },
          e('span', { className: 'vresults-grade-letter' }, stageGrade.letter),
          e('span', { className: 'vresults-grade-label' }, stageGrade.label),
        ),
        e('div', { className: 'vresults-score' },
          e('span', { className: 'vresults-score-value' }, stageScore),
          e('span', { className: 'vresults-score-label' }, 'SCORE'),
        ),
        e('div', { className: 'vbench-progress-bar' },
          e('div', { className: 'vbench-progress-stages' },
            BConfig.STAGES.map(function(s, i) {
              var isDone = i <= stageIndex;
              var isCurrent = i === stageIndex;
              return e('div', {
                key: s.id,
                className: 'vbench-progress-dot ' + (isDone ? 'done' : '') + ' ' + (isCurrent ? 'current' : ''),
              },
                e('span', null, i + 1),
              );
            }),
          ),
          e('div', { className: 'vbench-progress-text' },
            (stageIndex + 1) + ' of ' + BConfig.STAGES.length + ' stages complete'
          ),
        ),
        e('div', { className: 'vresults-actions' },
          e(VantageUI.Button, {
            variant: 'primary',
            onClick: handleContinueToNextStage,
          }, 'CONTINUE'),
          e(VantageUI.Button, {
            variant: 'ghost',
            onClick: handleAbandonBenchmark,
          }, 'ABANDON'),
        ),
      ),
    );
  }

  // ─── RENDER: FINAL RESULT ──────────────────────────
  if (view === 'final-result' && lastResult) {
    var benchResult = lastResult.overallScore !== undefined ? lastResult : BConfig.buildBenchmarkResult(stageResults);
    var rank = BConfig.getRankForScore(benchResult.overallScore);
    var nextRank = BConfig.getNextRank(rank);
    var pointsToNext = BConfig.pointsToNextRank(benchResult.overallScore, rank);
    var isPB = summary && summary.best && benchResult.overallScore >= summary.best.overallScore;
    var prevBench = summary ? summary.previous : null;

    return e('div', { className: 'vpage-gameplay vpage-results-overlay', style: { alignItems: 'flex-start', overflowY: 'auto' } },
      e('div', { className: 'vbench-final animate-in', style: { maxWidth: '700px', width: '100%', margin: '0 auto', padding: '48px 24px' } },
        // Header
        e('div', { className: 'vbench-final-header' },
          e('div', { className: 'vbench-final-badge', style: { borderColor: rank.color, boxShadow: '0 0 20px ' + rank.color + '40' } },
            e('span', { className: 'vbench-final-rank-icon', style: { color: rank.color } }, rank.icon),
          ),
          e('div', { className: 'vbench-final-rank-name', style: { color: rank.color } }, rank.name.toUpperCase()),
          isPB && e('div', { className: 'vbench-final-pb' }, 'NEW PERSONAL BEST'),
        ),

        // Score
        e('div', { className: 'vbench-final-score' },
          e('span', { className: 'vbench-final-score-value' }, benchResult.overallScore),
          e('span', { className: 'vbench-final-score-max' }, ' / 1000'),
        ),

        // Next rank progress
        nextRank && pointsToNext !== null && e('div', { className: 'vbench-final-next' },
          e('span', null, 'Next rank: '),
          e('span', { style: { color: nextRank.color, fontWeight: 600 } }, nextRank.name),
          e('span', null, ' — ' + pointsToNext + ' points to go'),
        ),
        !nextRank && e('div', { className: 'vbench-final-next' },
          e('span', { style: { color: rank.color } }, 'MAXIMUM RANK ACHIEVED'),
        ),

        // Category breakdown
        e('div', { className: 'vbench-final-categories' },
          e('div', { className: 'vbench-final-section-title' }, 'CATEGORY BREAKDOWN'),
          BConfig.STAGES.map(function(stage) {
            var catScore = benchResult.categoryScores[stage.category] || 0;
            var prevCatScore = prevBench && prevBench.categoryScores ? (prevBench.categoryScores[stage.category] || 0) : null;
            var diff = prevCatScore !== null ? catScore - prevCatScore : null;
            return e('div', { key: stage.id, className: 'vbench-final-cat-row' },
              e('div', { className: 'vbench-final-cat-info' },
                e('span', { className: 'vbench-final-cat-name' }, stage.name),
                diff !== null && e('span', {
                  className: 'vbench-final-cat-diff ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'),
                }, diff > 0 ? '+' + diff : diff === 0 ? '0' : String(diff)),
              ),
              e('div', { className: 'vbench-final-cat-bar-wrap' },
                e('div', { className: 'vbench-final-cat-bar', style: { width: catScore + '%', background: rank.color } }),
              ),
              e('div', { className: 'vbench-final-cat-score' }, catScore + '/100'),
            );
          }),
        ),

        // Best & worst
        benchResult.bestCategory && e('div', { className: 'vbench-final-highlights' },
          e('div', { className: 'vbench-final-highlight' },
            e('span', { className: 'vbench-final-hl-label' }, 'Strongest'),
            e('span', { className: 'vbench-final-hl-value', style: { color: 'var(--success)' } }, benchResult.bestCategory.name),
          ),
          benchResult.worstCategory && e('div', { className: 'vbench-final-highlight' },
            e('span', { className: 'vbench-final-hl-label' }, 'Improve'),
            e('span', { className: 'vbench-final-hl-value', style: { color: 'var(--warning)' } }, benchResult.worstCategory.name),
          ),
        ),

        // Meta
        e('div', { className: 'vbench-final-meta' },
          e('span', null, formatDate(benchResult.timestamp)),
          benchResult.duration && e('span', null, ' · Duration: ' + formatDuration(benchResult.duration)),
          e('span', null, ' · Version ' + benchResult.benchmarkVersion),
        ),

        // Actions
        e('div', { className: 'vbench-final-actions' },
          e(VantageUI.Button, { variant: 'primary', onClick: handleRetake }, 'RETAKE BENCHMARK'),
          e(VantageUI.Button, { variant: 'secondary', onClick: function() { setView('history'); } }, 'VIEW HISTORY'),
          e(VantageUI.Button, { variant: 'accent', onClick: function() { handleShare(benchResult); } }, 'SHARE RESULTS'),
          e(VantageUI.Button, { variant: 'ghost', onClick: handleBuildTrainingPlan }, 'BUILD MY TRAINING PLAN'),
        ),
      ),
    );
  }

  // ─── RENDER: HISTORY DETAIL ────────────────────────
  if (view === 'detail' && selectedBenchmark) {
    var det = selectedBenchmark;
    var detRank = BConfig.getRankForScore(det.overallScore);
    return e('div', { className: 'vpage-dashboard' },
      e(VantageUI.PageHeader, {
        title: 'Benchmark Result',
        breadcrumb: e(React.Fragment, null,
          e('a', { href: '#', onClick: function(ev) { ev.preventDefault(); setView('history'); } }, 'History'),
          ' / Detail',
        ),
        action: e(VantageUI.Button, { variant: 'ghost', onClick: function() { setView('history'); } }, 'BACK'),
      }),
      e(VantageUI.Card, null,
        e('div', { className: 'vbench-detail-header' },
          e('div', { className: 'vbench-detail-rank', style: { color: detRank.color } },
            e('span', { style: { fontSize: '2rem' } }, detRank.icon),
            e('span', { style: { fontSize: '1.4rem', fontWeight: 700, marginLeft: '8px' } }, detRank.name),
          ),
          e('div', { className: 'vbench-detail-score' },
            e('span', { style: { fontSize: '2.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' } }, det.overallScore),
            e('span', { style: { color: 'var(--text-tertiary)', fontSize: '1rem' } }, ' / 1000'),
          ),
          e('div', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem' } },
            formatDate(det.timestamp),
            det.duration ? ' · ' + formatDuration(det.duration) : '',
            ' · v' + det.benchmarkVersion,
          ),
        ),
        e('div', { className: 'vbench-detail-categories' },
          BConfig.STAGES.map(function(stage) {
            var cs = det.categoryScores[stage.category] || 0;
            var sr = det.stageResults[stage.id];
            return e('div', { key: stage.id, className: 'vbench-detail-cat' },
              e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                e('span', { style: { fontWeight: 500 } }, stage.name),
                e('span', { style: { fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' } }, cs + '/100'),
              ),
              e(VantageUI.ProgressBar, { value: cs, max: 100, color: detRank.color }),
              sr && e('div', { style: { marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-tertiary)' } },
                'Exercise score: ' + sr.score + ' · Grade: ' + (sr.grade || '—'),
              ),
            );
          }),
        ),
      ),
    );
  }

  // ─── RENDER: COMPARE ──────────────────────────────
  if (view === 'compare' && compareA && compareB) {
    var rankA = BConfig.getRankForScore(compareA.overallScore);
    var rankB = BConfig.getRankForScore(compareB.overallScore);
    var scoreDiff = compareA.overallScore - compareB.overallScore;
    var sameVersion = compareA.scoringVersion === compareB.scoringVersion;

    return e('div', { className: 'vpage-dashboard' },
      e(VantageUI.PageHeader, {
        title: 'Compare Benchmarks',
        breadcrumb: e(React.Fragment, null,
          e('a', { href: '#', onClick: function(ev) { ev.preventDefault(); setView('history'); } }, 'History'),
          ' / Compare',
        ),
        action: e(VantageUI.Button, { variant: 'ghost', onClick: function() { setView('history'); setCompareMode(false); } }, 'BACK'),
      }),
      !sameVersion && e('div', { className: 'vbench-compare-warning vcard', style: { borderColor: 'var(--warning)', marginBottom: '16px' } },
        e('span', { style: { color: 'var(--warning)' } }, 'These benchmarks use different scoring versions (' + compareA.scoringVersion + ' vs ' + compareB.scoringVersion + '). Comparison may not be exact.'),
      ),
      e(VantageUI.Card, null,
        e('div', { className: 'vbench-compare-grid' },
          // Header row
          e('div', { className: 'vbench-compare-label' }),
          e('div', { className: 'vbench-compare-val', style: { color: rankA.color, fontWeight: 700 } }, rankA.name + ' — ' + compareA.overallScore),
          e('div', { className: 'vbench-compare-val', style: { color: rankB.color, fontWeight: 700 } }, rankB.name + ' — ' + compareB.overallScore),

          // Date
          e('div', { className: 'vbench-compare-label' }, 'Date'),
          e('div', { className: 'vbench-compare-val' }, formatDate(compareA.timestamp)),
          e('div', { className: 'vbench-compare-val' }, formatDate(compareB.timestamp)),

          // Overall
          e('div', { className: 'vbench-compare-label' }, 'Overall Score'),
          e('div', { className: 'vbench-compare-val ' + (scoreDiff > 0 ? 'vbench-up' : scoreDiff < 0 ? 'vbench-down' : '') }, compareA.overallScore),
          e('div', { className: 'vbench-compare-val' }, compareB.overallScore),

          // Categories
          BConfig.STAGES.map(function(stage) {
            var sa = compareA.categoryScores[stage.category] || 0;
            var sb = compareB.categoryScores[stage.category] || 0;
            var d = sa - sb;
            return e(React.Fragment, { key: stage.id },
              e('div', { className: 'vbench-compare-label' }, stage.name),
              e('div', { className: 'vbench-compare-val ' + (d > 0 ? 'vbench-up' : d < 0 ? 'vbench-down' : '') }, sa + '/100'),
              e('div', { className: 'vbench-compare-val' }, sb + '/100'),
            );
          }),

          // Duration
          e('div', { className: 'vbench-compare-label' }, 'Duration'),
          e('div', { className: 'vbench-compare-val' }, formatDuration(compareA.duration)),
          e('div', { className: 'vbench-compare-val' }, formatDuration(compareB.duration)),
        ),
      ),
    );
  }

  // ─── RENDER: HISTORY ──────────────────────────────
  if (view === 'history') {
    return e('div', { className: 'vpage-dashboard' },
      e(VantageUI.PageHeader, {
        title: 'Benchmark History',
        subtitle: history.length + ' completed benchmark' + (history.length !== 1 ? 's' : ''),
        action: e('div', { style: { display: 'flex', gap: '8px' } },
          compareMode
            ? e(VantageUI.Button, { variant: 'ghost', size: 'sm', onClick: handleToggleCompare }, 'CANCEL COMPARE')
            : e(VantageUI.Button, { variant: 'secondary', size: 'sm', onClick: handleToggleCompare, disabled: history.length < 2 }, 'COMPARE'),
          e(VantageUI.Button, { variant: 'ghost', size: 'sm', onClick: function() { setView('dashboard'); } }, 'BACK'),
        ),
      }),
      compareMode && e('div', { style: { color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' } },
        compareA && compareB ? 'Comparison ready.' :
        compareA ? 'Select a second benchmark to compare.' :
        'Select benchmarks to compare (click two entries).',
      ),
      history.length === 0
        ? e(VantageUI.EmptyState, {
            icon: '⬡',
            title: 'No benchmarks yet',
            description: 'Complete your first benchmark to see history here.',
            action: e(VantageUI.Button, { variant: 'primary', onClick: function() { setView('dashboard'); } }, 'GO TO BENCHMARK'),
          })
        : e('div', { className: 'vbench-history-list' },
            history.map(function(bench) {
              var br = BConfig.getRankForScore(bench.overallScore);
              var isBest = summary && summary.best && bench.id === summary.best.id;
              var isSelectedA = compareA && compareA.id === bench.id;
              var isSelectedB = compareB && compareB.id === bench.id;
              var compatible = !compareA || compareA.scoringVersion === bench.scoringVersion;

              return e('div', {
                key: bench.id,
                className: 'vbench-history-row vcard' + (isSelectedA ? ' vbench-selected-a' : '') + (isSelectedB ? ' vbench-selected-b' : ''),
                style: { cursor: compareMode && compatible ? 'pointer' : compareMode ? 'not-allowed' : 'pointer', opacity: compareMode && !compatible ? 0.4 : 1 },
                onClick: function() {
                  if (compareMode && compatible) {
                    handleSelectForCompare(bench);
                  } else if (!compareMode) {
                    handleViewDetail(bench);
                  }
                },
              },
                e('div', { className: 'vbench-history-row-inner' },
                  e('div', { className: 'vbench-history-rank', style: { color: br.color } },
                    e('span', { style: { fontSize: '1.3rem' } }, br.icon),
                  ),
                  e('div', { className: 'vbench-history-info' },
                    e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      e('span', { style: { fontWeight: 600, color: br.color } }, br.name),
                      isBest && e(VantageUI.Badge, { color: 'var(--accent-secondary)' }, 'PB'),
                      e('span', { style: { fontSize: '0.7rem', color: 'var(--text-tertiary)' } }, 'v' + bench.benchmarkVersion),
                    ),
                    e('div', { style: { fontSize: '0.78rem', color: 'var(--text-secondary)' } }, formatDate(bench.timestamp)),
                  ),
                  e('div', { className: 'vbench-history-score' },
                    e('span', { style: { fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 } }, bench.overallScore),
                    e('span', { style: { color: 'var(--text-tertiary)', fontSize: '0.8rem' } }, '/1000'),
                  ),
                  e('div', { className: 'vbench-history-cats' },
                    BConfig.STAGES.map(function(s) {
                      var cs = bench.categoryScores[s.category] || 0;
                      return e('div', { key: s.id, className: 'vbench-history-cat' },
                        e('span', { style: { fontSize: '0.65rem', color: 'var(--text-tertiary)' } }, s.name.substring(0, 5)),
                        e('span', { style: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem' } }, cs),
                      );
                    }),
                  ),
                ),
              );
            }),
          ),
    );
  }

  // ─── RENDER: PLAYING (handled by TrainingGameplay) ─
  if (view === 'playing') {
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { style: { textAlign: 'center', color: 'var(--text-secondary)' } },
        e('div', { style: { fontSize: '1.2rem', marginBottom: '8px' } }, 'Starting exercise...'),
        e('div', { style: { fontSize: '0.85rem' } }, 'The exercise will launch automatically.'),
      ),
    );
  }

  // ─── RENDER: DASHBOARD (default) ──────────────────
  if (loading) {
    return e('div', { className: 'vpage-dashboard' },
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' } },
        e('span', { style: { color: 'var(--text-secondary)' } }, 'Loading benchmark data...'),
      ),
    );
  }

  var latest = summary ? summary.latest : null;
  var best = summary ? summary.best : null;
  var previous = summary ? summary.previous : null;
  var currentRank = latest ? BConfig.getRankForScore(latest.overallScore) : BConfig.RANKS[0];
  var highestRank = best ? BConfig.getRankForScore(best.overallScore) : BConfig.RANKS[0];
  var nextRank = latest ? BConfig.getNextRank(currentRank) : null;
  var pointsToNext = latest ? BConfig.pointsToNextRank(latest.overallScore, currentRank) : null;
  var hasBenchmark = !!latest;

  // First-time state
  if (!hasBenchmark) {
    return e('div', { className: 'vpage-dashboard' },
      e(VantageUI.PageHeader, {
        title: 'Aim Benchmark',
        subtitle: 'Measure your aim with a standardized test',
      }),
      e('div', { className: 'vbench-hero animate-in' },
        e('div', { className: 'vbench-hero-icon' }, '⬡'),
        e('h2', { className: 'vbench-hero-title' }, 'TAKE YOUR FIRST BENCHMARK'),
        e('p', { className: 'vbench-hero-desc' },
          'Complete ' + BConfig.STAGES.length + ' standardized aim exercises to receive your VANTAGE aim rank. ' +
          'The test covers precision, tracking, reactive aim, and target switching. ' +
          'Total time: approximately ' + Math.ceil(BConfig.getTotalDuration() / 60) + ' minutes.'
        ),
        e('div', { className: 'vbench-stages-preview' },
          BConfig.STAGES.map(function(stage, i) {
            return e('div', { key: stage.id, className: 'vbench-stage-preview animate-in stagger-' + (i + 1) },
              e('div', { className: 'vbench-stage-num' }, i + 1),
              e('div', { className: 'vbench-stage-name' }, stage.name),
              e('div', { className: 'vbench-stage-desc' }, stage.description),
            );
          }),
        ),
        e(VantageUI.Button, {
          variant: 'primary', size: 'lg',
          onClick: handleStartBenchmark,
          className: 'vbench-start-btn',
        }, 'START BENCHMARK'),
        e('div', { className: 'vbench-rules' },
          e('div', { className: 'vbench-rules-title' }, 'HOW IT WORKS'),
          e('div', { className: 'vbench-rules-list' },
            e('div', null, 'All players receive the same exercises with identical settings.'),
            e('div', null, 'Each stage is scored 0-1000, then normalized to a 0-100 category score.'),
            e('div', null, 'Category scores are weighted to produce your overall score (0-1000).'),
            e('div', null, 'You must complete all stages to receive an official rank.'),
            e('div', null, 'Results are saved and can be compared over time.'),
          ),
        ),
      ),
    );
  }

  // Has benchmark — show dashboard
  var prevComparison = null;
  if (previous) {
    prevComparison = latest.overallScore - previous.overallScore;
  }

  return e('div', { className: 'vpage-dashboard' },
    e(VantageUI.PageHeader, {
      title: 'Aim Benchmark',
      subtitle: 'Your standardized aim performance',
      action: e('div', { style: { display: 'flex', gap: '8px' } },
        e(VantageUI.Button, { variant: 'primary', onClick: handleStartBenchmark }, 'RETAKE'),
        e(VantageUI.Button, { variant: 'secondary', onClick: function() { setView('history'); } }, 'HISTORY'),
      ),
    }),

    // Rank + Score card
    e('div', { className: 'vbench-dashboard-grid animate-in' },
      // Current rank card
      e(VantageUI.Card, { className: 'vbench-rank-card' },
        e('div', { className: 'vbench-rank-card-inner' },
          e('div', { className: 'vbench-rank-badge', style: { borderColor: currentRank.color, boxShadow: '0 0 24px ' + currentRank.color + '30' } },
            e('span', { style: { fontSize: '2.5rem', color: currentRank.color } }, currentRank.icon),
          ),
          e('div', { className: 'vbench-rank-label' }, 'CURRENT RANK'),
          e('div', { className: 'vbench-rank-name', style: { color: currentRank.color } }, currentRank.name.toUpperCase()),
          e('div', { className: 'vbench-rank-score' },
            e('span', { style: { fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-display)' } }, latest.overallScore),
            e('span', { style: { color: 'var(--text-tertiary)', fontSize: '0.9rem' } }, ' / 1000'),
          ),
          nextRank && pointsToNext !== null && e('div', { className: 'vbench-rank-next' },
            e(VantageUI.ProgressBar, {
              value: latest.overallScore - currentRank.min,
              max: currentRank.max - currentRank.min + 1,
              color: nextRank.color,
              label: 'Next: ' + nextRank.name + ' (+' + pointsToNext + ')',
            }),
          ),
          !nextRank && e('div', { className: 'vbench-rank-next', style: { color: currentRank.color } }, 'MAXIMUM RANK'),
          prevComparison !== null && e('div', {
            className: 'vbench-rank-change ' + (prevComparison > 0 ? 'up' : prevComparison < 0 ? 'down' : 'same'),
          },
            prevComparison > 0 ? '+' + prevComparison + ' from last benchmark' :
            prevComparison < 0 ? prevComparison + ' from last benchmark' :
            'No change from last benchmark',
          ),
        ),
      ),

      // Stats column
      e('div', { className: 'vbench-stats-col' },
        // Quick stats
        e('div', { className: 'vstats-grid', style: { marginBottom: '16px' } },
          e(VantageUI.StatCard, { label: 'Personal Best', value: best ? String(best.overallScore) : '—', icon: '△', color: 'var(--accent-secondary)' }),
          e(VantageUI.StatCard, { label: 'Highest Rank', value: highestRank.name, icon: '⬡', color: highestRank.color }),
          e(VantageUI.StatCard, { label: 'Total Attempts', value: String(summary ? summary.totalAttempts : 0), icon: '◎', color: 'var(--info)' }),
          e(VantageUI.StatCard, { label: 'Last Benchmark', value: latest ? formatDate(latest.timestamp) : '—', icon: '◇', color: 'var(--text-secondary)' }),
        ),

        // Category breakdown
        e(VantageUI.Card, null,
          e('div', { className: 'vbench-section-title' }, 'CATEGORY SCORES'),
          BConfig.STAGES.map(function(stage) {
            var cs = latest.categoryScores[stage.category] || 0;
            var prevCs = previous && previous.categoryScores ? (previous.categoryScores[stage.category] || 0) : null;
            var diff = prevCs !== null ? cs - prevCs : null;
            return e('div', { key: stage.id, className: 'vbench-cat-row' },
              e('div', { className: 'vbench-cat-label' },
                e('span', null, stage.name),
                diff !== null && e('span', {
                  className: 'vbench-cat-diff ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'),
                }, diff > 0 ? '+' + diff : String(diff)),
              ),
              e(VantageUI.ProgressBar, { value: cs, max: 100, color: currentRank.color, showValue: true }),
            );
          }),
        ),
      ),
    ),

    // Recent history
    history.length > 0 && e(VantageUI.Card, { className: 'animate-in stagger-3', style: { marginTop: '16px' } },
      e('div', { className: 'vdashboard-card-header' },
        e('h3', null, 'Recent Benchmarks'),
        e('button', { className: 'vlink-btn', onClick: function() { setView('history'); } }, 'View All →'),
      ),
      e('div', { className: 'vbench-history-list' },
        history.slice(0, 3).map(function(bench) {
          var br = BConfig.getRankForScore(bench.overallScore);
          var isBest = best && bench.id === best.id;
          return e('div', {
            key: bench.id,
            className: 'vbench-history-row',
            style: { cursor: 'pointer' },
            onClick: function() { handleViewDetail(bench); },
          },
            e('div', { className: 'vbench-history-row-inner' },
              e('div', { className: 'vbench-history-rank', style: { color: br.color } },
                e('span', { style: { fontSize: '1.3rem' } }, br.icon),
              ),
              e('div', { className: 'vbench-history-info' },
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  e('span', { style: { fontWeight: 600, color: br.color } }, br.name),
                  isBest && e(VantageUI.Badge, { color: 'var(--accent-secondary)' }, 'PB'),
                ),
                e('div', { style: { fontSize: '0.78rem', color: 'var(--text-secondary)' } }, formatDate(bench.timestamp)),
              ),
              e('div', { className: 'vbench-history-score' },
                e('span', { style: { fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 } }, bench.overallScore),
                e('span', { style: { color: 'var(--text-tertiary)', fontSize: '0.8rem' } }, '/1000'),
              ),
            ),
          );
        }),
      ),
    ),
  );
};
