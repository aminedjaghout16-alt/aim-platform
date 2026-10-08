/* ============================================
   Scoring & Statistics Structure
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Scoring = {
  // Calculate score for a training session
  calculateScore(sessionData) {
    const { hits = 0, misses = 0, avgReactionTime = 0, duration = 0 } = sessionData;
    // Accuracy may be passed in; otherwise derive it from hits / misses
    const accuracy = sessionData.accuracy !== undefined
      ? sessionData.accuracy
      : hits / Math.max(1, hits + misses);

    // Base score from accuracy (0-500)
    const accuracyScore = accuracy * 500;

    // Speed bonus from avg reaction time (0-300)
    const speedScore = avgReactionTime > 0
      ? Math.max(0, Math.min(300, 300 - (avgReactionTime - 150) * 0.5))
      : 0;

    // Pace bonus (0-200): sustained hits per second, weighted by accuracy
    const hitsPerSec = hits / Math.max(1, duration);
    const consistencyScore = Math.min(200, hitsPerSec * 200 * accuracy);

    // Volume factor: a handful of lucky hits must not earn a top grade
    const expectedHits = Math.max(5, duration * 0.4);
    const volume = Math.min(1, hits / expectedHits);

    const total = Math.round((accuracyScore + speedScore + consistencyScore) * volume);

    return {
      total: Math.max(0, Math.min(1000, total)),
      accuracy: Math.round(accuracy * 100),
      speedScore: Math.round(speedScore * volume),
      consistencyScore: Math.round(consistencyScore * volume),
      grade: this.getGrade(total),
    };
  },

  // Performance grade
  getGrade(score) {
    if (score >= 900) return { letter: 'S', color: '#ffb830', label: 'Legendary' };
    if (score >= 750) return { letter: 'A', color: '#00e0d0', label: 'Excellent' };
    if (score >= 600) return { letter: 'B', color: '#448aff', label: 'Great' };
    if (score >= 400) return { letter: 'C', color: '#b388ff', label: 'Good' };
    if (score >= 200) return { letter: 'D', color: '#ffab00', label: 'Average' };
    return { letter: 'F', color: '#ff3d5a', label: 'Needs Work' };
  },

  // Build a results object ready for storage
  buildResult({ scenarioId, config, sessionData, userId }) {
    const score = this.calculateScore(sessionData);
    return {
      userId,
      scenarioId,
      timestamp: new Date().toISOString(),
      config: { ...config },
      score: score.total,
      grade: score.grade.letter,
      stats: {
        hits: sessionData.hits || 0,
        misses: sessionData.misses || 0,
        totalTargets: sessionData.totalTargets || 0,
        accuracy: score.accuracy,
        avgReactionTime: Math.round(sessionData.avgReactionTime || 0),
        bestStreak: sessionData.bestStreak || 0,
        duration: sessionData.duration || 0,
      },
      breakdown: {
        accuracyScore: Math.max(0, score.total - score.speedScore - score.consistencyScore),
        speedScore: score.speedScore,
        consistencyScore: score.consistencyScore,
      },
    };
  },

  // Calculate score for a tracking session (strafe-tracking-3d)
  // Pure tracking — no shooting. Rewards: time on target, consistency, low tracking error.
  calculateTrackingScore(trackingStats) {
    var trackingAccuracy = trackingStats.trackingAccuracy || 0; // 0-100 %
    var bestTrackingStreak = trackingStats.bestTrackingStreak || 0; // seconds
    var avgTrackingError = trackingStats.avgTrackingError || 0; // degrees
    var duration = trackingStats.duration || 1;

    // Time-on-target score (0-500): directly from tracking accuracy %
    var onTargetScore = (trackingAccuracy / 100) * 500;

    // Consistency score (0-250): best tracking streak relative to duration
    // A perfect session would have a streak equal to the full duration
    var streakFraction = duration > 0 ? Math.min(1, bestTrackingStreak / duration) : 0;
    var consistencyScore = streakFraction * 250;

    // Tracking error score (0-250): lower angular error = higher score
    // 0° error = 250 points, 25°+ error = 0 points
    var maxErrorDeg = 25;
    var errorScore = Math.max(0, Math.min(250, (1 - avgTrackingError / maxErrorDeg) * 250));

    var total = Math.round(onTargetScore + consistencyScore + errorScore);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(trackingAccuracy),
      grade: this.getGrade(total),
    };
  },

  // Calculate score for a target switching session
  // Rewards speed, accuracy, consistency, and streaks.
  calculateTargetSwitchingScore(switchingStats) {
    var hits = switchingStats.hits || 0;
    var misses = switchingStats.misses || 0;
    var totalShots = hits + misses;
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var avgSwitchTime = switchingStats.avgSwitchTime || 0; // ms
    var bestSwitchTime = switchingStats.bestSwitchTime || 0; // ms
    var targetsDestroyed = switchingStats.targetsDestroyed || 0;
    var bestStreak = switchingStats.bestStreak || 0;
    var duration = switchingStats.duration || 1;

    // Accuracy score (0-400): high accuracy is essential
    var accuracyScore = accuracy * 400;

    // Speed score (0-300): faster average switch times earn more
    // Ideal: <300ms avg = full points, >1000ms = near zero
    var speedScore = 0;
    if (avgSwitchTime > 0 && avgSwitchTime < 1500) {
      speedScore = Math.max(0, 300 - (avgSwitchTime - 200) * 0.25);
    } else if (avgSwitchTime >= 1500) {
      speedScore = 0;
    }

    // Consistency score (0-200): based on best streak relative to total hits
    var streakScore = 0;
    if (hits > 0 && bestStreak > 0) {
      var streakRatio = bestStreak / hits;
      streakScore = streakRatio * 200;
    }

    // Best switch time bonus (0-100): rewards peak performance
    var bestBonus = 0;
    if (bestSwitchTime > 0 && bestSwitchTime < 1000) {
      bestBonus = Math.max(0, 100 - (bestSwitchTime - 100) * 0.12);
    }

    // Volume factor: ensure enough shots were taken
    var expectedHits = Math.max(5, duration * 0.5);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((accuracyScore + speedScore + streakScore + bestBonus) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      speedScore: Math.round(speedScore * volume),
      consistencyScore: Math.round(streakScore * volume),
      grade: this.getGrade(total),
    };
  },

  // Calculate score for a reactive tracking session
  // Rewards accuracy, reaction speed, sustained tracking, and streaks.
  calculateReactiveTrackingScore(trackingStats) {
    var hits = trackingStats.hits || 0;
    var misses = trackingStats.misses || 0;
    var totalShots = hits + misses;
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var avgTrackingTime = trackingStats.avgTrackingTime || 0; // ms
    var targetsDestroyed = trackingStats.targetsDestroyed || 0;
    var bestStreak = trackingStats.bestStreak || 0;
    var duration = trackingStats.duration || 1;

    // Accuracy score (0-400): high accuracy is essential
    var accuracyScore = accuracy * 400;

    // Reaction speed score (0-300): faster tracking times earn more
    // Ideal: <500ms avg = full points, >2000ms = near zero
    var speedScore = 0;
    if (avgTrackingTime > 0 && avgTrackingTime < 2500) {
      speedScore = Math.max(0, 300 - (avgTrackingTime - 300) * 0.14);
    }

    // Consistency score (0-200): based on best streak relative to total hits
    var streakScore = 0;
    if (hits > 0 && bestStreak > 0) {
      var streakRatio = bestStreak / hits;
      streakScore = streakRatio * 200;
    }

    // Volume factor: ensure enough targets were destroyed
    var expectedHits = Math.max(5, duration * 0.4);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((accuracyScore + speedScore + streakScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      speedScore: Math.round(speedScore * volume),
      consistencyScore: Math.round(streakScore * volume),
      grade: this.getGrade(total),
    };
  },

  // Calculate score for a bot strafe session
  // Rewards accuracy, fast target kills, consistent tracking, and streaks.
  calculateBotStrafeScore(strafeStats) {
    var hits = strafeStats.hits || 0;
    var misses = strafeStats.misses || 0;
    var totalShots = hits + misses;
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var avgHitTime = strafeStats.avgHitTime || 0; // ms
    var targetsDestroyed = strafeStats.targetsDestroyed || 0;
    var bestStreak = strafeStats.bestStreak || 0;
    var duration = strafeStats.duration || 1;

    // Accuracy score (0-400): high accuracy is essential
    var accuracyScore = accuracy * 400;

    // Speed score (0-300): faster hit times earn more
    // Ideal: <800ms avg = full points, >3000ms = near zero
    var speedScore = 0;
    if (avgHitTime > 0 && avgHitTime < 3500) {
      speedScore = Math.max(0, 300 - (avgHitTime - 400) * 0.1);
    }

    // Consistency score (0-200): based on best streak relative to total hits
    var streakScore = 0;
    if (hits > 0 && bestStreak > 0) {
      var streakRatio = bestStreak / hits;
      streakScore = streakRatio * 200;
    }

    // Volume factor: ensure enough targets were destroyed
    var expectedHits = Math.max(5, duration * 0.35);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((accuracyScore + speedScore + streakScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      speedScore: Math.round(speedScore * volume),
      consistencyScore: Math.round(streakScore * volume),
      grade: this.getGrade(total),
    };
  },

  // Aggregate stats across multiple results
  aggregateStats(results) {
    if (!results.length) return null;
    
    const total = results.length;
    const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / total);
    const bestScore = Math.max(...results.map(r => r.score));
    const avgAccuracy = Math.round(results.reduce((s, r) => s + r.stats.accuracy, 0) / total);
    const avgReaction = Math.round(results.reduce((s, r) => s + r.stats.avgReactionTime, 0) / total);
    const totalHits = results.reduce((s, r) => s + r.stats.hits, 0);
    const totalMisses = results.reduce((s, r) => s + r.stats.misses, 0);
    
    return {
      totalSessions: total,
      averageScore: avgScore,
      bestScore,
      averageAccuracy: avgAccuracy,
      averageReactionTime: avgReaction,
      totalHits,
      totalMisses,
      overallAccuracy: Math.round((totalHits / Math.max(1, totalHits + totalMisses)) * 100),
    };
  },
};
