import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeSemester, setActiveSemester] = useState('');
  const [semesters] = useState([
    { value: 'ODD-2025', label: 'Odd Semester 2025' },
    { value: 'EVEN-2025', label: 'Even Semester 2025' },
    { value: 'ODD-2024', label: 'Odd Semester 2024' },
    { value: 'EVEN-2024', label: 'Even Semester 2024' },
  ]);
  const [courses, setCourses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/admin/semester').then(({ data }) => setActiveSemester(data.SEMESTER || '')).catch(() => {});
    api.get('/admin/courses').then(({ data }) => setCourses(data)).catch(console.error);
    api.get('/admin/registrations')
      .then(({ data }) => setRegistrations(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSetSemester = async (sem) => {
    try {
      await api.put('/admin/semester', { semester: sem });
      setActiveSemester(sem);
      setMessage(`Active semester updated to ${sem}`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Failed to update semester.');
    }
  };

  // Group courses by course_code
  const courseGroups = courses.reduce((acc, row) => {
    const key = row.COURSE_CODE;
    if (!acc[key]) acc[key] = { code: row.COURSE_CODE, name: row.COURSE_NAME, credits: row.CREDITS, dept: row.DEPT_NAME, sections: [] };
    if (row.SECTION_ID) acc[key].sections.push(row);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-text-main">Admin Dashboard ⚙️</h2>
          <p className="mt-1 text-text-muted">Manage semesters, courses, and registrations.</p>
        </div>

        {/* Semester Management */}
        <div className="glass-card mb-6 animate-fade-in-up">
          <h3 className="mb-4 font-semibold text-text-main">Active Semester</h3>
          <div className="flex flex-wrap items-center gap-3">
            {semesters.map((s) => (
              <button
                key={s.value}
                onClick={() => handleSetSemester(s.value)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
                  activeSemester === s.value
                    ? 'border-primary bg-primary/20 text-primary-light'
                    : 'border-white/15 text-text-muted hover:border-primary-light hover:text-text-main'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {message && <p className="mt-3 text-sm text-success">{message}</p>}
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Courses', value: Object.keys(courseGroups).length, icon: '📚' },
            { label: 'Sections', value: courses.filter(c => c.SECTION_ID).length, icon: '📋' },
            { label: 'Registrations', value: registrations.length, icon: '👥' },
          ].map((s, i) => (
            <div key={i} className="glass-card flex items-center gap-4">
              <span className="text-3xl">{s.icon}</span>
              <div>
                <p className="text-2xl font-bold text-text-main">{s.value}</p>
                <p className="text-sm text-text-muted">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Course–Semester Grid */}
        <h3 className="mb-4 text-lg font-semibold text-text-main">Courses & Sections</h3>
        <div className="space-y-3 mb-8">
          {Object.values(courseGroups).map((cg) => (
            <div key={cg.code} className="glass-card !p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-text-main">{cg.code}</span>
                  <span className="ml-2 text-sm text-text-muted">{cg.name}</span>
                  <span className="ml-2 text-xs text-accent">({cg.credits} credits)</span>
                </div>
                <span className="text-xs text-text-muted">{cg.dept}</span>
              </div>
              {cg.sections.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cg.sections.map((sec) => (
                    <span key={sec.SECTION_ID} className="rounded-lg bg-white/5 px-3 py-1 text-xs text-text-muted">
                      Sec {sec.SECTION_NAME} • {sec.SEMESTER} • {sec.COORDINATOR || 'No coordinator'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Recent Registrations */}
        <h3 className="mb-4 text-lg font-semibold text-text-main">Recent Registrations</h3>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
        ) : (
          <div className="glass-card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-text-muted">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Semester</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Approval</th>
                </tr>
              </thead>
              <tbody>
                {registrations.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="px-4 py-2 text-text-main">{r.STUDENT_NAME}</td>
                    <td className="px-4 py-2 text-text-main">{r.COURSE_CODE}</td>
                    <td className="px-4 py-2 text-text-muted">{r.SECTION_NAME}</td>
                    <td className="px-4 py-2 text-text-muted">{r.SEMESTER}</td>
                    <td className="px-4 py-2"><span className={`badge ${r.STATUS === 'ACTIVE' ? 'badge-present' : r.STATUS === 'PENDING' ? 'badge-pending' : 'badge-absent'}`}>{r.STATUS}</span></td>
                    <td className="px-4 py-2"><span className={`badge ${r.APPROVAL_STATUS === 'APPROVED' ? 'badge-present' : r.APPROVAL_STATUS === 'PENDING' ? 'badge-pending' : 'badge-absent'}`}>{r.APPROVAL_STATUS}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
