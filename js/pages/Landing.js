/* ============================================
   Landing Page — Marketing / entry page
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Landing = function Landing({ onNavigate }) {
  return e('div', { className: 'vlanding' },
    // Hero section
    e('section', { className: 'vlanding-hero' },
      e('div', { className: 'vlanding-hero-bg' }),
      e('div', { className: 'vlanding-hero-content' },
        e('div', { className: 'vlanding-badge animate-in' }, 'PRECISION AIM TRAINING'),
        e('h1', { className: 'vlanding-title animate-in stagger-1' },
          'ELEVATE YOUR ',
          e('span', { className: 'text-accent' }, 'AIM'),
        ),
        e('p', { className: 'vlanding-desc animate-in stagger-2' },
          'Professional aim training for competitive FPS players. ' +
          'Built for Valorant, CS2, and beyond. Train smarter, not harder.'
        ),
        e('div', { className: 'vlanding-actions animate-in stagger-3' },
          e(VantageUI.Button, {
            variant: 'primary', size: 'lg',
            onClick: () => onNavigate('register'),
          }, 'START TRAINING'),
          e(VantageUI.Button, {
            variant: 'ghost', size: 'lg',
            onClick: () => onNavigate('login'),
          }, 'SIGN IN'),
        ),
        e('div', { className: 'vlanding-stats animate-in stagger-4' },
          e('div', { className: 'vlanding-stat' },
            e('span', { className: 'vlanding-stat-value' }, '50+'),
            e('span', { className: 'vlanding-stat-label' }, 'Scenarios'),
          ),
          e('div', { className: 'vlanding-stat-divider' }),
          e('div', { className: 'vlanding-stat' },
            e('span', { className: 'vlanding-stat-value' }, '6'),
            e('span', { className: 'vlanding-stat-label' }, 'FPS Games'),
          ),
          e('div', { className: 'vlanding-stat-divider' }),
          e('div', { className: 'vlanding-stat' },
            e('span', { className: 'vlanding-stat-value' }, '∞'),
            e('span', { className: 'vlanding-stat-label' }, 'Improvement'),
          ),
        ),
      ),
    ),

    // Features section
    e('section', { className: 'vlanding-features' },
      e('h2', { className: 'vlanding-section-title' }, 'BUILT FOR COMPETITION'),
      e('div', { className: 'vlanding-features-grid' },
        [
          { icon: '◎', title: 'Precision Training', desc: 'Scientifically designed scenarios targeting every aspect of your aim.' },
          { icon: '◈', title: 'Deep Analytics', desc: 'Track your progress with detailed statistics and performance insights.' },
          { icon: '⟶', title: 'Game-Specific', desc: 'Sensitivity mapping and scenarios tailored for your main game.' },
          { icon: '◇', title: 'Adaptive Difficulty', desc: 'Training that scales with your skill level automatically.' },
        ].map((f, i) =>
          e(VantageUI.Card, { key: i, className: `vfeature-card animate-in stagger-${i + 1}`, hover: true },
            e('div', { className: 'vfeature-icon' }, f.icon),
            e('h3', null, f.title),
            e('p', null, f.desc),
          )
        ),
      ),
    ),

    // Footer
    e('footer', { className: 'vlanding-footer' },
      e('span', null, 'VANTAGE'),
      e('span', { className: 'text-secondary' }, ' — Precision Aim Training Platform'),
    ),
  );
};
