import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [sections, setSections] = useState({});   // keyed by courseId
  const [semester, setSemester] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Multi-select cart: { sectionId -> { courseId, courseCode, courseName, courseType, sectionName, credits } }
  const [cart, setCart] = useState({});

  // Registration status summary
  const [statusSummary, setStatusSummary] = useState(null);

  // Attendance detail modal
  const [showAttModal, setShowAttModal] = useState(null);
  const [attDetail, setAttDetail] = useState([]);
  const [attDetailLoading, setAttDetailLoading] = useState(false);

  // Drop confirmation
  const [dropTarget, setDropTarget] = useState(null);

  // Print ref
  const printRef = useRef(null);

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

  const fetchStatusSummary = useCallback(async () => {
    try {
      const { data } = await api.get(`/registration/status-summary/${user.id}`);
      setStatusSummary(data);
    } catch (err) {
      console.error(err);
    }
  }, [user.id]);

  useEffect(() => { fetchRegistrations(); fetchStatusSummary(); }, [fetchRegistrations, fetchStatusSummary]);

  // Load active semester (admin-controlled)
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

  // Load sections for a specific course
  const loadSections = async (courseId) => {
    if (sections[courseId]) return; // already loaded
    try {
      const { data } = await api.get(`/lookup/sections?courseId=${courseId}&semester=${semester}`);
      setSections(prev => ({ ...prev, [courseId]: data }));
    } catch (err) {
      console.error(err);
    }
  };

  // Cart management
  const addToCart = (sectionId, course, section) => {
    setCart(prev => ({
      ...prev,
      [sectionId]: {
        courseId: course.COURSE_ID,
        courseCode: course.COURSE_CODE,
        courseName: course.COURSE_NAME,
        courseType: course.COURSE_TYPE,
        credits: course.CREDITS,
        sectionName: section.SECTION_NAME,
        sectionId: section.SECTION_ID,
      }
    }));
  };

  const removeFromCart = (sectionId) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });
  };

  const isCourseInCart = (courseId) => {
    return Object.values(cart).some(c => c.courseId === courseId);
  };

  // Count by type
  const cartTheory = Object.values(cart).filter(c => c.courseType === 'THEORY').length;
  const cartPractical = Object.values(cart).filter(c => c.courseType === 'PRACTICAL').length;
  const existingTheory = statusSummary?.theoryCount || 0;
  const existingPractical = statusSummary?.practicalCount || 0;

  const handleBulkRegister = async () => {
    const sectionIds = Object.keys(cart).map(Number);
    if (sectionIds.length === 0) return;

    setRegError(''); setRegSuccess(''); setRegLoading(true);
    try {
      const { data } = await api.post('/registration/bulk', { sectionIds });
      setRegSuccess(data.message);
      setCart({});
      setShowRegForm(false);
      fetchRegistrations();
      fetchStatusSummary();
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
      fetchStatusSummary();
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

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Registration Form - ${user.firstName} ${user.lastName}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { text-align: center; margin-bottom: 4px; font-size: 22px; }
        h2 { text-align: center; margin-bottom: 20px; font-size: 16px; color: #555; }
        .info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        .info div { flex: 1; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; font-size: 13px; }
        th { background-color: #f0f0f0; font-weight: 600; }
        .type-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
        .theory { background: #dbeafe; color: #1e40af; }
        .practical { background: #dcfce7; color: #166534; }
        .footer { margin-top: 60px; display: flex; justify-content: space-between; }
        .footer div { text-align: center; width: 200px; }
        .footer .line { border-top: 1px solid #333; margin-top: 40px; padding-top: 4px; font-size: 13px; }
        .status { font-weight: bold; color: #16a34a; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${printContent.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const activeRegs = registrations.filter(r => r.STATUS === 'ACTIVE');
  const pendingRegs = registrations.filter(r => r.STATUS === 'PENDING');
  const currentSemRegs = registrations.filter(r => r.SEMESTER === semester && r.STATUS !== 'DROPPED' && r.STATUS !== 'REJECTED' && r.STATUS !== 'CANCELLED');

  // Group courses by type for display
  const theoryCourses = courses.filter(c => c.COURSE_TYPE === 'THEORY');
  const practicalCourses = courses.filter(c => c.COURSE_TYPE === 'PRACTICAL');

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Welcome */}
        <div className="mb-8 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-text-main">Welcome, {user.firstName}! 👋</h2>
          <p className="mt-1 text-text-muted">Manage your courses and track attendance.</p>
        </div>

        {/* Registration Status Banner */}
        {statusSummary && statusSummary.status !== 'NOT_REGISTERED' && statusSummary.status !== 'NO_SEMESTER' && (
          <div className={`mb-6 rounded-2xl border p-4 flex items-center justify-between animate-fade-in-up ${
            statusSummary.status === 'APPROVED' ? 'border-success/30 bg-success/10' :
            statusSummary.status === 'PENDING' ? 'border-warning/30 bg-warning/10' :
            'border-primary/30 bg-primary/10'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {statusSummary.status === 'APPROVED' ? '✅' : statusSummary.status === 'PENDING' ? '⏳' : '📋'}
              </span>
              <div>
                <p className={`font-semibold ${
                  statusSummary.status === 'APPROVED' ? 'text-success' :
                  statusSummary.status === 'PENDING' ? 'text-warning' : 'text-primary-light'
                }`}>
                  Registration Status: {statusSummary.status === 'APPROVED' ? 'APPROVED' :
                    statusSummary.status === 'PENDING' ? 'PENDING — Awaiting Batch Coordinator Approval' :
                    'PARTIALLY APPROVED'}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {semester} • Theory: {statusSummary.theoryCount}/6 • Practical: {statusSummary.practicalCount}/4
                  {statusSummary.pending > 0 && ` • ${statusSummary.pending} pending`}
                  {statusSummary.approved > 0 && ` • ${statusSummary.approved} approved`}
                </p>
              </div>
            </div>
            {statusSummary.status === 'APPROVED' && (
              <button onClick={handlePrint} className="btn-ghost text-sm flex items-center gap-2" id="print-reg-form">
                🖨️ Print Registration Form
              </button>
            )}
          </div>
        )}

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
          <button onClick={() => { setShowRegForm(!showRegForm); setRegError(''); setRegSuccess(''); setCart({}); }} className="btn-primary text-sm" id="register-course-btn">
            {showRegForm ? 'Cancel' : '+ Register Courses'}
          </button>
        </div>

        {/* ── Registration Form — Multi-Course Selection ────────── */}
        {showRegForm && (
          <div className="glass-card mb-6 animate-fade-in-up">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-semibold text-text-main">Sem. Course Registration</h4>
              <span className="rounded-lg bg-primary/20 px-3 py-1 text-sm font-semibold text-primary-light">{semester}</span>
            </div>

            {/* Instructions Banner */}
            <div className="mb-4 rounded-xl bg-white/5 border border-white/10 p-4 text-xs text-text-muted space-y-1">
              <p className="font-semibold text-text-main text-sm mb-2">📋 Registration Instructions</p>
              <p>• Select your courses (max <strong className="text-primary-light">6 Theory</strong> + <strong className="text-accent">4 Practical</strong>)</p>
              <p>• Consult your Batch Coordinator before finalizing.</p>
              <p>• Click <strong className="text-text-main">"APPLY FOR REGISTRATION"</strong> to submit all selected courses.</p>
              <p>• Your Batch Coordinator will review and approve your registration online.</p>
              <p>• Status will change to <strong className="text-warning">PENDING</strong> → <strong className="text-success">APPROVED</strong>.</p>
            </div>

            {/* Selection Counters */}
            <div className="mb-4 flex gap-4 items-center">
              <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border ${
                (existingTheory + cartTheory) > 6 ? 'border-danger/50 bg-danger/10 text-danger' : 'border-primary/30 bg-primary/10 text-primary-light'
              }`}>
                📖 Theory: <strong>{existingTheory + cartTheory}</strong>/6
              </div>
              <div className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border ${
                (existingPractical + cartPractical) > 4 ? 'border-danger/50 bg-danger/10 text-danger' : 'border-accent/30 bg-accent/10 text-accent'
              }`}>
                🔬 Practical: <strong>{existingPractical + cartPractical}</strong>/4
              </div>
              <span className="text-xs text-text-muted ml-auto">
                {Object.keys(cart).length} course(s) in cart
              </span>
            </div>

            {/* Course List — Theory */}
            {theoryCourses.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-semibold text-primary-light mb-2 flex items-center gap-2">
                  📖 Theory Courses ({theoryCourses.length})
                </h5>
                <div className="space-y-2">
                  {theoryCourses.map(course => {
                    const alreadyRegistered = currentSemRegs.some(r => r.COURSE_CODE === course.COURSE_CODE);
                    const inCart = isCourseInCart(course.COURSE_ID);
                    const disabled = alreadyRegistered || ((existingTheory + cartTheory) >= 6 && !inCart);
                    return (
                      <CourseSelectRow
                        key={course.COURSE_ID}
                        course={course}
                        inCart={inCart}
                        disabled={disabled}
                        alreadyRegistered={alreadyRegistered}
                        sections={sections[course.COURSE_ID]}
                        onExpand={() => loadSections(course.COURSE_ID)}
                        onSelect={(sec) => addToCart(sec.SECTION_ID, course, sec)}
                        onDeselect={(secId) => removeFromCart(secId)}
                        cart={cart}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Course List — Practical */}
            {practicalCourses.length > 0 && (
              <div className="mb-4">
                <h5 className="text-sm font-semibold text-accent mb-2 flex items-center gap-2">
                  🔬 Practical Courses ({practicalCourses.length})
                </h5>
                <div className="space-y-2">
                  {practicalCourses.map(course => {
                    const alreadyRegistered = currentSemRegs.some(r => r.COURSE_CODE === course.COURSE_CODE);
                    const inCart = isCourseInCart(course.COURSE_ID);
                    const disabled = alreadyRegistered || ((existingPractical + cartPractical) >= 4 && !inCart);
                    return (
                      <CourseSelectRow
                        key={course.COURSE_ID}
                        course={course}
                        inCart={inCart}
                        disabled={disabled}
                        alreadyRegistered={alreadyRegistered}
                        sections={sections[course.COURSE_ID]}
                        onExpand={() => loadSections(course.COURSE_ID)}
                        onSelect={(sec) => addToCart(sec.SECTION_ID, course, sec)}
                        onDeselect={(secId) => removeFromCart(secId)}
                        cart={cart}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {courses.length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No courses available for this semester.</p>
            )}

            {/* Cart Summary & Submit */}
            {Object.keys(cart).length > 0 && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <h5 className="text-sm font-semibold text-text-main mb-2">Selected Courses ({Object.keys(cart).length})</h5>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.values(cart).map(item => (
                    <span key={item.sectionId} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                      <span className={`inline-block w-2 h-2 rounded-full ${item.courseType === 'THEORY' ? 'bg-primary' : 'bg-accent'}`}></span>
                      <strong className="text-text-main">{item.courseCode}</strong>
                      <span className="text-text-muted">Sec {item.sectionName}</span>
                      <button onClick={() => removeFromCart(item.sectionId)} className="ml-1 text-danger hover:text-danger/80">✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleBulkRegister} className="btn-primary text-sm" disabled={regLoading} id="apply-for-registration">
                    {regLoading ? 'Submitting…' : '📝 APPLY FOR REGISTRATION'}
                  </button>
                  <span className="text-xs text-text-muted">
                    Total Credits: {Object.values(cart).reduce((a, c) => a + (c.credits || 0), 0)}
                  </span>
                </div>
              </div>
            )}

            {regError && <p className="mt-3 text-sm text-danger">{regError}</p>}
          </div>
        )}

        {/* ── Course Cards ──────────────────────────────── */}
        {loadingReg ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-48 rounded-2xl" />)}
          </div>
        ) : registrations.length === 0 ? (
          <div className="glass-card text-center">
            <p className="text-text-muted">No courses registered yet. Click "Register Courses" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {registrations.map((reg, i) => (
              <div key={reg.REGISTRATION_ID} className="glass-card animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-text-main">{reg.COURSE_CODE}</h4>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        reg.COURSE_TYPE === 'PRACTICAL' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary-light'
                      }`}>
                        {reg.COURSE_TYPE === 'PRACTICAL' ? '🔬 PRAC' : '📖 THY'}
                      </span>
                    </div>
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

      {/* ── Printable Registration Form (hidden) ────────── */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <h1>VNIT Nagpur — Semester Course Registration Form</h1>
          <h2>{semester}</h2>
          <div className="info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '14px' }}>
            <div><strong>Name:</strong> {user.firstName} {user.lastName}</div>
            <div><strong>Student ID:</strong> {user.id}</div>
            <div><strong>Status:</strong> <span className="status">{statusSummary?.status}</span></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sr.</th>
                <th>Course Code</th>
                <th>Course Name</th>
                <th>Type</th>
                <th>Section</th>
                <th>Credits</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentSemRegs.map((reg, i) => (
                <tr key={reg.REGISTRATION_ID}>
                  <td>{i + 1}</td>
                  <td>{reg.COURSE_CODE}</td>
                  <td>{reg.COURSE_NAME}</td>
                  <td><span className={`type-badge ${reg.COURSE_TYPE === 'PRACTICAL' ? 'practical' : 'theory'}`}>
                    {reg.COURSE_TYPE}
                  </span></td>
                  <td>{reg.SECTION_NAME}</td>
                  <td>{reg.CREDITS}</td>
                  <td>{reg.STATUS}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '16px', fontSize: '13px' }}>
            <strong>Total Credits:</strong> {currentSemRegs.reduce((a, r) => a + (r.CREDITS || 0), 0)} &nbsp;|&nbsp;
            <strong>Theory:</strong> {currentSemRegs.filter(r => r.COURSE_TYPE === 'THEORY').length} &nbsp;|&nbsp;
            <strong>Practical:</strong> {currentSemRegs.filter(r => r.COURSE_TYPE === 'PRACTICAL').length}
          </p>
          <div className="footer" style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <div className="line" style={{ borderTop: '1px solid #333', marginTop: '40px', paddingTop: '4px', fontSize: '13px' }}>Student Signature</div>
            </div>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <div className="line" style={{ borderTop: '1px solid #333', marginTop: '40px', paddingTop: '4px', fontSize: '13px' }}>Batch Coordinator</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Attendance Detail Modal ─────────────────────── */}
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

      {/* ── Drop Confirmation Modal ─────────────────────── */}
      {dropTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-sm animate-fade-in-up text-center">
            <h3 className="mb-2 text-lg font-bold text-text-main">Request Drop</h3>
            <p className="mb-6 text-sm text-text-muted">Are you sure you want to request to drop this course? Batch Coordinator approval is required.</p>
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

// ── Sub-component: Course Selection Row ─────────────────
function CourseSelectRow({ course, inCart, disabled, alreadyRegistered, sections, onExpand, onSelect, onDeselect, cart }) {
  const [expanded, setExpanded] = useState(false);
  const selectedSectionId = Object.keys(cart).find(sid => cart[sid]?.courseId === course.COURSE_ID);

  const handleToggle = () => {
    if (!expanded) {
      onExpand();
    }
    setExpanded(!expanded);
  };

  return (
    <div className={`rounded-xl border transition-all ${
      alreadyRegistered ? 'border-success/20 bg-success/5 opacity-60' :
      inCart ? 'border-primary/30 bg-primary/5' :
      'border-white/10 bg-white/[0.02] hover:border-white/20'
    }`}>
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={handleToggle}>
        <div className="flex items-center gap-3">
          <span className={`text-lg ${expanded ? 'rotate-90' : ''} transition-transform duration-200`}>▸</span>
          <div>
            <span className="font-semibold text-text-main text-sm">{course.COURSE_CODE}</span>
            <span className="text-text-muted text-sm ml-2">{course.COURSE_NAME}</span>
            <span className="ml-2 text-xs text-text-muted">({course.CREDITS} cr)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {alreadyRegistered && (
            <span className="rounded-md bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">ALREADY REGISTERED</span>
          )}
          {inCart && (
            <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary-light">SELECTED ✓</span>
          )}
        </div>
      </div>
      
      {expanded && !alreadyRegistered && (
        <div className="border-t border-white/10 px-4 py-3 space-y-1.5">
          {!sections ? (
            <div className="skeleton h-8 rounded-lg" />
          ) : sections.length === 0 ? (
            <p className="text-xs text-text-muted">No sections available.</p>
          ) : (
            sections.map(sec => {
              const isSelected = selectedSectionId === String(sec.SECTION_ID);
              return (
                <div key={sec.SECTION_ID} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all ${
                  isSelected ? 'bg-primary/15 border border-primary/30' : 'bg-white/5 hover:bg-white/10'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-text-main">Sec {sec.SECTION_NAME}</span>
                    <span className="text-text-muted">{sec.ROOM || 'TBA'}</span>
                    {sec.COORDINATOR_NAME && <span className="text-text-muted">• {sec.COORDINATOR_NAME}</span>}
                    {sec.SCHEDULE && <span className="text-text-muted">• {sec.SCHEDULE}</span>}
                  </div>
                  {isSelected ? (
                    <button onClick={(e) => { e.stopPropagation(); onDeselect(sec.SECTION_ID); }}
                      className="rounded-lg bg-danger/20 px-3 py-1 font-semibold text-danger hover:bg-danger/30 transition-all">
                      Deselect
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); onSelect(sec); }}
                      disabled={disabled || inCart}
                      className="rounded-lg bg-primary/20 px-3 py-1 font-semibold text-primary-light hover:bg-primary/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      Select
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
