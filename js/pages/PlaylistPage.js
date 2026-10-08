/* ============================================
   Playlist Page — Handles transitions and summary
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.PlaylistPage = function PlaylistPage({ activePlaylist, onStartNext, onExit, onNavigate }) {
  const [countdown, setCountdown] = useState(3);
  const [showSummary, setShowSummary] = useState(false);

  // Check if playlist is complete (all exercises done)
  const isComplete = activePlaylist && activePlaylist.currentIndex >= activePlaylist.items.length;

  useEffect(() => {
    if (!activePlaylist || isComplete) {
      setShowSummary(true);
      return;
    }

    // Start countdown for next exercise
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Start next exercise
          setTimeout(() => onStartNext(), 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePlaylist, isComplete]);

  if (!activePlaylist) {
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e(VantageUI.EmptyState, {
        icon: '◎',
        title: 'No active playlist',
        description: 'Create a playlist from the Training Library to get started.',
        action: e(VantageUI.Button, { 
          variant: 'primary', 
          onClick: () => onNavigate('training') 
        }, 'GO TO TRAINING'),
      }),
    );
  }

  // Show summary if playlist is complete
  if (showSummary || isComplete) {
    return e(VantagePages.PlaylistSummary, {
      playlist: activePlaylist.items,
      results: activePlaylist.results,
      onNavigate: onNavigate,
    });
  }

  // Show transition screen
  const completedIndex = activePlaylist.currentIndex - 1;
  const completedExercise = completedIndex >= 0 ? activePlaylist.items[completedIndex] : null;
  const completedResult = completedIndex >= 0 ? activePlaylist.results[completedIndex] : null;
  const nextExercise = activePlaylist.currentIndex < activePlaylist.items.length 
    ? activePlaylist.items[activePlaylist.currentIndex] 
    : null;

  if (!completedExercise || !completedResult) {
    // This shouldn't happen, but handle it gracefully
    return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
      e('div', { className: 'vresults-screen animate-in' },
        e('div', { className: 'vresults-scenario' }, 'Starting playlist...'),
      ),
    );
  }

  return e(VantageComponents.PlaylistTransition, {
    completedExercise: completedExercise,
    nextExercise: nextExercise,
    result: completedResult,
    countdown: countdown,
    onSkip: onExit,
  });
};
