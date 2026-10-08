/* ============================================
   Playlist Creator — Build custom training playlists
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

VantageComponents.PlaylistCreator = function PlaylistCreator({ onNavigate, onStartPlaylist, onClose, user, onLoadPlaylist }) {
  const [playlist, setPlaylist] = useState([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [savedPlaylists, setSavedPlaylists] = useState([]);
  const [showSavedPlaylists, setShowSavedPlaylists] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const allScenarios = VantageEngine.Scenarios.getEnabled();
  const Settings = VantageEngine.Settings;
  const DB = VantageServices.DatabaseService;

  // Load saved playlists on mount
  useEffect(() => {
    loadSavedPlaylists();
  }, [user]);

  // Clear save message after 3 seconds
  useEffect(() => {
    if (saveMessage) {
      var timer = setTimeout(() => setSaveMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  const loadSavedPlaylists = async () => {
    try {
      if (user && user.uid) {
        var playlists = await DB.getUserPlaylists(user.uid);
        setSavedPlaylists(playlists);
      } else {
        var localPlaylists = DB.getLocalPlaylists();
        setSavedPlaylists(localPlaylists);
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
      // Fall back to local storage if Firebase fails
      try {
        var localPlaylists = DB.getLocalPlaylists();
        setSavedPlaylists(localPlaylists);
      } catch (e2) {
        setSavedPlaylists([]);
      }
    }
  };

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

  const handleSave = async () => {
    if (playlist.length === 0 || !playlistName.trim()) return;

    try {
      const playlistData = {
        name: playlistName.trim(),
        items: playlist,
      };

      if (user && user.uid) {
        await DB.savePlaylist(user.uid, playlistData);
      } else {
        DB.saveLocalPlaylist(playlistData);
      }

      setPlaylistName('');
      setShowSaveDialog(false);
      setSaveMessage('Playlist saved successfully.');
      await loadSavedPlaylists();
      setShowSavedPlaylists(true); // Auto-expand to show the new playlist
    } catch (err) {
      console.error('Failed to save playlist:', err);
      // Try local storage as fallback
      try {
        const playlistData = {
          name: playlistName.trim(),
          items: playlist,
        };
        DB.saveLocalPlaylist(playlistData);
        setPlaylistName('');
        setShowSaveDialog(false);
        setSaveMessage('Playlist saved locally.');
        await loadSavedPlaylists();
        setShowSavedPlaylists(true);
      } catch (e2) {
        console.error('Failed to save locally:', e2);
        setSaveMessage('Failed to save playlist.');
      }
    }
  };

  const handleLoad = (savedPlaylist) => {
    if (onLoadPlaylist) {
      onLoadPlaylist(savedPlaylist.items);
    } else {
      setPlaylist(savedPlaylist.items);
    }
    setShowSavedPlaylists(false);
  };

  const handleDelete = async (playlistId) => {
    // Show custom confirmation dialog instead of using confirm()
    setDeleteConfirmId(playlistId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;

    try {
      if (user && user.uid) {
        await DB.deletePlaylist(deleteConfirmId, user.uid);
      } else {
        DB.deleteLocalPlaylist(deleteConfirmId);
      }
      setSaveMessage('Playlist deleted.');
      await loadSavedPlaylists();
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      // Try local storage fallback
      try {
        DB.deleteLocalPlaylist(deleteConfirmId);
        setSaveMessage('Playlist deleted.');
        await loadSavedPlaylists();
      } catch (e2) {
        console.error('Failed to delete locally:', e2);
        setSaveMessage('Failed to delete playlist.');
      }
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const formatPlaylistDuration = (items) => {
    const totalSec = items.reduce((sum, item) => sum + (item.durationSeconds || 60), 0);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return e('div', null,
    // Save message toast
    saveMessage && e('div', { className: 'vplaylist-save-toast' }, saveMessage),
    
    // Main modal
    e('div', { className: 'vmodal-backdrop', onClick: onClose },
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

          // Total time and action buttons
          playlist.length > 0 && e('div', { className: 'vplaylist-footer' },
            e('div', { className: 'vplaylist-total' },
              e('span', null, 'TOTAL TIME:'),
              e('span', { className: 'vplaylist-total-time' }, totalTimeText),
            ),
            e('div', { className: 'vplaylist-action-buttons' },
              e(VantageUI.Button, { 
                variant: 'secondary', 
                onClick: () => setShowSaveDialog(true),
                disabled: playlist.length === 0,
              }, 'SAVE PLAYLIST'),
              e(VantageUI.Button, { 
                variant: 'primary', 
                size: 'lg',
                onClick: handleStart,
                style: { flex: 1 },
              }, 'START PLAYLIST'),
            ),
          ),

          // My Playlists section
          e('div', { className: 'vplaylist-my-playlists-section' },
            e('div', { 
              className: 'vplaylist-my-playlists-header',
              onClick: () => setShowSavedPlaylists(!showSavedPlaylists),
            },
              e('span', null, `MY PLAYLISTS (${savedPlaylists.length})`),
              e('span', { className: 'vplaylist-toggle-icon' }, showSavedPlaylists ? '▼' : '▶'),
            ),
            showSavedPlaylists && e('div', { className: 'vplaylist-saved-list' },
              savedPlaylists.length === 0 
                ? e('div', { className: 'vplaylist-no-saved' }, 'No saved playlists yet')
                : savedPlaylists.map((saved) => 
                    e('div', { key: saved.id, className: 'vplaylist-saved-item' },
                      e('div', { className: 'vplaylist-saved-info' },
                        e('div', { className: 'vplaylist-saved-name' }, saved.name),
                        e('div', { className: 'vplaylist-saved-meta' }, 
                          `${saved.items.length} exercise${saved.items.length !== 1 ? 's' : ''} · ${formatPlaylistDuration(saved.items)}`
                        ),
                      ),
                      e('div', { className: 'vplaylist-saved-actions' },
                        e(VantageUI.Button, { 
                          variant: 'secondary', 
                          size: 'sm',
                          onClick: () => handleLoad(saved),
                        }, 'LOAD'),
                        e(VantageUI.Button, { 
                          variant: 'ghost', 
                          size: 'sm',
                          onClick: () => handleDelete(saved.id),
                        }, 'DELETE'),
                      ),
                    )
                  ),
            ),
          ),
        ),
      ),
    ),
    
    // Save dialog (rendered outside modal to avoid stacking issues)
    showSaveDialog && e('div', { className: 'vplaylist-save-dialog' },
      e('div', { className: 'vplaylist-save-dialog-content' },
        e('h4', null, 'Save Playlist'),
        e('input', {
          type: 'text',
          className: 'vplaylist-name-input',
          placeholder: 'Enter playlist name...',
          value: playlistName,
          onChange: (ev) => setPlaylistName(ev.target.value),
          autoFocus: true,
          onKeyPress: (ev) => {
            if (ev.key === 'Enter') handleSave();
          },
        }),
        e('div', { className: 'vplaylist-save-dialog-actions' },
          e(VantageUI.Button, { 
            variant: 'ghost', 
            size: 'sm',
            onClick: () => {
              setShowSaveDialog(false);
              setPlaylistName('');
            },
          }, 'CANCEL'),
          e(VantageUI.Button, { 
            variant: 'primary', 
            size: 'sm',
            onClick: handleSave,
            disabled: !playlistName.trim(),
          }, 'SAVE'),
        ),
      ),
    ),
    
    // Delete confirmation dialog
    deleteConfirmId && e('div', { className: 'vplaylist-save-dialog' },
      e('div', { className: 'vplaylist-save-dialog-content' },
        e('h4', null, 'Delete Playlist'),
        e('p', { style: { marginBottom: '16px', color: 'var(--text-secondary)' } }, 
          'Are you sure you want to delete this playlist?'),
        e('div', { className: 'vplaylist-save-dialog-actions' },
          e(VantageUI.Button, { 
            variant: 'ghost', 
            size: 'sm',
            onClick: cancelDelete,
          }, 'CANCEL'),
          e(VantageUI.Button, { 
            variant: 'danger', 
            size: 'sm',
            onClick: confirmDelete,
          }, 'DELETE'),
        ),
      ),
    ),
  );
};
