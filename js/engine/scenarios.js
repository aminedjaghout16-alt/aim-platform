/* ============================================
   Scenario Definitions
   Each scenario defines its type, category, default settings,
   purpose, skills trained, and a reference to its renderer.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Scenarios = {
  REGISTRY: [
    {
      id: 'static-flicking',
      name: 'Static Flick — 3D',
      shortName: 'Flick',
      category: 'flicking',
      description: 'Eliminate targets that appear at random positions in a 3D arena. Focus on speed and precision flicks from your crosshair placement to each new target.',
      purpose: 'Develop raw flick accuracy by training your muscle memory to snap directly to targets without overshooting or undershooting. Essential for games where enemies hold angles.',
      difficulty: 'easy',
      trainingType: 'accuracy',
      recommendedGame: 'valorant',
      estimatedDuration: '60s',
      skillsTrained: ['Flick accuracy', 'Mouse control', 'Crosshair placement', 'Speed'],
      tags: ['beginner', 'warmup', 'flick', 'accuracy'],
      defaults: {
        targetSize: 'medium',
        targetSpeed: 'normal',
        duration: 'standard',
        maxTargets: 1,
      },
      recommendedSettings: {
        sensitivity: 'Use your in-game sensitivity',
        targetSize: 'Start with Medium, decrease as you improve',
        duration: '60s rounds for consistency tracking',
      },
      // Weapons usable in this mode. Single-shot (semi-auto) weapons only; the rest stay
      // locked in the Armory until another game mode unlocks them. Omit this list to allow all.
      allowedWeapons: ['classic', 'sheriff', 'ghost'],
      renderer: 'ThreeArenaRenderer',
      enabled: true,
    },
    {
      id: 'strafe-tracking-3d',
      name: 'Strafe Tracking — 3D',
      shortName: 'Track',
      category: 'tracking',
      description: 'Track a continuously moving target and maintain aim while it changes direction.',
      purpose: 'Develop smooth tracking accuracy by training your ability to keep the crosshair on a target that accelerates, decelerates, and reverses direction. Essential for games where enemies strafe during gunfights.',
      difficulty: 'medium',
      trainingType: 'tracking',
      recommendedGame: 'valorant',
      estimatedDuration: '60s',
      skillsTrained: ['Tracking accuracy', 'Smooth mouse control', 'Target reading', 'Consistency'],
      tags: ['tracking', 'strafe', 'movement', 'intermediate'],
      defaults: {
        targetSize: 'medium',
        targetSpeed: 'normal',
        duration: 'standard',
        maxTargets: 1,
      },
      recommendedSettings: {
        sensitivity: 'Use your in-game sensitivity',
        targetSize: 'Medium works well for most players',
        duration: '60s rounds for consistent measurement',
      },
      renderer: 'StrafeTrackingRenderer',
      enabled: true,
    },
    {
      id: 'target-switching-3d',
      name: 'Target Switching — 3D',
      shortName: 'Switch',
      category: 'target_switching',
      description: 'Quickly switch between targets while maintaining accuracy.',
      purpose: 'Develop fast and accurate target acquisition by training rapid aim transitions between multiple stationary targets at varying distances and positions. Essential for games where multiple enemies appear simultaneously.',
      difficulty: 'medium',
      trainingType: 'speed',
      recommendedGame: 'valorant',
      estimatedDuration: '60s',
      skillsTrained: ['Target switching', 'Flick accuracy', 'Speed', 'Consistency'],
      tags: ['target switching', 'multi-target', 'speed', 'accuracy'],
      defaults: {
        targetSize: 'medium',
        targetSpeed: 'normal',
        duration: 'standard',
        maxTargets: 5,
      },
      recommendedSettings: {
        sensitivity: 'Use your in-game sensitivity',
        targetSize: 'Medium works well for most players',
        duration: '60s rounds for consistency tracking',
      },
      allowedWeapons: ['classic'],
      renderer: 'TargetSwitchingRenderer',
      enabled: true,
    },
  ],

  getById(id) {
    return this.REGISTRY.find(s => s.id === id) || null;
  },

  getByCategory(categoryId) {
    return this.REGISTRY.filter(s => s.category === categoryId && s.enabled);
  },

  getAll() {
    return this.REGISTRY.filter(s => s.enabled);
  },

  getEnabled() {
    return this.REGISTRY.filter(s => s.enabled);
  },

  // Get unique training types
  getTrainingTypes() {
    const types = new Set(this.REGISTRY.filter(s => s.enabled).map(s => s.trainingType));
    return Array.from(types);
  },

  // Get unique recommended games
  getRecommendedGames() {
    const games = new Set(this.REGISTRY.filter(s => s.enabled).map(s => s.recommendedGame));
    return Array.from(games);
  },

  // Register a new scenario at runtime (for extensibility)
  register(scenario) {
    if (this.REGISTRY.find(s => s.id === scenario.id)) {
      console.warn(`[Scenarios] Scenario "${scenario.id}" already exists`);
      return;
    }
    this.REGISTRY.push({ ...scenario, enabled: true });
    console.log(`[Scenarios] Registered: ${scenario.id}`);
  },
};
