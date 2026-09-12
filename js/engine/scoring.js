/* ============================================
   Scoring & Statistics Structure
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Scoring = {
  // Calculate score for a training session
  calculateScore(sessionData) {
    const { hits, misses, totalTargets, avgReactionTime, duration, accuracy } = sessionData;
    
    // Base score from accuracy (0-500)
    const accuracyScore = (accuracy || 0) * 500;
    
    // Speed bonus from avg reaction time (0-300)
    const speedScore = avgReactionTime > 0
      ? Math.max(0, 300 - (avgReactionTime - 150) * 0.5)
      : 0;
    
    // Consistency bonus (0-200)
    const consistencyScore = Math.min(200, (hits / Math.max(1, totalTargets)) * 200);
    
    const total = Math.round(accuracyScore + speedScore + consistencyScore);
    
    return {
      total: Math.min(1000, total),
      accuracy: Math.round((accuracy || 0) * 100),
      speedScore: Math.round(speedScore),
      consistencyScore: Math.round(consistencyScore),
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
        accuracyScore: Math.round(sessionData.hits / Math.max(1, sessionData.hits + sessionData.misses) * 500),
        speedScore: score.speedScore,
        consistencyScore: score.consistencyScore,
      },
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
