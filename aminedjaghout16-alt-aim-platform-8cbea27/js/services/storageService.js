/* ============================================
   Storage Service — Real Firebase Storage
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.StorageService = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      console.error('[StorageService] Firebase not initialized. Check js/firebase-config.js');
      return;
    }
    console.log('[StorageService] Initialized with Firebase Storage');
  },

  _storage() {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured. Please set up your Firebase credentials in js/firebase-config.js');
    }
    return window.VantageApp.storage;
  },

  async uploadFile(path, file) {
    var storage = this._storage();
    var ref = storage.ref(path);
    var snapshot = await ref.put(file);
    var url = await snapshot.ref.getDownloadURL();
    return { path: path, url: url };
  },

  async getDownloadURL(path) {
    var storage = this._storage();
    try {
      var url = await storage.ref(path).getDownloadURL();
      return url;
    } catch (err) {
      if (err.code === 'storage/object-not-found') return null;
      throw err;
    }
  },

  async deleteFile(path) {
    var storage = this._storage();
    await storage.ref(path).delete();
  },

  async uploadAvatar(userId, file) {
    // Use a fixed name so we can always retrieve it consistently
    var ext = file.name.split('.').pop() || 'jpg';
    var path = 'avatars/' + userId + '/avatar.' + ext;
    var result = await this.uploadFile(path, file);

    // Also update the user's profile with the photo URL
    try {
      var db = window.VantageApp.db;
      await db.collection('users').doc(userId).update({ photoURL: result.url });
    } catch (err) {
      console.warn('[StorageService] Could not update profile photoURL:', err);
    }

    return result;
  },

  async getAvatarURL(userId) {
    var storage = this._storage();
    try {
      // Try to find any avatar file for this user
      var list = await storage.ref('avatars/' + userId).listAll();
      if (list.items.length > 0) {
        return await list.items[0].getDownloadURL();
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  // Upload with progress tracking
  uploadFileWithProgress(path, file, onProgress) {
    var storage = this._storage();
    var ref = storage.ref(path);
    var task = ref.put(file);

    return new Promise(function (resolve, reject) {
      task.on('state_changed',
        function (snapshot) {
          var progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        },
        function (err) { reject(err); },
        function () {
          task.snapshot.ref.getDownloadURL().then(function (url) {
            resolve({ path: path, url: url });
          });
        }
      );
    });
  },
};
