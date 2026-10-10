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

  // Calculate score for an adjustshot session
  // Rewards precision (accuracy), speed (reaction time), headshots, and kill pace.
  calculateAdjustshotScore(adjustshotStats) {
    var hits = adjustshotStats.hits || 0;
    var misses = adjustshotStats.misses || 0;
    var totalShots = adjustshotStats.shotsFired || (hits + misses);
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var avgReactionTime = adjustshotStats.avgReactionTime || 0; // ms
    var targetsKilled = adjustshotStats.targetsKilled || 0;
    var headshots = adjustshotStats.headshots || 0;
    var bodyKills = adjustshotStats.bodyKills || 0;
    var bestStreak = adjustshotStats.bestStreak || 0;
    var duration = adjustshotStats.duration || 1;

    // Precision score (0-400): accuracy is critical for micro-adjustment training
    var precisionScore = accuracy * 400;

    // Speed score (0-250): faster reaction times earn more
    // Ideal: <500ms = full points, >1500ms = near zero
    var speedScore = 0;
    if (avgReactionTime > 0 && avgReactionTime < 2000) {
      speedScore = Math.max(0, 250 - (avgReactionTime - 300) * 0.15);
    }

    // Headshot bonus (0-200): rewards precision headshots
    var headshotRatio = targetsKilled > 0 ? headshots / targetsKilled : 0;
    var headshotScore = headshotRatio * 200;

    // Pace score (0-150): kills per second
    var killsPerSec = targetsKilled / duration;
    var paceScore = Math.min(150, killsPerSec * 75);

    // Volume factor: ensure enough targets were killed
    var expectedKills = Math.max(5, duration * 0.4);
    var volume = Math.min(1, targetsKilled / expectedKills);

    var total = Math.round((precisionScore + speedScore + headshotScore + paceScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      precisionScore: Math.round(precisionScore * volume),
      speedScore: Math.round(speedScore * volume),
      headshotScore: Math.round(headshotScore * volume),
      paceScore: Math.round(paceScore * volume),
      grade: this.getGrade(total),
    };
  },

  // ===== TACTICAL SCENARIO SCORING =====

  // Counter-Strafe & Shoot scoring
  calculateCounterStrafeScore(stats) {
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var totalShots = stats.shotsFired || (hits + misses);
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var hitsWhileStopped = stats.hitsWhileStopped || 0;
    var shotsWhileStopped = stats.shotsWhileStopped || 0;
    var counterStrafeHits = stats.counterStrafeHits || 0;
    var avgReactionTime = stats.avgReactionTime || 0;
    var duration = stats.duration || 1;

    // Stopped accuracy score (0-400): rewards shooting only when still
    var stoppedAccuracy = shotsWhileStopped > 0 ? hitsWhileStopped / shotsWhileStopped : 0;
    var stoppedScore = stoppedAccuracy * 400;

    // Counter-strafe bonus (0-250): rewards hits right after stopping
    var csRatio = hits > 0 ? counterStrafeHits / hits : 0;
    var csScore = csRatio * 250;

    // Speed score (0-200): faster reactions earn more
    var speedScore = 0;
    if (avgReactionTime > 0 && avgReactionTime < 2000) {
      speedScore = Math.max(0, 200 - (avgReactionTime - 200) * 0.12);
    }

    // Volume factor
    var expectedHits = Math.max(5, duration * 0.35);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((stoppedScore + csScore + speedScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      stoppedAccuracy: Math.round(stoppedAccuracy * 100),
      grade: this.getGrade(total),
    };
  },

  // Peek and Eliminate scoring
  calculatePeekEliminateScore(stats) {
    var targetsEliminated = stats.targetsEliminated || 0;
    var totalTargets = stats.totalTargets || 1;
    var avgTimeToEliminate = stats.avgTimeToEliminate || 0;
    var damageTaken = stats.damageTaken || 0;
    var peeksPerformed = stats.peeksPerformed || 0;
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var totalShots = hits + misses;
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var duration = stats.duration || 1;

    // Elimination score (0-400): percentage of targets eliminated
    var elimRatio = totalTargets > 0 ? targetsEliminated / totalTargets : 0;
    var elimScore = elimRatio * 400;

    // Speed score (0-250): faster eliminations earn more
    var speedScore = 0;
    if (avgTimeToEliminate > 0 && avgTimeToEliminate < 3000) {
      speedScore = Math.max(0, 250 - (avgTimeToEliminate - 200) * 0.1);
    }

    // Efficiency score (0-200): less damage taken = better
    var efficiencyScore = Math.max(0, 200 - damageTaken * 25);

    // Volume factor
    var expectedElims = Math.max(3, duration * 0.15);
    var volume = Math.min(1, targetsEliminated / expectedElims);

    var total = Math.round((elimScore + speedScore + efficiencyScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      grade: this.getGrade(total),
    };
  },

  // Micro-Adjustment Training scoring
  calculateMicroAdjustScore(stats) {
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var totalShots = stats.shotsFired || (hits + misses);
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var firstShotHits = stats.firstShotHits || 0;
    var firstShotTotal = stats.firstShotTotal || totalShots;
    var firstShotAccuracy = firstShotTotal > 0 ? firstShotHits / firstShotTotal : 0;
    var overcorrections = stats.overcorrections || 0;
    var avgReactionTime = stats.avgReactionTime || 0;
    var duration = stats.duration || 1;

    // First-shot accuracy score (0-400): the core metric
    var precisionScore = firstShotAccuracy * 400;

    // Overall accuracy (0-250)
    var accuracyScore = accuracy * 250;

    // Penalty for overcorrections (0-200, fewer = better)
    var overcorrRatio = totalShots > 0 ? overcorrections / totalShots : 0;
    var correctionScore = Math.max(0, (1 - overcorrRatio * 2)) * 200;

    // Speed score (0-150)
    var speedScore = 0;
    if (avgReactionTime > 0 && avgReactionTime < 1500) {
      speedScore = Math.max(0, 150 - (avgReactionTime - 150) * 0.12);
    }

    // Volume factor
    var expectedHits = Math.max(8, duration * 0.5);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((precisionScore + accuracyScore + correctionScore + speedScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      firstShotAccuracy: Math.round(firstShotAccuracy * 100),
      grade: this.getGrade(total),
    };
  },

  // Moving Enemy Engagements scoring
  calculateMovingEnemyScore(stats) {
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var totalShots = stats.shotsFired || (hits + misses);
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var targetsDestroyed = stats.targetsDestroyed || 0;
    var avgTrackingError = stats.avgTrackingError || 0;
    var avgHitTime = stats.avgHitTime || 0;
    var bestStreak = stats.bestStreak || 0;
    var duration = stats.duration || 1;

    // Accuracy score (0-350)
    var accuracyScore = accuracy * 350;

    // Tracking quality (0-250): lower angular error = better
    var maxError = 20;
    var trackingScore = Math.max(0, (1 - avgTrackingError / maxError)) * 250;

    // Speed score (0-200)
    var speedScore = 0;
    if (avgHitTime > 0 && avgHitTime < 3000) {
      speedScore = Math.max(0, 200 - (avgHitTime - 300) * 0.08);
    }

    // Kill pace (0-200)
    var killsPerSec = targetsDestroyed / duration;
    var paceScore = Math.min(200, killsPerSec * 100);

    // Volume factor
    var expectedHits = Math.max(5, duration * 0.35);
    var volume = Math.min(1, hits / expectedHits);

    var total = Math.round((accuracyScore + trackingScore + speedScore + paceScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
      grade: this.getGrade(total),
    };
  },

  // Sheriff / Classic Duel Practice scoring
  calculateDuelPracticeScore(stats) {
    var hits = stats.hits || 0;
    var misses = stats.misses || 0;
    var totalShots = stats.shotsFired || (hits + misses);
    var accuracy = totalShots > 0 ? hits / totalShots : 0;
    var eliminations = stats.eliminations || 0;
    var headshots = stats.headshots || 0;
    var ammoUsed = stats.ammoUsed || totalShots;
    var ammoTotal = stats.ammoTotal || 12;
    var avgHitTime = stats.avgHitTime || 0;
    var duration = stats.duration || 1;

    // Elimination score (0-350)
    var maxElims = stats.maxElims || 3;
    var elimRatio = maxElims > 0 ? eliminations / maxElims : 0;
    var elimScore = elimRatio * 350;

    // Precision score (0-250): accuracy + headshot bonus
    var headshotRatio = eliminations > 0 ? headshots / eliminations : 0;
    var precisionScore = accuracy * 150 + headshotRatio * 100;

    // Ammo efficiency (0-200): fewer shots per elimination = better
    var shotsPerElim = eliminations > 0 ? ammoUsed / eliminations : ammoUsed;
    var efficiencyScore = Math.max(0, 200 - (shotsPerElim - 1) * 50);

    // Speed score (0-200)
    var speedScore = 0;
    if (avgHitTime > 0 && avgHitTime < 2500) {
      speedScore = Math.max(0, 200 - (avgHitTime - 200) * 0.1);
    }

    // Volume factor
    var expectedElims = Math.max(1, maxElims * 0.5);
    var volume = Math.min(1, eliminations / expectedElims);

    var total = Math.round((elimScore + precisionScore + efficiencyScore + speedScore) * volume);
    total = Math.max(0, Math.min(1000, total));

    return {
      total: total,
      accuracy: Math.round(accuracy * 100),
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
