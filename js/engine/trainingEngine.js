/* ============================================
   Training Engine — Core orchestrator
   Manages scenario lifecycle, timing, input, and scoring.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.TrainingEngine = class {
  constructor() {
    this.scenario = null;
    this.config = {};
    this.state = 'idle'; // idle | countdown | running | paused | finished
    this.renderer = null;
    this.sessionData = this._emptySessionData();
    this._timer = null;
    this._startTime = 0;
    this._elapsed = 0;
    this._onStateChange = null;
    this._onTick = null;
    this._onFinish = null;
  }

  _emptySessionData() {
    return {
      hits: 0,
      misses: 0,
      totalTargets: 0,
      reactionTimes: [],
      avgReactionTime: 0,
      bestStreak: 0,
      currentStreak: 0,
      duration: 0,
      score: 0,
    };
  }

  // Load a scenario with user config overrides
  load(scenarioId, configOverrides = {}) {
    const scenario = VantageEngine.Scenarios.getById(scenarioId);
    if (!scenario) {
      console.error(`[Engine] Scenario not found: ${scenarioId}`);
      return false;
    }

    this.scenario = scenario;
    this.config = {
      ...VantageEngine.Settings.DEFAULT_CONFIG,
      ...scenario.defaults,
      ...configOverrides,
    };
    this.state = 'idle';
    this.sessionData = this._emptySessionData();
    this.renderer = null;

    console.log(`[Engine] Loaded scenario: ${scenario.name}`, this.config);
    return true;
  }

  // Set callbacks
  onStateChange(cb) { this._onStateChange = cb; }
  onTick(cb) { this._onTick = cb; }
  onFinish(cb) { this._onFinish = cb; }

  // Resolve and attach the renderer
  attachRenderer(canvasElement) {
    if (!this.scenario) return false;
    const RendererClass = VantageEngine.Renderers[this.scenario.renderer];
    if (!RendererClass) {
      console.error(`[Engine] Renderer not found: ${this.scenario.renderer}`);
      return false;
    }
    this.renderer = new RendererClass(canvasElement, this.scenario, this.config);
    return true;
  }

  // Start the training session
  start() {
    if (this.state !== 'idle') return;

    // Countdown
    this._setState('countdown');
    let count = 3;
    const countInterval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countInterval);
        this._beginSession();
      }
    }, 800);
  }

  _beginSession() {
    this._setState('running');
    this._startTime = Date.now();

    if (this.renderer && this.renderer.start) {
      this.renderer.start(this.sessionData);
    }

    const durationSetting = VantageEngine.Settings.getDuration(this.config.duration);
    const totalMs = durationSetting ? durationSetting.seconds * 1000 : 0;

    // Tick loop
    this._timer = setInterval(() => {
      this._elapsed = Date.now() - this._startTime;
      this.sessionData.duration = Math.floor(this._elapsed / 1000);

      if (this._onTick) {
        this._onTick({
          elapsed: this._elapsed,
          remaining: totalMs > 0 ? Math.max(0, totalMs - this._elapsed) : null,
          sessionData: { ...this.sessionData },
        });
      }

      // Check if time is up
      if (totalMs > 0 && this._elapsed >= totalMs) {
        this.finish();
      }
    }, 50);
  }

  // Register a hit
  registerHit(reactionTime) {
    if (this.state !== 'running') return;
    this.sessionData.hits++;
    this.sessionData.totalTargets++;
    this.sessionData.currentStreak++;
    this.sessionData.bestStreak = Math.max(this.sessionData.bestStreak, this.sessionData.currentStreak);
    if (reactionTime > 0) {
      this.sessionData.reactionTimes.push(reactionTime);
      this.sessionData.avgReactionTime =
        this.sessionData.reactionTimes.reduce((a, b) => a + b, 0) / this.sessionData.reactionTimes.length;
    }
  }

  // Register a miss
  registerMiss() {
    if (this.state !== 'running') return;
    this.sessionData.misses++;
    this.sessionData.totalTargets++;
    this.sessionData.currentStreak = 0;
  }

  // Pause
  pause() {
    if (this.state !== 'running') return;
    this._setState('paused');
    clearInterval(this._timer);
    if (this.renderer && this.renderer.pause) this.renderer.pause();
  }

  // Resume
  resume() {
    if (this.state !== 'paused') return;
    this._setState('running');
    const pausedDuration = Date.now() - this._startTime - this._elapsed;
    this._startTime += pausedDuration;
    this._timer = setInterval(() => {
      this._elapsed = Date.now() - this._startTime;
      this.sessionData.duration = Math.floor(this._elapsed / 1000);
      if (this._onTick) {
        const durationSetting = VantageEngine.Settings.getDuration(this.config.duration);
        const totalMs = durationSetting ? durationSetting.seconds * 1000 : 0;
        this._onTick({
          elapsed: this._elapsed,
          remaining: totalMs > 0 ? Math.max(0, totalMs - this._elapsed) : null,
          sessionData: { ...this.sessionData },
        });
      }
      const durationSetting = VantageEngine.Settings.getDuration(this.config.duration);
      const totalMs = durationSetting ? durationSetting.seconds * 1000 : 0;
      if (totalMs > 0 && this._elapsed >= totalMs) this.finish();
    }, 50);
    if (this.renderer && this.renderer.resume) this.renderer.resume();
  }

  // Finish the session
  finish() {
    if (this.state === 'finished' || this.state === 'idle') return;
    clearInterval(this._timer);
    this._setState('finished');

    if (this.renderer && this.renderer.stop) this.renderer.stop();

    // Calculate final score
    const accuracy = this.sessionData.hits / Math.max(1, this.sessionData.hits + this.sessionData.misses);
    this.sessionData.score = VantageEngine.Scoring.calculateScore({
      ...this.sessionData,
      accuracy,
    });

    // Build result
    const result = VantageEngine.Scoring.buildResult({
      scenarioId: this.scenario.id,
      config: this.config,
      sessionData: this.sessionData,
      userId: 'dev-user-001',
    });

    if (this._onFinish) this._onFinish(result);
    return result;
  }

  // Reset engine
  reset() {
    clearInterval(this._timer);
    this.scenario = null;
    this.config = {};
    this.state = 'idle';
    this.renderer = null;
    this.sessionData = this._emptySessionData();
    this._elapsed = 0;
  }

  _setState(newState) {
    this.state = newState;
    if (this._onStateChange) this._onStateChange(newState);
  }
};
