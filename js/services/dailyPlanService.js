/* ============================================
   Daily Plan Service — Smart training plan generation
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.DailyPlanService = {
  // Get today's date key (YYYY-MM-DD) in local timezone
  _getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Get date key for a specific date
  _getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Analyze user's performance history to identify weaknesses
  async _analyzePerformance(userId) {
    const db = VantageServices.DatabaseService._db();
    const resultsSnap = await db.collection('results')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const results = [];
    resultsSnap.forEach(doc => results.push(doc.data()));

    if (results.length === 0) {
      return { hasData: false, weaknesses: {}, strengths: {} };
    }

    // Group results by scenario
    const byScenario = {};
    results.forEach(r => {
      if (!byScenario[r.scenarioId]) byScenario[r.scenarioId] = [];
      byScenario[r.scenarioId].push(r);
    });

    // Calculate metrics for each scenario
    const metrics = {};
    Object.keys(byScenario).forEach(scenarioId => {
      const scenarioResults = byScenario[scenarioId];
      const recentResults = scenarioResults.slice(0, 10); // Last 10 attempts
      
      const avgScore = recentResults.reduce((sum, r) => sum + (r.score || 0), 0) / recentResults.length;
      const avgAccuracy = recentResults.reduce((sum, r) => sum + ((r.stats && r.stats.accuracy) || 0), 0) / recentResults.length;
      
      // Calculate trend (compare last 5 vs previous 5)
      let trend = 0;
      if (recentResults.length >= 10) {
        const recent5 = recentResults.slice(0, 5).reduce((sum, r) => sum + (r.score || 0), 0) / 5;
        const older5 = recentResults.slice(5, 10).reduce((sum, r) => sum + (r.score || 0), 0) / 5;
        trend = recent5 - older5;
      }

      // Calculate consistency (standard deviation of scores)
      const scores = recentResults.map(r => r.score || 0);
      const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
      const consistency = Math.sqrt(variance);

      // Days since last practice
      const lastPractice = scenarioResults[0].timestamp ? new Date(scenarioResults[0].timestamp) : new Date();
      const daysSince = Math.floor((Date.now() - lastPractice.getTime()) / (1000 * 60 * 60 * 24));

      metrics[scenarioId] = {
        avgScore,
        avgAccuracy,
        trend,
        consistency,
        daysSince,
        totalAttempts: scenarioResults.length,
      };
    });

    // Identify weaknesses and strengths
    const weaknesses = {};
    const strengths = {};

    Object.keys(metrics).forEach(scenarioId => {
      const m = metrics[scenarioId];
      const scenario = VantageEngine.Scenarios.getById(scenarioId);
      if (!scenario) return;

      // Weakness score: lower accuracy, negative trend, high inconsistency, long time since practice
      let weaknessScore = 0;
      
      // Low accuracy is a weakness
      if (m.avgAccuracy < 50) weaknessScore += 3;
      else if (m.avgAccuracy < 70) weaknessScore += 2;
      else if (m.avgAccuracy < 85) weaknessScore += 1;

      // Negative trend is a weakness
      if (m.trend < -50) weaknessScore += 3;
      else if (m.trend < 0) weaknessScore += 1;

      // High inconsistency is a weakness
      if (m.consistency > 150) weaknessScore += 2;
      else if (m.consistency > 100) weaknessScore += 1;

      // Long time since practice is a weakness
      if (m.daysSince > 14) weaknessScore += 3;
      else if (m.daysSince > 7) weaknessScore += 2;
      else if (m.daysSince > 3) weaknessScore += 1;

      if (weaknessScore >= 3) {
        weaknesses[scenarioId] = { score: weaknessScore, metrics: m };
      } else if (weaknessScore <= 1 && m.avgAccuracy >= 80 && m.trend >= 0) {
        strengths[scenarioId] = { score: weaknessScore, metrics: m };
      }
    });

    return { hasData: true, weaknesses, strengths, metrics };
  },

  // Generate a balanced starter plan (for new users)
  _generateBalancedStarterPlan(durationMinutes) {
    const scenarios = VantageEngine.Scenarios.getEnabled();
    const exercises = [];
    
    // Select one from each category for variety
    const categories = {
      flicking: scenarios.filter(s => s.category === 'flicking'),
      tracking: scenarios.filter(s => s.category === 'tracking'),
      target_switching: scenarios.filter(s => s.category === 'target_switching'),
      micro_adjustments: scenarios.filter(s => s.category === 'micro_adjustments'),
    };

    const exerciseDuration = Math.floor(durationMinutes / 4); // 4 exercises
    
    // Add one from each category
    Object.keys(categories).forEach(cat => {
      if (categories[cat].length > 0) {
        const scenario = categories[cat][0];
        exercises.push({
          scenarioId: scenario.id,
          duration: exerciseDuration,
          difficulty: 'medium',
          reason: 'Balanced warmup exercise',
        });
      }
    });

    return exercises;
  },

  // Generate a personalized plan based on performance analysis
  _generatePersonalizedPlan(analysis, durationMinutes, planType) {
    const scenarios = VantageEngine.Scenarios.getEnabled();
    const exercises = [];
    
    // Filter scenarios based on plan type
    let priorityScenarios = [];
    let otherScenarios = [];

    if (planType === 'precision') {
      priorityScenarios = scenarios.filter(s => 
        s.category === 'flicking' || s.category === 'micro_adjustments'
      );
      otherScenarios = scenarios.filter(s => 
        s.category !== 'flicking' && s.category !== 'micro_adjustments'
      );
    } else if (planType === 'tracking') {
      priorityScenarios = scenarios.filter(s => s.category === 'tracking');
      otherScenarios = scenarios.filter(s => s.category !== 'tracking');
    } else if (planType === 'target_switching') {
      priorityScenarios = scenarios.filter(s => s.category === 'target_switching');
      otherScenarios = scenarios.filter(s => s.category !== 'target_switching');
    } else {
      // Balanced or recommended: mix of all
      priorityScenarios = scenarios;
      otherScenarios = [];
    }

    // If we have performance data, prioritize weaknesses
    if (analysis.hasData && Object.keys(analysis.weaknesses).length > 0) {
      // Sort weaknesses by score (highest first)
      const sortedWeaknesses = Object.entries(analysis.weaknesses)
        .sort((a, b) => b[1].score - a[1].score);

      // Add weakness exercises first
      const numWeaknessExercises = Math.min(3, sortedWeaknesses.length);
      const weaknessDuration = Math.floor(durationMinutes * 0.6 / numWeaknessExercises);
      
      for (let i = 0; i < numWeaknessExercises; i++) {
        const [scenarioId, data] = sortedWeaknesses[i];
        const scenario = VantageEngine.Scenarios.getById(scenarioId);
        if (!scenario) continue;

        let reason = 'Improve recent performance';
        if (data.metrics.avgAccuracy < 50) reason = 'Low accuracy needs work';
        else if (data.metrics.trend < 0) reason = 'Performance declining';
        else if (data.metrics.daysSince > 7) reason = 'Needs practice after break';
        else if (data.metrics.consistency > 100) reason = 'Improve consistency';

        exercises.push({
          scenarioId,
          duration: weaknessDuration,
          difficulty: 'medium',
          reason,
        });
      }

      // Fill remaining time with other exercises
      const remainingTime = durationMinutes - (numWeaknessExercises * weaknessDuration);
      const otherDuration = Math.floor(remainingTime / 2);
      
      const otherPriority = otherScenarios.length > 0 ? otherScenarios : priorityScenarios;
      for (let i = 0; i < 2 && i < otherPriority.length; i++) {
        const scenario = otherPriority[i];
        if (exercises.find(e => e.scenarioId === scenario.id)) continue;
        
        exercises.push({
          scenarioId: scenario.id,
          duration: otherDuration,
          difficulty: 'medium',
          reason: 'Maintain skills',
        });
      }
    } else {
      // No weakness data, create balanced plan
      const numExercises = Math.min(4, priorityScenarios.length);
      const exerciseDuration = Math.floor(durationMinutes / numExercises);

      for (let i = 0; i < numExercises; i++) {
        const scenario = priorityScenarios[i];
        exercises.push({
          scenarioId: scenario.id,
          duration: exerciseDuration,
          difficulty: 'medium',
          reason: 'Balanced training',
        });
      }
    }

    return exercises;
  },

  // Generate a daily plan
  async generatePlan(userId, preferences = {}) {
    const durationMinutes = preferences.duration || 15;
    const planType = preferences.planType || 'recommended';
    const difficulty = preferences.difficulty || 'medium';

    // Analyze performance
    const analysis = await this._analyzePerformance(userId);

    // Generate exercises
    let exercises;
    if (analysis.hasData && planType === 'recommended') {
      exercises = this._generatePersonalizedPlan(analysis, durationMinutes, planType);
    } else if (planType === 'balanced') {
      exercises = this._generateBalancedStarterPlan(durationMinutes);
    } else {
      exercises = this._generatePersonalizedPlan(analysis, durationMinutes, planType);
    }

    // Apply difficulty preference
    exercises = exercises.map(ex => ({
      ...ex,
      difficulty,
    }));

    // Create plan object
    const plan = {
      id: `plan_${Date.now()}`,
      date: this._getTodayKey(),
      userId,
      planType,
      durationMinutes,
      exercises,
      status: 'not_started',
      completedExercises: [],
      results: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    return plan;
  },

  // Save plan to Firestore
  async savePlan(userId, plan) {
    const db = VantageServices.DatabaseService._db();
    const planRef = db.collection('dailyPlans').doc(plan.id);
    await planRef.set({
      ...plan,
      userId,
    });
    return plan;
  },

  // Get today's plan
  async getTodayPlan(userId) {
    const db = VantageServices.DatabaseService._db();
    const todayKey = this._getTodayKey();
    
    const snap = await db.collection('dailyPlans')
      .where('userId', '==', userId)
      .where('date', '==', todayKey)
      .limit(1)
      .get();

    if (snap.empty) return null;
    
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // Update plan progress
  async updatePlanProgress(planId, updates) {
    const db = VantageServices.DatabaseService._db();
    await db.collection('dailyPlans').doc(planId).update(updates);
  },

  // Get plan history
  async getPlanHistory(userId, limit = 30) {
    const db = VantageServices.DatabaseService._db();
    const snap = await db.collection('dailyPlans')
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();

    const plans = [];
    snap.forEach(doc => plans.push({ id: doc.id, ...doc.data() }));
    return plans;
  },

  // Get streak info
  async getStreakInfo(userId) {
    const history = await this.getPlanHistory(userId, 100);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;

    // Sort by date descending
    history.sort((a, b) => b.date.localeCompare(a.date));

    for (const plan of history) {
      if (plan.status !== 'completed') continue;

      const planDate = new Date(plan.date);
      
      if (lastDate) {
        const daysDiff = Math.floor((lastDate - planDate) / (1000 * 60 * 60 * 24));
        if (daysDiff === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }

      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }

      // Check if this is part of current streak
      const today = new Date();
      const todayKey = this._getDateKey(today);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = this._getDateKey(yesterday);

      if (plan.date === todayKey || plan.date === yesterdayKey) {
        currentStreak = tempStreak;
      }

      lastDate = planDate;
    }

    return { currentStreak, longestStreak };
  },
};
