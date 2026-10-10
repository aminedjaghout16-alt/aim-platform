/* ============================================
   Aim Benchmark — Configuration & Scoring
   Fixed, standardized benchmark for all players.
   Version: 1.0
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.BenchmarkConfig = {
  VERSION: '1.0',
  SCORING_VERSION: '1.0',

  // Rank definitions — centralized configuration
  RANKS: [
    { id: 'unranked',   name: 'Unranked',   min: null, max: null,  color: '#555a6e', icon: '—' },
    { id: 'iron',       name: 'Iron',       min: 0,    max: 199,   color: '#6b7280', icon: '⬡' },
    { id: 'bronze',     name: 'Bronze',     min: 200,  max: 349,   color: '#cd7f32', icon: '⬡' },
    { id: 'silver',     name: 'Silver',     min: 350,  max: 499,   color: '#c0c0c0', icon: '⬡' },
    { id: 'gold',       name: 'Gold',       min: 500,  max: 649,   color: '#ffb830', icon: '⬡' },
    { id: 'platinum',   name: 'Platinum',   min: 650,  max: 749,   color: '#00e0d0', icon: '⬡' },
    { id: 'diamond',    name: 'Diamond',    min: 750,  max: 849,   color: '#b388ff', icon: '⬡' },
    { id: 'ascendant',  name: 'Ascendant',  min: 850,  max: 924,   color: '#00e676', icon: '⬡' },
    { id: 'immortal',   name: 'Immortal',   min: 925,  max: 974,   color: '#ff3d5a', icon: '⬡' },
    { id: 'radiant',    name: 'Radiant',    min: 975,  max: 1000,  color: '#ffe066', icon: '⬡' },
  ],

  // Benchmark stages — fixed configuration for all players
  // Each stage uses an existing exercise with fixed settings.
  STAGES: [
    {
      id: 'precision',
      name: 'Precision & Flicking',
      category: 'precision',
      scenarioId: 'static-flicking',
      duration: 'standard', // 60s
      difficulty: 'medium',
      targetSize: 'medium',
      targetSpeed: 'normal',
      weight: 0.30,
      description: 'Eliminate targets that appear at random positions. Measures accurate target acquisition and clicking precision.',
    },
    {
      id: 'tracking',
      name: 'Tracking',
      category: 'tracking',
      scenarioId: 'strafe-tracking-3d',
      duration: 'standard', // 60s
      difficulty: 'medium',
      targetSize: 'medium',
      targetSpeed: 'normal',
      weight: 0.25,
      description: 'Track a continuously moving target and maintain aim. Measures smooth pursuit and tracking accuracy.',
    },
    {
      id: 'reactive',
      name: 'Reactive Aim',
      category: 'reactive',
      scenarioId: 'reactive-tracking-3d',
      duration: 'standard', // 60s
      difficulty: 'medium',
      targetSize: 'medium',
      targetSpeed: 'normal',
      weight: 0.20,
      description: 'React to sudden target movement changes. Measures reaction speed and adaptive tracking.',
    },
    {
      id: 'switching',
      name: 'Target Switching',
      category: 'switching',
      scenarioId: 'target-switching-3d',
      duration: 'standard', // 60s
      difficulty: 'medium',
      targetSize: 'medium',
      targetSpeed: 'normal',
      weight: 0.25,
      description: 'Quickly switch between multiple targets. Measures speed and accuracy of aim transitions.',
    },
  ],

  // Get rank for a given overall score (0-1000)
  getRankForScore(score) {
    if (score === null || score === undefined || isNaN(score)) {
      return this.RANKS[0]; // Unranked
    }
    var s = Math.max(0, Math.min(1000, Math.round(score)));
    for (var i = this.RANKS.length - 1; i >= 0; i--) {
      var r = this.RANKS[i];
      if (r.min === null) continue; // skip unranked
      if (s >= r.min && s <= r.max) return r;
    }
    return this.RANKS[0]; // fallback
  },

  // Get next rank above the current one
  getNextRank(currentRank) {
    var idx = this.RANKS.findIndex(function(r) { return r.id === currentRank.id; });
    if (idx < 0 || idx >= this.RANKS.length - 1) return null;
    return this.RANKS[idx + 1];
  },

  // Points needed to reach next rank
  pointsToNextRank(score, currentRank) {
    var next = this.getNextRank(currentRank);
    if (!next || next.min === null) return null;
    return Math.max(0, next.min - Math.round(score));
  },

  // Normalize a raw exercise score (0-1000) to a category score (0-100)
  // Uses a deterministic mapping based on the exercise's own scoring system.
  // The existing scoring functions already produce 0-1000 scores,
  // so we map them linearly: raw / 10 = category score (0-100).
  normalizeToCategory(rawScore) {
    if (!rawScore && rawScore !== 0) return 0;
    return Math.max(0, Math.min(100, Math.round(rawScore / 10)));
  },

  // Calculate the overall benchmark score (0-1000) from category scores
  calculateOverallScore(categoryScores) {
    var weightedSum = 0;
    var totalWeight = 0;
    var self = this;

    this.STAGES.forEach(function(stage) {
      var catScore = categoryScores[stage.category];
      if (catScore !== undefined && catScore !== null) {
        weightedSum += catScore * stage.weight;
        totalWeight += stage.weight;
      }
    });

    if (totalWeight === 0) return 0;

    // weightedSum is 0-100 (weighted average of category scores)
    // Normalize to 0-1000
    var normalized = weightedSum / totalWeight;
    return Math.max(0, Math.min(1000, Math.round(normalized * 10)));
  },

  // Calculate category scores from stage results
  calculateCategoryScores(stageResults) {
    var scores = {};
    var self = this;

    this.STAGES.forEach(function(stage) {
      var result = stageResults[stage.id];
      if (!result) {
        scores[stage.category] = 0;
        return;
      }
      // The result.score is already 0-1000 from the exercise's scoring function
      scores[stage.category] = self.normalizeToCategory(result.score);
    });

    return scores;
  },

  // Build a complete benchmark result from stage results
  buildBenchmarkResult(stageResults) {
    var categoryScores = this.calculateCategoryScores(stageResults);
    var overallScore = this.calculateOverallScore(categoryScores);
    var rank = this.getRankForScore(overallScore);

    // Find best and worst categories
    var bestCategory = null;
    var worstCategory = null;
    var bestScore = -1;
    var worstScore = 101;

    var self = this;
    this.STAGES.forEach(function(stage) {
      var s = categoryScores[stage.category];
      if (s !== undefined) {
        if (s > bestScore) { bestScore = s; bestCategory = stage; }
        if (s < worstScore) { worstScore = s; worstCategory = stage; }
      }
    });

    return {
      benchmarkVersion: this.VERSION,
      scoringVersion: this.SCORING_VERSION,
      overallScore: overallScore,
      rank: rank.id,
      rankName: rank.name,
      rankColor: rank.color,
      categoryScores: categoryScores,
      stageResults: stageResults,
      bestCategory: bestCategory ? { id: bestCategory.id, name: bestCategory.name, score: bestScore } : null,
      worstCategory: worstCategory ? { id: worstCategory.id, name: worstCategory.name, score: worstScore } : null,
      timestamp: new Date().toISOString(),
    };
  },

  // Check if all required stages are completed
  isBenchmarkComplete(stageResults) {
    var self = this;
    return this.STAGES.every(function(stage) {
      return stageResults[stage.id] && stageResults[stage.id].score !== undefined;
    });
  },

  // Get total estimated duration in seconds
  getTotalDuration() {
    var total = 0;
    var self = this;
    this.STAGES.forEach(function(stage) {
      var dur = VantageEngine.Settings.getDuration(stage.duration);
      if (dur) total += dur.seconds;
    });
    return total;
  },
};
