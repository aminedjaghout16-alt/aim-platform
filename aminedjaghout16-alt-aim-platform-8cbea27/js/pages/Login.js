/* ============================================
   Login Page — Firebase Authentication
   ============================================ */
window.VantagePages = window.VantagePages || {};

VantagePages.Login = function Login({ onNavigate, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setError('');
    setLoading(true);

    try {
      const user = await VantageServices.AuthService.signInWithEmail(email, password);
      if (onLogin) onLogin(user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await VantageServices.AuthService.signInWithGoogle();
      if (onLogin) onLogin(user);
      onNavigate('dashboard');
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (ev) => {
    ev.preventDefault();
    if (!resetEmail) { setResetError('Please enter your email'); return; }
    setResetError('');
    setResetMessage('');
    setResetLoading(true);

    try {
      await VantageServices.AuthService.resetPassword(resetEmail);
      setResetMessage('Password reset email sent. Check your inbox.');
    } catch (err) {
      setResetError(err.message || 'Could not send reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  // Forgot password modal
  if (showForgotPassword) {
    return e('div', { className: 'vpage-auth' },
      e('div', { className: 'vauth-card animate-in' },
        e('div', { className: 'vauth-logo' },
          e('span', { className: 'vlogo-icon' }, '▽'),
          e('span', { className: 'vlogo-text' }, 'VANTAGE'),
        ),
        e('h2', { className: 'vauth-title' }, 'Reset Password'),
        e('p', { className: 'vauth-subtitle text-secondary' }, 'Enter your email to receive a reset link'),

        e('form', { className: 'vauth-form', onSubmit: handleResetPassword },
          e(VantageUI.Input, {
            label: 'Email',
            type: 'email',
            value: resetEmail,
            onChange: (v) => { setResetEmail(v); setResetError(''); setResetMessage(''); },
            placeholder: 'operator@vantage.gg',
          }),
          resetError && e('div', { className: 'vauth-error' }, resetError),
          resetMessage && e('div', { style: { color: 'var(--success)', fontSize: '13px', padding: '8px 0', textAlign: 'center' } }, resetMessage),
          e(VantageUI.Button, { variant: 'primary', size: 'lg', type: 'submit', disabled: resetLoading, style: { width: '100%' } },
            resetLoading ? 'SENDING...' : 'SEND RESET LINK'),
        ),

        e('div', { className: 'vauth-footer' },
          e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); setShowForgotPassword(false); } }, 'Back to Sign In'),
        ),
      ),
    );
  }

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

        e('div', { style: { textAlign: 'right', marginTop: '-8px' } },
          e('a', {
            href: '#',
            style: { fontSize: '12px', color: 'var(--accent-primary)', textDecoration: 'none' },
            onClick: (ev) => { ev.preventDefault(); setResetEmail(email); setShowForgotPassword(true); },
          }, 'Forgot password?'),
        ),

        error && e('div', { className: 'vauth-error' }, error),
        e(VantageUI.Button, { variant: 'primary', size: 'lg', type: 'submit', disabled: loading, style: { width: '100%' } },
          loading ? 'SIGNING IN...' : 'SIGN IN'),
      ),

      e('div', { className: 'vauth-divider' },
        e('span', null, 'OR'),
      ),

      e(VantageUI.Button, {
        variant: 'secondary', style: { width: '100%' }, disabled: loading,
        onClick: handleGoogleSignIn,
      }, 'SIGN IN WITH GOOGLE'),

      e('div', { className: 'vauth-footer' },
        e('span', { className: 'text-secondary' }, "Don't have an account? "),
        e('a', { href: '#', onClick: (ev) => { ev.preventDefault(); onNavigate('register'); } }, 'Register'),
      ),
    ),
  );
};
