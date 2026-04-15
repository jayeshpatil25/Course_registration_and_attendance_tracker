import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('attendance'); // 'attendance' | 'approvals'

  // Section list
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState([]);
  const [attendanceState, setAttendanceState] = useState({});
  const [existingAttendance, setExistingAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Approval state
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Student detail modal
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);

  useEffect(() => {
    api.get(`/lookup/instructor-sections/${user.id}`)
      .then(({ data }) => setSections(data))
      .catch(console.error);
  }, []);

  const fetchPending = () => {
    setApprovalLoading(true);
    api.get(`/registration/pending-approvals/${user.id}`)
      .then(({ data }) => setPendingApprovals(data))
      .catch(console.error)
      .finally(() => setApprovalLoading(false));
  };

  useEffect(() => {
    if (tab === 'approvals') fetchPending();
  }, [tab]);

  useEffect(() => {
    if (!selectedSection) { setStudents([]); return; }
    setLoading(true);
    api.get(`/lookup/section-students/${selectedSection}`)
      .then(({ data }) => {
        setStudents(data);
        const state = {};
        data.forEach((s) => { state[s.STUDENT_ID] = 'PRESENT'; });
        setAttendanceState(state);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSection]);

  useEffect(() => {
    if (!selectedSection || !date) return;
    api.get(`/attendance/section/${selectedSection}/date/${date}`)
      .then(({ data }) => {
        setExistingAttendance(data);
        if (data.length > 0) {
          const state = { ...attendanceState };
          data.forEach((a) => { state[a.STUDENT_ID] = a.STATUS; });
          setAttendanceState(state);
        }
      })
      .catch(console.error);
  }, [selectedSection, date, students]);

  const handleStatusChange = (studentId, status) => {
    setAttendanceState((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status) => {
    const state = {};
    students.forEach((s) => { state[s.STUDENT_ID] = status; });
    setAttendanceState(state);
  };

  const handleSubmit = async () => {
    setSubmitLoading(true);
    setMessage({ type: '', text: '' });
    const records = students.map((s) => ({
      studentId: s.STUDENT_ID,
      status: attendanceState[s.STUDENT_ID] || 'PRESENT',
    }));
    try {
      const { data } = await api.post('/attendance/mark', {
        sectionId: Number(selectedSection),
        date,
        records,
      });
      setMessage({ type: 'success', text: `Attendance saved for ${data.count} students.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save attendance.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleApprove = async (regId) => {
    try {
      await api.put(`/registration/${regId}/approve`);
      fetchPending();
    } catch { alert('Failed to approve.'); }
  };

  const handleReject = async (regId) => {
    if (!confirm('Reject this registration?')) return;
    try {
      await api.put(`/registration/${regId}/reject`);
      fetchPending();
    } catch { alert('Failed to reject.'); }
  };

  // Open student detail modal
  const openStudentDetail = async (studentId) => {
    setStudentDetailLoading(true);
    setStudentDetail(null);
    try {
      const [profileRes, regRes, attRes] = await Promise.all([
        api.get(`/lookup/student-profile/${studentId}`),
        api.get(`/registration/${studentId}`),
        api.get(`/attendance/student/${studentId}`),
      ]);
      setStudentDetail({
        profile: profileRes.data,
        registrations: regRes.data,
        attendance: attRes.data,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setStudentDetailLoading(false);
    }
  };

  const statusOptions = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  const statusColors = {
    PRESENT: 'bg-success/20 text-success border-success/40',
    ABSENT: 'bg-danger/20 text-danger border-danger/40',
    LATE: 'bg-warning/20 text-warning border-warning/40',
    EXCUSED: 'bg-accent/20 text-accent border-accent/40',
  };

  const presentCount = Object.values(attendanceState).filter((v) => v === 'PRESENT').length;
  const absentCount = Object.values(attendanceState).filter((v) => v === 'ABSENT').length;
  const selectedSectionInfo = sections.find(s => String(s.SECTION_ID) === String(selectedSection));

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-text-main">Faculty Dashboard 🎓</h2>
          <p className="mt-1 text-text-muted">Manage attendance and approve course registrations.</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {[
            { key: 'attendance', label: '📝 Mark Attendance' },
            { key: 'approvals', label: `✅ Approvals ${pendingApprovals.length > 0 ? `(${pendingApprovals.length})` : ''}` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg'
                  : 'border border-white/15 text-text-muted hover:text-text-main'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Attendance Tab ──────────────────────────────── */}
        {tab === 'attendance' && (
          <>
            <div className="glass-card mb-6 animate-fade-in-up grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Section</label>
                <select className="input-field" value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} id="faculty-section-select">
                  <option value="">Select section</option>
                  {sections.map((s) => (
                    <option key={s.SECTION_ID} value={s.SECTION_ID}>
                      {s.COURSE_CODE} — Sec {s.SECTION_NAME} ({s.SEMESTER})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Date</label>
                <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} id="faculty-date-input" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={() => markAll('PRESENT')} className="btn-ghost flex-1 text-xs" id="mark-all-present">All Present</button>
                <button onClick={() => markAll('ABSENT')} className="btn-ghost flex-1 text-xs" id="mark-all-absent">All Absent</button>
              </div>
            </div>

            {selectedSectionInfo && (
              <div className="mb-4 flex flex-wrap gap-3 text-xs text-text-muted animate-fade-in-up">
                <span>📍 Room: <strong className="text-text-main">{selectedSectionInfo.ROOM}</strong></span>
                <span>🕐 Schedule: <strong className="text-text-main">{selectedSectionInfo.SCHEDULE}</strong></span>
                <span>📖 {selectedSectionInfo.COURSE_NAME} ({selectedSectionInfo.CREDITS} credits)</span>
              </div>
            )}

            {students.length > 0 && (
              <div className="mb-4 flex gap-4 text-sm animate-fade-in-up">
                <span className="text-text-muted">Total: <strong className="text-text-main">{students.length}</strong></span>
                <span className="text-success">Present: <strong>{presentCount}</strong></span>
                <span className="text-danger">Absent: <strong>{absentCount}</strong></span>
                {existingAttendance.length > 0 && (
                  <span className="ml-auto rounded-full bg-warning/20 px-3 py-0.5 text-xs text-warning">⚠ Editing existing records</span>
                )}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
            ) : students.length === 0 && selectedSection ? (
              <div className="glass-card text-center text-text-muted">No students registered in this section.</div>
            ) : (
              <div className="space-y-2">
                {students.map((stu, i) => (
                  <div key={stu.STUDENT_ID} className="glass-card flex items-center justify-between !p-4 animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-light">
                        {stu.FIRST_NAME?.[0]}{stu.LAST_NAME?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-main">{stu.FIRST_NAME} {stu.LAST_NAME}</p>
                        <p className="text-xs text-text-muted">ID: {stu.STUDENT_ID} • {stu.EMAIL}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {statusOptions.map((opt) => (
                        <button key={opt} onClick={() => handleStatusChange(stu.STUDENT_ID, opt)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                            attendanceState[stu.STUDENT_ID] === opt ? statusColors[opt] : 'border-white/10 text-text-muted hover:border-white/20'
                          }`}>{opt.charAt(0) + opt.slice(1).toLowerCase()}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {students.length > 0 && (
              <div className="mt-6 flex items-center gap-4">
                <button onClick={handleSubmit} className="btn-primary" disabled={submitLoading} id="submit-attendance-btn">
                  {submitLoading ? 'Saving…' : 'Save Attendance'}
                </button>
                {message.text && <p className={`text-sm ${message.type === 'success' ? 'text-success' : 'text-danger'}`}>{message.text}</p>}
              </div>
            )}
          </>
        )}

        {/* ── Approvals Tab ──────────────────────────────── */}
        {tab === 'approvals' && (
          <div className="animate-fade-in-up">
            {approvalLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
            ) : pendingApprovals.length === 0 ? (
              <div className="glass-card text-center text-text-muted">
                No pending approvals. All registrations have been reviewed. ✅
              </div>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map((p, i) => (
                  <div key={p.REGISTRATION_ID} className="glass-card !p-4 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary-light">
                          {p.FIRST_NAME?.[0]}{p.LAST_NAME?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-main">{p.FIRST_NAME} {p.LAST_NAME}</p>
                          <p className="text-xs text-text-muted">{p.EMAIL}</p>
                          <p className="mt-0.5 text-xs">
                            <span className="text-accent">{p.COURSE_CODE}</span>
                            <span className="text-text-muted"> — Sec {p.SECTION_NAME} • {p.SEMESTER}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openStudentDetail(p.STUDENT_ID)} className="rounded-lg bg-primary/20 px-3 py-2 text-xs font-semibold text-primary-light hover:bg-primary/30 transition-all">
                          👁 View Profile
                        </button>
                        <button onClick={() => handleApprove(p.REGISTRATION_ID)} className="rounded-lg bg-success/20 px-4 py-2 text-xs font-semibold text-success hover:bg-success/30 transition-all">
                          ✓ Approve
                        </button>
                        <button onClick={() => handleReject(p.REGISTRATION_ID)} className="rounded-lg bg-danger/20 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/30 transition-all">
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Student Detail Modal ──────────────────────────── */}
      {(studentDetail || studentDetailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setStudentDetail(null)}>
          <div className="glass-card max-h-[85vh] w-full max-w-2xl overflow-y-auto animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">Student Profile</h3>
              <button onClick={() => setStudentDetail(null)} className="text-text-muted hover:text-text-main text-lg">✕</button>
            </div>

            {studentDetailLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-6 rounded" />)}</div>
            ) : studentDetail ? (
              <>
                {/* Basic Info */}
                <div className="mb-4 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xl font-bold text-white">
                    {studentDetail.profile.FIRST_NAME?.[0]}{studentDetail.profile.LAST_NAME?.[0]}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-text-main">{studentDetail.profile.FIRST_NAME} {studentDetail.profile.LAST_NAME}</h4>
                    <p className="text-sm text-text-muted">{studentDetail.profile.EMAIL}</p>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Student ID', value: studentDetail.profile.STUDENT_ID },
                    { label: 'Department', value: studentDetail.profile.DEPT_NAME },
                    { label: 'Enrollment Year', value: studentDetail.profile.ENROLLMENT_YEAR },
                    { label: 'Current Semester', value: studentDetail.profile.SEMESTER },
                    { label: 'College', value: 'VNIT Nagpur' },
                    { label: 'Phone', value: studentDetail.profile.PHONE || '—' },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl bg-white/5 p-3">
                      <p className="text-xs text-text-muted">{item.label}</p>
                      <p className="text-sm font-semibold text-text-main">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Registered Courses */}
                <h5 className="mb-2 text-sm font-semibold text-text-main">Registered Courses ({studentDetail.registrations.length})</h5>
                <div className="mb-4 space-y-1">
                  {studentDetail.registrations.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <span className="text-text-main">{r.COURSE_CODE} — {r.COURSE_NAME} (Sec {r.SECTION_NAME})</span>
                      <span className={`badge ${r.STATUS === 'ACTIVE' ? 'badge-present' : r.STATUS === 'PENDING' ? 'badge-pending' : 'badge-absent'}`}>
                        {r.STATUS}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Attendance Summary */}
                <h5 className="mb-2 text-sm font-semibold text-text-main">Recent Attendance ({studentDetail.attendance.length} records)</h5>
                {studentDetail.attendance.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {studentDetail.attendance.slice(0, 20).map((a, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs">
                        <span className="text-text-muted">
                          {new Date(a.ATTENDANCE_DATE).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} — {a.COURSE_CODE}
                        </span>
                        <span className={`badge ${a.STATUS === 'PRESENT' ? 'badge-present' : a.STATUS === 'ABSENT' ? 'badge-absent' : 'badge-late'}`}>
                          {a.STATUS}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No attendance records yet.</p>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
