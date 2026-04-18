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
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(user?.role === 'student' ? '/student' : user?.role === 'instructor' ? '/faculty' : '/admin')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white shadow-sm">
            V
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
              AIMSREG
            </h1>
            <p className="text-[11px] text-text-muted tracking-wide">VNIT Academic Portal</p>
          </div>
        </div>

        {/* Nav Links + Semester Badge */}
        {user && (
          <div className="hidden items-center gap-1 md:flex">
            {navLinks().map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  location.pathname === link.path
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-text-muted hover:bg-gray-100 hover:text-text-main'
                }`}
              >
                {link.label}
              </button>
            ))}
            {activeSemester && (
              <span className="ml-3 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700">
                📅 {activeSemester}
              </span>
            )}
          </div>
        )}

        {/* User Info + Logout */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-text-main">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs capitalize text-text-muted">{user.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <button onClick={handleLogout} className="btn-ghost !py-2 !px-3 text-sm" id="logout-btn">
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
