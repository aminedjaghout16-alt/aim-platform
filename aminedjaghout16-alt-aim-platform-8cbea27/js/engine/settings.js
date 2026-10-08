/* ============================================
   Training Settings — Difficulty, Duration, etc.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Settings = {
  // Difficulty presets
  DIFFICULTY: {
    EASY: { id: 'easy', label: 'Easy', multiplier: 0.7, description: 'Large targets, slow speed' },
    MEDIUM: { id: 'medium', label: 'Medium', multiplier: 1.0, description: 'Standard targets and speed' },
    HARD: { id: 'hard', label: 'Hard', multiplier: 1.4, description: 'Small targets, fast speed' },
    EXTREME: { id: 'extreme', label: 'Extreme', multiplier: 2.0, description: 'Minimal targets, maximum speed' },
  },

  // Duration presets (in seconds)
  DURATION: {
    SHORT: { id: 'short', label: '30s', seconds: 30 },
    STANDARD: { id: 'standard', label: '60s', seconds: 60 },
    LONG: { id: 'long', label: '90s', seconds: 90 },
    ENDLESS: { id: 'endless', label: 'Endless', seconds: 0 },
  },

  // Target size presets (in px)
  TARGET_SIZE: {
    LARGE: { id: 'large', label: 'Large', px: 52 },
    MEDIUM: { id: 'medium', label: 'Medium', px: 36 },
    SMALL: { id: 'small', label: 'Small', px: 22 },
    TINY: { id: 'tiny', label: 'Tiny', px: 14 },
  },

  // Target speed presets (multiplier)
  TARGET_SPEED: {
    SLOW: { id: 'slow', label: 'Slow', multiplier: 0.5 },
    NORMAL: { id: 'normal', label: 'Normal', multiplier: 1.0 },
    FAST: { id: 'fast', label: 'Fast', multiplier: 1.8 },
    INSTANT: { id: 'instant', label: 'Instant', multiplier: 3.0 },
  },

  // Supported games
  GAMES: [
    { id: 'valorant', name: 'Valorant', defaultSensitivity: 0.35, defaultDPI: 800, yaw: 0.07 },
    { id: 'cs2', name: 'Counter-Strike 2', defaultSensitivity: 2.0, defaultDPI: 800, yaw: 0.022 },
    { id: 'overwatch2', name: 'Overwatch 2', defaultSensitivity: 5.0, defaultDPI: 800, yaw: 0.0066 },
    { id: 'apex', name: 'Apex Legends', defaultSensitivity: 2.5, defaultDPI: 800, yaw: 0.022 },
    { id: 'fortnite', name: 'Fortnite', defaultSensitivity: 7.0, defaultDPI: 800, yaw: 0.005555 },
    { id: 'generic', name: 'Generic FPS', defaultSensitivity: 1.0, defaultDPI: 800, yaw: 0.022 },
  ],

  // Default training configuration
  DEFAULT_CONFIG: {
    difficulty: 'medium',
    duration: 'standard',
    targetSize: 'medium',
    targetSpeed: 'normal',
    game: 'valorant',
    sensitivity: 0.35,
    dpi: 800,
  },

  getDifficulty(id) { return Object.values(this.DIFFICULTY).find(d => d.id === id); },
  getDuration(id) { return Object.values(this.DURATION).find(d => d.id === id); },
  getTargetSize(id) { return Object.values(this.TARGET_SIZE).find(d => d.id === id); },
  getTargetSpeed(id) { return Object.values(this.TARGET_SPEED).find(d => d.id === id); },
  getGame(id) { return this.GAMES.find(g => g.id === id); },

  // Physical mouse distance for a full 360° turn, in cm
  getCm360(gameId, sensitivity, dpi) {
    const g = this.getGame(gameId) || this.getGame('generic');
    const degPerCount = (Number(sensitivity) || 0) * (g.yaw || 0.022);
    if (!degPerCount || !dpi) return 0;
    return (360 / degPerCount) / dpi * 2.54;
  },

  getAllDifficulties() { return Object.values(this.DIFFICULTY); },
  getAllDurations() { return Object.values(this.DURATION); },
  getAllTargetSizes() { return Object.values(this.TARGET_SIZE); },
  getAllTargetSpeeds() { return Object.values(this.TARGET_SPEED); },
  getAllGames() { return this.GAMES; },
};
