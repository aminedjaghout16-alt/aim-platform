/* ============================================
   Smart Aim Analysis Engine
   Session analysis, weakness detection, feedback,
   and training recommendations.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.AimAnalysis = (function () {
  var EXERCISE_METRICS = {
    'static-flicking': {
      primary: ['score', 'accuracy', 'avgReactionTime'],
      secondary: ['hits', 'misses', 'bestStreak', 'duration'],
      speedMetric: 'avgReactionTime',
      speedLowerBetter: true,
      skillCategory: 'flicking',
    },
    'strafe-tracking-3d': {
      primary: ['score', 'accuracy', 'avgTrackingError'],
      secondary: ['bestTrackingStreak', 'duration'],
      speedMetric: null,
      speedLowerBetter: true,
      skillCategory: 'tracking',
    },
    'target-switching-3d': {
      primary: ['score', 'accuracy', 'avgSwitchTime'],
      secondary: ['hits', 'misses', 'bestSwitchTime', 'targetsDestroyed', 'bestStreak', 'duration'],
      speedMetric: 'avgSwitchTime',
      speedLowerBetter: true,
      skillCategory: 'switching',
    },
    'reactive-tracking-3d': {
      primary: ['score', 'accuracy', 'avgTrackingTime'],
      secondary: ['hits', 'misses', 'targetsDestroyed', 'bestStreak', 'duration'],
      speedMetric: 'avgTrackingTime',
      speedLowerBetter: true,
      skillCategory: 'reactive',
    },
    'bot-strafe-3d': {
      primary: ['score', 'accuracy', 'avgHitTime'],
      secondary: ['hits', 'misses', 'targetsDestroyed', 'bestStreak', 'duration'],
      speedMetric: 'avgHitTime',
      speedLowerBetter: true,
      skillCategory: 'tracking',
    },
    'adjustshot-3d': {
      primary: ['score', 'accuracy', 'avgReactionTime'],
      secondary: ['hits', 'misses', 'targetsKilled', 'headshots', 'bodyKills', 'bestStreak', 'duration'],
      speedMetric: 'avgReactionTime',
      speedLowerBetter: true,
      skillCategory: 'flicking',
    },
  };

  var SKILL_CATEGORIES = {
    flicking: {
      label: 'Flicking & Precision',
      exercises: ['static-flicking', 'adjustshot-3d'],
    },
    tracking: {
      label: 'Tracking',
      exercises: ['strafe-tracking-3d', 'bot-strafe-3d'],
    },
    reactive: {
      label: 'Reactive Aim',
      exercises: ['reactive-tracking-3d'],
    },
    switching: {
      label: 'Target Switching',
      exercises: ['target-switching-3d'],
    },
  };

  var TREND_WINDOW = 10;
  var MIN_SESSIONS_FOR_TREND = 3;
  var TREND_THRESHOLD = 0.02;

  function getMetricValue(result, metric) {
    if (!result) return undefined;
    if (metric === 'score') return result.score;
    if (metric === 'accuracy') {
      if (result.stats && result.stats.accuracy !== undefined) return result.stats.accuracy;
      return undefined;
    }
    if (result.stats && result.stats[metric] !== undefined) return result.stats[metric];
    return undefined;
  }

  function getExerciseConfig(result) {
    return (result && result.config) ? result.config : {};
  }

  function filterByExercise(results, exerciseId) {
    if (!results || !results.length) return [];
    return results.filter(function (r) { return r.scenarioId === exerciseId; });
  }

  function filterByConfig(results, config) {
    if (!results || !results.length || !config) return results;
    return results.filter(function (r) {
      var rc = getExerciseConfig(r);
      var diffMatch = !config.difficulty || !rc.difficulty || rc.difficulty === config.difficulty;
      var durMatch = !config.duration || !rc.duration || rc.duration === config.duration;
      return diffMatch && durMatch;
    });
  }

  function average(values) {
    var valid = values.filter(function (v) { return v !== undefined && v !== null && !isNaN(v); });
    if (!valid.length) return null;
    var sum = 0;
    for (var i = 0; i < valid.length; i++) sum += valid[i];
    return sum / valid.length;
  }

  function variance(values) {
    var avg = average(values);
    if (avg === null || values.length < 2) return 0;
    var sumSq = 0;
    var count = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v === undefined || v === null || isNaN(v)) continue;
      sumSq += (v - avg) * (v - avg);
      count++;
    }
    return count > 1 ? sumSq / (count - 1) : 0;
  }

  function linearTrend(values) {
    var pts = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v !== undefined && v !== null && !isNaN(v)) {
        pts.push({ x: i, y: v });
      }
    }
    if (pts.length < MIN_SESSIONS_FOR_TREND) return { slope: 0, confidence: 'low' };

    var n = pts.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var j = 0; j < n; j++) {
      sumX += pts[j].x;
      sumY += pts[j].y;
      sumXY += pts[j].x * pts[j].y;
      sumX2 += pts[j].x * pts[j].x;
    }
    var denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return { slope: 0, confidence: 'low' };

    var slope = (n * sumXY - sumX * sumY) / denom;
    var meanY = sumY / n;
    var normalizedSlope = meanY !== 0 ? slope / Math.abs(meanY) : 0;

    var ssRes = 0, ssTot = 0;
    var intercept = (sumY - slope * sumX) / n;
    for (var k = 0; k < n; k++) {
      var predicted = intercept + slope * pts[k].x;
      ssRes += (pts[k].y - predicted) * (pts[k].y - predicted);
      ssTot += (pts[k].y - meanY) * (pts[k].y - meanY);
    }
    var rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    var confidence = 'low';
    if (n >= 5 && rSquared > 0.3) confidence = 'high';
    else if (n >= 3 && rSquared > 0.1) confidence = 'medium';

    return { slope: normalizedSlope, rSquared: rSquared, confidence: confidence };
  }

  function classifyTrend(trendData) {
    if (trendData.confidence === 'low') return 'insufficient_data';
    if (trendData.slope > TREND_THRESHOLD) return 'improving';
    if (trendData.slope < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  function safeDelta(current, previous) {
    if (current === undefined || current === null || previous === undefined || previous === null) return null;
    if (isNaN(current) || isNaN(previous)) return null;
    return Math.round((current - previous) * 100) / 100;
  }

  function safePercentDelta(current, previous) {
    if (!previous || previous === 0) return null;
    var delta = safeDelta(current, previous);
    if (delta === null) return null;
    return Math.round((delta / Math.abs(previous)) * 1000) / 10;
  }

  // ─── compareWithHistory ──────────────────────────────

  function compareWithHistory(currentResult, history) {
    var exerciseId = currentResult.scenarioId;
    var config = getExerciseConfig(currentResult);
    var metrics = EXERCISE_METRICS[exerciseId];

    if (!metrics) {
      return { vsPrevious: {}, vsPersonalBest: {}, trend: 'insufficient_data', sampleSize: 0 };
    }

    var sameExercise = filterByExercise(history, exerciseId);
    var sameConfig = filterByConfig(sameExercise, config);
    var comparePool = sameConfig.length >= MIN_SESSIONS_FOR_TREND ? sameConfig : sameExercise;

    var recent = comparePool.slice(0, TREND_WINDOW);
    var sampleSize = recent.length;

    if (sampleSize === 0) {
      return { vsPrevious: {}, vsPersonalBest: {}, trend: 'insufficient_data', sampleSize: 0 };
    }

    var previous = recent[0];
    var personalBest = comparePool.reduce(function (best, r) {
      return (r.score > best.score) ? r : best;
    }, comparePool[0]);

    var vsPrevious = {};
    var vsPersonalBest = {};
    var allMetrics = metrics.primary.concat(metrics.secondary);

    for (var i = 0; i < allMetrics.length; i++) {
      var m = allMetrics[i];
      var curVal = getMetricValue(currentResult, m);
      var prevVal = getMetricValue(previous, m);
      var bestVal = getMetricValue(personalBest, m);
      vsPrevious[m] = {
        current: curVal,
        previous: prevVal,
        delta: safeDelta(curVal, prevVal),
        percentDelta: safePercentDelta(curVal, prevVal),
      };
      vsPersonalBest[m] = {
        current: curVal,
        best: bestVal,
        delta: safeDelta(curVal, bestVal),
        percentDelta: safePercentDelta(curVal, bestVal),
      };
    }

    var scoreValues = recent.map(function (r) { return r.score; }).reverse();
    scoreValues.push(currentResult.score);
    var trendData = linearTrend(scoreValues);
    var trend = classifyTrend(trendData);

    return {
      vsPrevious: vsPrevious,
      vsPersonalBest: vsPersonalBest,
      trend: trend,
      trendData: trendData,
      sampleSize: sampleSize,
      personalBestScore: personalBest.score,
      previousScore: previous.score,
      recentAverage: Math.round(average(recent.map(function (r) { return r.score; })) || 0),
    };
  }

  // ─── generateFeedback ────────────────────────────────

  function generateFeedback(analysis, exerciseType) {
    var feedback = [];
    var metrics = EXERCISE_METRICS[exerciseType];
    if (!metrics) return feedback;

    var sessionMetrics = analysis.sessionMetrics || {};
    var comparison = analysis.comparison || {};
    var pbInfo = analysis.personalBestInfo || {};

    if (comparison.sampleSize === 0) {
      feedback.push({
        type: 'suggestion',
        message: 'This is your first session with ' + exerciseType + '. Complete a few more sessions to establish a performance baseline for comparison.',
      });
      return feedback;
    }

    var accuracy = sessionMetrics.accuracy;
    var score = sessionMetrics.score;
    var avgRecentAccuracy = comparison.recentAverage !== undefined ? null : null;
    var recentScores = comparison.vsPrevious ? Object.keys(comparison.vsPrevious) : [];

    var prevAccuracy = comparison.vsPrevious && comparison.vsPrevious.accuracy
      ? comparison.vsPrevious.accuracy.previous : null;
    var prevScore = comparison.vsPrevious && comparison.vsPrevious.score
      ? comparison.vsPrevious.score.previous : null;

    if (pbInfo.isNewBest) {
      var improvedMetric = pbInfo.improvedMetric || 'score';
      feedback.push({
        type: 'strength',
        message: 'New personal best! Your score of ' + score + ' beats your previous best of ' + pbInfo.previousBest + '. Key improvement in ' + improvedMetric + '.',
      });
    }

    if (accuracy !== undefined && accuracy >= 80 && score !== undefined && prevScore !== null && score < prevScore) {
      feedback.push({
        type: 'suggestion',
        message: 'Your accuracy is strong at ' + accuracy + '% but your score dropped. Focus on increasing your pace — faster target engagement while maintaining precision will raise your score.',
      });
    }

    if (accuracy !== undefined && accuracy < 60 && comparison.vsPrevious) {
      var speedKey = metrics.speedMetric;
      if (speedKey && comparison.vsPrevious[speedKey]) {
        var curSpeed = comparison.vsPrevious[speedKey].current;
        var prevSpeed = comparison.vsPrevious[speedKey].previous;
        if (curSpeed !== undefined && prevSpeed !== undefined && curSpeed < prevSpeed) {
          feedback.push({
            type: 'weakness',
            message: 'Your speed increased (' + Math.round(curSpeed) + 'ms vs ' + Math.round(prevSpeed) + 'ms) but accuracy dropped to ' + accuracy + '%. Slow down slightly and prioritize landing each shot.',
          });
        }
      }
      if (feedback.length === 0 || feedback[feedback.length - 1].type !== 'weakness') {
        feedback.push({
          type: 'weakness',
          message: 'Accuracy at ' + accuracy + '% is below target. Focus on controlled aim — reduce speed until you consistently hit above 70%, then gradually increase pace.',
        });
      }
    }

    if (comparison.trend === 'declining' && accuracy !== undefined) {
      var accDelta = comparison.vsPrevious && comparison.vsPrevious.accuracy
        ? comparison.vsPrevious.accuracy.delta : null;
      if (accDelta !== null && accDelta < -5) {
        feedback.push({
          type: 'weakness',
          message: 'Your accuracy has been declining over recent sessions (' + (accDelta > 0 ? '+' : '') + accDelta + '% vs last session). Consider slowing your pace and focusing on precision fundamentals.',
        });
      }
    }

    if (comparison.trend === 'stable' && score !== undefined && score >= 700) {
      var scoreVariance = comparison.trendData && comparison.trendData.rSquared !== undefined
        ? comparison.trendData.rSquared : null;
      feedback.push({
        type: 'strength',
        message: 'Your performance is consistently strong (avg ~' + comparison.recentAverage + '). Consider increasing difficulty or reducing target size to continue challenging yourself.',
      });
    }

    if (comparison.trend === 'improving') {
      feedback.push({
        type: 'strength',
        message: 'Your performance is trending upward over the last ' + comparison.sampleSize + ' sessions. Keep up the consistent practice.',
      });
    }

    if (comparison.trend === 'declining' && feedback.length === 0) {
      feedback.push({
        type: 'suggestion',
        message: 'Performance has trended down over recent sessions. This is normal — variation happens. Focus on consistent fundamentals: crosshair placement, smooth mouse control, and breathing.',
      });
    }

    var speedKey = metrics.speedMetric;
    if (speedKey && comparison.vsPrevious && comparison.vsPrevious[speedKey]) {
      var curSpeedVal = comparison.vsPrevious[speedKey].current;
      var prevSpeedVal = comparison.vsPrevious[speedKey].previous;
      if (curSpeedVal !== undefined && prevSpeedVal !== undefined && metrics.speedLowerBetter) {
        if (curSpeedVal > prevSpeedVal * 1.15 && accuracy >= 75) {
          feedback.push({
            type: 'suggestion',
            message: 'Your reaction time slowed (' + Math.round(curSpeedVal) + 'ms vs ' + Math.round(prevSpeedVal) + 'ms) while accuracy held. You may be overthinking shots — trust your instincts and click faster.',
          });
        }
      }
    }

    if (sessionMetrics.bestStreak !== undefined && sessionMetrics.bestStreak >= 10) {
      feedback.push({
        type: 'strength',
        message: 'Strong consistency with a best streak of ' + sessionMetrics.bestStreak + '. Your aim control is solid.',
      });
    }

    return feedback;
  }

  // ─── analyzeSession ──────────────────────────────────

  function analyzeSession(currentResult, previousResults, personalBest) {
    var exerciseId = currentResult.scenarioId;
    var metrics = EXERCISE_METRICS[exerciseId];

    var sessionMetrics = { score: currentResult.score };
    if (metrics) {
      var allKeys = metrics.primary.concat(metrics.secondary);
      for (var i = 0; i < allKeys.length; i++) {
        var val = getMetricValue(currentResult, allKeys[i]);
        if (val !== undefined) sessionMetrics[allKeys[i]] = val;
      }
    } else {
      if (currentResult.stats) {
        var statKeys = Object.keys(currentResult.stats);
        for (var j = 0; j < statKeys.length; j++) {
          sessionMetrics[statKeys[j]] = currentResult.stats[statKeys[j]];
        }
      }
    }

    var comparison = compareWithHistory(currentResult, previousResults || []);

    var pb = personalBest;
    if (!pb && previousResults && previousResults.length) {
      var sameType = filterByExercise(previousResults, exerciseId);
      if (sameType.length) {
        pb = sameType.reduce(function (b, r) { return (r.score > b.score) ? r : b; }, sameType[0]);
      }
    }

    var personalBestInfo = {
      isNewBest: false,
      previousBest: pb ? pb.score : 0,
      improvedMetric: null,
    };

    if (pb) {
      if (currentResult.score > pb.score) {
        personalBestInfo.isNewBest = true;
        personalBestInfo.previousBest = pb.score;
        if (metrics) {
          var bestAcc = getMetricValue(pb, 'accuracy');
          var curAcc = getMetricValue(currentResult, 'accuracy');
          if (curAcc !== undefined && bestAcc !== undefined && curAcc > bestAcc) {
            personalBestInfo.improvedMetric = 'accuracy';
          } else {
            personalBestInfo.improvedMetric = 'score';
          }
        } else {
          personalBestInfo.improvedMetric = 'score';
        }
      }
    }

    var analysis = {
      sessionMetrics: sessionMetrics,
      comparison: comparison,
      feedback: [],
      personalBestInfo: personalBestInfo,
    };

    analysis.feedback = generateFeedback(analysis, exerciseId);

    return analysis;
  }

  // ─── detectWeaknesses ────────────────────────────────

  function detectWeaknesses(userResults, benchmarkData) {
    if (!userResults || !userResults.length) return [];

    var weaknesses = [];

    var categoryKeys = Object.keys(SKILL_CATEGORIES);
    for (var c = 0; c < categoryKeys.length; c++) {
      var catId = categoryKeys[c];
      var cat = SKILL_CATEGORIES[catId];
      var catResults = [];

      for (var e = 0; e < cat.exercises.length; e++) {
        var exResults = filterByExercise(userResults, cat.exercises[e]);
        catResults = catResults.concat(exResults);
      }

      catResults.sort(function (a, b) {
        var ta = new Date(a.timestamp).getTime();
        var tb = new Date(b.timestamp).getTime();
        return tb - ta;
      });

      var recentCat = catResults.slice(0, TREND_WINDOW);
      if (!recentCat.length) continue;

      var scores = recentCat.map(function (r) { return r.score; });
      var accuracies = recentCat.map(function (r) {
        return r.stats ? r.stats.accuracy : undefined;
      }).filter(function (v) { return v !== undefined && v !== null; });

      var avgScore = average(scores);
      var avgAccuracy = average(accuracies);
      var scoreVar = variance(scores);

      var scoreTrend = linearTrend(scores.slice().reverse());
      var trendLabel = classifyTrend(scoreTrend);

      var confidence = 'low';
      if (recentCat.length >= 5) confidence = 'high';
      else if (recentCat.length >= 3) confidence = 'medium';

      var recommendation = '';
      var suggestedExercise = cat.exercises[0];

      if (avgScore === null) continue;

      if (avgScore < 400) {
        recommendation = cat.label + ' needs significant work. Focus on fundamentals in ' + suggestedExercise + '.';
      } else if (avgScore < 600) {
        recommendation = cat.label + ' is below average. Regular practice on ' + suggestedExercise + ' will help build consistency.';
      } else if (trendLabel === 'declining') {
        recommendation = cat.label + ' has been declining. Review your form and consider extra sessions on ' + suggestedExercise + '.';
      } else if (avgScore >= 700 && trendLabel === 'stable') {
        recommendation = cat.label + ' is strong and stable. Consider increasing difficulty or moving to advanced exercises.';
        suggestedExercise = null;
      } else {
        recommendation = cat.label + ' is developing normally. Continue regular practice.';
      }

      if (avgAccuracy !== null && avgAccuracy < 55) {
        recommendation = cat.label + ' accuracy (' + Math.round(avgAccuracy) + '%) is low. Prioritize precision over speed in ' + cat.exercises[0] + '.';
      }

      weaknesses.push({
        category: cat.label,
        categoryId: catId,
        recentPerformance: {
          avgScore: Math.round(avgScore),
          avgAccuracy: avgAccuracy !== null ? Math.round(avgAccuracy) : null,
          trend: trendLabel,
          sessions: recentCat.length,
        },
        confidence: confidence,
        recommendation: recommendation,
        suggestedExercise: suggestedExercise,
        metrics: {
          scoreVariance: Math.round(scoreVar),
          bestScore: Math.max.apply(null, scores),
          worstScore: Math.min.apply(null, scores),
        },
      });
    }

    var reactionExercises = ['static-flicking', 'adjustshot-3d', 'reactive-tracking-3d', 'bot-strafe-3d', 'target-switching-3d'];
    var reactionMetrics = {
      'static-flicking': 'avgReactionTime',
      'adjustshot-3d': 'avgReactionTime',
      'reactive-tracking-3d': 'avgTrackingTime',
      'bot-strafe-3d': 'avgHitTime',
      'target-switching-3d': 'avgSwitchTime',
    };
    var reactionValues = [];
    var reactionDetails = {};

    for (var ri = 0; ri < reactionExercises.length; ri++) {
      var rex = reactionExercises[ri];
      var rexResults = filterByExercise(userResults, rex).slice(0, 5);
      if (!rexResults.length) continue;
      var metric = reactionMetrics[rex];
      var vals = rexResults.map(function (r) { return getMetricValue(r, metric); }).filter(function (v) { return v !== undefined && v !== null && v > 0; });
      if (vals.length) {
        var avg = average(vals);
        reactionValues.push(avg);
        reactionDetails[rex] = Math.round(avg);
      }
    }

    if (reactionValues.length) {
      var overallReactionAvg = average(reactionValues);
      var reactionTrend = linearTrend(reactionValues);

      var reactionRec = '';
      var reactionSuggested = null;
      if (overallReactionAvg > 800) {
        reactionRec = 'Reaction speed is slow (avg ' + Math.round(overallReactionAvg) + 'ms). Practice reactive-tracking-3d to improve reflexes.';
        reactionSuggested = 'reactive-tracking-3d';
      } else if (overallReactionAvg > 500) {
        reactionRec = 'Reaction speed is moderate (avg ' + Math.round(overallReactionAvg) + 'ms). Include reactive-tracking-3d and static-flicking in your routine.';
        reactionSuggested = 'reactive-tracking-3d';
      } else {
        reactionRec = 'Reaction speed is strong (avg ' + Math.round(overallReactionAvg) + 'ms). Maintain with occasional reactive drills.';
      }

      weaknesses.push({
        category: 'Reaction Speed',
        categoryId: 'reaction',
        recentPerformance: {
          avgScore: Math.round(overallReactionAvg),
          avgAccuracy: null,
          trend: classifyTrend(reactionTrend),
          sessions: reactionValues.length,
        },
        confidence: reactionValues.length >= 3 ? 'medium' : 'low',
        recommendation: reactionRec,
        suggestedExercise: reactionSuggested,
        metrics: reactionDetails,
      });
    }

    var allScores = userResults.slice(0, 20).map(function (r) { return r.score; });
    if (allScores.length >= 3) {
      var globalVar = variance(allScores);
      var globalAvg = average(allScores);
      var cv = globalAvg > 0 ? Math.sqrt(globalVar) / globalAvg : 0;

      var consistencyRec = '';
      if (cv > 0.35) {
        consistencyRec = 'High performance variance detected. Your scores fluctuate significantly. Focus on consistency by practicing the same exercise with fixed settings.';
      } else if (cv > 0.2) {
        consistencyRec = 'Moderate performance variance. Aim for more consistent sessions by warming up before each practice.';
      } else {
        consistencyRec = 'Good consistency across sessions. Your performance is reliable.';
      }

      weaknesses.push({
        category: 'Consistency',
        categoryId: 'consistency',
        recentPerformance: {
          avgScore: Math.round(globalAvg),
          avgAccuracy: null,
          trend: cv > 0.35 ? 'declining' : 'stable',
          sessions: allScores.length,
        },
        confidence: allScores.length >= 5 ? 'high' : 'medium',
        recommendation: consistencyRec,
        suggestedExercise: null,
        metrics: {
          coefficientOfVariation: Math.round(cv * 100) / 100,
          scoreVariance: Math.round(globalVar),
          standardDeviation: Math.round(Math.sqrt(globalVar)),
        },
      });
    }

    weaknesses.sort(function (a, b) {
      var priority = { flicking: 0, tracking: 1, reactive: 2, switching: 3, reaction: 4, consistency: 5 };
      var pa = priority[a.categoryId] !== undefined ? priority[a.categoryId] : 99;
      var pb2 = priority[b.categoryId] !== undefined ? priority[b.categoryId] : 99;
      if (a.recentPerformance.avgScore === null) return -1;
      if (b.recentPerformance.avgScore === null) return 1;
      return a.recentPerformance.avgScore - b.recentPerformance.avgScore;
    });

    return weaknesses;
  }

  // ─── getRecommendations ──────────────────────────────

  function getRecommendations(weaknesses, recentResults) {
    if (!weaknesses || !weaknesses.length) return [];

    var recommendations = [];

    for (var i = 0; i < weaknesses.length; i++) {
      var w = weaknesses[i];

      if (w.recentPerformance.avgScore === null) continue;

      if (w.categoryId === 'consistency') {
        if (w.recentPerformance.trend === 'declining' || (w.metrics && w.metrics.coefficientOfVariation > 0.3)) {
          var mostPlayed = null;
          var playCounts = {};
          if (recentResults && recentResults.length) {
            for (var r = 0; r < recentResults.length; r++) {
              var sid = recentResults[r].scenarioId;
              playCounts[sid] = (playCounts[sid] || 0) + 1;
            }
            var maxCount = 0;
            var pkeys = Object.keys(playCounts);
            for (var p = 0; p < pkeys.length; p++) {
              if (playCounts[pkeys[p]] > maxCount) {
                maxCount = playCounts[pkeys[p]];
                mostPlayed = pkeys[p];
              }
            }
          }
          recommendations.push({
            type: 'consistency',
            reason: w.recommendation,
            exercise: mostPlayed || 'static-flicking',
            action: 'Repeat the same exercise with fixed settings for 3-5 sessions to build consistency.',
            priority: i + 1,
          });
        }
        continue;
      }

      if (w.suggestedExercise) {
        var action = '';
        if (w.recentPerformance.avgScore < 400) {
          action = 'Start with fundamentals: use medium difficulty and focus on accuracy over speed.';
        } else if (w.recentPerformance.avgScore < 600) {
          action = 'Practice regularly at medium difficulty. Aim for 3+ sessions per week to build muscle memory.';
        } else if (w.recentPerformance.trend === 'declining') {
          action = 'Take a step back to medium difficulty and rebuild consistency before increasing challenge.';
        } else if (w.recentPerformance.avgScore >= 700) {
          action = 'Increase difficulty or reduce target size to push past your current plateau.';
        } else {
          action = 'Continue regular practice to maintain and improve your performance.';
        }

        if (w.recentPerformance.avgAccuracy !== null && w.recentPerformance.avgAccuracy < 55) {
          action = 'Prioritize accuracy: slow down your aim and ensure each shot lands before moving to the next target.';
        }

        var scenario = null;
        if (window.VantageEngine && window.VantageEngine.Scenarios) {
          scenario = window.VantageEngine.Scenarios.getById(w.suggestedExercise);
        }

        recommendations.push({
          type: w.categoryId,
          reason: w.recommendation,
          exercise: w.suggestedExercise,
          exerciseName: scenario ? scenario.name : w.suggestedExercise,
          action: action,
          priority: i + 1,
        });
      }
    }

    recommendations.sort(function (a, b) { return a.priority - b.priority; });

    return recommendations;
  }

  // ─── Public API ──────────────────────────────────────

  return {
    analyzeSession: analyzeSession,
    generateFeedback: generateFeedback,
    detectWeaknesses: detectWeaknesses,
    compareWithHistory: compareWithHistory,
    getRecommendations: getRecommendations,

    getExerciseMetrics: function (exerciseId) {
      return EXERCISE_METRICS[exerciseId] || null;
    },

    getSkillCategories: function () {
      return SKILL_CATEGORIES;
    },

    getTrend: linearTrend,
  };
})();
