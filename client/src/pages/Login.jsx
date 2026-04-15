import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password, role });
      login(data.token, data.user);
      navigate(role === 'student' ? '/student' : role === 'instructor' ? '/faculty' : '/admin');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <div className="animate-fade-in-up relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white shadow-xl">
            U
          </div>
          <h1 className="text-3xl font-bold text-text-main">UniTrack</h1>
          <p className="mt-1 text-text-muted">Student Registration & Attendance Portal</p>
        </div>

        {/* Card */}
        <div className="glass-card">
          {/* Role Toggle */}
          <div className="mb-6 flex overflow-hidden rounded-xl border border-white/10 bg-surface p-1">
            {[{ key: 'student', label: 'Student' }, { key: 'instructor', label: 'Faculty' }, { key: 'admin', label: 'Admin' }].map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
                  role === r.key
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-md'
                    : 'text-text-muted hover:text-text-main'
                }`}
                id={`role-toggle-${r.key}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted" htmlFor="email-input">
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                className="input-field"
                placeholder={role === 'student' ? 'student@university.edu' : role === 'instructor' ? 'faculty@university.edu' : 'admin@university.edu'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted" htmlFor="password-input">
                Password
              </label>
              <input
                id="password-input"
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
              id="login-submit-btn"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                `Sign in as ${role === 'instructor' ? 'Faculty' : role === 'admin' ? 'Admin' : 'Student'}`
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          © 2025 UniTrack — University Academic Portal
        </p>
      </div>
    </div>
  );
}
