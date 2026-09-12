/* ============================================
   Auth Service — Firebase Auth stub
   ============================================ */
window.VantageServices = window.VantageServices || {};

VantageServices.AuthService = {
  _currentUser: null,
  _listeners: [],

  // Placeholder user for development
  _mockUser: {
    uid: 'dev-user-001',
    displayName: 'Operator',
    email: 'operator@vantage.gg',
    photoURL: null,
    createdAt: new Date().toISOString(),
    settings: {
      sensitivity: 3.5,
      game: 'valorant',
      mouseDPI: 800,
    },
  },

  init() {
    console.log('[AuthService] Initialized — Firebase not configured');
  },

  onAuthStateChanged(callback) {
    this._listeners.push(callback);
    // Immediately fire with current state
    callback(this._currentUser);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  },

  async signInWithEmail(email, password) {
    // TODO: Replace with firebase.auth().signInWithEmailAndPassword()
    console.log('[AuthService] signInWithEmail stub:', email);
    this._currentUser = { ...this._mockUser, email };
    this._notify();
    return this._currentUser;
  },

  async registerWithEmail(email, password, displayName) {
    // TODO: Replace with firebase.auth().createUserWithEmailAndPassword()
    console.log('[AuthService] registerWithEmail stub:', email, displayName);
    this._currentUser = { ...this._mockUser, email, displayName };
    this._notify();
    return this._currentUser;
  },

  async signInWithGoogle() {
    // TODO: Replace with firebase.auth().signInWithPopup(googleProvider)
    console.log('[AuthService] signInWithGoogle stub');
    this._currentUser = this._mockUser;
    this._notify();
    return this._currentUser;
  },

  async signOut() {
    // TODO: Replace with firebase.auth().signOut()
    console.log('[AuthService] signOut stub');
    this._currentUser = null;
    this._notify();
  },

  async resetPassword(email) {
    // TODO: Replace with firebase.auth().sendPasswordResetEmail()
    console.log('[AuthService] resetPassword stub:', email);
  },

  getCurrentUser() {
    return this._currentUser;
  },

  isAuthenticated() {
    return this._currentUser !== null;
  },

  _notify() {
    this._listeners.forEach(cb => cb(this._currentUser));
  },
};
