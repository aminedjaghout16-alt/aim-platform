/* ============================================
   Register Page — Account creation
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Register = function Register({ onNavigate, onLogin }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!displayName || !email || !password) { setError('Please fill in all fields'); return; }
    if (onLogin) onLogin({ displayName, email });
    onNavigate('dashboard');
  };

  return e('div', { className: 'vpage-auth' },
    e('div', { className: 'vauth-card animate-in' },
      e('div', { className: 'vauth-logo' },
        e('span', { className: 'vlogo-icon' }, '▽'),
        e('span', { className: 'vlogo-text' }, 'VANTAGE'),
      ),
      e('h2', { className: 'vauth-title' }, 'Create Account'),
      e('p', { className: 'vauth-subtitle text-secondary' }, 'Start your aim training journey'),

      e('form', { className: 'vauth-form', onSubmit: handleSubmit },
        e(VantageUI.Input, {
          label: 'Display Name',
          value: displayName,
          onChange: (v) => { setDisplayName(v); setError(''); },
          placeholder: 'Operator',
        }),
        e(VantageUI.Input, {
          label: 'Email',
          type: 'email',
          value: email,
          onChange: (v) => { setEmail(v); setError(''); },
          placeholder: 'operator@vantage.gg',
        }),
        e(VantageUI.Input, {
          label: 'Password',
          type: 'password',
          value: password,
          onChange: (v) => { setPassword(v); setError(''); },
          placeholder: '••••••••',
        }),
        error && e('div', { className: 'vauth-error' }, error),
        e(VantageUI.Button, { variant: 'primary', size: 'lg', type: 'submit', style: { width: '100%' } },
          'CREATE ACCOUNT'),
      ),

      e('div', { className: 'vauth-footer' },
        e('span', { className: 'text-secondary' }, 'Already have an account? '),
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('login'); } }, 'Sign In'),
      ),
    ),
  );
};
