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
      name: 'Static Flicking',
      shortName: 'Flick',
      category: 'flicking',
      description: 'Eliminate targets that appear at random positions. Focus on speed and precision flicks from your crosshair placement to each new target.',
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
      renderer: 'ThreeArenaRenderer',
      enabled: true,
    },
    {
      id: 'smooth-tracking',
      name: 'Smooth Tracking',
      shortName: 'Track',
      category: 'tracking',
      description: 'Keep your crosshair locked on a target moving in smooth, predictable patterns. Build the foundation for tracking moving enemies.',
      purpose: 'Train smooth pursuit eye movements and develop the ability to keep your crosshair on targets moving in predictable arcs. Critical for games with high TTK.',
      difficulty: 'medium',
      trainingType: 'smoothness',
      recommendedGame: 'apex',
      estimatedDuration: '90s',
      skillsTrained: ['Smooth tracking', 'Hand-eye coordination', 'Predictive aim', 'Consistency'],
      tags: ['tracking', 'smooth', 'intermediate', 'coordination'],
      defaults: {
        targetSize: 'large',
        targetSpeed: 'slow',
        duration: 'long',
        maxTargets: 1,
      },
      recommendedSettings: {
        sensitivity: 'Lower sensitivity helps with smoothness',
        targetSize: 'Start Large, progress to Medium',
        duration: '90s for endurance building',
      },
      renderer: 'GridShotRenderer',
      enabled: true,
    },
    {
      id: 'target-switching',
      name: 'Target Switching',
      shortName: 'Switch',
      category: 'target_switching',
      description: 'Rapidly switch your aim between multiple moving targets. Combines flick speed with tracking precision for dynamic scenarios.',
      purpose: 'Develop the ability to quickly acquire and track new targets after eliminating one. Simulates real combat where enemies appear from multiple angles.',
      difficulty: 'hard',
      trainingType: 'speed',
      recommendedGame: 'overwatch2',
      estimatedDuration: '60s',
      skillsTrained: ['Target acquisition', 'Switching speed', 'Reactive aim', 'Multi-target awareness'],
      tags: ['advanced', 'speed', 'switching', 'reactive'],
      defaults: {
        targetSize: 'medium',
        targetSpeed: 'fast',
        duration: 'standard',
        maxTargets: 3,
      },
      recommendedSettings: {
        sensitivity: 'Slightly higher sensitivity for faster switches',
        targetSize: 'Medium for balanced challenge',
        duration: '60s to maintain intensity',
      },
      renderer: 'GridShotRenderer',
      enabled: true,
    },
    {
      id: 'reaction-clicking',
      name: 'Reaction Clicking',
      shortName: 'React',
      category: 'click_timing',
      description: 'Click targets only when they enter a specific zone or state. Trains your reaction time and click precision under timing pressure.',
      purpose: 'Improve your reaction time and ability to click at the exact right moment. Essential for games where timing your shots matters more than raw speed.',
      difficulty: 'medium',
      trainingType: 'reaction',
      recommendedGame: 'cs2',
      estimatedDuration: '60s',
      skillsTrained: ['Reaction time', 'Click timing', 'Patience', 'Precision under pressure'],
      tags: ['timing', 'reaction', 'intermediate', 'precision'],
      defaults: {
        targetSize: 'small',
        targetSpeed: 'normal',
        duration: 'standard',
        maxTargets: 1,
      },
      recommendedSettings: {
        sensitivity: 'Use your precise in-game sensitivity',
        targetSize: 'Small to challenge precision',
        duration: '60s rounds for focus maintenance',
      },
      renderer: 'GridShotRenderer',
      enabled: true,
    },
    {
      id: 'micro-adjustments',
      name: 'Micro Adjustments',
      shortName: 'Micro',
      category: 'micro_adjustments',
      description: 'Make tiny, precise corrections to land on small targets. Develops fine motor control and stability for pixel-perfect aim.',
      purpose: 'Train the fine motor skills needed for tiny corrections when your crosshair is close but not quite on target. Critical for headshot-heavy games.',
      difficulty: 'hard',
      trainingType: 'precision',
      recommendedGame: 'cs2',
      estimatedDuration: '60s',
      skillsTrained: ['Fine motor control', 'Stability', 'Precision', 'Micro-corrections'],
      tags: ['advanced', 'precision', 'micro', 'headshot'],
      defaults: {
        targetSize: 'tiny',
        targetSpeed: 'slow',
        duration: 'standard',
        maxTargets: 1,
      },
      recommendedSettings: {
        sensitivity: 'Exact in-game sensitivity is crucial',
        targetSize: 'Tiny for maximum precision training',
        duration: '60s to maintain focus on small targets',
      },
      renderer: 'GridShotRenderer',
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
