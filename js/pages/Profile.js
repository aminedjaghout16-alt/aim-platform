/* ============================================
   Profile Page — Firebase user profile
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Profile = function Profile({ user, onNavigate, onLogout }) {
  const [stats, setStats] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(user ? user.displayName || '' : '');
  const [nameError, setNameError] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  var profile = user || { displayName: 'Operator', email: '' };
  var uid = user ? user.uid : null;

  useEffect(function () {
    if (!uid) return;
    VantageServices.DatabaseService.getUserStats(uid).then(function (s) {
      setStats(s);
    }).catch(function () {});
  }, [uid]);

  var handleNameSave = async function () {
    if (!newName.trim()) { setNameError('Name cannot be empty'); return; }
    setNameSaving(true);
    setNameError('');
    try {
      await VantageServices.AuthService.updateProfile({ displayName: newName.trim() });
      setEditingName(false);
    } catch (err) {
      setNameError('Could not update name. Please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  var bestGrade = stats && stats.bestScore > 0
    ? (VantageEngine.Scoring.getGrade(stats.bestScore) || {}).letter || '—'
    : '—';

  // Generate initials from display name
  var initials = (profile.displayName || 'O').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);

  return e('div', { className: 'vpage-profile' },
    e(VantageUI.PageHeader, {
      title: 'Profile',
      subtitle: 'Your player profile',
    }),

    e('div', { className: 'vprofile-grid' },
      // Profile card
      e(VantageUI.Card, { className: 'vprofile-card animate-in' },
        e('div', { className: 'vprofile-avatar' },
          e('div', { className: 'vavatar-lg' }, initials),
        ),

        editingName
          ? e('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } },
              e('input', {
                type: 'text',
                value: newName,
                onChange: function (ev) { setNewName(ev.target.value); setNameError(''); },
                style: {
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '6px 12px', color: 'var(--text-primary)',
                  fontSize: '16px', fontWeight: 600, textAlign: 'center', width: '160px',
                },
                autoFocus: true,
                onKeyDown: function (ev) { if (ev.key === 'Enter') handleNameSave(); if (ev.key === 'Escape') setEditingName(false); },
              }),
              e('button', {
                className: 'vbtn vbtn-primary vbtn-sm',
                onClick: handleNameSave,
                disabled: nameSaving,
              }, nameSaving ? '...' : '✓'),
              e('button', {
                className: 'vbtn vbtn-ghost vbtn-sm',
                onClick: function () { setEditingName(false); setNewName(profile.displayName || ''); },
              }, '✕'),
              nameError && e('span', { style: { color: 'var(--danger)', fontSize: '12px' } }, nameError),
            )
          : e('h2', {
              style: { cursor: 'pointer' },
              onClick: function () { setEditingName(true); setNewName(profile.displayName || ''); },
              title: 'Click to edit name',
            }, profile.displayName || 'Operator'),

        e('p', { className: 'text-secondary' }, profile.email || ''),
        e('div', { className: 'vprofile-badges' },
          e(VantageUI.Badge, { color: 'var(--accent-primary)' }, 'OPERATOR'),
        ),
        e('div', { className: 'vprofile-stats' },
          e('div', null,
            e('span', { className: 'vprofile-stat-val' }, stats ? String(stats.totalSessions) : '—'),
            e('span', { className: 'text-secondary' }, 'Sessions'),
          ),
          e('div', null,
            e('span', { className: 'vprofile-stat-val' }, stats && stats.totalSessions > 0 ? String(stats.averageScore) : '—'),
            e('span', { className: 'text-secondary' }, 'Avg Score'),
          ),
          e('div', null,
            e('span', { className: 'vprofile-stat-val' }, bestGrade),
            e('span', { className: 'text-secondary' }, 'Best Grade'),
          ),
        ),
      ),

      // Quick links
      e(VantageUI.Card, { className: 'vprofile-links animate-in stagger-1' },
        e('h4', null, 'Quick Actions'),
        e('div', { className: 'vprofile-link-list' },
          e('button', { className: 'vprofile-link', onClick: function () { onNavigate('settings'); } },
            e('span', null, '⚙'), 'Settings'),
          e('button', { className: 'vprofile-link', onClick: function () { onNavigate('stats'); } },
            e('span', null, '◈'), 'Statistics'),
          e('button', { className: 'vprofile-link', onClick: function () { onNavigate('results'); } },
            e('span', null, '◎'), 'Results History'),
          e('button', { className: 'vprofile-link vprofile-link-danger', onClick: function () { if (onLogout) onLogout(); } },
            e('span', null, '⏻'), 'Sign Out'),
        ),
      ),
    ),
  );
};
