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
  // Rewards: time on target, shot accuracy, consistency, low tracking error
  calculateTrackingScore(trackingStats) {
    var trackingAccuracy = trackingStats.trackingAccuracy || 0; // 0-100 %
    var hits = trackingStats.hits || 0;
    var misses = trackingStats.misses || 0;
    var shotsFired = hits + misses;
    var bestTrackingStreak = trackingStats.bestTrackingStreak || 0; // seconds
    var avgTrackingError = trackingStats.avgTrackingError || 0; // degrees
    var duration = trackingStats.duration || 1;

    // Time-on-target score (0-400): directly from tracking accuracy %
    var onTargetScore = (trackingAccuracy / 100) * 400;

    // Shot accuracy score (0-200): hits / shots fired
    var shotAccuracy = shotsFired > 0 ? hits / shotsFired : 0;
    var shotScore = shotAccuracy * 200;

    // Consistency score (0-200): best tracking streak relative to duration
    // A perfect session would have a streak equal to the full duration
    var streakFraction = duration > 0 ? Math.min(1, bestTrackingStreak / duration) : 0;
    var consistencyScore = streakFraction * 200;

    // Tracking error score (0-200): lower angular error = higher score
    // 0° error = 200 points, 20°+ error = 0 points
    var maxErrorDeg = 20;
    var errorScore = Math.max(0, Math.min(200, (1 - avgTrackingError / maxErrorDeg) * 200));

    // Volume factor: ensure enough shots were fired for a meaningful score
    var expectedShots = Math.max(10, duration * 1.5);
    var volume = Math.min(1, shotsFired / expectedShots);

    var total = Math.round((onTargetScore + shotScore + consistencyScore + errorScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(trackingAccuracy),
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
