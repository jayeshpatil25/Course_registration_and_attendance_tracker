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
      {/* Subtle decorative strip at top */}
      <div className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />

      <div className="animate-fade-in-up relative w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-white shadow-md">
            V
          </div>
          <h1 className="text-3xl font-bold text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
            AIMSREG
          </h1>
          <p className="mt-1 text-text-muted text-sm">
            Visvesvaraya National Institute of Technology, Nagpur
          </p>
        </div>

        {/* Card */}
        <div className="glass-card !shadow-md">
          <h2 className="text-lg font-semibold text-text-main mb-5 text-center">Sign in to your account</h2>

          {/* Role Toggle */}
          <div className="mb-6 flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1">
            {[{ key: 'student', label: 'Student' }, { key: 'instructor', label: 'Faculty' }, { key: 'admin', label: 'Admin' }].map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all duration-200 ${
                  role === r.key
                    ? 'bg-primary text-white shadow-sm'
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
                placeholder={role === 'student' ? 'student@aimsreg.edu' : role === 'instructor' ? 'faculty@aimsreg.edu' : 'admin@aimsreg.edu'}
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
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger" role="alert">
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
          © 2025 AIMSREG — VNIT Nagpur Academic Portal
        </p>
      </div>
    </div>
  );
}
