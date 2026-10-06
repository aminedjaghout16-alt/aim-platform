/* ============================================
   Auth Service — Real Firebase Authentication
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.AuthService = {
  _currentUser: null,
  _profileCache: {},
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      console.error('[AuthService] Firebase not initialized. Check js/firebase-config.js');
      return;
    }

    // Listen to Firebase auth state changes (persistent sessions)
    window.VantageApp.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Load or create user profile in Firestore
        var profile = await this._ensureProfile(firebaseUser);
        this._currentUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: profile.displayName || firebaseUser.displayName || 'Operator',
          photoURL: profile.photoURL || firebaseUser.photoURL || null,
          emailVerified: firebaseUser.emailVerified,
          createdAt: profile.createdAt || firebaseUser.metadata.creationTime,
          role: profile.role || 'user',
          settings: profile.settings || {},
        };
      } else {
        this._currentUser = null;
      }
      this._notify();
    });

    console.log('[AuthService] Initialized with Firebase Auth');
  },

  // Ensure a user profile document exists in Firestore
  async _ensureProfile(firebaseUser) {
    var db = window.VantageApp.db;
    var docRef = db.collection('users').doc(firebaseUser.uid);

    try {
      var doc = await docRef.get();
      if (doc.exists) {
        var data = doc.data();
        // Update last login
        await docRef.update({ lastLoginAt: new Date().toISOString() }).catch(function() {});
        return data;
      }
    } catch (err) {
      console.warn('[AuthService] Could not read profile:', err);
    }

    // Create new profile
    var newProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || 'Operator',
      photoURL: firebaseUser.photoURL || null,
      role: 'user',
      settings: {
        game: 'valorant',
        sensitivity: 0.35,
        dpi: 800,
        soundEnabled: true,
        showFPS: false,
      },
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    try {
      await docRef.set(newProfile);
    } catch (err) {
      console.warn('[AuthService] Could not create profile:', err);
    }

    return newProfile;
  },

  onAuthStateChanged(callback) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      callback(null);
      return function () {};
    }

    // Wrap Firebase's onAuthStateChanged to also pass our enriched user object
    var self = this;
    var unsub = window.VantageApp.auth.onAuthStateChanged(function () {
      // Small delay to let our internal handler update _currentUser first
      setTimeout(function () {
        callback(self._currentUser);
      }, 50);
    });
    return unsub;
  },

  async signInWithEmail(email, password) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured. Please set up your Firebase credentials in js/firebase-config.js');
    }

    try {
      var result = await window.VantageApp.auth.signInWithEmailAndPassword(email, password);
      // Wait for the auth state listener to populate _currentUser
      await this._waitForUser();
      return this._currentUser;
    } catch (err) {
      throw this._formatAuthError(err);
    }
  },

  async registerWithEmail(email, password, displayName) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured. Please set up your Firebase credentials in js/firebase-config.js');
    }

    try {
      var result = await window.VantageApp.auth.createUserWithEmailAndPassword(email, password);

      // Set display name on the Firebase user
      if (displayName && result.user) {
        await result.user.updateProfile({ displayName: displayName });
      }

      // Create profile in Firestore (the auth state listener will also do this)
      var db = window.VantageApp.db;
      await db.collection('users').doc(result.user.uid).set({
        uid: result.user.uid,
        email: email,
        displayName: displayName || 'Operator',
        photoURL: null,
        role: 'user',
        settings: {
          game: 'valorant',
          sensitivity: 0.35,
          dpi: 800,
          soundEnabled: true,
          showFPS: false,
        },
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });

      await this._waitForUser();
      return this._currentUser;
    } catch (err) {
      throw this._formatAuthError(err);
    }
  },

  async signInWithGoogle() {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured. Please set up your Firebase credentials in js/firebase-config.js');
    }

    try {
      var provider = new firebase.auth.GoogleAuthProvider();
      var result = await window.VantageApp.auth.signInWithPopup(provider);
      await this._waitForUser();
      return this._currentUser;
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in was cancelled.');
      }
      throw this._formatAuthError(err);
    }
  },

  async signOut() {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) return;

    try {
      await window.VantageApp.auth.signOut();
      this._currentUser = null;
      this._notify();
    } catch (err) {
      console.error('[AuthService] Sign out error:', err);
    }
  },

  async resetPassword(email) {
    if (!window.VantageApp || !window.VantageApp.firebaseReady) {
      throw new Error('Firebase is not configured.');
    }

    try {
      await window.VantageApp.auth.sendPasswordResetEmail(email);
    } catch (err) {
      throw this._formatAuthError(err);
    }
  },

  async updateProfile(updates) {
    if (!this._currentUser) throw new Error('Not authenticated');
    if (!window.VantageApp || !window.VantageApp.firebaseReady) return;

    var db = window.VantageApp.db;
    var uid = this._currentUser.uid;

    try {
      await db.collection('users').doc(uid).update(updates);
      // Update local state
      Object.assign(this._currentUser, updates);
      this._notify();
    } catch (err) {
      console.error('[AuthService] Update profile error:', err);
      throw err;
    }
  },

  async updateSettings(settings) {
    if (!this._currentUser) throw new Error('Not authenticated');
    if (!window.VantageApp || !window.VantageApp.firebaseReady) return;

    var db = window.VantageApp.db;
    var uid = this._currentUser.uid;

    try {
      await db.collection('users').doc(uid).update({ settings: settings });
      this._currentUser.settings = settings;
      this._notify();
    } catch (err) {
      console.error('[AuthService] Update settings error:', err);
      throw err;
    }
  },

  getCurrentUser() {
    return this._currentUser;
  },

  isAuthenticated() {
    return this._currentUser !== null;
  },

  // Wait for auth state listener to populate _currentUser after sign-in
  _waitForUser() {
    var self = this;
    return new Promise(function (resolve) {
      var attempts = 0;
      var interval = setInterval(function () {
        attempts++;
        if (self._currentUser || attempts > 40) {
          clearInterval(interval);
          resolve(self._currentUser);
        }
      }, 50);
    });
  },

  _formatAuthError(err) {
    var messages = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Contact support.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
      'auth/missing-email': 'Please enter your email address.',
    };
    var msg = messages[err.code];
    if (msg) return new Error(msg);
    return new Error(err.message || 'An authentication error occurred.');
  },

  _listeners: [],
  _notify() {
    this._listeners.forEach(function (cb) { cb(VantageServices.AuthService._currentUser); });
  },
};
