/* ============================================
   Database Service — Real Firestore
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.DatabaseService = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      console.error('[DatabaseService] Firebase not initialized. Check js/firebase-config.js');
      return;
    }
    console.log('[DatabaseService] Initialized with Firestore');
  },

  _db() {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured. Please set up your Firebase credentials in js/firebase-config.js');
    }
    return window.VantageApp.db;
  },

  // ─── Training Results ────────────────────────────────

  async saveTrainingResult(userId, result) {
    var db = this._db();
    var docData = {
      userId: userId,
      scenarioId: result.scenarioId || '',
      score: result.score || 0,
      grade: result.grade || 'F',
      stats: result.stats || {},
      config: result.config || {},
      breakdown: result.breakdown || {},
      timestamp: result.timestamp || new Date().toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    var ref = await db.collection('results').add(docData);
    return { id: ref.id, ...docData };
  },

  async getUserResults(userId) {
    var db = this._db();
    var snap = await db.collection('results')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();
    var results = [];
    snap.forEach(function (doc) {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  },

  async getResultById(resultId) {
    var db = this._db();
    var doc = await db.collection('results').doc(resultId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async deleteResult(resultId, userId) {
    var db = this._db();
    var doc = await db.collection('results').doc(resultId).get();
    if (doc.exists && doc.data().userId === userId) {
      await db.collection('results').doc(resultId).delete();
    }
  },

  // ─── User Stats ──────────────────────────────────────

  async getUserStats(userId) {
    var results = await this.getUserResults(userId);
    if (!results.length) {
      return {
        totalSessions: 0,
        averageScore: 0,
        bestScore: 0,
        totalTime: 0,
        averageAccuracy: 0,
        averageReactionTime: 0,
        totalHits: 0,
        totalMisses: 0,
      };
    }

    var totalSessions = results.length;
    var totalScore = results.reduce(function (s, r) { return s + (r.score || 0); }, 0);
    var bestScore = Math.max.apply(null, results.map(function (r) { return r.score || 0; }));
    var totalTime = results.reduce(function (s, r) { return s + ((r.stats && r.stats.duration) || 0); }, 0);
    var totalHits = results.reduce(function (s, r) { return s + ((r.stats && r.stats.hits) || 0); }, 0);
    var totalMisses = results.reduce(function (s, r) { return s + ((r.stats && r.stats.misses) || 0); }, 0);
    var avgAccuracy = Math.round(results.reduce(function (s, r) { return s + ((r.stats && r.stats.accuracy) || 0); }, 0) / totalSessions);
    var avgReaction = Math.round(results.reduce(function (s, r) { return s + ((r.stats && r.stats.avgReactionTime) || 0); }, 0) / totalSessions);

    return {
      totalSessions: totalSessions,
      averageScore: Math.round(totalScore / totalSessions),
      bestScore: bestScore,
      totalTime: totalTime,
      averageAccuracy: avgAccuracy,
      averageReactionTime: avgReaction,
      totalHits: totalHits,
      totalMisses: totalMisses,
    };
  },

  // ─── User Profile ────────────────────────────────────

  async getUserProfile(userId) {
    var db = this._db();
    var doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async saveUserProfile(userId, profile) {
    var db = this._db();
    await db.collection('users').doc(userId).update(profile);
    return profile;
  },

  // ─── User Settings ───────────────────────────────────

  async getUserSettings(userId) {
    var db = this._db();
    var doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return {};
    return doc.data().settings || {};
  },

  async saveUserSettings(userId, settings) {
    var db = this._db();
    await db.collection('users').doc(userId).update({ settings: settings });
    return settings;
  },

  // ─── Real-time listeners ─────────────────────────────

  onResultsChanged(userId, callback) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) return function () {};
    var db = window.VantageApp.db;
    return db.collection('results')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .onSnapshot(function (snap) {
        var results = [];
        snap.forEach(function (doc) {
          results.push({ id: doc.id, ...doc.data() });
        });
        callback(results);
      });
  },

  onProfileChanged(userId, callback) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) return function () {};
    var db = window.VantageApp.db;
    return db.collection('users').doc(userId).onSnapshot(function (doc) {
      if (doc.exists) {
        callback({ id: doc.id, ...doc.data() });
      }
    });
  },

  // ─── Category performance stats ──────────────────────

  async getCategoryStats(userId) {
    var results = await this.getUserResults(userId);
    var categories = {};

    results.forEach(function (r) {
      var scenario = null;
      if (window.VantageEngine && window.VantageEngine.Scenarios) {
        scenario = window.VantageEngine.Scenarios.getById(r.scenarioId);
      }
      var catId = scenario ? scenario.category : 'unknown';
      if (!categories[catId]) {
        categories[catId] = { totalScore: 0, count: 0, bestScore: 0 };
      }
      categories[catId].totalScore += r.score || 0;
      categories[catId].count += 1;
      if ((r.score || 0) > categories[catId].bestScore) {
        categories[catId].bestScore = r.score || 0;
      }
    });

    return categories;
  },

  // ─── Recent results (limited) ────────────────────────

  async getRecentResults(userId, limit) {
    var db = this._db();
    var snap = await db.collection('results')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit || 10)
      .get();
    var results = [];
    snap.forEach(function (doc) {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  },
};
