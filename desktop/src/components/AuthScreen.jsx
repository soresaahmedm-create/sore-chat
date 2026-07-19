import React, { useState } from 'react';
import { signIn, signUp } from '../firebase.js';

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = mode === 'signup' ? await signUp(email, password, name) : await signIn(email, password);
      onAuthed(user);
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.pulse} />
          Sore Chat
        </div>
        <div style={styles.sub}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <input
              style={styles.input}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.cta} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <div style={styles.switchRow}>
          {mode === 'signin' ? (
            <>Don't have an account? <span style={styles.link} onClick={() => setMode('signup')}>Sign up</span></>
          ) : (
            <>Already have an account? <span style={styles.link} onClick={() => setMode('signin')}>Sign in</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function friendlyError(code) {
  if (code?.includes('email-already-in-use')) return 'That email already has an account — try signing in.';
  if (code?.includes('invalid-credential') || code?.includes('wrong-password')) return 'Incorrect email or password.';
  if (code?.includes('user-not-found')) return 'No account found with that email.';
  if (code?.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code?.includes('invalid-email')) return 'That email address looks invalid.';
  return 'Something went wrong. Please try again.';
}

const styles = {
  wrap: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' },
  card: { width: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 28, animation: 'modalIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both' },
  brand: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' },
  pulse: { width: 8, height: 8, borderRadius: '50%', background: 'var(--signal)' },
  sub: { color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 20px' },
  input: {
    width: '100%', boxSizing: 'border-box', background: 'var(--surface-raised)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '11px 13px', color: 'var(--text)', fontSize: 14, marginBottom: 10, outline: 'none',
  },
  error: { color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 },
  cta: {
    width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--signal)',
    color: 'var(--bg)', fontWeight: 700, cursor: 'pointer', fontSize: 14, marginTop: 4,
  },
  switchRow: { marginTop: 16, fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' },
  link: { color: 'var(--signal)', cursor: 'pointer' },
};
