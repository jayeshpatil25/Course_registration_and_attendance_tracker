import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview'); // 'overview' | 'fa-assignment'
  
  // Semester State
  const [activeSemester, setActiveSemester] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [newSemesterStr, setNewSemesterStr] = useState('');
  const [showAddSemester, setShowAddSemester] = useState(false);
  
  // Data State
  const [courses, setCourses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  // Course Modal State
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourse, setNewCourse] = useState({
    courseCode: '',
    courseName: '',
    deptId: '',
    credits: 3,
    description: '',
    courseType: 'THEORY'
  });

  // FA Assignment
  const [faFilter, setFaFilter] = useState({ dept: '', unassignedOnly: false });
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedFA, setSelectedFA] = useState('');
  const [faActionLoading, setFaActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [semListRes, semRes, dptRes, crsRes, regRes, instrRes, stuRes] = await Promise.all([
        api.get('/admin/semester-list').catch(() => ({ data: [] })),
        api.get('/admin/semester').catch(() => ({ data: {} })),
        api.get('/lookup/departments').catch(() => ({ data: [] })),
        api.get('/admin/courses').catch(() => ({ data: [] })),
        api.get('/admin/registrations').catch(() => ({ data: [] })),
        api.get('/lookup/instructors').catch(() => ({ data: [] })),
        api.get('/admin/students').catch(() => ({ data: [] })),
      ]);
      
      setSemesters(semListRes.data);
      setActiveSemester(semRes.data.SEMESTER || '');
      setDepartments(dptRes.data);
      setCourses(crsRes.data);
      setRegistrations(regRes.data);
      setInstructors(instrRes.data);
      setStudents(stuRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetSemester = async (sem) => {
    try {
      await api.put('/admin/semester', { semester: sem });
      setActiveSemester(sem);
      setMessage(`Active semester updated to ${sem}`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Failed to update active semester.');
    }
  };

  const handleAddSemester = async (e) => {
    e.preventDefault();
    if (!newSemesterStr.trim()) return;
    try {
      await api.post('/admin/semester-list', { semester: newSemesterStr });
      setMessage(`Semester ${newSemesterStr.toUpperCase()} added.`);
      setNewSemesterStr('');
      setShowAddSemester(false);
      fetchData(); // refresh list
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add semester.');
    }
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/courses', newCourse);
      setMessage(`Course ${newCourse.courseCode.toUpperCase()} added.`);
      setShowCourseModal(false);
      setNewCourse({ courseCode: '', courseName: '', deptId: '', credits: 3, description: '', courseType: 'THEORY' });
      fetchData(); // refresh courses
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add course.');
    }
  };

  // FA Assignment
  const handleAssignFA = async () => {
    if (selectedStudents.length === 0 || !selectedFA) return;
    setFaActionLoading(true);
    try {
      await api.put('/admin/bulk-assign-fa', { studentIds: selectedStudents, instructorId: Number(selectedFA) });
      setMessage(`FA assigned to ${selectedStudents.length} student(s).`);
      setSelectedStudents([]);
      setSelectedFA('');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign FA.');
    } finally { setFaActionLoading(false); }
  };

  const toggleStudent = (sid) => {
    setSelectedStudents(prev => prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]);
  };

  const selectAllFiltered = () => {
    const ids = filteredStudents.map(s => s.STUDENT_ID);
    setSelectedStudents(ids);
  };

  // Filter students for FA assignment tab
  const filteredStudents = students.filter(s => {
    if (faFilter.dept && s.DEPT_NAME !== faFilter.dept) return false;
    if (faFilter.unassignedOnly && s.FA_ID) return false;
    return true;
  });

  // Group courses by course_code
  const courseGroups = courses.reduce((acc, row) => {
    const key = row.COURSE_CODE;
    if (!acc[key]) acc[key] = { code: row.COURSE_CODE, name: row.COURSE_NAME, credits: row.CREDITS, dept: row.DEPT_NAME, courseType: row.COURSE_TYPE, sections: [] };
    if (row.SECTION_ID) acc[key].sections.push(row);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-surface relative pb-10">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-text-main">Admin Dashboard ⚙️</h2>
          <p className="mt-1 text-text-muted">Manage semesters, courses, FA assignments, and registrations.</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'fa-assignment', label: '👨‍🏫 Batch Coordinator Assignment' },
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

        {/* ── Overview Tab ──────────────────────────────── */}
        {tab === 'overview' && (
          <>
            {/* Semester Management */}
            <div className="glass-card mb-6 animate-fade-in-up">
              <h3 className="mb-4 font-semibold text-text-main flex items-center gap-2">
                Active Semester List
                <button onClick={() => setShowAddSemester(!showAddSemester)} className="btn-ghost !py-1 !px-2 text-xs">
                  + New
                </button>
              </h3>
              
              {showAddSemester && (
                <form onSubmit={handleAddSemester} className="mb-4 flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
                  <input 
                    type="text" 
                    placeholder="e.g. SUMMER-2026" 
                    value={newSemesterStr} 
                    onChange={(e) => setNewSemesterStr(e.target.value)}
                    className="input-field !mb-0 flex-1"
                    required
                  />
                  <button type="submit" className="btn-primary !px-4 !py-1.5 whitespace-nowrap">Add Semester</button>
                </form>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {semesters.length === 0 && <span className="text-sm text-text-muted">No semesters configured.</span>}
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
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
              {[
                { label: 'Courses', value: Object.keys(courseGroups).length, icon: '📚' },
                { label: 'Sections', value: courses.filter(c => c.SECTION_ID).length, icon: '📋' },
                { label: 'Registrations', value: registrations.length, icon: '👥' },
                { label: 'Students w/ Coordinator', value: students.filter(s => s.FA_ID).length + '/' + students.length, icon: '👨‍🏫' },
              ].map((s, i) => (
                <div key={i} className="glass-card flex items-center gap-4 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <p className="text-2xl font-bold text-text-main">{s.value}</p>
                    <p className="text-sm text-text-muted">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Course–Semester Grid */}
            <div className="flex items-center justify-between mb-4 animate-fade-in-up">
              <h3 className="text-lg font-semibold text-text-main">Courses & Sections</h3>
              <button onClick={() => setShowCourseModal(true)} className="btn-primary !py-1.5 !px-4 text-sm flex items-center gap-2">
                <span>+</span> Add Course
              </button>
            </div>
            <div className="space-y-3 mb-8 animate-fade-in-up">
              {Object.keys(courseGroups).length === 0 && <div className="glass-card text-center text-text-muted p-6">No courses established.</div>}
              {Object.values(courseGroups).map((cg) => (
                <div key={cg.code} className="glass-card !p-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-main">{cg.code}</span>
                      <span className="text-sm font-medium text-text-muted">{cg.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        cg.courseType === 'PRACTICAL' ? 'bg-accent/15 text-accent' : 'bg-primary/15 text-primary-light'
                      }`}>
                        {cg.courseType === 'PRACTICAL' ? '🔬 PRACTICAL' : '📖 THEORY'}
                      </span>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                        {cg.credits} credits
                      </span>
                    </div>
                    <span className="text-xs text-text-muted bg-white/5 px-2 py-1 rounded-md">{cg.dept}</span>
                  </div>
                  
                  <div className="mt-3">
                    {cg.sections.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {cg.sections.map((sec) => (
                          <span key={sec.SECTION_ID} className="rounded-lg bg-surface px-3 py-1.5 text-xs text-text-muted border border-white/10 flex items-center gap-2">
                            <span className="font-bold text-primary-light">Sec {sec.SECTION_NAME}</span> 
                            <span>•</span> 
                            <span className="text-text-main">{sec.SEMESTER}</span>
                            <span>•</span>
                            <span>{sec.COORDINATOR || 'No coordinator'}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted italic">No active sections currently registered.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Registrations */}
            <h3 className="mb-4 text-lg font-semibold text-text-main animate-fade-in-up">Recent Registrations</h3>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
            ) : (
              <div className="glass-card overflow-x-auto !p-0 animate-fade-in-up">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-text-muted">
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Semester</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-2 text-text-main font-medium">{r.STUDENT_NAME}</td>
                        <td className="px-4 py-2 text-primary-light font-bold">{r.COURSE_CODE}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            r.COURSE_TYPE === 'PRACTICAL' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary-light'
                          }`}>{r.COURSE_TYPE || 'THEORY'}</span>
                        </td>
                        <td className="px-4 py-2 text-text-muted">{r.SECTION_NAME}</td>
                        <td className="px-4 py-2 text-text-muted">{r.SEMESTER}</td>
                        <td className="px-4 py-2"><span className={`badge ${r.STATUS === 'ACTIVE' ? 'badge-present' : r.STATUS === 'PENDING' ? 'badge-pending' : 'badge-absent'}`}>{r.STATUS}</span></td>
                        <td className="px-4 py-2"><span className={`badge ${r.APPROVAL_STATUS === 'APPROVED' ? 'badge-present' : r.APPROVAL_STATUS === 'PENDING' ? 'badge-pending' : 'badge-absent'}`}>{r.APPROVAL_STATUS}</span></td>
                      </tr>
                    ))}
                    {registrations.length === 0 && (
                      <tr>
                        <td colSpan="7" className="text-center py-6 text-text-muted italic">No registrations to display</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Batch Coordinator Assignment Tab ──────────────────────────── */}
        {tab === 'fa-assignment' && (
          <div className="animate-fade-in-up">
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-muted">
              <p className="font-semibold text-primary-light mb-1">👨‍🏫 Batch Coordinator Assignment</p>
              <p className="text-xs">Assign Batch Coordinators to students. The Batch Coordinator will be responsible for approving course registrations. Select students and choose an instructor to assign.</p>
            </div>

            {/* Filters & Action Bar */}
            <div className="glass-card mb-4 !p-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Filter by Department</label>
                  <select className="input-field !py-2" value={faFilter.dept} onChange={(e) => setFaFilter(prev => ({ ...prev, dept: e.target.value }))}>
                    <option value="">All Departments</option>
                    {[...new Set(students.map(s => s.DEPT_NAME))].sort().map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-text-muted">
                    <input type="checkbox" checked={faFilter.unassignedOnly}
                      onChange={(e) => setFaFilter(prev => ({ ...prev, unassignedOnly: e.target.checked }))}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary" />
                    Unassigned only
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Assign Coordinator to Selected</label>
                  <select className="input-field !py-2" value={selectedFA} onChange={(e) => setSelectedFA(e.target.value)}>
                    <option value="">Select Instructor</option>
                    {instructors.map(inst => (
                      <option key={inst.INSTRUCTOR_ID} value={inst.INSTRUCTOR_ID}>
                        {inst.INSTRUCTOR_NAME}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAllFiltered} className="btn-ghost !py-2 text-xs flex-1">Select All ({filteredStudents.length})</button>
                  <button onClick={handleAssignFA}
                    disabled={faActionLoading || selectedStudents.length === 0 || !selectedFA}
                    className="btn-primary !py-2 text-xs flex-1 disabled:opacity-50">
                    {faActionLoading ? '...' : `Assign (${selectedStudents.length})`}
                  </button>
                </div>
              </div>
            </div>

            {/* Students Table */}
            <div className="glass-card overflow-x-auto !p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-text-muted">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                        onChange={(e) => e.target.checked ? selectAllFiltered() : setSelectedStudents([])}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary cursor-pointer" />
                    </th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Year / Sem</th>
                    <th className="px-4 py-3">Current Coordinator</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr key={s.STUDENT_ID}
                      className={`border-b border-white/5 transition-colors cursor-pointer ${
                        selectedStudents.includes(s.STUDENT_ID) ? 'bg-primary/10' : 'hover:bg-white/5'
                      }`}
                      onClick={() => toggleStudent(s.STUDENT_ID)}>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedStudents.includes(s.STUDENT_ID)}
                          onChange={() => toggleStudent(s.STUDENT_ID)}
                          className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary cursor-pointer" />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-text-main">{s.FIRST_NAME} {s.LAST_NAME}</p>
                        <p className="text-xs text-text-muted">{s.EMAIL}</p>
                      </td>
                      <td className="px-4 py-2 text-text-muted">{s.DEPT_NAME}</td>
                      <td className="px-4 py-2 text-text-muted">{s.ENROLLMENT_YEAR} / Sem {s.SEMESTER}</td>
                      <td className="px-4 py-2">
                        {s.FA_NAME ? (
                          <span className="rounded-md bg-success/15 px-2 py-1 text-xs text-success font-semibold">{s.FA_NAME}</span>
                        ) : (
                          <span className="rounded-md bg-warning/15 px-2 py-1 text-xs text-warning font-semibold">Not Assigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-6 text-text-muted italic">No students match the filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-main">Add New Course</h3>
              <button onClick={() => setShowCourseModal(false)} className="text-text-muted hover:text-white text-xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleAddCourse} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Course Code</label>
                <input type="text" className="input-field" placeholder="e.g. CSL401 (Theory) or CSP401 (Practical)" value={newCourse.courseCode} onChange={(e) => setNewCourse({...newCourse, courseCode: e.target.value})} required maxLength={20} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Course Name</label>
                <input type="text" className="input-field" placeholder="e.g. Advanced Databases" value={newCourse.courseName} onChange={(e) => setNewCourse({...newCourse, courseName: e.target.value})} required maxLength={200} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Department</label>
                <select className="input-field appearance-none bg-surface" value={newCourse.deptId} onChange={(e) => setNewCourse({...newCourse, deptId: e.target.value})} required>
                  <option value="" disabled>Select a department</option>
                  {departments.map(d => <option key={d.DEPT_ID} value={d.DEPT_ID}>{d.DEPT_NAME}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Credits (1-6)</label>
                  <input type="number" min="1" max="6" className="input-field" value={newCourse.credits} onChange={(e) => setNewCourse({...newCourse, credits: e.target.value})} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Course Type</label>
                  <div className="flex gap-2 mt-1">
                    <button type="button"
                      onClick={() => setNewCourse({...newCourse, courseType: 'THEORY'})}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                        newCourse.courseType === 'THEORY'
                          ? 'border-primary bg-primary/20 text-primary-light'
                          : 'border-white/15 text-text-muted hover:border-white/30'
                      }`}>
                      📖 Theory
                    </button>
                    <button type="button"
                      onClick={() => setNewCourse({...newCourse, courseType: 'PRACTICAL'})}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                        newCourse.courseType === 'PRACTICAL'
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-white/15 text-text-muted hover:border-white/30'
                      }`}>
                      🔬 Practical
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Description (Optional)</label>
                <textarea className="input-field min-h-[80px] resize-none" placeholder="Course overview..." value={newCourse.description} onChange={(e) => setNewCourse({...newCourse, description: e.target.value})} maxLength={1000}></textarea>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-5">
                <button type="button" onClick={() => setShowCourseModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Create Course</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
