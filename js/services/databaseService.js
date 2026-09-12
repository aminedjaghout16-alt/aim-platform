/* ============================================
   Database Service — Firestore stub
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.DatabaseService = {
  _collections: {},

  init() {
    console.log('[DatabaseService] Initialized — Firebase not configured');
  },

  // Generic collection reference
  collection(name) {
    if (!this._collections[name]) {
      this._collections[name] = [];
    }
    return {
      add: async (data) => {
        const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const doc = { id, ...data, createdAt: new Date().toISOString() };
        this._collections[name].push(doc);
        console.log(`[DB] Added to ${name}:`, doc.id);
        return doc;
      },
      get: async (id) => {
        return this._collections[name].find(d => d.id === id) || null;
      },
      where: async (field, op, value) => {
        return this._collections[name].filter(d => {
          if (op === '==') return d[field] === value;
          if (op === '>') return d[field] > value;
          if (op === '<') return d[field] < value;
          return true;
        });
      },
      getAll: async () => {
        return [...this._collections[name]];
      },
      update: async (id, data) => {
        const idx = this._collections[name].findIndex(d => d.id === id);
        if (idx >= 0) {
          this._collections[name][idx] = { ...this._collections[name][idx], ...data };
          console.log(`[DB] Updated ${name}/${id}`);
          return this._collections[name][idx];
        }
        return null;
      },
      delete: async (id) => {
        this._collections[name] = this._collections[name].filter(d => d.id !== id);
        console.log(`[DB] Deleted ${name}/${id}`);
      },
    };
  },

  // Convenience methods for common operations
  async saveTrainingResult(userId, result) {
    return this.collection('results').add({ userId, ...result });
  },

  async getUserResults(userId) {
    return this.collection('results').where('userId', '==', userId);
  },

  async getUserStats(userId) {
    const results = await this.getUserResults(userId);
    // TODO: Compute aggregate stats
    return {
      totalSessions: results.length,
      averageScore: 0,
      bestScore: 0,
      totalTime: 0,
    };
  },

  async saveUserProfile(userId, profile) {
    return this.collection('profiles').add({ userId, ...profile });
  },

  async getUserProfile(userId) {
    const profiles = await this.collection('profiles').where('userId', '==', userId);
    return profiles[0] || null;
  },
};
