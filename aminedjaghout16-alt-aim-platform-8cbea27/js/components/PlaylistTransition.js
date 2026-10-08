/* ============================================
   Playlist Transition — Shown between playlist exercises
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

VantageComponents.PlaylistTransition = function PlaylistTransition({ 
  completedExercise, 
  nextExercise, 
  result, 
  countdown, 
  onSkip,
}) {
  var grade = VantageEngine.Scoring.getGrade(result.score) || {};

  return e('div', { className: 'vpage-gameplay vplaylist-transition-overlay' },
    e('div', { className: 'vplaylist-transition animate-in' },
      e('div', { className: 'vplaylist-transition-complete' }, 'EXERCISE COMPLETE'),
      
      e('div', { className: 'vplaylist-transition-results' },
        e('div', { className: 'vplaylist-transition-exercise-name' }, completedExercise.name),
        e('div', { className: 'vplaylist-transition-grade', style: { color: grade.color || 'var(--accent-primary)' } },
          e('span', { className: 'vresults-grade-letter' }, result.grade),
        ),
        e('div', { className: 'vplaylist-transition-score' },
          e('span', { className: 'vresults-score-value' }, result.score),
          e('span', { className: 'vresults-score-label' }, 'SCORE'),
        ),
      ),

      nextExercise && e('div', { className: 'vplaylist-transition-next' },
        e('div', { className: 'vplaylist-transition-next-label' }, 'NEXT:'),
        e('div', { className: 'vplaylist-transition-next-name' }, nextExercise.name.toUpperCase()),
        e('div', { className: 'vplaylist-transition-countdown' }, countdown > 0 ? countdown : 'GO'),
      ),

      e('div', { className: 'vplaylist-transition-actions' },
        e(VantageUI.Button, { 
          variant: 'ghost', 
          size: 'sm',
          onClick: onSkip,
        }, 'EXIT PLAYLIST'),
      ),
    ),
  );
};
