/* ============================================
   Layout — Sidebar + TopBar + Content Area
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

VantageComponents.Layout = function Layout({ children, currentPage, onNavigate, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'daily', label: 'Daily Plan', icon: '📅' },
    { id: 'training', label: 'Training', icon: '◎' },
    { id: 'stats', label: 'Statistics', icon: '◈' },
    { id: 'leaderboard', label: 'Leaderboard', icon: '△' },
    { id: 'profile', label: 'Profile', icon: '◇' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  return e('div', { className: 'vlayout' },
    // Sidebar
    e('aside', { className: 'vsidebar ' + (collapsed ? 'vsidebar-collapsed' : '') },
      // Logo
      e('div', { className: 'vsidebar-logo' },
        e('div', { className: 'vlogo-mark' },
          e('span', { className: 'vlogo-icon' }, '▽'),
        ),
        !collapsed && e('span', { className: 'vlogo-text' }, 'VANTAGE'),
      ),

      // Nav items
      e('nav', { className: 'vsidebar-nav' },
        navItems.map(function (item) {
          return e('button', {
            key: item.id,
            className: 'vnav-item ' + (currentPage === item.id ? 'vnav-active' : ''),
            onClick: function () { onNavigate(item.id); },
            title: collapsed ? item.label : '',
          },
            e('span', { className: 'vnav-icon' }, item.icon),
            !collapsed && e('span', { className: 'vnav-label' }, item.label),
            !collapsed && currentPage === item.id && e('span', { className: 'vnav-indicator' }),
          );
        })
      ),

      // Collapse toggle
      e('button', {
        className: 'vsidebar-toggle',
        onClick: function () { setCollapsed(!collapsed); },
      }, collapsed ? '›' : '‹'),
    ),

    // Main area
    e('div', { className: 'vmain' },
      // TopBar
      e('header', { className: 'vtopbar' },
        e('div', { className: 'vtopbar-left' },
          e('span', { className: 'vtopbar-page' },
            (navItems.find(function (n) { return n.id === currentPage; }) || {}).label || 'Vantage'
          ),
        ),
        e('div', { className: 'vtopbar-right' },
          user
            ? e('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                e('div', { className: 'vtopbar-user', onClick: function () { onNavigate('profile'); } },
                  e('div', { className: 'vavatar' }, (user.displayName || 'O')[0].toUpperCase()),
                  e('span', { className: 'vtopbar-username' }, user.displayName || 'Operator'),
                ),
                e('button', {
                  className: 'vbtn vbtn-ghost vbtn-sm',
                  onClick: function () { if (onLogout) onLogout(); },
                  title: 'Sign Out',
                  style: { fontSize: '16px', padding: '4px 8px' },
                }, '⏻'),
              )
            : e(VantageUI.Button, {
                variant: 'primary', size: 'sm',
                onClick: function () { onNavigate('login'); },
              }, 'Sign In'),
        ),
      ),

      // Content
      e('main', { className: 'vcontent bg-grid' },
        children,
      ),
    ),
  );
};
