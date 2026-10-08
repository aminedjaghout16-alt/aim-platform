/* ============================================
   Training Engine — Core orchestrator
   Manages scenario lifecycle, timing, input, and scoring.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.TrainingEngine = class {
  constructor() {
    this.scenario = null;
    this.config = {};
    this.state = 'idle'; // idle | ready | countdown | running | paused | finished
    this.renderer = null;
    this.sessionData = this._emptySessionData();
    this._timer = null;
    this._startTime = 0;
    this._elapsed = 0;
    this._onStateChange = null;
    this._onTick = null;
    this._onFinish = null;
    this._onCountdown = null;
    this._countdownTimer = null;
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
  onCountdown(cb) { this._onCountdown = cb; }

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

  // Build the arena so it is visible before the countdown (state: ready)
  prepare() {
    if (this.state !== 'idle' || !this.renderer) return false;
    if (this.renderer.init) this.renderer.init();
    this._setState('ready');
    return true;
  }

  // Start the training session (3 · 2 · 1 · GO, then gameplay)
  start() {
    if (this.state !== 'idle' && this.state !== 'ready') return;

    // Initialize the renderer if prepare() wasn't called
    if (this.renderer && this.renderer.init) {
      this.renderer.init();
    }

    this._setState('countdown');
    let count = 3;
    if (this._onCountdown) this._onCountdown(count);
    this._countdownTimer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        if (this._onCountdown) this._onCountdown(0); // GO
        // Small delay after GO before starting gameplay
        setTimeout(() => this._beginSession(), 650);
      } else if (this._onCountdown) {
        this._onCountdown(count);
      }
    }, 900);
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
    if (this.state !== 'running' && this.state !== 'paused') return;
    clearInterval(this._timer);
    this.sessionData.duration = Math.round(this._elapsed / 1000);
    this._setState('finished');

    if (this.renderer && this.renderer.stop) this.renderer.stop();

    // Calculate final score
    const accuracy = this.sessionData.hits / Math.max(1, this.sessionData.hits + this.sessionData.misses);
    this.sessionData.score = VantageEngine.Scoring.calculateScore({
      ...this.sessionData,
      accuracy,
    });

    // Build result (userId is set by the app layer when saving to Firebase)
    const result = VantageEngine.Scoring.buildResult({
      scenarioId: this.scenario.id,
      config: this.config,
      sessionData: this.sessionData,
      userId: null,
    });

    if (this._onFinish) this._onFinish(result);
    return result;
  }

  // Reset engine
  reset() {
    clearInterval(this._timer);
    clearInterval(this._countdownTimer);
    this._countdownTimer = null;
    this._onStateChange = null;
    this._onTick = null;
    this._onFinish = null;
    this._onCountdown = null;
    if (this.renderer && this.renderer.stop) {
      this.renderer.stop();
    }
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
