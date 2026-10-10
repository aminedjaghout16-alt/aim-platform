/* ============================================
   Daily Plan History Page — View past training plans
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.DailyHistory = function DailyHistory({ user, onNavigate }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [streakInfo, setStreakInfo] = useState(null);

  const DailyPlanService = VantageServices.DailyPlanService;

  useEffect(() => {
    if (!user) return;

    async function loadHistory() {
      try {
        setLoading(true);
        const [planHistory, streak] = await Promise.all([
          DailyPlanService.getPlanHistory(user.uid, 30),
          DailyPlanService.getStreakInfo(user.uid),
        ]);
        setHistory(planHistory);
        setStreakInfo(streak);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [user]);

  if (loading) {
    return e('div', { className: 'vpage-dailyhistory' },
      e('div', { className: 'vloading' },
        e('div', { className: 'vspinner' }),
        e('p', null, 'Loading history...'),
      ),
    );
  }

  if (selectedPlan) {
    return e('div', { className: 'vpage-dailyhistory' },
      e('button', {
        className: 'vback-button',
        onClick: () => setSelectedPlan(null),
      }, '← Back to History'),
      e('div', { className: 'vplan-detail' },
        e('h2', null, `Plan from ${selectedPlan.date}`),
        e('div', { className: 'vplan-meta' },
          e('span', null, `Type: ${selectedPlan.planType}`),
          e('span', null, `Duration: ${selectedPlan.durationMinutes} min`),
          e('span', null, `Status: ${selectedPlan.status}`),
        ),
        e('div', { className: 'vexercise-list' },
          selectedPlan.exercises.map((exercise, index) => {
            const scenario = VantageEngine.Scenarios.getById(exercise.scenarioId);
            const result = selectedPlan.results[index];
            const isCompleted = selectedPlan.completedExercises.includes(index);

            return e('div', {
              key: index,
              className: `vexercise-card ${isCompleted ? 'completed' : ''}`,
            },
              e('div', { className: 'vexercise-number' }, index + 1),
              e('div', { className: 'vexercise-info' },
                e('div', { className: 'vexercise-name' }, scenario ? scenario.name : exercise.scenarioId),
                e('div', { className: 'vexercise-meta' },
                  e('span', null, `${exercise.duration} min`),
                  e('span', null, ` · ${exercise.difficulty}`),
                ),
                isCompleted && result && e('div', { className: 'vexercise-result' },
                  e('span', null, `Score: ${result.score}`),
                  e('span', null, ` · Grade: ${result.grade}`),
                  e('span', null, ` · Accuracy: ${result.stats?.accuracy || 0}%`),
                ),
              ),
              e('div', { className: 'vexercise-status' },
                isCompleted ? e('span', null, '✓') : e('span', null, '○'),
              ),
            );
          }),
        ),
      ),
    );
  }

  return e('div', { className: 'vpage-dailyhistory' },
    e('div', { className: 'vdailyhistory-header animate-in' },
      e('h1', null, 'TRAINING HISTORY'),
      streakInfo && e('div', { className: 'vstreak-info' },
        e('div', { className: 'vstreak-current' },
          e('span', { className: 'vstreak-number' }, streakInfo.currentStreak),
          e('span', { className: 'vstreak-label' }, 'Current Streak'),
        ),
        e('div', { className: 'vstreak-longest' },
          e('span', { className: 'vstreak-number' }, streakInfo.longestStreak),
          e('span', { className: 'vstreak-label' }, 'Longest Streak'),
        ),
      ),
    ),

    history.length === 0
      ? e(VantageUI.EmptyState, {
          icon: '📅',
          title: 'No Training History',
          description: 'Complete your first daily plan to see it here.',
          action: e(VantageUI.Button, {
            variant: 'primary',
            onClick: () => onNavigate('daily'),
          }, 'START TRAINING'),
        })
      : e('div', { className: 'vhistory-list animate-in stagger-1' },
          history.map(plan => {
            const completedCount = plan.completedExercises.length;
            const totalCount = plan.exercises.length;
            const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

            return e('div', {
              key: plan.id,
              className: `vhistory-card ${plan.status}`,
              onClick: () => setSelectedPlan(plan),
            },
              e('div', { className: 'vhistory-date' }, plan.date),
              e('div', { className: 'vhistory-info' },
                e('div', { className: 'vhistory-type' }, plan.planType),
                e('div', { className: 'vhistory-progress' },
                  e('div', { className: 'vprogress-bar' },
                    e('div', {
                      className: 'vprogress-fill',
                      style: { width: `${progress}%` },
                    }),
                  ),
                  e('span', null, `${completedCount}/${totalCount} exercises`),
                ),
              ),
              e('div', { className: 'vhistory-status' },
                plan.status === 'completed' ? '✓' : plan.status === 'in_progress' ? '▶' : '○',
              ),
            );
          }),
        ),
  );
};
