/* ============================================
   Training Gameplay — Active training session
   Flow: ready → countdown (3·2·1·GO) → running ⇄ paused → finished (results)
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingGameplay = function TrainingGameplay({ scenarioId, config, onNavigate, onFinish, onSaveResult }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const saveRef = useRef(onSaveResult);
  saveRef.current = onSaveResult;

  const [attempt, setAttempt] = useState(0);
  const [engineState, setEngineState] = useState('idle');
  const [tickData, setTickData] = useState(null);
  const [result, setResult] = useState(null);
  const [saveInfo, setSaveInfo] = useState(null);
  const [hitMarker, setHitMarker] = useState(0);
  const [countdownNum, setCountdownNum] = useState(null); // 3,2,1,0(GO) or null
  const [lockError, setLockError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);

  const scenario = VantageEngine.Scenarios.getById(scenarioId);
  const Settings = VantageEngine.Settings;
  const effectiveConfig = { ...Settings.DEFAULT_CONFIG, ...(scenario ? scenario.defaults : {}), ...(config || {}) };
  const durationSetting = Settings.getDuration(effectiveConfig.duration);
  const isEndless = !durationSetting || durationSetting.seconds === 0;

  // ---- Session lifecycle ----
  useEffect(() => {
    setError(null);
    setResult(null);
    setSaveInfo(null);
    setTickData(null);
    setCountdownNum(null);
    setLockError(false);
    setEngineState('idle');

    if (typeof THREE === 'undefined') {
      setError('The 3D engine could not be loaded. Check your internet connection and reload the page.');
      return;
    }
    if (!canvasRef.current) return;

    const engine = new VantageEngine.TrainingEngine();
    engineRef.current = engine;
    let goTimer = null;

    engine.onStateChange((state) => setEngineState(state));
    engine.onTick((data) => setTickData(data));
    engine.onCountdown((n) => {
      setCountdownNum(n);
      if (n === 0) goTimer = setTimeout(() => setCountdownNum(null), 650);
    });
    engine.onFinish((res) => {
      setResult(res);
      // Save the real result immediately so it is never lost
      Promise.resolve(saveRef.current ? saveRef.current(res) : null)
        .then((info) => setSaveInfo(info || null))
        .catch((err) => console.error('[Gameplay] Failed to save result', err));
    });

    // Mouse-lock state drives start / pause / resume
    const onLockChange = () => {
      const isLocked = !!document.pointerLockElement;
      setLocked(isLocked);
      if (isLocked) setLockError(false);
      if (isLocked && engine.state === 'ready') engine.start();
      else if (isLocked && engine.state === 'paused') engine.resume();
      else if (!isLocked && engine.state === 'running') engine.pause();
    };
    const onLockError = () => setLockError(true);

    try {
      if (!engine.load(scenarioId, config || {})) throw new Error('Scenario could not be loaded.');
      if (!engine.attachRenderer(canvasRef.current)) throw new Error('Renderer could not be created.');
      if (engine.renderer.setCallbacks) {
        engine.renderer.setCallbacks({
          onHit: (rt) => { engine.registerHit(rt); setHitMarker(Date.now()); },
          onMiss: () => engine.registerMiss(),
        });
      }
      engine.prepare(); // builds the arena → 'ready'
    } catch (err) {
      console.error('[Gameplay] Failed to start session', err);
      setError('Your browser could not start the 3D arena (WebGL may be disabled or unsupported).');
      engine.reset();
      return;
    }

    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);

    // Try to capture the mouse right away (works when the browser still honours the Start click)
    engine.renderer.requestLock();

    return () => {
      clearTimeout(goTimer);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      engine.reset();
    };
  }, [scenarioId, attempt]);

  // If the countdown finishes without a locked mouse, pause instead of burning the clock
  useEffect(() => {
    if (engineState === 'running' && !document.pointerLockElement && engineRef.current) {
      engineRef.current.pause();
    }
  }, [engineState]);

  // Enter / Space also start or resume (keypress counts as a user gesture)
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const eng = engineRef.current;
      if (eng && (eng.state === 'ready' || eng.state === 'paused') && eng.renderer) {
        ev.preventDefault();
        eng.renderer.requestLock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const requestLock = () => {
    const eng = engineRef.current;
    if (eng && eng.renderer) eng.renderer.requestLock();
  };

  const handleQuit = () => {
    if (engineRef.current) engineRef.current.reset();
    onNavigate('training');
  };

  const handleEndSession = () => {
    if (engineRef.current) engineRef.current.finish();
  };

  const handlePlayAgain = () => {
    // Reset everything in one batch so the canvas is mounted before the new session starts
    setResult(null);
    setSaveInfo(null);
    setTickData(null);
    setEngineState('idle');
    setAttempt(a => a + 1);
  };

  const handleViewHistory = () => { if (onFinish) onFinish(result); };

  // ---- Derived values ----
  const sd = tickData?.sessionData;
  const hits = sd?.hits || 0;
  const misses = sd?.misses || 0;
  const totalShots = hits + misses;
  const accuracy = totalShots > 0 ? Math.round((hits / totalShots) * 100) : 0;
  const hitMarkerActive = hitMarker && (Date.now() - hitMarker < 300);

  const remainingSec = tickData && tickData.remaining !== null && tickData.remaining !== undefined
    ? Math.ceil(tickData.remaining / 1000) : null;
  let timerText;
  if (engineState === 'running' || engineState === 'paused') {
    timerText = isEndless ? `${tickData ? tickData.sessionData.duration : 0}s` : `${remainingSec !== null ? remainingSec : durationSetting.seconds}s`;
  } else {
    timerText = isEndless ? '0s' : `${durationSetting.seconds}s`;
  }
  const timerLow = !isEndless && remainingSec !== null && remainingSec <= 5 && engineState === 'running';

  // ---- Error screen ----
  if (error) {
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e(VantageUI.EmptyState, {
        icon: '✕',
        title: 'Unable to start training',
        description: error,
        action: e('div', { className: 'vresults-actions' },
          e(VantageUI.Button, { variant: 'primary', onClick: () => window.location.reload() }, 'RELOAD'),
          e(VantageUI.Button, { variant: 'ghost', onClick: () => onNavigate('training') }, 'BACK TO LIBRARY'),
        ),
      }),
    );
  }

  // ---- Results screen ----
  if (engineState === 'finished' && result) {
    const grade = VantageEngine.Scoring.getGrade(result.score) || {};
    const cfg = result.config || {};
    const diff = Settings.getDifficulty(cfg.difficulty);
    const size = Settings.getTargetSize(cfg.targetSize);
    const dur = Settings.getDuration(cfg.duration);
    const game = Settings.getGame(cfg.game);
    const shots = result.stats.hits + result.stats.misses;
    const hitsPerSec = result.stats.duration > 0 ? (result.stats.hits / result.stats.duration).toFixed(2) : '0.00';
    const summary = [
      diff && diff.label,
      size && `${size.label} targets`,
      dur && dur.label,
      game && `${game.name} ${cfg.sensitivity}`,
    ].filter(Boolean).join(' · ');

    let saveLine = 'Saving session…';
    let saveClass = 'vresults-save';
    if (saveInfo) {
      if (saveInfo.previousBest === null) saveLine = 'First session saved to your history';
      else if (saveInfo.isPersonalBest) { saveLine = '★ NEW PERSONAL BEST'; saveClass += ' vresults-save-pb'; }
      else saveLine = `Session saved · Personal best ${saveInfo.previousBest}`;
    }

    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { className: 'vresults-screen animate-in' },
        e('div', { className: 'vresults-scenario' }, (scenario ? scenario.name : 'Training') + ' — Complete'),
        e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
          e('span', { className: 'vresults-grade-letter' }, result.grade),
          e('span', { className: 'vresults-grade-label' }, grade.label || ''),
        ),
        e('div', { className: 'vresults-score' },
          e('span', { className: 'vresults-score-value' }, result.score),
          e('span', { className: 'vresults-score-label' }, 'SCORE'),
        ),
        e('div', { className: saveClass }, saveLine),
        e('div', { className: 'vresults-stats' },
          [
            [result.stats.accuracy + '%', 'Accuracy'],
            [result.stats.hits > 0 ? result.stats.avgReactionTime + 'ms' : '—', 'Avg Reaction'],
            [result.stats.hits, 'Hits'],
            [result.stats.misses, 'Misses'],
            [shots, 'Shots'],
            [result.stats.bestStreak, 'Best Streak'],
            [hitsPerSec, 'Hits / sec'],
            [result.stats.duration + 's', 'Duration'],
          ].map(([value, label]) =>
            e('div', { key: label, className: 'vresults-stat' },
              e('span', { className: 'vresults-stat-value' }, value),
              e('span', { className: 'vresults-stat-label' }, label),
            )
          ),
        ),
        summary && e('div', { className: 'vresults-config' }, summary),
        e('div', { className: 'vresults-actions' },
          e(VantageUI.Button, { variant: 'ghost', onClick: () => onNavigate('training') }, 'EXIT'),
          e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
          e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
        ),
      ),
    );
  }

  // ---- Active gameplay ----
  const isLive = engineState === 'running' || engineState === 'paused';
  const showCrosshair = (engineState === 'running' || engineState === 'countdown') && locked;
  const showCountdown = countdownNum !== null && (engineState === 'countdown' || engineState === 'running');
  const cm360 = Math.round(Settings.getCm360(effectiveConfig.game, effectiveConfig.sensitivity, effectiveConfig.dpi));

  return e('div', { className: 'vpage-gameplay' },
    // HUD
    e('div', { className: 'vgameplay-hud' },
      e('div', { className: 'vhud-left' },
        e('div', { className: 'vhud-scenario' }, scenario ? scenario.name : 'Training'),
      ),
      e('div', { className: 'vhud-center' },
        e('div', { className: `vhud-timer ${timerLow ? 'vhud-timer-low' : ''}` }, timerText),
      ),
      e('div', { className: 'vhud-right' },
        e('div', { className: 'vhud-stats' },
          e('span', { className: 'vhud-stat' }, e('span', { className: 'text-accent' }, hits), ' hits'),
          e('span', { className: 'vhud-stat' }, e('span', { className: 'text-error' }, misses), ' miss'),
          e('span', { className: 'vhud-stat' }, e('span', { className: 'text-warning' }, accuracy + '%'), ' acc'),
          e('span', { className: 'vhud-stat' }, e('span', null, totalShots), ' shots'),
        ),
        e('div', { className: 'vhud-hint' },
          engineState === 'running' ? 'ESC — pause' : (engineState === 'paused' ? 'PAUSED' : '')),
      ),
    ),

    // Canvas wrapper
    e('div', { className: 'vgameplay-canvas-wrapper' },
      e('canvas', { ref: canvasRef, className: 'vgameplay-canvas' }),

      // Ready overlay: waiting for the player's click to capture the mouse
      engineState === 'ready' && e('div', {
        className: 'vready-overlay',
        onMouseDown: requestLock,
      },
        e('div', { className: 'vready-card' },
          e('div', { className: 'vready-title' }, scenario ? scenario.name : 'Training'),
          e('div', { className: 'vready-cta' }, 'CLICK TO START'),
          e('p', { className: 'vready-text' },
            'Your mouse will be captured for aiming. Press ESC at any time to pause.'),
          e('p', { className: 'vready-meta' },
            `${isEndless ? 'Endless' : durationSetting.label} · ${effectiveConfig.sensitivity} sens · ≈${cm360} cm/360°`),
          lockError && e('p', { className: 'vready-error' },
            'Your browser blocked mouse capture. Click again to retry.'),
          e('div', { className: 'vready-actions' },
            e(VantageUI.Button, {
              variant: 'ghost', size: 'sm',
              onClick: (ev) => { ev.stopPropagation(); handleQuit(); },
            }, '← BACK'),
          ),
        ),
      ),

      // Countdown overlay
      showCountdown && e('div', { className: 'vcountdown-overlay' },
        e('div', { key: countdownNum, className: 'vcountdown-number' }, countdownNum > 0 ? countdownNum : 'GO'),
      ),

      // Crosshair with hit marker
      showCrosshair && e('div', { className: 'vcrosshair-overlay' },
        e('div', { className: `vcrosshair ${hitMarkerActive ? 'vcrosshair-hit' : ''}` },
          e('div', { className: 'vcrosshair-dot' }),
          e('div', { className: 'vcrosshair-line vcrosshair-top' }),
          e('div', { className: 'vcrosshair-line vcrosshair-bottom' }),
          e('div', { className: 'vcrosshair-line vcrosshair-left' }),
          e('div', { className: 'vcrosshair-line vcrosshair-right' }),
          hitMarkerActive && e('div', { className: 'vhitmarker' },
            e('div', { className: 'vhitmarker-line vhitmarker-1' }),
            e('div', { className: 'vhitmarker-line vhitmarker-2' }),
          ),
        ),
      ),

      // Pause overlay (interactive)
      engineState === 'paused' && e('div', { className: 'vpause-overlay' },
        e('div', { className: 'vpause-text' }, 'PAUSED'),
        e('div', { className: 'vpause-hint' }, 'Click RESUME (or press Enter) to capture your mouse and continue'),
        lockError && e('div', { className: 'vready-error' }, 'Your browser blocked mouse capture. Click RESUME again.'),
        e('div', { className: 'vpause-actions' },
          e(VantageUI.Button, { variant: 'primary', onClick: requestLock }, 'RESUME'),
          isEndless && e(VantageUI.Button, { variant: 'secondary', onClick: handleEndSession }, 'END SESSION'),
          e(VantageUI.Button, { variant: 'danger', onClick: handleQuit }, 'QUIT'),
        ),
      ),
    ),
  );
};
