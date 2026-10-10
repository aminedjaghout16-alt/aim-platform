/* ============================================
   Daily Plan Page — Smart training plan interface
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.DailyPlan = function DailyPlan({ user, onNavigate, onStartExercise, activeDailyPlan, onPlanUpdate }) {
  const [plan, setPlan] = useState(activeDailyPlan);
  const [loading, setLoading] = useState(!activeDailyPlan);
  const [preferences, setPreferences] = useState({
    duration: 15,
    planType: 'recommended',
    difficulty: 'medium',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const DailyPlanService = VantageServices.DailyPlanService;

  // Load or generate today's plan
  useEffect(() => {
    if (!user) return;

    async function loadPlan() {
      try {
        setLoading(true);
        setError(null);

        let todayPlan = await DailyPlanService.getTodayPlan(user.uid);
        
        if (!todayPlan) {
          // Generate new plan
          todayPlan = await DailyPlanService.generatePlan(user.uid, preferences);
          await DailyPlanService.savePlan(user.uid, todayPlan);
        }

        setPlan(todayPlan);
        if (onPlanUpdate) onPlanUpdate(todayPlan);
      } catch (err) {
        console.error('Failed to load daily plan:', err);
        setError('Failed to load your daily plan. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadPlan();
  }, [user]);

  // Regenerate plan
  const handleRegenerate = async () => {
    if (!user || generating) return;
    if (plan && plan.status === 'in_progress') {
      if (!confirm('You have a plan in progress. Regenerating will start a new plan. Continue?')) {
        return;
      }
    }

    try {
      setGenerating(true);
      setError(null);

      const newPlan = await DailyPlanService.generatePlan(user.uid, preferences);
      await DailyPlanService.savePlan(user.uid, newPlan);
      
      setPlan(newPlan);
      if (onPlanUpdate) onPlanUpdate(newPlan);
    } catch (err) {
      console.error('Failed to regenerate plan:', err);
      setError('Failed to regenerate plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Start training
  const handleStartTraining = () => {
    if (!plan || plan.exercises.length === 0) return;

    // Mark plan as started
    if (plan.status === 'not_started') {
      DailyPlanService.updatePlanProgress(plan.id, {
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      });
      setPlan({ ...plan, status: 'in_progress' });
    }

    // Start first exercise
    const firstExercise = plan.exercises[0];
    if (onStartExercise) {
      onStartExercise(firstExercise, plan);
    }
  };

  // Resume training
  const handleResumeTraining = () => {
    if (!plan || plan.status !== 'in_progress') return;

    const nextIndex = plan.completedExercises.length;
    if (nextIndex >= plan.exercises.length) return;

    const nextExercise = plan.exercises[nextIndex];
    if (onStartExercise) {
      onStartExercise(nextExercise, plan);
    }
  };

  // View history
  const handleViewHistory = () => {
    onNavigate('daily-history');
  };

  if (loading) {
    return e('div', { className: 'vpage-dailyplan' },
      e('div', { className: 'vloading' },
        e('div', { className: 'vspinner' }),
        e('p', null, 'Loading your daily plan...'),
      ),
    );
  }

  if (error) {
    return e('div', { className: 'vpage-dailyplan' },
      e(VantageUI.EmptyState, {
        icon: '⚠',
        title: 'Error',
        description: error,
        action: e(VantageUI.Button, {
          variant: 'primary',
          onClick: () => window.location.reload(),
        }, 'RETRY'),
      }),
    );
  }

  if (!plan) {
    return e('div', { className: 'vpage-dailyplan' },
      e(VantageUI.EmptyState, {
        icon: '📅',
        title: 'No Plan Available',
        description: 'Could not generate a daily plan. Please try again.',
      }),
    );
  }

  const isCompleted = plan.status === 'completed';
  const isInProgress = plan.status === 'in_progress';
  const progress = plan.exercises.length > 0 
    ? (plan.completedExercises.length / plan.exercises.length) * 100 
    : 0;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return e('div', { className: 'vpage-dailyplan' },
    // Header
    e('div', { className: 'vdailyplan-header animate-in' },
      e('div', { className: 'vdailyplan-date' }, dateStr),
      e('h1', { className: 'vdailyplan-title' }, 'YOUR DAILY PLAN'),
      e('div', { className: 'vdailyplan-meta' },
        e('span', null, `${plan.durationMinutes} minutes`),
        e('span', { className: 'vseparator' }, '·'),
        e('span', null, `${plan.exercises.length} exercises`),
      ),
    ),

    // Progress bar (if in progress or completed)
    (isInProgress || isCompleted) && e('div', { className: 'vdailyplan-progress animate-in stagger-1' },
      e('div', { className: 'vprogress-bar' },
        e('div', { 
          className: 'vprogress-fill',
          style: { width: `${progress}%` },
        }),
      ),
      e('div', { className: 'vprogress-text' },
        e('span', null, `${plan.completedExercises.length} of ${plan.exercises.length} exercises`),
        isCompleted && e('span', { className: 'vcompleted-badge' }, '✓ COMPLETED'),
      ),
    ),

    // Configuration (only if not started)
    !isInProgress && !isCompleted && e('div', { className: 'vdailyplan-config animate-in stagger-1' },
      e(VantageUI.Card, null,
        e('h3', null, 'Plan Configuration'),
        
        e('div', { className: 'vconfig-group' },
          e('label', null, 'Duration'),
          e('div', { className: 'vconfig-options' },
            [10, 15, 20, 30].map(mins => 
              e('button', {
                key: mins,
                className: `vconfig-option ${preferences.duration === mins ? 'active' : ''}`,
                onClick: () => setPreferences({ ...preferences, duration: mins }),
              }, `${mins} min`)
            ),
          ),
        ),

        e('div', { className: 'vconfig-group' },
          e('label', null, 'Plan Type'),
          e('div', { className: 'vconfig-options' },
            [
              { value: 'recommended', label: 'Recommended' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'precision', label: 'Precision' },
              { value: 'tracking', label: 'Tracking' },
              { value: 'target_switching', label: 'Target Switching' },
            ].map(opt =>
              e('button', {
                key: opt.value,
                className: `vconfig-option ${preferences.planType === opt.value ? 'active' : ''}`,
                onClick: () => setPreferences({ ...preferences, planType: opt.value }),
              }, opt.label)
            ),
          ),
        ),

        e('div', { className: 'vconfig-group' },
          e('label', null, 'Difficulty'),
          e('div', { className: 'vconfig-options' },
            ['easy', 'medium', 'hard'].map(diff =>
              e('button', {
                key: diff,
                className: `vconfig-option ${preferences.difficulty === diff ? 'active' : ''}`,
                onClick: () => setPreferences({ ...preferences, difficulty: diff }),
              }, diff.charAt(0).toUpperCase() + diff.slice(1))
            ),
          ),
        ),

        e('div', { className: 'vconfig-actions' },
          e(VantageUI.Button, {
            variant: 'secondary',
            onClick: handleRegenerate,
            disabled: generating,
          }, generating ? 'GENERATING...' : 'REGENERATE PLAN'),
        ),
      ),
    ),

    // Exercise list
    e('div', { className: 'vdailyplan-exercises animate-in stagger-2' },
      e('h2', null, 'Exercises'),
      e('div', { className: 'vexercise-list' },
        plan.exercises.map((exercise, index) => {
          const scenario = VantageEngine.Scenarios.getById(exercise.scenarioId);
          const isCompleted = plan.completedExercises.includes(index);
          const isCurrent = isInProgress && plan.completedExercises.length === index;
          const result = plan.results[index];

          return e('div', {
            key: index,
            className: `vexercise-card ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`,
          },
            e('div', { className: 'vexercise-number' }, index + 1),
            e('div', { className: 'vexercise-info' },
              e('div', { className: 'vexercise-name' }, scenario ? scenario.name : exercise.scenarioId),
              e('div', { className: 'vexercise-meta' },
                e('span', null, `${exercise.duration} min`),
                e('span', { className: 'vseparator' }, '·'),
                e('span', null, exercise.difficulty),
              ),
              e('div', { className: 'vexercise-reason' }, exercise.reason),
              isCompleted && result && e('div', { className: 'vexercise-result' },
                e('span', null, `Score: ${result.score}`),
                e('span', { className: 'vseparator' }, '·'),
                e('span', null, `Grade: ${result.grade}`),
              ),
            ),
            e('div', { className: 'vexercise-status' },
              isCompleted 
                ? e('span', { className: 'vstatus-completed' }, '✓')
                : isCurrent
                ? e('span', { className: 'vstatus-current' }, '▶')
                : e('span', { className: 'vstatus-pending' }, '○'),
            ),
          );
        }),
      ),
    ),

    // Action buttons
    e('div', { className: 'vdailyplan-actions animate-in stagger-3' },
      isCompleted
        ? e(VantageUI.Button, {
            variant: 'primary',
            onClick: handleViewHistory,
            size: 'lg',
          }, 'VIEW HISTORY')
        : isInProgress
        ? e(VantageUI.Button, {
            variant: 'primary',
            onClick: handleResumeTraining,
            size: 'lg',
          }, 'RESUME TRAINING')
        : e(VantageUI.Button, {
            variant: 'primary',
            onClick: handleStartTraining,
            size: 'lg',
          }, 'START TRAINING'),
    ),
  );
};
