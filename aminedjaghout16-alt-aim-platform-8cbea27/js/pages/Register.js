/* ============================================
   Register Page — Firebase Account Creation
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Register = function Register({ onNavigate, onLogin }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!displayName || !email || !password) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setError('');
    setLoading(true);

    try {
      const user = await VantageServices.AuthService.registerWithEmail(email, password, displayName);
      if (onLogin) onLogin(user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await VantageServices.AuthService.signInWithGoogle();
      if (onLogin) onLogin(user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message || 'Google sign-up failed.');
    } finally {
      setLoading(false);
    }
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
          placeholder: 'Minimum 6 characters',
        }),
        e(VantageUI.Input, {
          label: 'Confirm Password',
          type: 'password',
          value: confirmPassword,
          onChange: (v) => { setConfirmPassword(v); setError(''); },
          placeholder: 'Re-enter password',
        }),
        error && e('div', { className: 'vauth-error' }, error),
        e(VantageUI.Button, { variant: 'primary', size: 'lg', type: 'submit', disabled: loading, style: { width: '100%' } },
          loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'),
      ),

      e('div', { className: 'vauth-divider' },
        e('span', null, 'OR'),
      ),

      e(VantageUI.Button, {
        variant: 'secondary', style: { width: '100%' }, disabled: loading,
        onClick: handleGoogleSignUp,
      }, 'SIGN UP WITH GOOGLE'),

      e('div', { className: 'vauth-footer' },
        e('span', { className: 'text-secondary' }, 'Already have an account? '),
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('login'); } }, 'Sign In'),
      ),
    ),
  );
};
