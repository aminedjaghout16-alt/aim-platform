/* ============================================
   Training Gameplay — Active training session
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingGameplay = function TrainingGameplay({ scenarioId, config, onNavigate, onFinish }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [engineState, setEngineState] = useState('idle');
  const [tickData, setTickData] = useState(null);
  const [result, setResult] = useState(null);
  const [pointerLocked, setPointerLocked] = useState(false);

  useEffect(() => {
    const onPLChange = () => {
      setPointerLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', onPLChange);
    return () => document.removeEventListener('pointerlockchange', onPLChange);
  }, []);

  useEffect(() => {
    const engine = new VantageEngine.TrainingEngine();
    engineRef.current = engine;

    engine.onStateChange((state) => {
      setEngineState(state);
    });

    engine.onTick((data) => {
      setTickData(data);
    });

    engine.onFinish((res) => {
      setResult(res);
    });

    const loaded = engine.load(scenarioId, config);
    if (loaded && canvasRef.current) {
      engine.attachRenderer(canvasRef.current);
      if (engine.renderer && engine.renderer.setCallbacks) {
        engine.renderer.setCallbacks({
          onHit: (rt) => engine.registerHit(rt),
          onMiss: () => engine.registerMiss(),
        });
      }
      engine.start();
    }

    return () => { engine.reset(); };
  }, [scenarioId]);

  const handlePause = () => {
    if (engineState === 'running') engineRef.current.pause();
    else if (engineState === 'paused') engineRef.current.resume();
  };

  const handleQuit = () => {
    if (engineRef.current) engineRef.current.reset();
    onNavigate('training');
  };

  const handleContinue = () => {
    if (result) onFinish(result);
  };

  // Compute live accuracy
  const sd = tickData?.sessionData;
  const totalShots = (sd?.hits || 0) + (sd?.misses || 0);
  const accuracy = totalShots > 0 ? Math.round(((sd?.hits || 0) / totalShots) * 100) : 0;

  // Results screen
  if (engineState === 'finished' && result) {
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { className: 'vresults-screen animate-in' },
        e('div', { className: 'vresults-grade', style: { color: result.grade.color || 'var(--accent-primary)' } },
          e('span', { className: 'vresults-grade-letter' }, result.grade),
          e('span', { className: 'vresults-grade-label' },
            VantageEngine.Scoring.getGrade(result.score)?.label || ''),
        ),
        e('div', { className: 'vresults-score' },
          e('span', { className: 'vresults-score-value' }, result.score),
          e('span', { className: 'vresults-score-label' }, 'SCORE'),
        ),
        e('div', { className: 'vresults-stats' },
          e('div', { className: 'vresults-stat' },
            e('span', { className: 'vresults-stat-value' }, result.stats.accuracy + '%'),
            e('span', { className: 'vresults-stat-label' }, 'Accuracy'),
          ),
          e('div', { className: 'vresults-stat' },
            e('span', { className: 'vresults-stat-value' }, result.stats.avgReactionTime + 'ms'),
            e('span', { className: 'vresults-stat-label' }, 'Avg Reaction'),
          ),
          e('div', { className: 'vresults-stat' },
            e('span', { className: 'vresults-stat-value' }, result.stats.hits),
            e('span', { className: 'vresults-stat-label' }, 'Hits'),
          ),
          e('div', { className: 'vresults-stat' },
            e('span', { className: 'vresults-stat-value' }, result.stats.bestStreak),
            e('span', { className: 'vresults-stat-label' }, 'Best Streak'),
          ),
        ),
        e('div', { className: 'vresults-actions' },
          e(VantageUI.Button, { variant: 'ghost', onClick: handleQuit }, 'EXIT'),
          e(VantageUI.Button, { variant: 'primary', onClick: handleContinue }, 'SAVE & CONTINUE'),
        ),
      ),
    );
  }

  // Active gameplay
  return e('div', { className: 'vpage-gameplay' },
    // HUD overlay
    e('div', { className: 'vgameplay-hud' },
      e('div', { className: 'vhud-left' },
        e('div', { className: 'vhud-scenario' },
          VantageEngine.Scenarios.getById(scenarioId)?.name || 'Training',
        ),
      ),
      e('div', { className: 'vhud-center' },
        // Countdown
        engineState === 'countdown' && e('div', { className: 'vhud-countdown' }, 'GET READY'),
        // Timer
        engineState === 'running' && tickData && e('div', { className: 'vhud-timer' },
          tickData.remaining !== null
            ? `${Math.ceil(tickData.remaining / 1000)}s`
            : `${tickData.sessionData.duration}s`,
        ),
        // Paused
        engineState === 'paused' && e('div', { className: 'vhud-paused' }, 'PAUSED'),
      ),
      e('div', { className: 'vhud-right' },
        e('div', { className: 'vhud-stats' },
          e('span', { className: 'vhud-stat' },
            e('span', { className: 'text-accent' }, sd?.hits || 0), ' hits'),
          e('span', { className: 'vhud-stat' },
            e('span', { className: 'text-error' }, sd?.misses || 0), ' miss'),
          e('span', { className: 'vhud-stat' },
            e('span', { className: 'text-warning' }, accuracy + '%'), ' acc'),
          e('span', { className: 'vhud-stat' },
            e('span', {}, totalShots), ' shots'),
        ),
        e('div', { className: 'vhud-controls' },
          (engineState === 'running' || engineState === 'paused') &&
            e(VantageUI.Button, { variant: 'ghost', size: 'sm', onClick: handlePause },
              engineState === 'paused' ? 'RESUME' : 'PAUSE'),
          e(VantageUI.Button, { variant: 'danger', size: 'sm', onClick: handleQuit }, 'QUIT'),
        ),
      ),
    ),

    // Canvas wrapper with crosshair
    e('div', { className: 'vgameplay-canvas-wrapper' },
      e('canvas', { ref: canvasRef, className: 'vgameplay-canvas' }),
      // Crosshair overlay
      engineState === 'running' && pointerLocked && e('div', { className: 'vcrosshair-overlay' },
        e('div', { className: 'vcrosshair' },
          e('div', { className: 'vcrosshair-dot' }),
          e('div', { className: 'vcrosshair-line vcrosshair-top' }),
          e('div', { className: 'vcrosshair-line vcrosshair-bottom' }),
          e('div', { className: 'vcrosshair-line vcrosshair-left' }),
          e('div', { className: 'vcrosshair-line vcrosshair-right' }),
        ),
      ),
      // Click-to-start prompt
      engineState === 'running' && !pointerLocked && e('div', { className: 'vclick-prompt' },
        e('span', null, 'CLICK TO AIM'),
      ),
    ),
  );
};
