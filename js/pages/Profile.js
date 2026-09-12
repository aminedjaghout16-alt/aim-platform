/* ============================================
   Profile Page — User profile & settings
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Profile = function Profile({ user, onNavigate }) {
  const profile = user || { displayName: 'Operator', email: 'operator@vantage.gg' };

  return e('div', { className: 'vpage-profile' },
    e(VantageUI.PageHeader, {
      title: 'Profile',
      subtitle: 'Your player profile',
    }),

    e('div', { className: 'vprofile-grid' },
      // Profile card
      e(VantageUI.Card, { className: 'vprofile-card animate-in' },
        e('div', { className: 'vprofile-avatar' },
          e('div', { className: 'vavatar-lg' }, (profile.displayName || 'O')[0].toUpperCase()),
        ),
        e('h2', null, profile.displayName || 'Operator'),
        e('p', { className: 'text-secondary' }, profile.email || ''),
        e('div', { className: 'vprofile-badges' },
          e(VantageUI.Badge, { color: 'var(--accent-primary)' }, 'OPERATOR'),
          e(VantageUI.Badge, { variant: 'outline', color: 'var(--accent-secondary)' }, 'FOUNDING MEMBER'),
        ),
        e('div', { className: 'vprofile-stats' },
          e('div', null, e('span', { className: 'vprofile-stat-val' }, '24'), e('span', { className: 'text-secondary' }, 'Sessions')),
          e('div', null, e('span', { className: 'vprofile-stat-val' }, '712'), e('span', { className: 'text-secondary' }, 'Avg Score')),
          e('div', null, e('span', { className: 'vprofile-stat-val' }, 'A'), e('span', { className: 'text-secondary' }, 'Best Grade')),
        ),
      ),

      // Quick links
      e(VantageUI.Card, { className: 'vprofile-links animate-in stagger-1' },
        e('h4', null, 'Quick Actions'),
        e('div', { className: 'vprofile-link-list' },
          e('button', { className: 'vprofile-link', onClick: () => onNavigate('settings') },
            e('span', null, '⚙'), 'Settings'),
          e('button', { className: 'vprofile-link', onClick: () => onNavigate('stats') },
            e('span', null, '◈'), 'Statistics'),
          e('button', { className: 'vprofile-link', onClick: () => onNavigate('results') },
            e('span', null, '◎'), 'Results History'),
          e('button', { className: 'vprofile-link vprofile-link-danger', onClick: () => onNavigate('landing') },
            e('span', null, '⏻'), 'Sign Out'),
        ),
      ),
    ),
  );
};
