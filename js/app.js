/* ============================================
   Vantage App — Main entry, routing, auth guards
   ============================================ */
(function() {
  const { useState, useEffect, useCallback, useRef } = React;
  const e = React.createElement;

  // Initialize services
  VantageServices.AuthService.init();
  VantageServices.DatabaseService.init();

  // Pages that require authentication
  const PROTECTED_PAGES = ['dashboard', 'training', 'details', 'setup', 'weaponselect', 'gameplay', 'results', 'stats', 'profile', 'settings', 'playlist', 'leaderboard'];
  // Pages that should redirect to dashboard if already logged in
  const AUTH_PAGES = ['login', 'register'];

  function App() {
    const [page, setPage] = useState(null); // null = waiting for auth
    const [pageParam, setPageParam] = useState(null);
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [trainingConfig, setTrainingConfig] = useState(null);
    const [latestResultId, setLatestResultId] = useState(null);
    const [pendingWeaponSelect, setPendingWeaponSelect] = useState(null); // { scenarioId, config }
    const [activePlaylist, setActivePlaylist] = useState(null); // { items: [...], currentIndex: 0, results: [] }

    // Auth listener — persistent sessions via Firebase
    useEffect(() => {
      const unsub = VantageServices.AuthService.onAuthStateChanged((u) => {
        setUser(u);
        setAuthLoading(false);
        // Set initial page based on auth state
        if (u) {
          setPage('dashboard');
        } else {
          setPage('login');
        }
      });
      return unsub;
    }, []);

    // Auth guard: redirect based on auth state
    useEffect(() => {
      if (authLoading || page === null) return;

      // If user is authenticated and on login/register, redirect to dashboard
      if (user && AUTH_PAGES.includes(page)) {
        setPage('dashboard');
        return;
      }

      // If user is not authenticated and on a protected page, redirect to login
      if (!user && PROTECTED_PAGES.includes(page)) {
        setPage('login');
        return;
      }
    }, [user, authLoading, page]);

    const navigate = useCallback((pageName, param) => {
      setPage(pageName);
      setPageParam(param || null);
      window.scrollTo(0, 0);
    }, []);

    const handleLogin = useCallback((userData) => {
      setUser(userData);
    }, []);

    const handleLogout = useCallback(async () => {
      try {
        await VantageServices.AuthService.signOut();
        setUser(null);
        setPage('landing');
      } catch (err) {
        console.error('Logout error:', err);
      }
    }, []);

    const handleSelectScenario = useCallback((scenarioId) => {
      setSelectedScenario(scenarioId);
      navigate('details', scenarioId);
    }, [navigate]);

    const handleStartSetup = useCallback((scenarioId) => {
      setSelectedScenario(scenarioId);
      navigate('setup', scenarioId);
    }, [navigate]);

    const handleStartTraining = useCallback((scenarioId, config) => {
      try {
        window.localStorage.setItem('vantage.trainingConfig.' + scenarioId, JSON.stringify(config || {}));
      } catch (err) { /* storage unavailable */ }
      setSelectedScenario(scenarioId);
      setTrainingConfig(config);
      // Navigate to weapon selection before gameplay
      setPendingWeaponSelect({ scenarioId: scenarioId, config: config });
      navigate('weaponselect', scenarioId);
    }, [navigate]);

    const handleWeaponSelected = useCallback(function (weaponId) {
      // Weapon is saved to prefs by the WeaponSelect page itself
    }, []);

    const handleWeaponConfirmed = useCallback(function () {
      var p = pendingWeaponSelect;
      if (!p) return;
      navigate('gameplay', p.scenarioId);
    }, [navigate, pendingWeaponSelect]);

    const handleQuickStart = useCallback((scenarioId) => {
      handleStartTraining(scenarioId, VantagePages.getSavedConfig(scenarioId));
    }, [handleStartTraining]);

    // Save training result to Firestore
    const handleSaveResult = useCallback(async (result) => {
      if (!user) return { previousBest: null, isPersonalBest: false };

      const uid = user.uid;
      const DB = VantageServices.DatabaseService;
      let previousBest = null;
      try {
        const previous = (await DB.getUserResults(uid)).filter(r => r.scenarioId === result.scenarioId);
        if (previous.length) previousBest = Math.max(...previous.map(r => r.score));
      } catch (err) { console.warn('Could not check previous best:', err); }

      const saved = await DB.saveTrainingResult(uid, { ...result, userId: uid });
      setLatestResultId(saved.id);

      // Submit to leaderboard (fire-and-forget, don't block the UI)
      try {
        await DB.submitLeaderboardEntry(uid, {
          scenarioId: result.scenarioId,
          score: result.score,
          accuracy: result.stats ? result.stats.accuracy : 0,
          grade: result.grade,
          weaponId: result.config ? result.config.weaponId : null,
          displayName: user.displayName || 'Operator',
        });
      } catch (err) {
        console.error('Could not submit leaderboard entry:', err && err.code, err && err.message, err);
      }

      return { previousBest, isPersonalBest: previousBest === null || result.score > previousBest };
    }, [user]);

    const handleFinishTraining = useCallback(() => {
      navigate('results');
    }, [navigate]);

    // Playlist handlers
    const handleCreatePlaylist = useCallback((playlistItems) => {
      setActivePlaylist({
        items: playlistItems,
        currentIndex: 0,
        results: [],
      });
      // Start the first exercise
      const firstItem = playlistItems[0];
      const config = { duration: firstItem.duration, difficulty: firstItem.difficulty || 'medium' };
      setSelectedScenario(firstItem.id);
      setTrainingConfig(config);
      setPendingWeaponSelect({ scenarioId: firstItem.id, config: config });
      navigate('weaponselect', firstItem.id);
    }, [navigate]);

    const handlePlaylistExerciseComplete = useCallback((result) => {
      if (!activePlaylist) return;
      // Guard: if already past the end, ignore duplicate calls
      if (activePlaylist.currentIndex >= activePlaylist.items.length) return;
      
      const newResults = [...activePlaylist.results, result];
      const nextIndex = activePlaylist.currentIndex + 1;
      
      // Always advance currentIndex — PlaylistPage uses it to detect completion
      setActivePlaylist({
        ...activePlaylist,
        currentIndex: nextIndex,
        results: newResults,
      });
      navigate('playlist');
    }, [activePlaylist, navigate]);

    const handleStartNextPlaylistExercise = useCallback(() => {
      if (!activePlaylist) return;
      
      const currentItem = activePlaylist.items[activePlaylist.currentIndex];
      const config = { duration: currentItem.duration, difficulty: currentItem.difficulty || 'medium' };
      setSelectedScenario(currentItem.id);
      setTrainingConfig(config);
      setPendingWeaponSelect({ scenarioId: currentItem.id, config: config });
      navigate('weaponselect', currentItem.id);
    }, [activePlaylist, navigate]);

    const handleExitPlaylist = useCallback(() => {
      setActivePlaylist(null);
      navigate('training');
    }, [navigate]);

    // Show loading screen while checking auth state
    if (authLoading || page === null) {
      return e('div', { className: 'vlanding' },
        e('div', { style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', flexDirection: 'column', gap: '16px',
        }},
          e('span', { style: { fontSize: '48px', color: 'var(--accent-primary)' } }, '▽'),
          e('span', { style: { color: 'var(--text-secondary)', fontSize: '14px', letterSpacing: '2px' } }, 'LOADING...'),
        ),
      );
    }

    // Full-screen pages (no sidebar/topbar)
    const fullScreenPages = ['landing', 'login', 'register', 'gameplay', 'weaponselect'];

    const renderPage = () => {
      switch (page) {
        case 'landing':
          return e(VantagePages.Landing, { onNavigate: navigate, user: user });
        case 'login':
          return e(VantagePages.Login, { onNavigate: navigate, onLogin: handleLogin });
        case 'register':
          return e(VantagePages.Register, { onNavigate: navigate, onLogin: handleLogin });
        case 'dashboard':
          return e(VantagePages.Dashboard, { onNavigate: navigate, user: user });
        case 'training':
          return e(VantagePages.TrainingLibrary, {
            onNavigate: navigate,
            onSelectScenario: handleSelectScenario,
            onQuickStart: handleQuickStart,
            onCreatePlaylist: handleCreatePlaylist,
            user: user,
          });
        case 'details':
          return e(VantagePages.TrainingDetails, {
            scenarioId: pageParam || selectedScenario,
            onNavigate: navigate,
            onStartSetup: handleStartSetup,
            onQuickStart: handleQuickStart,
          });
        case 'setup':
          return e(VantagePages.TrainingSetup, {
            scenarioId: pageParam || selectedScenario,
            onNavigate: navigate,
            onStartTraining: handleStartTraining,
          });
        case 'weaponselect':
          return e(VantagePages.WeaponSelect, {
            onNavigate: navigate,
            onSelect: handleWeaponSelected,
            scenarioId: pageParam || selectedScenario,
            config: trainingConfig || {},
          });
        case 'gameplay':
          return e(VantagePages.TrainingGameplay, {
            scenarioId: pageParam || selectedScenario,
            config: trainingConfig || {},
            onNavigate: navigate,
            onFinish: handleFinishTraining,
            onSaveResult: handleSaveResult,
            activePlaylist: activePlaylist,
            onPlaylistExerciseComplete: handlePlaylistExerciseComplete,
          });
        case 'results':
          return e(VantagePages.Results, { onNavigate: navigate, user: user, latestResultId: latestResultId, onQuickStart: handleQuickStart });
        case 'playlist':
          return e(VantagePages.PlaylistPage, { 
            activePlaylist: activePlaylist,
            onStartNext: handleStartNextPlaylistExercise,
            onExit: handleExitPlaylist,
            onNavigate: navigate,
          });
        case 'stats':
          return e(VantagePages.Statistics, { onNavigate: navigate, user: user });
        case 'profile':
          return e(VantagePages.Profile, { user: user, onNavigate: navigate, onLogout: handleLogout });
        case 'settings':
          return e(VantagePages.Settings, { onNavigate: navigate, user: user, onLogout: handleLogout });
        case 'leaderboard':
          return e(VantagePages.Leaderboard, { onNavigate: navigate, user: user });
        default:
          return e(VantagePages.Dashboard, { onNavigate: navigate, user: user });
      }
    };

    if (fullScreenPages.includes(page)) {
      var wrapperClass = page === 'gameplay' ? 'vapp-fullscreen' : 'vapp-fullscreen-scroll';
      return e('div', { className: wrapperClass }, renderPage());
    }

    return e(VantageComponents.Layout, {
      currentPage: page,
      onNavigate: navigate,
      user: user,
      onLogout: handleLogout,
    }, renderPage());
  }

  // Mount
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(e(App));
})();
