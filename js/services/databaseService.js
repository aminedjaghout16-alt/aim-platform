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
      }, function (err) {
        console.error('[DatabaseService] onResultsChanged error:', err);
        callback([]);
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

  // ─── Saved Playlists ─────────────────────────────────

  async savePlaylist(userId, playlist) {
    var db = this._db();
    var docData = {
      userId: userId,
      name: playlist.name || 'Untitled Playlist',
      items: playlist.items || [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    var ref = await db.collection('playlists').add(docData);
    return { id: ref.id, ...docData };
  },

  async getUserPlaylists(userId) {
    var db = this._db();
    var snap = await db.collection('playlists')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    var playlists = [];
    snap.forEach(function (doc) {
      playlists.push({ id: doc.id, ...doc.data() });
    });
    return playlists;
  },

  async deletePlaylist(playlistId, userId) {
    var db = this._db();
    var doc = await db.collection('playlists').doc(playlistId).get();
    if (doc.exists && doc.data().userId === userId) {
      await db.collection('playlists').doc(playlistId).delete();
    }
  },

  // Local storage fallback for non-logged-in users
  getLocalPlaylists() {
    try {
      var data = localStorage.getItem('vantage.playlists');
      return data ? JSON.parse(data) : [];
    } catch (err) {
      return [];
    }
  },

  saveLocalPlaylist(playlist) {
    try {
      var playlists = this.getLocalPlaylists();
      playlist.id = 'local_' + Date.now();
      playlist.createdAt = new Date().toISOString();
      playlists.unshift(playlist);
      localStorage.setItem('vantage.playlists', JSON.stringify(playlists));
      return playlist;
    } catch (err) {
      return null;
    }
  },

  deleteLocalPlaylist(playlistId) {
    try {
      var playlists = this.getLocalPlaylists();
      playlists = playlists.filter(function(p) { return p.id !== playlistId; });
      localStorage.setItem('vantage.playlists', JSON.stringify(playlists));
    } catch (err) {}
  },

  // ─── Leaderboards ──────────────────────────────────────

  // Submit or update a leaderboard entry for a scenario.
  // Only writes if the new score beats the existing best for this user.
  async submitLeaderboardEntry(userId, entry) {
    var db = this._db();
    var scenarioId = entry.scenarioId;
    if (!scenarioId) throw new Error('scenarioId is required');

    var entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');
    var userEntryRef = entriesCol.doc(userId);

    // Use a transaction to ensure we only overwrite if the new score is higher
    return db.runTransaction(async function (transaction) {
      var existingDoc = await transaction.get(userEntryRef);
      var existingScore = existingDoc.exists ? (existingDoc.data().score || 0) : -1;

      if (existingDoc.exists && entry.score <= existingScore) {
        // Current score is not better — skip the write
        return { updated: false, reason: 'score_not_better' };
      }

      var docData = {
        userId: userId,
        displayName: entry.displayName || 'Operator',
        score: entry.score || 0,
        accuracy: entry.accuracy || 0,
        scenarioId: scenarioId,
        weaponId: entry.weaponId || null,
        grade: entry.grade || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      transaction.set(userEntryRef, docData);
      return { updated: true, entry: docData };
    });
  },

  // Get top N entries for a scenario, ordered by score descending
  async getLeaderboardTop(scenarioId, limit, timeRange) {
    var db = this._db();
    var entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');

    var query = entriesCol.orderBy('score', 'desc');

    // Apply time filter if specified
    if (timeRange === 'week') {
      var weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      // Note: createdAt is a server timestamp, so we filter client-side after fetch
      // Firestore doesn't allow filtering on serverTimestamp directly in queries
    }

    query = query.limit(limit || 50);
    var snap = await query.get();

    var entries = [];
    snap.forEach(function (doc) {
      var data = doc.data();
      // Client-side time filter for "this week"
      if (timeRange === 'week' && data.createdAt) {
        var entryDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        var weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (entryDate < weekAgo) return;
      }
      entries.push({ id: doc.id, ...data });
    });

    return entries;
  },

  // Get a specific user's entry for a scenario
  async getUserLeaderboardEntry(userId, scenarioId) {
    var db = this._db();
    var entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');
    var doc = await entriesCol.doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  // Get the rank of a user in a scenario (1-indexed)
  async getUserLeaderboardRank(userId, scenarioId) {
    var db = this._db();
    var entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');

    // First get the user's score
    var userDoc = await entriesCol.doc(userId).get();
    if (!userDoc.exists) return null;
    var userScore = userDoc.data().score || 0;

    // Count how many entries have a higher score
    var betterSnap = await entriesCol
      .where('score', '>', userScore)
      .get();

    return betterSnap.size + 1;
  },
};
