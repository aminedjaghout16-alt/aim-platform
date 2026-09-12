/* ============================================
   Vantage App — Main entry, routing, state
   ============================================ */
(function() {
  const { useState, useEffect, useCallback } = React;
  const e = React.createElement;

  // Initialize services
  VantageServices.AuthService.init();
  VantageServices.DatabaseService.init();
  VantageServices.StorageService.init();

  function App() {
    const [page, setPage] = useState('landing');
    const [pageParam, setPageParam] = useState(null);
    const [user, setUser] = useState(null);
    const [selectedScenario, setSelectedScenario] = useState(null);
    const [trainingConfig, setTrainingConfig] = useState(null);

    // Auth listener
    useEffect(() => {
      const unsub = VantageServices.AuthService.onAuthStateChanged((u) => {
        setUser(u);
      });
      return unsub;
    }, []);

    const navigate = useCallback((pageName, param) => {
      setPage(pageName);
      setPageParam(param || null);
      window.scrollTo(0, 0);
    }, []);

    const handleLogin = useCallback((userData) => {
      setUser(userData);
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
      setSelectedScenario(scenarioId);
      setTrainingConfig(config);
      navigate('gameplay', scenarioId);
    }, [navigate]);

    const handleFinishTraining = useCallback((result) => {
      // Save result to database
      VantageServices.DatabaseService.saveTrainingResult(
        user?.uid || 'dev-user-001',
        result
      );
      navigate('results');
    }, [navigate, user]);

    // Pages without layout (landing, login, register, gameplay)
    const fullScreenPages = ['landing', 'login', 'register', 'gameplay'];

    const renderPage = () => {
      switch (page) {
        case 'landing':
          return e(VantagePages.Landing, { onNavigate: navigate });
        case 'login':
          return e(VantagePages.Login, { onNavigate: navigate, onLogin: handleLogin });
        case 'register':
          return e(VantagePages.Register, { onNavigate: navigate, onLogin: handleLogin });
        case 'dashboard':
          return e(VantagePages.Dashboard, { onNavigate: navigate });
        case 'training':
          return e(VantagePages.TrainingLibrary, {
            onNavigate: navigate,
            onSelectScenario: handleSelectScenario,
          });
        case 'details':
          return e(VantagePages.TrainingDetails, {
            scenarioId: pageParam || selectedScenario,
            onNavigate: navigate,
            onStartSetup: handleStartSetup,
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
          });
        case 'results':
          return e(VantagePages.Results, { onNavigate: navigate });
        case 'stats':
          return e(VantagePages.Statistics, { onNavigate: navigate });
        case 'profile':
          return e(VantagePages.Profile, { user, onNavigate: navigate });
        case 'settings':
          return e(VantagePages.Settings, { onNavigate: navigate });
        default:
          return e(VantagePages.Dashboard, { onNavigate: navigate });
      }
    };

    // Full-screen pages (no sidebar/topbar)
    if (fullScreenPages.includes(page)) {
      return e('div', { className: 'vapp-fullscreen' }, renderPage());
    }

    // App pages with layout
    return e(VantageComponents.Layout, {
      currentPage: page,
      onNavigate: navigate,
      user,
    }, renderPage());
  }

  // Mount
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(e(App));
})();
