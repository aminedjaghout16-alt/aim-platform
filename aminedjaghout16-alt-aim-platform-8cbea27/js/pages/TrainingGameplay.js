/* ============================================
   Training Gameplay — Active training session
   Flow: ready → countdown (3·2·1·GO) → running ⇄ paused → finished (results)
   Pause = the mouse is released (ESC). The pause menu offers resume / restart /
   settings / quit; settings apply live (sensitivity, FOV, audio, crosshair) except
   target settings, which are staged and applied on restart.
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.TrainingGameplay = function TrainingGameplay({ scenarioId, config, onNavigate, onFinish, onSaveResult, activePlaylist, onPlaylistExerciseComplete }) {
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
  const [scoped, setScoped] = useState(false); // looking through a weapon scope (hides the crosshair)
  const [countdownNum, setCountdownNum] = useState(null); // 3,2,1,0(GO) or null
  const [lockError, setLockError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);

  const Audio = VantageEngine.Audio;
  const Prefs = VantageEngine.PlayerPrefs;

  // In-session menu state
  const [menuView, setMenuView] = useState('main'); // main | settings | confirm-restart | confirm-quit
  const [settingsTab, setSettingsTab] = useState('controls');
  const [prefs, setPrefs] = useState(() => Prefs.get());
  const [audioReady, setAudioReady] = useState(false);
  // The config actually in force for this session (sensitivity can change live; targets on restart)
  const [sessionConfig, setSessionConfig] = useState(() => ({ ...(config || {}) }));
  const [pending, setPending] = useState(null); // staged target settings (null → same as session)

  const scenario = VantageEngine.Scenarios.getById(scenarioId);
  const Settings = VantageEngine.Settings;
  const effectiveConfig = { ...Settings.DEFAULT_CONFIG, ...(scenario ? scenario.defaults : {}), ...sessionConfig };

  // Refs so long-lived listeners always see the latest values
  const cfgRef = useRef(sessionConfig); cfgRef.current = sessionConfig;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const viewRef = useRef(menuView); viewRef.current = menuView;
  const pausedAtRef = useRef(0);
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

    engine.onStateChange((state) => {
      if (state === 'paused') pausedAtRef.current = Date.now();
      setEngineState(state);
    });
    engine.onTick((data) => {
      var trackingLive = null;
      if (engine.renderer && engine.renderer.getLiveTrackingAccuracy) {
        trackingLive = {
          accuracy: engine.renderer.getLiveTrackingAccuracy(),
          bestStreak: engine.renderer._trackingStats
            ? Math.round(engine.renderer._trackingStats.bestStreakFrames / 60 * 10) / 10
            : null,
        };
      }
      setTickData({
        ...data,
        progression: engine.renderer && engine.renderer.getProgression ? engine.renderer.getProgression() : 0,
        trackingAccuracy: trackingLive ? trackingLive.accuracy : null,
        bestTrackingStreak: trackingLive ? trackingLive.bestStreak : null,
      });
    });
    engine.onCountdown((n) => {
      setCountdownNum(n);
      if (n > 0) Audio.playTick(); else Audio.playGo();
      if (n === 0) goTimer = setTimeout(() => setCountdownNum(null), 650);
    });
    engine.onFinish((res) => {
      Audio.playFinish();
      // For tracking mode: merge renderer tracking stats and recalculate score (no shooting)
      if (engine.renderer && engine.renderer.getTrackingStats) {
        var ts = engine.renderer.getTrackingStats();
        var trackingInput = {
          trackingAccuracy: ts.trackingAccuracy,
          bestTrackingStreak: ts.bestTrackingStreak,
          avgTrackingError: ts.avgTrackingError,
          duration: res.stats.duration || 1,
        };
        var trackScore = VantageEngine.Scoring.calculateTrackingScore(trackingInput);
        res.stats.trackingAccuracy = ts.trackingAccuracy;
        res.stats.timeOnTarget = ts.timeOnTarget;
        res.stats.avgTrackingError = ts.avgTrackingError;
        res.stats.bestTrackingStreak = ts.bestTrackingStreak;
        // No shooting in tracking mode — zero out hit/miss counts
        res.stats.hits = 0;
        res.stats.misses = 0;
        res.stats.totalTargets = 0;
        res.stats.accuracy = ts.trackingAccuracy;
        res.stats.avgReactionTime = 0;
        res.score = trackScore.total;
        res.grade = trackScore.grade.letter;
        res.isTrackingMode = true;
      }
      // For target switching mode: merge renderer switching stats and recalculate score
      if (engine.renderer && engine.renderer.getSwitchingStats) {
        var ss = engine.renderer.getSwitchingStats();
        var switchingInput = {
          hits: res.stats.hits || 0,
          misses: res.stats.misses || 0,
          avgSwitchTime: ss.avgSwitchTime,
          bestSwitchTime: ss.bestSwitchTime,
          targetsDestroyed: ss.targetsDestroyed,
          bestStreak: res.stats.bestStreak || 0,
          duration: res.stats.duration || 1,
        };
        var switchScore = VantageEngine.Scoring.calculateTargetSwitchingScore(switchingInput);
        res.stats.avgSwitchTime = ss.avgSwitchTime;
        res.stats.bestSwitchTime = ss.bestSwitchTime;
        res.stats.targetsDestroyed = ss.targetsDestroyed;
        res.stats.shotsFired = (res.stats.hits || 0) + (res.stats.misses || 0);
        res.score = switchScore.total;
        res.grade = switchScore.grade.letter;
        res.isTargetSwitchingMode = true;
      }
      // For reactive tracking mode: merge renderer tracking stats and recalculate score
      if (engine.renderer && engine.renderer.getReactiveTrackingStats) {
        var rts = engine.renderer.getReactiveTrackingStats();
        var reactiveInput = {
          hits: res.stats.hits || 0,
          misses: res.stats.misses || 0,
          avgTrackingTime: rts.avgTrackingTime,
          targetsDestroyed: rts.targetsDestroyed,
          bestStreak: res.stats.bestStreak || 0,
          duration: res.stats.duration || 1,
        };
        var reactiveScore = VantageEngine.Scoring.calculateReactiveTrackingScore(reactiveInput);
        res.stats.avgTrackingTime = rts.avgTrackingTime;
        res.stats.targetsDestroyed = rts.targetsDestroyed;
        res.stats.shotsFired = (res.stats.hits || 0) + (res.stats.misses || 0);
        res.score = reactiveScore.total;
        res.grade = reactiveScore.grade.letter;
        res.isReactiveTrackingMode = true;
      }
      // For bot strafe mode: merge renderer strafe stats and recalculate score
      if (engine.renderer && engine.renderer.getBotStrafeStats) {
        var bs = engine.renderer.getBotStrafeStats();
        var strafeInput = {
          hits: res.stats.hits || 0,
          misses: res.stats.misses || 0,
          avgHitTime: bs.avgHitTime,
          targetsDestroyed: bs.targetsDestroyed,
          bestStreak: res.stats.bestStreak || 0,
          duration: res.stats.duration || 1,
        };
        var strafeScore = VantageEngine.Scoring.calculateBotStrafeScore(strafeInput);
        res.stats.avgHitTime = bs.avgHitTime;
        res.stats.avgSurvivalTime = bs.avgSurvivalTime;
        res.stats.targetsDestroyed = bs.targetsDestroyed;
        res.stats.shotsFired = (res.stats.hits || 0) + (res.stats.misses || 0);
        res.score = strafeScore.total;
        res.grade = strafeScore.grade.letter;
        res.isBotStrafeMode = true;
      }
      // For adjustshot mode: merge renderer adjustshot stats and recalculate score
      if (engine.renderer && engine.renderer.getAdjustshotStats) {
        var adj = engine.renderer.getAdjustshotStats();
        var adjustshotInput = {
          hits: res.stats.hits || 0,
          misses: res.stats.misses || 0,
          avgReactionTime: adj.avgReactionTime,
          targetsKilled: adj.targetsKilled,
          headshots: adj.headshots,
          bodyKills: adj.bodyKills,
          shotsFired: adj.shotsFired,
          bestStreak: res.stats.bestStreak || 0,
          duration: res.stats.duration || 1,
        };
        var adjustshotScore = VantageEngine.Scoring.calculateAdjustshotScore(adjustshotInput);
        res.stats.avgReactionTime = adj.avgReactionTime;
        res.stats.targetsKilled = adj.targetsKilled;
        res.stats.headshots = adj.headshots;
        res.stats.bodyKills = adj.bodyKills;
        res.stats.shotsFired = adj.shotsFired;
        res.stats.accuracy = adj.accuracy;
        res.stats.headshotPercentage = adj.headshotPercentage;
        res.stats.killsPerSecond = adj.killsPerSecond;
        res.score = adjustshotScore.total;
        res.grade = adjustshotScore.grade.letter;
        res.isAdjustshotMode = true;
      }
      setResult(res);
      // Save the real result immediately so it is never lost
      Promise.resolve(saveRef.current ? saveRef.current(res) : null)
        .then((info) => {
          setSaveInfo(info || null);
          // If in playlist mode, notify the parent instead of showing results
          if (activePlaylist && onPlaylistExerciseComplete) {
            setTimeout(() => {
              onPlaylistExerciseComplete(res);
            }, 1500); // Brief delay to show the results screen
          }
        })
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
      if (!engine.load(scenarioId, cfgRef.current || {})) throw new Error('Scenario could not be loaded.');
      if (!engine.attachRenderer(canvasRef.current)) throw new Error('Renderer could not be created.');
      if (engine.renderer.setFov) engine.renderer.setFov(prefsRef.current.fov);
      if (engine.renderer.setTargetColor) engine.renderer.setTargetColor(prefsRef.current.targetColor);
      if (engine.renderer.setCallbacks) {
        engine.renderer.setCallbacks({
          onHit: (rt) => { engine.registerHit(rt); setHitMarker(Date.now()); Audio.playHit(); },
          onMiss: () => { engine.registerMiss(); Audio.playMiss(); },
          onScope: (isScoped) => setScoped(!!isScoped),
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

  // ---- Audio: unlock on the first gesture, apply the saved mix, run music while training ----
  const unlockAudio = useCallback(() => {
    Promise.resolve(Audio.unlock()).then(() => setAudioReady(Audio.isReady()));
  }, []);

  useEffect(() => {
    const p = prefsRef.current;
    Audio.setVolumes({ master: p.masterVolume, music: p.musicVolume, sfx: p.sfxVolume });
    unlockAudio(); // the click that opened this screen already counts as a user gesture in most browsers
    const onGesture = () => unlockAudio(); // fallback for stricter browsers: first click / key press
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      Audio.stopMusic();
    };
  }, []);

  useEffect(() => {
    if (!audioReady) return;
    if (engineState === 'finished') Audio.stopMusic();
    else Audio.startMusic();
  }, [engineState, audioReady]);

  // Every state change starts from the main menu view
  useEffect(() => { setMenuView('main'); }, [engineState]);

  const requestLock = useCallback(() => {
    unlockAudio();
    const eng = engineRef.current;
    if (eng && eng.renderer) eng.renderer.requestLock();
  }, []);

  // ---- Keyboard: ESC (back / resume), Enter / Space (start / resume), R · S · Q (pause shortcuts) ----
  useEffect(() => {
    const onKey = (ev) => {
      const eng = engineRef.current;
      if (!eng) return;
      const st = eng.state;
      const view = viewRef.current;
      const t = ev.target;
      const tag = t && t.tagName;
      const typing = tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && t.type !== 'range' && t.type !== 'color');

      if (ev.key === 'Escape') {
        if (st !== 'paused' && st !== 'ready') return;
        if (view !== 'main') { ev.preventDefault(); setMenuView('main'); return; }
        // Ignore the Esc keystroke that opened the pause menu (some browsers deliver it too)
        if (st === 'paused' && Date.now() - pausedAtRef.current > 350) {
          ev.preventDefault();
          requestLock();
        }
        return;
      }

      if (typing || view !== 'main' || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (st === 'ready' || st === 'paused') {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); requestLock(); return; }
      }
      if (st === 'paused') {
        const k = ev.key.toLowerCase();
        if (k === 'r') { ev.preventDefault(); setMenuView('confirm-restart'); }
        else if (k === 's') { ev.preventDefault(); setMenuView('settings'); }
        else if (k === 'q') { ev.preventDefault(); setMenuView('confirm-quit'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Live settings ----
  const persistConfig = (patch) => {
    try {
      const key = 'vantage.trainingConfig.' + scenarioId;
      const saved = JSON.parse(window.localStorage.getItem(key) || '{}') || {};
      window.localStorage.setItem(key, JSON.stringify({ ...saved, ...patch }));
    } catch (err) { /* storage unavailable */ }
  };

  const handleSensitivity = (value) => {
    const v = Math.round(value * 100) / 100;
    if (!(v > 0)) return;
    setSessionConfig(c => ({ ...c, sensitivity: v }));
    const eng = engineRef.current;
    if (eng) {
      eng.config.sensitivity = v; // results record the sensitivity actually used
      if (eng.renderer && eng.renderer.setSensitivity) eng.renderer.setSensitivity(v);
    }
    persistConfig({ sensitivity: v });
  };

  const handlePrefs = (patch) => {
    const next = Prefs.set(patch);
    setPrefs(next);
    if (patch.fov !== undefined) {
      const eng = engineRef.current;
      if (eng && eng.renderer && eng.renderer.setFov) eng.renderer.setFov(next.fov);
    }
    if (patch.targetColor !== undefined) {
      const eng = engineRef.current;
      if (eng && eng.renderer && eng.renderer.setTargetColor) eng.renderer.setTargetColor(next.targetColor);
    }
    if (patch.masterVolume !== undefined || patch.musicVolume !== undefined || patch.sfxVolume !== undefined) {
      Audio.setVolumes({ master: next.masterVolume, music: next.musicVolume, sfx: next.sfxVolume });
    }
  };

  const liveTargets = {
    targetSize: effectiveConfig.targetSize,
    targetSpeed: effectiveConfig.targetSpeed,
    difficulty: effectiveConfig.difficulty,
  };
  const stagedTargets = { ...liveTargets, ...(pending || {}) };
  const targetsDirty = Object.keys(liveTargets).some(k => stagedTargets[k] !== liveTargets[k]);

  const handleResetTab = () => {
    const D = Prefs.defaults();
    if (settingsTab === 'controls') {
      handlePrefs({ fov: D.fov });
      const g = Settings.getGame(effectiveConfig.game);
      if (g) handleSensitivity(g.defaultSensitivity);
    } else if (settingsTab === 'audio') {
      handlePrefs({ masterVolume: D.masterVolume, musicVolume: D.musicVolume, sfxVolume: D.sfxVolume });
    } else if (settingsTab === 'crosshair') {
      handlePrefs({ crosshair: D.crosshair });
    }
  };

  // ---- Session actions ----
  const handleQuit = () => {
    if (engineRef.current) engineRef.current.reset();
    onNavigate('training');
  };

  // Restart the run in place; staged target settings (if any) take effect now
  const handleRestart = () => {
    if (targetsDirty) {
      setSessionConfig(c => ({ ...c, ...stagedTargets }));
      persistConfig(stagedTargets);
    }
    setPending(null);
    setMenuView('main');
    setResult(null);
    setSaveInfo(null);
    setTickData(null);
    setEngineState('idle');
    setAttempt(a => a + 1);
  };

  const openSettings = () => { unlockAudio(); setMenuView('settings'); };

  const handleEndSession = () => {
    if (engineRef.current) engineRef.current.finish();
  };

  const handlePlayAgain = () => {
    // Reset everything in one batch so the canvas is mounted before the new session starts
    setResult(null);
    setSaveInfo(null);
    setTickData(null);
    setEngineState('idle');
    setPending(null);
    setAttempt(a => a + 1);
  };

  const handleViewHistory = () => { if (onFinish) onFinish(result); };

  // ---- Derived values ----
  const isTrackingMode = scenario && scenario.id === 'strafe-tracking-3d';
  const isTargetSwitchingMode = scenario && scenario.id === 'target-switching-3d';
  const isReactiveTrackingMode = scenario && scenario.id === 'reactive-tracking-3d';
  const isBotStrafeMode = scenario && scenario.id === 'bot-strafe-3d';
  const isAdjustshotMode = scenario && scenario.id === 'adjustshot-3d';
  const sd = tickData?.sessionData;
  const hits = isTrackingMode ? 0 : (sd?.hits || 0);
  const misses = isTrackingMode ? 0 : (sd?.misses || 0);
  const totalShots = hits + misses;
  const accuracy = isTrackingMode
    ? (tickData?.trackingAccuracy != null ? tickData.trackingAccuracy : null)
    : (totalShots > 0 ? Math.round((hits / totalShots) * 100) : null);
  const hitMarkerActive = !isTrackingMode && hitMarker && (Date.now() - hitMarker < 300);
  const avgReaction = isTrackingMode ? null : (hits > 0 && sd ? Math.round(sd.avgReactionTime) : null);
  // Live score uses the exact same formula as the results screen
  const liveScore = isTrackingMode
    ? (tickData?.trackingAccuracy != null
        ? VantageEngine.Scoring.calculateTrackingScore({
            trackingAccuracy: tickData.trackingAccuracy,
            bestTrackingStreak: 0,
            avgTrackingError: 0,
            duration: sd?.duration || 1,
          }).total
        : 0)
    : isTargetSwitchingMode
        ? (sd && totalShots > 0
            ? VantageEngine.Scoring.calculateTargetSwitchingScore({
                hits: hits,
                misses: misses,
                avgSwitchTime: sd.avgReactionTime || 0,
                bestSwitchTime: 0,
                targetsDestroyed: sd.hits || 0,
                bestStreak: sd.bestStreak || 0,
                duration: sd?.duration || 1,
              }).total
            : 0)
        : isReactiveTrackingMode
            ? (sd && totalShots > 0
                ? VantageEngine.Scoring.calculateReactiveTrackingScore({
                    hits: hits,
                    misses: misses,
                    avgTrackingTime: sd.avgReactionTime || 0,
                    targetsDestroyed: sd.hits || 0,
                    bestStreak: sd.bestStreak || 0,
                    duration: sd?.duration || 1,
                  }).total
                : 0)
            : isBotStrafeMode
                ? (sd && totalShots > 0
                    ? VantageEngine.Scoring.calculateBotStrafeScore({
                        hits: hits,
                        misses: misses,
                        avgHitTime: sd.avgReactionTime || 0,
                        targetsDestroyed: sd.hits || 0,
                        bestStreak: sd.bestStreak || 0,
                        duration: sd?.duration || 1,
                      }).total
                    : 0)
                : isAdjustshotMode
                    ? (sd && totalShots > 0
                        ? VantageEngine.Scoring.calculateAdjustshotScore({
                            hits: hits,
                            misses: misses,
                            shotsFired: totalShots,
                            avgReactionTime: sd.avgReactionTime || 0,
                            targetsKilled: sd.hits || 0,
                            headshots: sd.headshots || 0,
                            bodyKills: sd.bodyKills || 0,
                            bestStreak: sd.bestStreak || 0,
                            duration: sd?.duration || 1,
                          }).total
                        : 0)
                    : (sd && totalShots > 0
                        ? VantageEngine.Scoring.calculateScore({ ...sd, accuracy: hits / totalShots }).total
                        : 0);
  const progression = tickData?.progression || 0;

  const remainingSec = tickData && tickData.remaining !== null && tickData.remaining !== undefined
    ? Math.ceil(tickData.remaining / 1000) : null;
  const isLive = engineState === 'running' || engineState === 'paused';
  const totalMs = isEndless ? 0 : durationSetting.seconds * 1000;
  const remainingMs = isLive && tickData && tickData.remaining !== null && tickData.remaining !== undefined
    ? tickData.remaining : totalMs;
  const elapsedSec = isLive && tickData ? tickData.sessionData.duration : 0;

  const TM = VantageComponents;
  const timerText = isEndless ? TM.formatElapsed(elapsedSec) : TM.formatRemaining(remainingMs);
  const timerLow = !isEndless && remainingSec !== null && remainingSec <= 5 && engineState === 'running';
  const timeFraction = isEndless || totalMs === 0 ? null : 1 - remainingMs / totalMs;
  const diffSetting = Settings.getDifficulty(effectiveConfig.difficulty);

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
    var grade = VantageEngine.Scoring.getGrade(result.score) || {};
    var cfg = result.config || {};
    var diff = Settings.getDifficulty(cfg.difficulty);
    var size = Settings.getTargetSize(cfg.targetSize);
    var dur = Settings.getDuration(cfg.duration);
    var game = Settings.getGame(cfg.game);
    var isTracking = result.isTrackingMode || (scenario && scenario.id === 'strafe-tracking-3d');
    var isTargetSwitching = result.isTargetSwitchingMode || (scenario && scenario.id === 'target-switching-3d');
    // Resolve weapon name
    var weaponUsed = 'Classic';
    try {
      var _prefs = VantageEngine.PlayerPrefs.get();
      var _w = VantageEngine.Weapons.getById(_prefs.selectedWeapon || 'classic');
      if (_w) weaponUsed = _w.name;
    } catch (err) { /* keep default */ }

    if (isTargetSwitching) {
      // Target Switching results screen
      var tsShots = (result.stats.hits || 0) + (result.stats.misses || 0);
      var tsAccuracy = tsShots > 0 ? Math.round((result.stats.hits / tsShots) * 100) : 0;
      var tsAvgSwitch = result.stats.avgSwitchTime || 0;
      var tsBestSwitch = result.stats.bestSwitchTime || 0;
      var tsSummary = [
        dur && dur.label,
        weaponUsed,
      ].filter(Boolean).join(' · ');

      var tsSaveLine = 'Saving session…';
      var tsSaveClass = 'vresults-save';
      if (saveInfo) {
        if (saveInfo.previousBest === null) tsSaveLine = 'First session saved to your history';
        else if (saveInfo.isPersonalBest) { tsSaveLine = '★ NEW PERSONAL BEST'; tsSaveClass += ' vresults-save-pb'; }
        else tsSaveLine = 'Session saved · Personal best ' + saveInfo.previousBest;
      }

      return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
        e('div', { className: 'vresults-screen animate-in' },
          e('div', { className: 'vresults-scenario' }, 'TARGET SWITCHING — 3D — Complete'),
          e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
            e('span', { className: 'vresults-grade-letter' }, result.grade),
            e('span', { className: 'vresults-grade-label' }, grade.label || ''),
          ),
          e('div', { className: 'vresults-score' },
            e('span', { className: 'vresults-score-value' }, result.score),
            e('span', { className: 'vresults-score-label' }, 'SCORE'),
          ),
          e('div', { className: tsSaveClass }, tsSaveLine),
          e('div', { className: 'vresults-stats' },
            [
              [result.score, 'Score'],
              [tsAccuracy + '%', 'Accuracy'],
              [tsAvgSwitch > 0 ? tsAvgSwitch + 'ms' : '—', 'Avg Switch Time'],
              [tsBestSwitch > 0 ? tsBestSwitch + 'ms' : '—', 'Best Switch Time'],
              [result.stats.hits || 0, 'Hits'],
              [result.stats.misses || 0, 'Misses'],
              [tsShots, 'Shots Fired'],
              [result.stats.targetsDestroyed || 0, 'Targets Destroyed'],
              [result.stats.bestStreak || 0, 'Best Hit Streak'],
              [result.stats.duration + 's', 'Session Duration'],
              [weaponUsed, 'Weapon Used'],
            ].map(function (pair) {
              var value = pair[0], label = pair[1];
              return e('div', { key: label, className: 'vresults-stat' },
                e('span', { className: 'vresults-stat-value' }, value),
                e('span', { className: 'vresults-stat-label' }, label),
              );
            })
          ),
          tsSummary && e('div', { className: 'vresults-config' }, tsSummary),
          e('div', { className: 'vresults-actions' },
            e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('training'); } }, 'EXIT'),
            e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
            e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
          ),
        ),
      );
    }

    // Reactive Tracking results screen
    var isReactiveTracking = result.isReactiveTrackingMode || (scenario && scenario.id === 'reactive-tracking-3d');
    if (isReactiveTracking) {
      var rtShots = (result.stats.hits || 0) + (result.stats.misses || 0);
      var rtAccuracy = rtShots > 0 ? Math.round((result.stats.hits / rtShots) * 100) : 0;
      var rtAvgTracking = result.stats.avgTrackingTime || 0;
      var rtSummary = [
        dur && dur.label,
        weaponUsed,
      ].filter(Boolean).join(' · ');

      var rtSaveLine = 'Saving session…';
      var rtSaveClass = 'vresults-save';
      if (saveInfo) {
        if (saveInfo.previousBest === null) rtSaveLine = 'First session saved to your history';
        else if (saveInfo.isPersonalBest) { rtSaveLine = '★ NEW PERSONAL BEST'; rtSaveClass += ' vresults-save-pb'; }
        else rtSaveLine = 'Session saved · Personal best ' + saveInfo.previousBest;
      }

      return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
        e('div', { className: 'vresults-screen animate-in' },
          e('div', { className: 'vresults-scenario' }, 'REACTIVE TRACKING — 3D — Complete'),
          e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
            e('span', { className: 'vresults-grade-letter' }, result.grade),
            e('span', { className: 'vresults-grade-label' }, grade.label || ''),
          ),
          e('div', { className: 'vresults-score' },
            e('span', { className: 'vresults-score-value' }, result.score),
            e('span', { className: 'vresults-score-label' }, 'SCORE'),
          ),
          e('div', { className: rtSaveClass }, rtSaveLine),
          e('div', { className: 'vresults-stats' },
            [
              [result.score, 'Score'],
              [rtAccuracy + '%', 'Accuracy'],
              [rtAvgTracking > 0 ? rtAvgTracking + 'ms' : '—', 'Avg Tracking Time'],
              [result.stats.hits || 0, 'Hits'],
              [result.stats.misses || 0, 'Misses'],
              [rtShots, 'Shots Fired'],
              [result.stats.targetsDestroyed || 0, 'Targets Destroyed'],
              [result.stats.bestStreak || 0, 'Best Hit Streak'],
              [result.stats.duration + 's', 'Session Duration'],
              [weaponUsed, 'Weapon Used'],
            ].map(function (pair) {
              var value = pair[0], label = pair[1];
              return e('div', { key: label, className: 'vresults-stat' },
                e('span', { className: 'vresults-stat-value' }, value),
                e('span', { className: 'vresults-stat-label' }, label),
              );
            })
          ),
          rtSummary && e('div', { className: 'vresults-config' }, rtSummary),
          e('div', { className: 'vresults-actions' },
            e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('training'); } }, 'EXIT'),
            e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
            e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
          ),
        ),
      );
    }

    // Bot Strafe results screen
    var isBotStrafe = result.isBotStrafeMode || (scenario && scenario.id === 'bot-strafe-3d');
    if (isBotStrafe) {
      var bsShots = (result.stats.hits || 0) + (result.stats.misses || 0);
      var bsAccuracy = bsShots > 0 ? Math.round((result.stats.hits / bsShots) * 100) : 0;
      var bsAvgHitTime = result.stats.avgHitTime || 0;
      var bsSummary = [
        dur && dur.label,
        weaponUsed,
      ].filter(Boolean).join(' · ');

      var bsSaveLine = 'Saving session…';
      var bsSaveClass = 'vresults-save';
      if (saveInfo) {
        if (saveInfo.previousBest === null) bsSaveLine = 'First session saved to your history';
        else if (saveInfo.isPersonalBest) { bsSaveLine = '★ NEW PERSONAL BEST'; bsSaveClass += ' vresults-save-pb'; }
        else bsSaveLine = 'Session saved · Personal best ' + saveInfo.previousBest;
      }

      return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
        e('div', { className: 'vresults-screen animate-in' },
          e('div', { className: 'vresults-scenario' }, 'BOT STRAFE — 3D — Complete'),
          e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
            e('span', { className: 'vresults-grade-letter' }, result.grade),
            e('span', { className: 'vresults-grade-label' }, grade.label || ''),
          ),
          e('div', { className: 'vresults-score' },
            e('span', { className: 'vresults-score-value' }, result.score),
            e('span', { className: 'vresults-score-label' }, 'SCORE'),
          ),
          e('div', { className: bsSaveClass }, bsSaveLine),
          e('div', { className: 'vresults-stats' },
            [
              [result.score, 'Score'],
              [bsAccuracy + '%', 'Accuracy'],
              [bsAvgHitTime > 0 ? bsAvgHitTime + 'ms' : '—', 'Avg Hit Time'],
              [result.stats.hits || 0, 'Hits'],
              [result.stats.misses || 0, 'Misses'],
              [bsShots, 'Shots Fired'],
              [result.stats.targetsDestroyed || 0, 'Targets Destroyed'],
              [result.stats.bestStreak || 0, 'Best Hit Streak'],
              [result.stats.duration + 's', 'Session Duration'],
              [weaponUsed, 'Weapon Used'],
            ].map(function (pair) {
              var value = pair[0], label = pair[1];
              return e('div', { key: label, className: 'vresults-stat' },
                e('span', { className: 'vresults-stat-value' }, value),
                e('span', { className: 'vresults-stat-label' }, label),
              );
            })
          ),
          bsSummary && e('div', { className: 'vresults-config' }, bsSummary),
          e('div', { className: 'vresults-actions' },
            e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('training'); } }, 'EXIT'),
            e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
            e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
          ),
        ),
      );
    }

    // Adjustshot results screen
    var isAdjustshot = result.isAdjustshotMode || (scenario && scenario.id === 'adjustshot-3d');
    if (isAdjustshot) {
      var adjShots = result.stats.shotsFired || ((result.stats.hits || 0) + (result.stats.misses || 0));
      var adjAccuracy = result.stats.accuracy || (adjShots > 0 ? Math.round((result.stats.hits / adjShots) * 100) : 0);
      var adjAvgRT = result.stats.avgReactionTime || 0;
      var adjTargetsKilled = result.stats.targetsKilled || 0;
      var adjHeadshots = result.stats.headshots || 0;
      var adjBodyKills = result.stats.bodyKills || 0;
      var adjHeadshotPct = result.stats.headshotPercentage || (adjTargetsKilled > 0 ? Math.round((adjHeadshots / adjTargetsKilled) * 100) : 0);
      var adjKillsPerSec = result.stats.killsPerSecond || (result.stats.duration > 0 ? (adjTargetsKilled / result.stats.duration).toFixed(2) : 0);
      var adjSummary = [
        dur && dur.label,
        weaponUsed,
      ].filter(Boolean).join(' · ');

      var adjSaveLine = 'Saving session…';
      var adjSaveClass = 'vresults-save';
      if (saveInfo) {
        if (saveInfo.previousBest === null) adjSaveLine = 'First session saved to your history';
        else if (saveInfo.isPersonalBest) { adjSaveLine = '★ NEW PERSONAL BEST'; adjSaveClass += ' vresults-save-pb'; }
        else adjSaveLine = 'Session saved · Personal best ' + saveInfo.previousBest;
      }

      return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
        e('div', { className: 'vresults-screen animate-in' },
          e('div', { className: 'vresults-scenario' }, 'ADJUSTSHOT — 3D — Complete'),
          e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
            e('span', { className: 'vresults-grade-letter' }, result.grade),
            e('span', { className: 'vresults-grade-label' }, grade.label || ''),
          ),
          e('div', { className: 'vresults-score' },
            e('span', { className: 'vresults-score-value' }, result.score),
            e('span', { className: 'vresults-score-label' }, 'SCORE'),
          ),
          e('div', { className: adjSaveClass }, adjSaveLine),
          e('div', { className: 'vresults-stats' },
            [
              [result.score, 'Score'],
              [adjAccuracy + '%', 'Accuracy'],
              [adjAvgRT > 0 ? adjAvgRT + 'ms' : '—', 'Avg Reaction Time'],
              [adjTargetsKilled, 'Targets Killed'],
              [adjHeadshots, 'Headshots'],
              [adjBodyKills, 'Body Kills'],
              [adjHeadshotPct + '%', 'Headshot %'],
              [adjKillsPerSec, 'Kills/Second'],
              [result.stats.hits || 0, 'Hits'],
              [result.stats.misses || 0, 'Misses'],
              [adjShots, 'Shots Fired'],
              [result.stats.bestStreak || 0, 'Best Hit Streak'],
              [result.stats.duration + 's', 'Session Duration'],
              [weaponUsed, 'Weapon Used'],
            ].map(function (pair) {
              var value = pair[0], label = pair[1];
              return e('div', { key: label, className: 'vresults-stat' },
                e('span', { className: 'vresults-stat-value' }, value),
                e('span', { className: 'vresults-stat-label' }, label),
              );
            })
          ),
          adjSummary && e('div', { className: 'vresults-config' }, adjSummary),
          e('div', { className: 'vresults-actions' },
            e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('training'); } }, 'EXIT'),
            e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
            e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
          ),
        ),
      );
    }

    if (isTracking) {
      // Tracking-specific results screen (no shooting stats)
      var tSummary = [
        diff && diff.label,
        dur && dur.label,
        weaponUsed,
      ].filter(Boolean).join(' · ');

      var tSaveLine = 'Saving session…';
      var tSaveClass = 'vresults-save';
      if (saveInfo) {
        if (saveInfo.previousBest === null) tSaveLine = 'First session saved to your history';
        else if (saveInfo.isPersonalBest) { tSaveLine = '★ NEW PERSONAL BEST'; tSaveClass += ' vresults-save-pb'; }
        else tSaveLine = 'Session saved · Personal best ' + saveInfo.previousBest;
      }

      return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
        e('div', { className: 'vresults-screen animate-in' },
          e('div', { className: 'vresults-scenario' }, 'STRAFE TRACKING — 3D — Complete'),
          e('div', { className: 'vresults-grade', style: { color: grade.color || 'var(--accent-primary)' } },
            e('span', { className: 'vresults-grade-letter' }, result.grade),
            e('span', { className: 'vresults-grade-label' }, grade.label || ''),
          ),
          e('div', { className: 'vresults-score' },
            e('span', { className: 'vresults-score-value' }, result.score),
            e('span', { className: 'vresults-score-label' }, 'SCORE'),
          ),
          e('div', { className: tSaveClass }, tSaveLine),
          e('div', { className: 'vresults-stats' },
            [
              [result.score, 'Score'],
              [result.stats.trackingAccuracy + '%', 'Tracking Accuracy'],
              [result.stats.timeOnTarget + '%', 'Time On Target'],
              [result.stats.avgTrackingError + '°', 'Avg Tracking Error'],
              [result.stats.bestTrackingStreak + 's', 'Best Tracking Streak'],
              [result.stats.duration + 's', 'Duration'],
              [diff && diff.label || '—', 'Difficulty'],
              [weaponUsed, 'Weapon Used'],
            ].map(function (pair) {
              var value = pair[0], label = pair[1];
              return e('div', { key: label, className: 'vresults-stat' },
                e('span', { className: 'vresults-stat-value' }, value),
                e('span', { className: 'vresults-stat-label' }, label),
              );
            })
          ),
          tSummary && e('div', { className: 'vresults-config' }, tSummary),
          e('div', { className: 'vresults-actions' },
            e(VantageUI.Button, { variant: 'ghost', onClick: function () { onNavigate('training'); } }, 'EXIT'),
            e(VantageUI.Button, { variant: 'secondary', onClick: handleViewHistory }, 'VIEW HISTORY'),
            e(VantageUI.Button, { variant: 'primary', onClick: handlePlayAgain }, 'PLAY AGAIN'),
          ),
        ),
      );
    }

    // Standard (Static Flick) results screen
    var shots2 = result.stats.hits + result.stats.misses;
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
            [shots2, 'Shots'],
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
  const showCrosshair = (engineState === 'running' || engineState === 'countdown') && locked && !scoped;
  const showCountdown = countdownNum !== null && (engineState === 'countdown' || engineState === 'running');
  const cm360 = Math.round(Settings.getCm360(effectiveConfig.game, effectiveConfig.sensitivity, effectiveConfig.dpi));
  const gameInfo = Settings.getGame(effectiveConfig.game);
  const scenarioName = scenario ? scenario.name : 'Training';

  const renderSettings = () => e(TM.SettingsPanel, {
    tab: settingsTab,
    onTab: setSettingsTab,
    onBack: () => setMenuView('main'),
    onResetTab: handleResetTab,
    prefs,
    onPrefs: handlePrefs,
    sensitivity: Number(effectiveConfig.sensitivity),
    onSensitivity: handleSensitivity,
    cm360,
    gameName: gameInfo ? gameInfo.name : 'Game',
    dpi: effectiveConfig.dpi,
    pending: stagedTargets,
    live: liveTargets,
    onPending: (patch) => setPending(prev => ({ ...(prev || {}), ...patch })),
    canApply: targetsDirty,
    applyLabel: engineState === 'paused' ? 'Apply & Restart' : 'Apply',
    onApply: () => (engineState === 'paused' ? setMenuView('confirm-restart') : handleRestart()),
    onPreviewSound: () => Audio.playHit(),
  });

  return e('div', { className: 'vpage-gameplay' },
    // Canvas wrapper (the HUD floats on top of it so the arena uses the whole screen)
    e('div', { className: 'vgameplay-canvas-wrapper' },
      // Keyed per attempt: a restart needs a fresh canvas because the old WebGL context is released
      e('canvas', { key: 'arena-' + attempt, ref: canvasRef, className: 'vgameplay-canvas' }),

      // Minimal HUD
      e(TM.TrainingHud, {
        timerText,
        timerLabel: isEndless ? 'Elapsed' : 'Time',
        timerLow,
        timeFraction,
        score: liveScore,
        accuracy,
        hits,
        shots: totalShots,
        avgReaction,
        difficultyLabel: diffSetting ? diffSetting.label : 'Custom',
        progression,
        isTrackingMode: isTrackingMode,
        bestTrackingStreak: tickData?.bestTrackingStreak != null ? tickData.bestTrackingStreak : null,
      }),
      engineState === 'running' && e(TM.PauseHint),

      // Ready overlay: waiting for the player's click to capture the mouse
      engineState === 'ready' && menuView !== 'settings' && e('div', {
        className: 'vready-overlay',
        onMouseDown: requestLock,
      },
        e('div', { className: 'vready-card' },
          e('div', { className: 'vready-title' }, scenarioName),
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
              onClick: (ev) => { ev.stopPropagation(); openSettings(); },
            }, 'SETTINGS'),
            e(VantageUI.Button, {
              variant: 'ghost', size: 'sm',
              onClick: (ev) => { ev.stopPropagation(); handleQuit(); },
            }, '← BACK'),
          ),
        ),
      ),

      // Settings before the run starts
      engineState === 'ready' && menuView === 'settings' && e('div', { className: 'vtm-overlay' },
        renderSettings(),
      ),

      // Countdown overlay
      showCountdown && e('div', { className: 'vcountdown-overlay' },
        e('div', { key: countdownNum, className: 'vcountdown-number' }, countdownNum > 0 ? countdownNum : 'GO'),
      ),

      // Crosshair with hit marker
      showCrosshair && e('div', { className: 'vcrosshair-overlay' },
        e(TM.CrosshairView, { crosshair: prefs.crosshair, hit: !!hitMarkerActive }),
      ),

      // Pause overlay — the mouse is free here, so nothing in the arena can be shot or aimed
      engineState === 'paused' && e('div', { className: 'vtm-overlay' },
        menuView === 'main' && e(TM.PauseMenu, {
          scenarioName,
          isEndless,
          lockError,
          snapshot: { time: timerText, score: liveScore, accuracy, hits },
          onResume: requestLock,
          onRestart: () => setMenuView('confirm-restart'),
          onSettings: openSettings,
          onQuit: () => setMenuView('confirm-quit'),
          onEndSession: handleEndSession,
        }),
        menuView === 'settings' && renderSettings(),
        menuView === 'confirm-restart' && e(TM.ConfirmPanel, {
          title: 'Restart this run?',
          body: `Your current run${hits ? ` (${hits} hit${hits === 1 ? '' : 's'})` : ''} will be discarded and not saved.`
            + (targetsDirty ? ' Your new target settings will be applied.' : ''),
          confirmLabel: 'Restart',
          onConfirm: handleRestart,
          onCancel: () => setMenuView('main'),
        }),
        menuView === 'confirm-quit' && e(TM.ConfirmPanel, {
          title: 'Quit to Training Library?',
          body: `This run${hits ? ` (${hits} hit${hits === 1 ? '' : 's'})` : ''} is unfinished and will not be saved.`,
          confirmLabel: 'Quit',
          danger: true,
          onConfirm: handleQuit,
          onCancel: () => setMenuView('main'),
        }),
      ),
    ),
  );
};
