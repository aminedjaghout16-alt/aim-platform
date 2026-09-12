/* ============================================
   Login Page — Authentication
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Login = function Login({ onNavigate, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (!email || !password) { setError('Please fill in all fields'); return; }
    // Stub: just navigate to dashboard
    if (onLogin) onLogin({ displayName: 'Operator', email });
    onNavigate('dashboard');
  };

  return e('div', { className: 'vpage-auth' },
    e('div', { className: 'vauth-card animate-in' },
      e('div', { className: 'vauth-logo' },
        e('span', { className: 'vlogo-icon' }, '▽'),
        e('span', { className: 'vlogo-text' }, 'VANTAGE'),
      ),
      e('h2', { className: 'vauth-title' }, 'Welcome Back'),
      e('p', { className: 'vauth-subtitle text-secondary' }, 'Sign in to continue training'),

      e('form', { className: 'vauth-form', onSubmit: handleSubmit },
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
          'SIGN IN'),
      ),

      e('div', { className: 'vauth-divider' },
        e('span', null, 'OR'),
      ),

      e(VantageUI.Button, {
        variant: 'secondary', style: { width: '100%' },
        onClick: () => { if (onLogin) onLogin({ displayName: 'Operator', email: 'operator@vantage.gg' }); onNavigate('dashboard'); },
      }, 'CONTINUE AS GUEST'),

      e('div', { className: 'vauth-footer' },
        e('span', { className: 'text-secondary' }, "Don't have an account? "),
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('register'); } }, 'Register'),
      ),
    ),
  );
};
