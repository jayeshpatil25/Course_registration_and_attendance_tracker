import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSemester, setActiveSemester] = useState('');

  useEffect(() => {
    if (user) {
      api.get('/lookup/active-semester')
        .then(({ data }) => setActiveSemester(data.semester || ''))
        .catch(() => {});
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinks = () => {
    if (!user) return [];
    if (user.role === 'student') return [
      { path: '/student', label: 'Dashboard' },
      { path: '/student/profile', label: 'Profile' },
    ];
    if (user.role === 'instructor') return [
      { path: '/faculty', label: 'Dashboard' },
      { path: '/faculty/profile', label: 'Profile' },
    ];
    if (user.role === 'admin') return [
      { path: '/admin', label: 'Dashboard' },
    ];
    return [];
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-white shadow-lg">
            U
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-text-main">UniTrack</h1>
            <p className="text-xs text-text-muted">VNIT Academic Portal</p>
          </div>
        </div>

        {/* Nav Links + Semester Badge */}
        {user && (
          <div className="hidden items-center gap-6 md:flex">
            {navLinks().map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'text-primary-light'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {link.label}
              </button>
            ))}
            {activeSemester && (
              <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                📅 {activeSemester}
              </span>
            )}
          </div>
        )}

        {/* User Info + Logout */}
        {user && (
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-text-main">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs capitalize text-text-muted">{user.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-light">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <button onClick={handleLogout} className="btn-ghost text-sm" id="logout-btn">
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
