/* ============================================
   Layout — Sidebar + TopBar + Content Area
   ============================================ */
window.VantageComponents = window.VantageComponents || {};

VantageComponents.Layout = function Layout({ children, currentPage, onNavigate, user }) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'training', label: 'Training', icon: '◎' },
    { id: 'stats', label: 'Statistics', icon: '◈' },
    { id: 'profile', label: 'Profile', icon: '◇' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  return e('div', { className: 'vlayout' },
    // Sidebar
    e('aside', { className: `vsidebar ${collapsed ? 'vsidebar-collapsed' : ''}` },
      // Logo
      e('div', { className: 'vsidebar-logo' },
        e('div', { className: 'vlogo-mark' },
          e('span', { className: 'vlogo-icon' }, '▽'),
        ),
        !collapsed && e('span', { className: 'vlogo-text' }, 'VANTAGE'),
      ),

      // Nav items
      e('nav', { className: 'vsidebar-nav' },
        navItems.map(item =>
          e('button', {
            key: item.id,
            className: `vnav-item ${currentPage === item.id ? 'vnav-active' : ''}`,
            onClick: () => onNavigate(item.id),
            title: collapsed ? item.label : '',
          },
            e('span', { className: 'vnav-icon' }, item.icon),
            !collapsed && e('span', { className: 'vnav-label' }, item.label),
            !collapsed && currentPage === item.id && e('span', { className: 'vnav-indicator' }),
          )
        ),
      ),

      // Collapse toggle
      e('button', {
        className: 'vsidebar-toggle',
        onClick: () => setCollapsed(!collapsed),
      }, collapsed ? '›' : '‹'),
    ),

    // Main area
    e('div', { className: 'vmain' },
      // TopBar
      e('header', { className: 'vtopbar' },
        e('div', { className: 'vtopbar-left' },
          e('span', { className: 'vtopbar-page' },
            navItems.find(n => n.id === currentPage)?.label || 'Vantage'
          ),
        ),
        e('div', { className: 'vtopbar-right' },
          user
            ? e('div', { className: 'vtopbar-user', onClick: () => onNavigate('profile') },
                e('div', { className: 'vavatar' }, (user.displayName || 'O')[0].toUpperCase()),
                e('span', { className: 'vtopbar-username' }, user.displayName || 'Operator'),
              )
            : e(VantageUI.Button, {
                variant: 'primary', size: 'sm',
                onClick: () => onNavigate('login'),
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
