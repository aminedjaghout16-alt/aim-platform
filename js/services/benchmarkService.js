/* ============================================
   Benchmark Service — Firebase persistence
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.BenchmarkService = {
  _initialized: false,

  init() {
    this._initialized = true;
  },

  _db() {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured.');
    }
    return window.VantageApp.db;
  },

  // Save a completed benchmark attempt
  async saveBenchmark(userId, benchmarkData) {
    var db = this._db();
    var docData = {
      userId: userId,
      benchmarkVersion: benchmarkData.benchmarkVersion || '1.0',
      scoringVersion: benchmarkData.scoringVersion || '1.0',
      overallScore: Math.max(0, Math.min(1000, Math.round(benchmarkData.overallScore || 0))),
      rank: benchmarkData.rank || 'unranked',
      rankName: benchmarkData.rankName || 'Unranked',
      rankColor: benchmarkData.rankColor || '#555a6e',
      categoryScores: benchmarkData.categoryScores || {},
      stageResults: benchmarkData.stageResults || {},
      bestCategory: benchmarkData.bestCategory || null,
      worstCategory: benchmarkData.worstCategory || null,
      duration: benchmarkData.duration || 0,
      status: 'completed',
      timestamp: benchmarkData.timestamp || new Date().toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    var ref = await db.collection('benchmarks').add(docData);
    return { id: ref.id, ...docData };
  },

  // Save an incomplete attempt (for resume/abandon tracking)
  async saveIncompleteAttempt(userId, attemptData) {
    var db = this._db();
    var docData = {
      userId: userId,
      benchmarkVersion: attemptData.benchmarkVersion || '1.0',
      status: 'incomplete',
      currentStageIndex: attemptData.currentStageIndex || 0,
      stageResults: attemptData.stageResults || {},
      startedAt: attemptData.startedAt || new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    var ref = await db.collection('benchmarkAttempts').add(docData);
    return { id: ref.id, ...docData };
  },

  // Update an incomplete attempt
  async updateIncompleteAttempt(attemptId, userId, updates) {
    var db = this._db();
    // Verify ownership
    var doc = await db.collection('benchmarkAttempts').doc(attemptId).get();
    if (!doc.exists || doc.data().userId !== userId) {
      throw new Error('Attempt not found or access denied.');
    }
    updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('benchmarkAttempts').doc(attemptId).update(updates);
    return { id: attemptId, ...updates };
  },

  // Delete an incomplete attempt
  async deleteIncompleteAttempt(attemptId, userId) {
    var db = this._db();
    var doc = await db.collection('benchmarkAttempts').doc(attemptId).get();
    if (doc.exists && doc.data().userId === userId) {
      await db.collection('benchmarkAttempts').doc(attemptId).delete();
    }
  },

  // Get latest incomplete attempt
  async getLatestIncompleteAttempt(userId) {
    var db = this._db();
    var snap = await db.collection('benchmarkAttempts')
      .where('userId', '==', userId)
      .where('status', '==', 'incomplete')
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // Get all completed benchmarks for a user
  async getUserBenchmarks(userId) {
    var db = this._db();
    var snap = await db.collection('benchmarks')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('timestamp', 'desc')
      .get();
    var results = [];
    snap.forEach(function(doc) {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  },

  // Get a specific benchmark by ID
  async getBenchmarkById(benchmarkId) {
    var db = this._db();
    var doc = await db.collection('benchmarks').doc(benchmarkId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  // Get the latest completed benchmark
  async getLatestBenchmark(userId) {
    var db = this._db();
    var snap = await db.collection('benchmarks')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // Get the highest scoring benchmark
  async getBestBenchmark(userId) {
    var db = this._db();
    var snap = await db.collection('benchmarks')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('overallScore', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // Get the previous completed benchmark (second most recent)
  async getPreviousBenchmark(userId) {
    var db = this._db();
    var snap = await db.collection('benchmarks')
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('timestamp', 'desc')
      .limit(2)
      .get();
    if (snap.size < 2) return null;
    var doc = snap.docs[1];
    return { id: doc.id, ...doc.data() };
  },

  // Get benchmark summary (latest, best, previous)
  async getBenchmarkSummary(userId) {
    try {
      var results = await this.getUserBenchmarks(userId);
      if (results.length === 0) {
        return {
          latest: null,
          best: null,
          previous: null,
          totalAttempts: 0,
          currentRank: null,
          highestRank: null,
        };
      }

      var latest = results[0]; // Already sorted desc by timestamp
      var best = results.reduce(function(prev, curr) {
        return (curr.overallScore > prev.overallScore) ? curr : prev;
      }, results[0]);
      var previous = results.length > 1 ? results[1] : null;

      // Highest rank achieved
      var highestRankScore = best.overallScore;
      var highestRank = VantageEngine.BenchmarkConfig.getRankForScore(highestRankScore);
      var currentRank = VantageEngine.BenchmarkConfig.getRankForScore(latest.overallScore);

      return {
        latest: latest,
        best: best,
        previous: previous,
        totalAttempts: results.length,
        currentRank: currentRank,
        highestRank: highestRank,
      };
    } catch (err) {
      console.error('[BenchmarkService] getBenchmarkSummary error:', err);
      return {
        latest: null, best: null, previous: null,
        totalAttempts: 0, currentRank: null, highestRank: null,
        error: err.message || 'Failed to load benchmark data',
      };
    }
  },
};
