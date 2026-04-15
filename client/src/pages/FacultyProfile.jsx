import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function FacultyProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/lookup/faculty-profile/${user.id}`)
      .then(({ data }) => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="glass-card animate-fade-in-up text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-3xl font-bold text-white shadow-lg">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton mx-auto h-5 w-48 rounded" />)}
            </div>
          ) : profile ? (
            <>
              <h2 className="text-2xl font-bold text-text-main">{profile.FIRST_NAME} {profile.LAST_NAME}</h2>
              <p className="text-sm text-text-muted">{profile.EMAIL}</p>
              <span className="mt-2 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary-light">{profile.DESIGNATION}</span>

              <div className="mt-6 grid grid-cols-2 gap-4 text-left">
                {[
                  { label: 'Faculty ID', value: profile.INSTRUCTOR_ID },
                  { label: 'Department', value: profile.DEPT_NAME },
                  { label: 'College', value: 'VNIT — Visvesvaraya National Institute of Technology' },
                  { label: 'Phone', value: profile.PHONE || '—' },
                  { label: 'Hire Date', value: profile.HIRE_DATE ? new Date(profile.HIRE_DATE).toLocaleDateString('en-IN') : '—' },
                  { label: 'Sections', value: profile.SECTION_COUNT || 0 },
                ].map((item, i) => (
                  <div key={i} className="rounded-xl bg-white/5 p-3">
                    <p className="text-xs text-text-muted">{item.label}</p>
                    <p className="font-semibold text-text-main">{item.value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-text-muted">Could not load profile.</p>
          )}
        </div>
      </main>
    </div>
  );
}
