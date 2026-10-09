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

  // Get ISO week ID for a date (format: "2026-W41")
  _getWeekId(date) {
    var d = date || new Date();
    // ISO-8601 week in UTC (Thursday of the week decides the year)
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var dayNr = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayNr + 3);
    var isoYear = t.getUTCFullYear();
    var firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    var fDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
    var weekNumber = 1 + Math.round((t - firstThursday) / 604800000);
    return isoYear + '-W' + (weekNumber < 10 ? '0' : '') + weekNumber;
  },

  // Submit or update a leaderboard entry for a scenario.
  // Writes to both all-time and current week's bucket.
  async submitLeaderboardEntry(userId, entry) {
    var db = this._db();
    var scenarioId = entry.scenarioId;
    if (!scenarioId) throw new Error('scenarioId is required');

    var weekId = this._getWeekId();
    var allTimeRef = db.collection('leaderboards').doc(scenarioId).collection('entries').doc(userId);
    var weeklyRef = db.collection('leaderboards').doc(scenarioId).collection('weeks').doc(weekId).collection('entries').doc(userId);

    // The security rules require displayName to equal users/{uid}.displayName,
    // so always read it from the profile doc instead of trusting client state.
    var profileName = null;
    try {
      var profileDoc = await db.collection('users').doc(userId).get();
      if (profileDoc.exists) profileName = profileDoc.data().displayName;
    } catch (e) { console.warn('Could not read profile for leaderboard name:', e); }

    var docData = {
      userId: userId,
      displayName: profileName || entry.displayName || 'Operator',
      score: Math.max(0, Math.min(1000, Math.round(entry.score || 0))),
      accuracy: Math.max(0, Math.min(100, Math.round(entry.accuracy || 0))),
      scenarioId: scenarioId,
      weaponId: entry.weaponId || null,
      grade: entry.grade || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Use a transaction to ensure we only overwrite if the new score is higher
    return db.runTransaction(async function (transaction) {
      // Check all-time entry
      var allTimeDoc = await transaction.get(allTimeRef);
      var allTimeScore = allTimeDoc.exists ? (allTimeDoc.data().score || 0) : -1;

      // Check weekly entry
      var weeklyDoc = await transaction.get(weeklyRef);
      var weeklyScore = weeklyDoc.exists ? (weeklyDoc.data().score || 0) : -1;

      // Only write if the new score beats at least one of them
      if (allTimeDoc.exists && docData.score <= allTimeScore &&
          weeklyDoc.exists && docData.score <= weeklyScore) {
        return { updated: false, reason: 'score_not_better' };
      }

      // Write to all-time if it's a new best
      if (!allTimeDoc.exists || docData.score > allTimeScore) {
        transaction.set(allTimeRef, docData);
      }

      // Write to weekly if it's a new best for this week
      if (!weeklyDoc.exists || docData.score > weeklyScore) {
        transaction.set(weeklyRef, docData);
      }

      return { updated: true, entry: docData };
    });
  },

  // Get top N entries for a scenario, ordered by score descending
  async getLeaderboardTop(scenarioId, limit, timeRange) {
    var db = this._db();
    var entriesCol;

    if (timeRange === 'week') {
      // Query the current week's bucket
      var weekId = this._getWeekId();
      entriesCol = db.collection('leaderboards').doc(scenarioId)
        .collection('weeks').doc(weekId).collection('entries');
    } else {
      // Query all-time
      entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');
    }

    var query = entriesCol.orderBy('score', 'desc').limit(limit || 50);
    var snap = await query.get();

    var entries = [];
    snap.forEach(function (doc) {
      entries.push({ id: doc.id, ...doc.data() });
    });

    return entries;
  },

  // Get a specific user's entry for a scenario
  async getUserLeaderboardEntry(userId, scenarioId, timeRange) {
    var db = this._db();
    var entriesCol;

    if (timeRange === 'week') {
      var weekId = this._getWeekId();
      entriesCol = db.collection('leaderboards').doc(scenarioId)
        .collection('weeks').doc(weekId).collection('entries');
    } else {
      entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');
    }

    var doc = await entriesCol.doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  // Get the rank of a user in a scenario (1-indexed)
  async getUserLeaderboardRank(userId, scenarioId, timeRange) {
    var db = this._db();
    var entriesCol;

    if (timeRange === 'week') {
      var weekId = this._getWeekId();
      entriesCol = db.collection('leaderboards').doc(scenarioId)
        .collection('weeks').doc(weekId).collection('entries');
    } else {
      entriesCol = db.collection('leaderboards').doc(scenarioId).collection('entries');
    }

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
