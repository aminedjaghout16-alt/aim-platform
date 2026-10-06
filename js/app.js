/* ============================================
   Vantage App — Main entry, routing, auth guards
   ============================================ */
(function() {
  const { useState, useEffect, useCallback, useRef } = React;
  const e = React.createElement;

  // Initialize services
  VantageServices.AuthService.init();
  VantageServices.DatabaseService.init();
  VantageServices.StorageService.init();

  // Pages that require authentication
  const PROTECTED_PAGES = ['dashboard', 'training', 'details', 'setup', 'gameplay', 'results', 'stats', 'profile', 'settings'];
  // Pages that should redirect to dashboard if already logged in
  const AUTH_PAGES = ['login', 'register'];

  function App() {
    const [page, setPage] = useState('landing');
    const [pageParam, setPageParam] = useState(null);
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [trainingConfig, setTrainingConfig] = useState(null);
    const [latestResultId, setLatestResultId] = useState(null);

    // Auth listener — persistent sessions via Firebase
    useEffect(() => {
      const unsub = VantageServices.AuthService.onAuthStateChanged((u) => {
        setUser(u);
        setAuthLoading(false);
      });
      return unsub;
    }, []);

    // Auth guard: redirect based on auth state
    useEffect(() => {
      if (authLoading) return;

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
      navigate('gameplay', scenarioId);
    }, [navigate]);

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
      return { previousBest, isPersonalBest: previousBest === null || result.score > previousBest };
    }, [user]);

    const handleFinishTraining = useCallback(() => {
      navigate('results');
    }, [navigate]);

    // Show loading screen while checking auth state
    if (authLoading) {
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
    const fullScreenPages = ['landing', 'login', 'register', 'gameplay'];

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
        case 'gameplay':
          return e(VantagePages.TrainingGameplay, {
            scenarioId: pageParam || selectedScenario,
            config: trainingConfig || {},
            onNavigate: navigate,
            onFinish: handleFinishTraining,
            onSaveResult: handleSaveResult,
          });
        case 'results':
          return e(VantagePages.Results, { onNavigate: navigate, user: user, latestResultId: latestResultId, onQuickStart: handleQuickStart });
        case 'stats':
          return e(VantagePages.Statistics, { onNavigate: navigate, user: user });
        case 'profile':
          return e(VantagePages.Profile, { user: user, onNavigate: navigate, onLogout: handleLogout });
        case 'settings':
          return e(VantagePages.Settings, { onNavigate: navigate, user: user, onLogout: handleLogout });
        default:
          return e(VantagePages.Dashboard, { onNavigate: navigate, user: user });
      }
    };

    if (fullScreenPages.includes(page)) {
      return e('div', { className: 'vapp-fullscreen' }, renderPage());
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
