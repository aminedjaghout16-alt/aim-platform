/* ============================================
   Playlist Creator — Build custom training playlists
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

VantageComponents.PlaylistCreator = function PlaylistCreator({ onNavigate, onStartPlaylist, onClose }) {
  const [playlist, setPlaylist] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const allScenarios = VantageEngine.Scenarios.getEnabled();
  const Settings = VantageEngine.Settings;

  const addExercise = (scenarioId) => {
    const scenario = VantageEngine.Scenarios.getById(scenarioId);
    if (!scenario) return;
    
    setPlaylist([...playlist, {
      id: scenarioId,
      name: scenario.name,
      duration: 'standard', // Default to 60s
      durationSeconds: 60,
      difficulty: 'medium', // Default difficulty
    }]);
    setShowAddMenu(false);
  };

  const removeExercise = (index) => {
    const newPlaylist = [...playlist];
    newPlaylist.splice(index, 1);
    setPlaylist(newPlaylist);
  };

  const moveExercise = (index, direction) => {
    const newPlaylist = [...playlist];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= playlist.length) return;
    
    const temp = newPlaylist[index];
    newPlaylist[index] = newPlaylist[newIndex];
    newPlaylist[newIndex] = temp;
    setPlaylist(newPlaylist);
  };

  const updateDuration = (index, durationId) => {
    const newPlaylist = [...playlist];
    const durationSetting = Settings.getDuration(durationId);
    newPlaylist[index] = {
      ...newPlaylist[index],
      duration: durationId,
      durationSeconds: durationSetting ? durationSetting.seconds : 60,
    };
    setPlaylist(newPlaylist);
  };

  const updateDifficulty = (index, difficultyId) => {
    const newPlaylist = [...playlist];
    newPlaylist[index] = {
      ...newPlaylist[index],
      difficulty: difficultyId,
    };
    setPlaylist(newPlaylist);
  };

  const totalSeconds = playlist.reduce((sum, item) => sum + item.durationSeconds, 0);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const totalTimeText = `${totalMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  const handleStart = () => {
    if (playlist.length === 0) return;
    onStartPlaylist(playlist);
  };

  return e('div', { className: 'vmodal-backdrop', onClick: onClose },
    e('div', { 
      className: 'vmodal vplaylist-modal',
      style: { maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
      onClick: (ev) => ev.stopPropagation(),
    },
      e('div', { className: 'vmodal-header' },
        e('h3', null, 'CREATE PLAYLIST'),
        e('button', { className: 'vmodal-close', onClick: onClose }, '×'),
      ),
      e('div', { className: 'vmodal-body', style: { flex: 1, overflow: 'auto' } },
        // Add exercise button
        e('div', { style: { marginBottom: '16px' } },
          e(VantageUI.Button, { 
            variant: 'secondary', 
            onClick: () => setShowAddMenu(!showAddMenu) 
          }, '+ ADD EXERCISE'),
          
          showAddMenu && e('div', { className: 'vplaylist-add-menu' },
            allScenarios.map(s => 
              e('div', { 
                key: s.id, 
                className: 'vplaylist-add-item',
                onClick: () => addExercise(s.id),
              },
                e('span', null, s.name),
                e('span', { className: 'vplaylist-add-duration' }, s.estimatedDuration),
              )
            )
          ),
        ),

        // Playlist items
        playlist.length === 0 
          ? e('div', { className: 'vplaylist-empty' }, 
              'No exercises added yet. Click "+ ADD EXERCISE" to start building your playlist.'
            )
          : e('div', { className: 'vplaylist-items' },
              playlist.map((item, index) => 
                e('div', { key: index, className: 'vplaylist-item' },
                  e('div', { className: 'vplaylist-item-controls' },
                    e('button', { 
                      className: 'vplaylist-move-btn',
                      onClick: () => moveExercise(index, -1),
                      disabled: index === 0,
                    }, '↑'),
                    e('button', { 
                      className: 'vplaylist-move-btn',
                      onClick: () => moveExercise(index, 1),
                      disabled: index === playlist.length - 1,
                    }, '↓'),
                  ),
                  e('div', { className: 'vplaylist-item-info' },
                    e('div', { className: 'vplaylist-item-number' }, `${index + 1}.`),
                    e('div', { className: 'vplaylist-item-name' }, item.name),
                  ),
                  e('div', { className: 'vplaylist-item-settings' },
                    e('select', {
                      className: 'vplaylist-difficulty-select',
                      value: item.difficulty || 'medium',
                      onChange: (ev) => updateDifficulty(index, ev.target.value),
                    },
                      e('option', { value: 'easy' }, 'Easy'),
                      e('option', { value: 'medium' }, 'Medium'),
                      e('option', { value: 'hard' }, 'Hard'),
                      e('option', { value: 'extreme' }, 'Expert'),
                    ),
                    e('select', {
                      className: 'vplaylist-duration-select',
                      value: item.duration,
                      onChange: (ev) => updateDuration(index, ev.target.value),
                    },
                      e('option', { value: 'short' }, '30s'),
                      e('option', { value: 'standard' }, '60s'),
                      e('option', { value: 'long' }, '90s'),
                    ),
                  ),
                  e('button', { 
                    className: 'vplaylist-remove-btn',
                    onClick: () => removeExercise(index),
                  }, '×'),
                )
              )
            ),

        // Total time and start button
        playlist.length > 0 && e('div', { className: 'vplaylist-footer' },
          e('div', { className: 'vplaylist-total' },
            e('span', null, 'TOTAL TIME:'),
            e('span', { className: 'vplaylist-total-time' }, totalTimeText),
          ),
          e(VantageUI.Button, { 
            variant: 'primary', 
            size: 'lg',
            onClick: handleStart,
            style: { width: '100%' },
          }, 'START PLAYLIST'),
        ),
      ),
    ),
  );
};
