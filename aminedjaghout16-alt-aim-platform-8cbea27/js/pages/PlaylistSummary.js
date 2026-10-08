/* ============================================
   Playlist Summary — Shows after completing a playlist
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.PlaylistSummary = function PlaylistSummary({ playlist, results, onNavigate }) {
  var totalScore = results.reduce(function(sum, r) { return sum + (r.score || 0); }, 0);
  var totalTime = playlist.reduce(function(sum, item) { return sum + item.durationSeconds; }, 0);
  var totalMinutes = Math.floor(totalTime / 60);
  var remainingSeconds = totalTime % 60;
  var totalTimeText = totalMinutes + ':' + remainingSeconds.toString().padStart(2, '0');

  var gradeColor = function(g) {
    var map = { S: '#ffb830', A: '#00e0d0', B: '#448aff', C: '#b388ff', D: '#ffab00', F: '#ff3d5a' };
    return map[g] || '#8b8fa3';
  };

  return e('div', { className: 'vpage-gameplay vpage-results-overlay' },
    e('div', { className: 'vresults-screen animate-in vplaylist-summary' },
      e('div', { className: 'vresults-scenario' }, 'PLAYLIST COMPLETE'),
      
      e('div', { className: 'vplaylist-summary-stats' },
        e('div', { className: 'vplaylist-summary-stat' },
          e('span', { className: 'vplaylist-summary-stat-value' }, results.length),
          e('span', { className: 'vplaylist-summary-stat-label' }, 'EXERCISES'),
        ),
        e('div', { className: 'vplaylist-summary-stat' },
          e('span', { className: 'vplaylist-summary-stat-value' }, totalTimeText),
          e('span', { className: 'vplaylist-summary-stat-label' }, 'TOTAL TIME'),
        ),
        e('div', { className: 'vplaylist-summary-stat' },
          e('span', { className: 'vplaylist-summary-stat-value' }, totalScore),
          e('span', { className: 'vplaylist-summary-stat-label' }, 'TOTAL SCORE'),
        ),
      ),

      e('div', { className: 'vplaylist-summary-breakdown' },
        e('h4', { className: 'vplaylist-summary-breakdown-title' }, 'EXERCISE RESULTS'),
        results.map(function(r, index) {
          var item = playlist[index];
          return e('div', { key: index, className: 'vplaylist-summary-item' },
            e('div', { className: 'vplaylist-summary-item-number' }, (index + 1) + '.'),
            e('div', { className: 'vplaylist-summary-item-name' }, item.name),
            e('div', { className: 'vplaylist-summary-item-grade', style: { color: gradeColor(r.grade) } }, r.grade),
            e('div', { className: 'vplaylist-summary-item-score' }, r.score),
          );
        })
      ),

      e('div', { className: 'vresults-actions' },
        e(VantageUI.Button, { 
          variant: 'primary', 
          onClick: function() { onNavigate('training'); } 
        }, 'BACK TO TRAINING'),
      ),
    ),
  );
};
