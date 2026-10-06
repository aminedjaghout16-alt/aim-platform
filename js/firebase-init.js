/* ============================================
   Firebase Initialization
   ============================================ */
(function () {
  var cfg = window.VantageFirebaseConfig;
  if (!cfg || cfg.apiKey === 'YOUR_API_KEY_HERE') {
    console.warn('[Firebase] Configuration not set. Edit js/firebase-config.js with your Firebase project credentials.');
    window.VantageApp = window.VantageApp || {};
    window.VantageApp.firebaseReady = false;
    return;
  }

  try {
    firebase.initializeApp(cfg);
    window.VantageApp = window.VantageApp || {};
    window.VantageApp.firebaseReady = true;
    window.VantageApp.auth = firebase.auth();
    window.VantageApp.db = firebase.firestore();
    console.log('[Firebase] Initialized successfully');
  } catch (err) {
    console.error('[Firebase] Initialization failed:', err);
    window.VantageApp = window.VantageApp || {};
    window.VantageApp.firebaseReady = false;
  }
})();
