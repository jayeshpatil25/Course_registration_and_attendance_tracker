import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [loadingReg, setLoadingReg] = useState(true);

  // Registration form
  const [showRegForm, setShowRegForm] = useState(false);
  const [courses, setCourses] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [semester, setSemester] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Attendance detail modal
  const [showAttModal, setShowAttModal] = useState(null);
  const [attDetail, setAttDetail] = useState([]);
  const [attDetailLoading, setAttDetailLoading] = useState(false);

  // Drop confirmation
  const [dropTarget, setDropTarget] = useState(null);

  const fetchRegistrations = useCallback(async () => {
    try {
      const { data } = await api.get(`/lookup/student-course-details/${user.id}`);
      const seen = new Set();
      const unique = [];
      for (const row of data) {
        if (!seen.has(row.REGISTRATION_ID)) {
          seen.add(row.REGISTRATION_ID);
          unique.push(row);
        }
      }
      setRegistrations(unique);
      const pctMap = {};
      for (const reg of unique.filter((r) => r.STATUS === 'ACTIVE')) {
        try {
          const res = await api.get(`/attendance/percentage/${user.id}/${reg.SECTION_ID}`);
          pctMap[reg.SECTION_ID] = res.data.percentage;
        } catch { pctMap[reg.SECTION_ID] = null; }
      }
      setAttendanceMap(pctMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReg(false);
    }
  }, [user.id]);

  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  // Load active semester (admin-controlled, no user choice)
  useEffect(() => {
    api.get('/lookup/active-semester').then(({ data }) => {
      setSemester(data.semester || '');
    }).catch(console.error);
  }, []);

  // Load courses filtered by semester
  useEffect(() => {
    if (showRegForm && semester) {
      api.get(`/lookup/courses?semester=${semester}`).then(({ data }) => setCourses(data)).catch(console.error);
    }
  }, [showRegForm, semester]);

  // Load sections
  useEffect(() => {
    if (selectedCourse && semester) {
      api.get(`/lookup/sections?courseId=${selectedCourse}&semester=${semester}`)
        .then(({ data }) => setSections(data)).catch(console.error);
    } else { setSections([]); }
  }, [selectedCourse, semester]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError(''); setRegSuccess(''); setRegLoading(true);
    try {
      await api.post('/registration', { sectionId: Number(selectedSection) });
      setRegSuccess('Registration submitted — pending faculty approval.');
      setShowRegForm(false);
      setSelectedCourse(''); setSelectedSection('');
      fetchRegistrations();
    } catch (err) {
      setRegError(err.response?.data?.error || 'Registration failed.');
    } finally { setRegLoading(false); }
  };

  const handleDrop = async () => {
    if (!dropTarget) return;
    try {
      await api.delete(`/registration/${dropTarget}`);
      setDropTarget(null);
      fetchRegistrations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to drop.');
      setDropTarget(null);
    }
  };

  const openAttendanceDetail = async (sectionId) => {
    setShowAttModal(sectionId);
    setAttDetailLoading(true);
    try {
      const { data } = await api.get(`/attendance/student/${user.id}`);
      setAttDetail(data.filter((a) => a.SECTION_ID === sectionId));
    } catch (err) { console.error(err); }
    finally { setAttDetailLoading(false); }
  };

  const getPctColor = (pct) => {
    if (pct === null || pct === undefined) return 'text-text-muted';
    if (pct >= 75) return 'text-success';
    if (pct >= 50) return 'text-warning';
    return 'text-danger';
  };

  const statusBadge = (status) => {
    const map = { PRESENT: 'badge-present', ABSENT: 'badge-absent', CANCELLED: 'bg-white/10 text-white border-white/20' };
    return map[status] || '';
  };

  const activeRegs = registrations.filter(r => r.STATUS === 'ACTIVE');
  const pendingRegs = registrations.filter(r => r.STATUS === 'PENDING');

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Welcome */}
        <div className="mb-8 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-text-main">Welcome, {user.firstName}! 👋</h2>
          <p className="mt-1 text-text-muted">Manage your courses and track attendance.</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[
            { label: 'Active Courses', value: activeRegs.length, icon: '📚' },
            { label: 'Pending Approval', value: pendingRegs.length, icon: '⏳' },
            { label: 'Total Credits', value: activeRegs.reduce((a, r) => a + (r.CREDITS || 0), 0), icon: '🎓' },
            { label: 'Avg Attendance', value: (() => { const vals = Object.values(attendanceMap).filter(v => v !== null); return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) + '%' : '—'; })(), icon: '📊' },
          ].map((s, i) => (
            <div key={i} className="glass-card flex items-center gap-4" style={{ animationDelay: `${i * 100}ms` }}>
              <span className="text-3xl">{s.icon}</span>
              <div>
                <p className="text-2xl font-bold text-text-main">{s.value}</p>
                <p className="text-sm text-text-muted">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Success / Error Messages */}
        {regSuccess && (
          <div className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success animate-fade-in-up">
            {regSuccess}
          </div>
        )}

        {/* Action Bar */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-main">My Courses</h3>
          <button onClick={() => { setShowRegForm(!showRegForm); setRegError(''); setRegSuccess(''); }} className="btn-primary text-sm" id="register-course-btn">
            {showRegForm ? 'Cancel' : '+ Register Course'}
          </button>
        </div>

        {/* Registration Form */}
        {showRegForm && (
          <div className="glass-card mb-6 animate-fade-in-up">
            <h4 className="mb-4 font-semibold text-text-main">Register for a Course</h4>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-text-muted">Active Semester:</span>
              <span className="rounded-lg bg-primary/20 px-3 py-1 font-semibold text-primary-light">{semester}</span>
            </div>
            <form onSubmit={handleRegister} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-text-muted">Course</label>
                <select className="input-field" value={selectedCourse} onChange={(e) => { setSelectedCourse(e.target.value); setSelectedSection(''); }} id="reg-course">
                  <option value="">Select course</option>
                  {courses.map((c) => <option key={c.COURSE_ID} value={c.COURSE_ID}>{c.COURSE_CODE} — {c.COURSE_NAME}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Section</label>
                <select className="input-field" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} id="reg-section">
                  <option value="">Select section</option>
                  {sections.map((s) => (
                    <option key={s.SECTION_ID} value={s.SECTION_ID}>
                      {s.SECTION_NAME} — {s.ROOM || 'TBA'} {s.COORDINATOR_NAME ? `(${s.COORDINATOR_NAME})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full text-sm" disabled={regLoading || !selectedSection} id="reg-submit">
                  {regLoading ? 'Submitting…' : 'Register'}
                </button>
              </div>
            </form>
            {regError && <p className="mt-3 text-sm text-danger">{regError}</p>}
          </div>
        )}

        {/* Course Cards */}
        {loadingReg ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
          </div>
        ) : registrations.length === 0 ? (
          <div className="glass-card text-center">
            <p className="text-text-muted">No courses registered yet. Click "Register Course" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {registrations.map((reg, i) => (
              <div key={reg.REGISTRATION_ID} className="glass-card animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-text-main">{reg.COURSE_CODE}</h4>
                    <p className="text-sm text-text-muted">{reg.COURSE_NAME}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`badge ${
                      reg.STATUS === 'ACTIVE' ? 'badge-present' : 
                      reg.STATUS === 'PENDING' ? 'badge-pending' : 
                      reg.STATUS === 'DROP_PENDING' ? 'badge-absent' :
                      reg.STATUS === 'DROPPED' ? 'badge-absent' : 
                      reg.STATUS === 'CANCELLED' ? 'badge-absent' : 'badge-absent'
                    }`}>{reg.STATUS}</span>
                    
                    {reg.STATUS === 'ACTIVE' && (
                      <button onClick={() => setDropTarget(reg.REGISTRATION_ID)} className="btn-danger p-2 px-3 text-xs ml-2">Request Drop</button>
                    )}
                    {reg.STATUS === 'DROP_PENDING' && (
                      <button disabled className="btn-danger p-2 px-3 text-xs opacity-50 cursor-not-allowed ml-2">Drop Pending</button>
                    )}
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
                  <span>Section: <strong className="text-text-main">{reg.SECTION_NAME}</strong></span>
                  <span>Credits: <strong className="text-text-main">{reg.CREDITS}</strong></span>
                  <span>Semester: <strong className="text-text-main">{reg.SEMESTER}</strong></span>
                  <span>Room: <strong className="text-text-main">{reg.ROOM || 'TBA'}</strong></span>
                  {reg.SCHEDULE && <span className="col-span-2">Schedule: <strong className="text-text-main">{reg.SCHEDULE}</strong></span>}
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {reg.SECTION_COORDINATOR && (
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary-light">👨‍🏫 {reg.SECTION_COORDINATOR}</span>
                  )}
                  {reg.BATCH_NAME && (
                    <span className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">
                      🔬 {reg.BATCH_NAME}{reg.BATCH_COORDINATOR ? `: ${reg.BATCH_COORDINATOR}` : ''}
                    </span>
                  )}
                </div>

                {/* Attendance Bar (only for ACTIVE) */}
                {reg.STATUS === 'ACTIVE' && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-text-muted">Attendance</span>
                      <span className={`font-bold ${getPctColor(attendanceMap[reg.SECTION_ID])}`}>
                        {attendanceMap[reg.SECTION_ID] != null ? `${attendanceMap[reg.SECTION_ID]}%` : '—'}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700" style={{ width: `${attendanceMap[reg.SECTION_ID] || 0}%` }} />
                    </div>
                    {attendanceMap[reg.SECTION_ID] != null && attendanceMap[reg.SECTION_ID] < 75 && (
                      <p className="mt-1 text-xs text-danger">⚠ Below 75% minimum attendance requirement</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-4">
                  {reg.STATUS === 'ACTIVE' && (
                    <button onClick={() => openAttendanceDetail(reg.SECTION_ID)} className="text-xs text-primary-light hover:underline">
                      📋 View Attendance
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Attendance Detail Modal */}
      {showAttModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAttModal(null)}>
          <div className="glass-card max-h-[80vh] w-full max-w-xl overflow-y-auto animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">Attendance Details</h3>
              <button onClick={() => setShowAttModal(null)} className="text-text-muted hover:text-text-main text-lg">✕</button>
            </div>
            {attDetailLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>
            ) : attDetail.length === 0 ? (
              <p className="text-text-muted text-sm">No attendance records yet.</p>
            ) : (
              <>
                {/* Summary */}
                <div className="mb-4 flex gap-4 text-sm">
                  <span className="text-success">Present: <strong>{attDetail.filter(a => a.STATUS === 'PRESENT').length}</strong></span>
                  <span className="text-danger">Absent: <strong>{attDetail.filter(a => a.STATUS === 'ABSENT').length}</strong></span>
                  <span className="text-text-muted">Cancelled: <strong>{attDetail.filter(a => a.STATUS === 'CANCELLED').length}</strong></span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-text-muted">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Course</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attDetail.map((a, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-2 text-text-main">{new Date(a.ATTENDANCE_DATE).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="py-2 text-text-muted">{a.COURSE_CODE} — {a.SECTION_NAME}</td>
                        <td className="py-2 text-right"><span className={`badge ${statusBadge(a.STATUS)}`}>{a.STATUS}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Drop Confirmation Modal */}
      {dropTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-sm animate-fade-in-up text-center">
            <h3 className="mb-2 text-lg font-bold text-text-main">Request Drop</h3>
            <p className="mb-6 text-sm text-text-muted">Are you sure you want to request to drop this course? Faculty approval is required.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setDropTarget(null)} className="btn-ghost text-sm">Cancel</button>
              <button onClick={handleDrop} className="rounded-xl bg-danger px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-danger/80" disabled={regLoading}>
                {regLoading ? 'Submitting…' : 'Confirm Drop Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
