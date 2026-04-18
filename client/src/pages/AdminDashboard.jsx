import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import api from '../services/api';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview'); // 'overview' | 'people' | 'fa-assignment' | 'section-assignment'
  
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
  const [adminInstructors, setAdminInstructors] = useState([]);
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

  // Section Modal State
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [newSection, setNewSection] = useState({
    courseId: '',
    sectionName: 'A',
    semester: '',
    capacity: 60,
    room: '',
    schedule: '',
    coordinatorId: ''
  });

  // People Management Modal State
  const [showInstructorModal, setShowInstructorModal] = useState(false);
  const [newInstructor, setNewInstructor] = useState({
    firstName: '',
    lastName: '',
    email: '',
    deptId: '',
    designation: 'Assistant Professor',
    phone: '',
  });

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    email: '',
    deptId: '',
    admissionYear: '',
    phone: '',
    dob: '',
  });

  // Section Assignment
  const [unassignedRegs, setUnassignedRegs] = useState([]);
  const [sectionOptions, setSectionOptions] = useState({});  // keyed by courseId
  const [assignLoading, setAssignLoading] = useState(null);

  // FA Assignment
  const [faFilter, setFaFilter] = useState({ dept: '', unassignedOnly: false });
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedFA, setSelectedFA] = useState('');
  const [faActionLoading, setFaActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [semListRes, semRes, dptRes, crsRes, regRes, instrRes, adminInstrRes, stuRes] = await Promise.all([
        api.get('/admin/semester-list').catch(() => ({ data: [] })),
        api.get('/admin/semester').catch(() => ({ data: {} })),
        api.get('/lookup/departments').catch(() => ({ data: [] })),
        api.get('/admin/courses').catch(() => ({ data: [] })),
        api.get('/admin/registrations').catch(() => ({ data: [] })),
        api.get('/lookup/instructors').catch(() => ({ data: [] })),
        api.get('/admin/instructors'),
        api.get('/admin/students').catch(() => ({ data: [] })),
      ]);
      
      setSemesters(semListRes.data);
      setActiveSemester(semRes.data.SEMESTER || '');
      setDepartments(dptRes.data);
      setCourses(crsRes.data);
      setRegistrations(regRes.data);
      setInstructors(instrRes.data);
      setAdminInstructors(adminInstrRes.data);
      setStudents(stuRes.data);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.error || 'Failed to load admin data.');
      setTimeout(() => setMessage(''), 4000);
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

  const handleAddSection = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/sections', newSection);
      setMessage(`Section ${newSection.sectionName} added.`);
      setShowSectionModal(false);
      setNewSection({ ...newSection, sectionName: 'A', room: '', schedule: '', coordinatorId: '' });
      fetchData(); // refresh courses
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add section.');
    }
  };

  const handleDeleteCourse = async (courseId, courseCode) => {
    if (!courseId) return;
    const ok = window.confirm(`Delete course ${courseCode}? This will also delete its sections/registrations/attendance.`);
    if (!ok) return;
    try {
      await api.delete(`/admin/courses/${courseId}`);
      setMessage(`Course ${courseCode} deleted.`);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete course.');
    }
  };

  const handleDeleteSection = async (sectionId, courseCode, sectionName) => {
    if (!sectionId) return;
    const ok = window.confirm(`Delete section ${courseCode} - ${sectionName}? This will also delete registrations/attendance for this section.`);
    if (!ok) return;
    try {
      await api.delete(`/admin/sections/${sectionId}`);
      setMessage(`Section ${courseCode}-${sectionName} deleted.`);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete section.');
    }
  };

  const handleAddInstructor = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/instructors', newInstructor);
      setMessage(`Instructor ${newInstructor.firstName} added.`);
      setShowInstructorModal(false);
      setNewInstructor({ firstName: '', lastName: '', email: '', deptId: '', designation: 'Assistant Professor', phone: '' });
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add instructor.');
    }
  };

  const handleDeleteInstructor = async (instructorId, name) => {
    const ok = window.confirm(`Delete instructor ${name}? This is blocked if they are referenced in sections/FA/attendance.`);
    if (!ok) return;
    try {
      await api.delete(`/admin/instructors/${instructorId}`);
      setMessage(`Instructor ${name} deleted.`);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete instructor.');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/students', newStudent);
      setMessage(`Student ${newStudent.firstName} added.`);
      setShowStudentModal(false);
      setNewStudent({ firstName: '', lastName: '', email: '', deptId: '', admissionYear: '', phone: '', dob: '' });
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add student.');
    }
  };

  const handleDeleteStudent = async (studentId, name) => {
    const ok = window.confirm(`Delete student ${name}? This is blocked if they have registrations/attendance.`);
    if (!ok) return;
    try {
      await api.delete(`/admin/students/${studentId}`);
      setMessage(`Student ${name} deleted.`);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete student.');
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

  // Fetch unassigned registrations for section assignment tab
  const fetchUnassignedRegs = async () => {
    try {
      const { data } = await api.get('/admin/unassigned-registrations');
      setUnassignedRegs(data);
      // Prefetch sections for each unique course
      const courseIds = [...new Set(data.map(r => r.COURSE_ID))];
      for (const cid of courseIds) {
        if (!sectionOptions[cid]) {
          try {
            const secRes = await api.get(`/lookup/sections?courseId=${cid}&semester=${activeSemester}`);
            setSectionOptions(prev => ({ ...prev, [cid]: secRes.data }));
          } catch {}
        }
      }
    } catch (err) {
      console.error('Fetch unassigned registrations error:', err);
    }
  };

  const handleAssignSection = async (registrationId, sectionId) => {
    if (!sectionId) return;
    setAssignLoading(registrationId);
    try {
      await api.put('/admin/assign-section', { registrationId, sectionId: Number(sectionId) });
      setMessage('Section assigned successfully.');
      fetchUnassignedRegs();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign section.');
    } finally {
      setAssignLoading(null);
    }
  };

  useEffect(() => {
    if (tab === 'section-assignment') fetchUnassignedRegs();
  }, [tab]);

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
            { key: 'people', label: '🧑‍🎓 People' },
            { key: 'fa-assignment', label: '👨‍🏫 Batch Coordinator Assignment' },
            { key: 'section-assignment', label: '📋 Section Assignment' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                tab === t.key
                  ? 'bg-primary text-white shadow-lg'
                  : 'border border-gray-200 text-text-muted hover:text-text-main'
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
                <form onSubmit={handleAddSemester} className="mb-4 flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
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
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 text-text-muted hover:border-primary-light hover:text-text-main'
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
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-main">{cg.code}</span>
                      <span className="text-sm font-medium text-text-muted">{cg.name}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        cg.courseType === 'PRACTICAL' ? 'bg-amber-50 text-amber-700' : 'bg-primary/10 text-primary'
                      }`}>
                        {cg.courseType === 'PRACTICAL' ? '🔬 PRACTICAL' : '📖 THEORY'}
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-text-muted">
                        {cg.credits} credits
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted bg-gray-50 px-2 py-1 rounded-md">{cg.dept}</span>
                      <button
                        onClick={() => {
                          const anyRow = cg.sections[0] || courses.find(c => c.COURSE_CODE === cg.code);
                          handleDeleteCourse(anyRow?.COURSE_ID, cg.code);
                        }}
                        className="btn-ghost !px-2 !py-1 text-xs text-warning"
                        title="Delete course"
                      >
                        🗑 Delete
                      </button>
                      <button 
                        onClick={() => {
                          setNewSection({...newSection, courseId: cg.sections[0]?.COURSE_ID || courses.find(c => c.COURSE_CODE === cg.code).COURSE_ID, semester: activeSemester});
                          setShowSectionModal(true);
                        }}
                        className="btn-ghost !px-2 !py-1 text-xs"
                      >
                        + Add Section
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    {cg.sections.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {cg.sections.map((sec) => (
                          <span key={sec.SECTION_ID} className="rounded-lg bg-surface px-3 py-1.5 text-xs text-text-muted border border-gray-200 flex items-center gap-2">
                            <span className="font-bold text-primary">Sec {sec.SECTION_NAME}</span> 
                            <span>•</span> 
                            <span className="text-text-main">{sec.SEMESTER}</span>
                            <span>•</span>
                            <span>{sec.COORDINATOR || 'No coordinator'}</span>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSection(sec.SECTION_ID, cg.code, sec.SECTION_NAME); }}
                              className="ml-2 rounded-md bg-gray-50 px-2 py-0.5 text-[10px] text-warning border border-gray-200 hover:bg-gray-100"
                              title="Delete section"
                            >
                              🗑
                            </button>
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
                    <tr className="border-b border-gray-200 text-left text-text-muted">
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
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 text-text-main font-medium">{r.STUDENT_NAME}</td>
                        <td className="px-4 py-2 text-primary font-bold">{r.COURSE_CODE}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            r.COURSE_TYPE === 'PRACTICAL' ? 'bg-amber-50 text-amber-700' : 'bg-primary/10 text-primary'
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

        {/* ── People Tab ──────────────────────────────── */}
        {tab === 'people' && (
          <div className="animate-fade-in-up space-y-6">
            <div className="glass-card !p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-main">Faculty & Students</h3>
                <p className="text-xs text-text-muted">Add/remove faculty and students. Default password for new accounts is <span className="font-semibold text-text-main">password123</span>.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowInstructorModal(true)} className="btn-primary !py-2 !px-3 text-xs">+ Add Faculty</button>
                <button onClick={() => setShowStudentModal(true)} className="btn-primary !py-2 !px-3 text-xs">+ Add Student</button>
              </div>
            </div>

            {/* Faculty Table */}
            <div className="glass-card overflow-x-auto !p-0">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h4 className="font-semibold text-text-main">Faculty ({adminInstructors.length})</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-text-muted">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3 w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adminInstructors.map((i) => (
                    <tr key={i.INSTRUCTOR_ID} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-text-main font-medium">{i.FIRST_NAME} {i.LAST_NAME}</td>
                      <td className="px-4 py-2 text-text-muted">{i.EMAIL}</td>
                      <td className="px-4 py-2 text-text-muted">{i.DESIGNATION}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDeleteInstructor(i.INSTRUCTOR_ID, `${i.FIRST_NAME} ${i.LAST_NAME}`)}
                          className="btn-ghost !py-1 !px-2 text-xs text-warning"
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {adminInstructors.length === 0 && (
                    <tr><td colSpan="4" className="text-center py-6 text-text-muted italic">No faculty records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Students Table */}
            <div className="glass-card overflow-x-auto !p-0">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h4 className="font-semibold text-text-main">Students ({students.length})</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-text-muted">
                    <th className="px-4 py-3">Enrollment No.</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Dept</th>
                    <th className="px-4 py-3">Admission Year</th>
                    <th className="px-4 py-3">Sem</th>
                    <th className="px-4 py-3 w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.STUDENT_ID} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-primary font-mono font-semibold">{s.ENROLLMENT_NUMBER || '-'}</td>
                      <td className="px-4 py-2 text-text-main font-medium">{s.FIRST_NAME} {s.LAST_NAME}</td>
                      <td className="px-4 py-2 text-text-muted">{s.EMAIL}</td>
                      <td className="px-4 py-2 text-text-muted">{s.DEPT_CODE || '-'}</td>
                      <td className="px-4 py-2 text-text-muted">{s.ADMISSION_YEAR || '-'}</td>
                      <td className="px-4 py-2 text-text-muted">{s.SEMESTER || '-'}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDeleteStudent(s.STUDENT_ID, `${s.FIRST_NAME} ${s.LAST_NAME}`)}
                          className="btn-ghost !py-1 !px-2 text-xs text-warning"
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr><td colSpan="7" className="text-center py-6 text-text-muted italic">No student records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Batch Coordinator Assignment Tab ──────────────────────────── */}
        {tab === 'fa-assignment' && (
          <div className="animate-fade-in-up">
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-muted">
              <p className="font-semibold text-primary mb-1">👨‍🏫 Batch Coordinator Assignment</p>
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
                      className="w-4 h-4 rounded border-gray-300 bg-gray-50 accent-primary" />
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
                  <tr className="border-b border-gray-200 text-left text-text-muted">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0}
                        onChange={(e) => e.target.checked ? selectAllFiltered() : setSelectedStudents([])}
                        className="w-4 h-4 rounded border-gray-300 bg-gray-50 accent-primary cursor-pointer" />
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
                      className={`border-b border-gray-100 transition-colors cursor-pointer ${
                        selectedStudents.includes(s.STUDENT_ID) ? 'bg-primary/10' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => toggleStudent(s.STUDENT_ID)}>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedStudents.includes(s.STUDENT_ID)}
                          onChange={() => toggleStudent(s.STUDENT_ID)}
                          className="w-4 h-4 rounded border-gray-300 bg-gray-50 accent-primary cursor-pointer" />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-text-main">{s.FIRST_NAME} {s.LAST_NAME}</p>
                        <p className="text-xs text-text-muted">{s.EMAIL}</p>
                      </td>
                      <td className="px-4 py-2 text-text-muted">{s.DEPT_NAME}</td>
                      <td className="px-4 py-2 text-text-muted">{s.ENROLLMENT_NUMBER || '-'} / Sem {s.SEMESTER}</td>
                      <td className="px-4 py-2">
                        {s.FA_NAME ? (
                          <span className="rounded-md bg-green-50 px-2 py-1 text-xs text-success font-semibold">{s.FA_NAME}</span>
                        ) : (
                          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-warning font-semibold">Not Assigned</span>
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

        {/* ── Section Assignment Tab ────────────────────────── */}
        {tab === 'section-assignment' && (
          <div className="animate-fade-in-up">
            <div className="mb-4 rounded-xl border border-amber-200 bg-accent/5 p-4 text-sm text-text-muted">
              <p className="font-semibold text-amber-700 mb-1">📋 Section Assignment</p>
              <p className="text-xs">Assign sections to student registrations that don't have a section yet. Students register for courses only; the admin assigns sections.</p>
            </div>

            {unassignedRegs.length === 0 ? (
              <div className="glass-card text-center py-8">
                <p className="text-text-muted">✅ All registrations have sections assigned.</p>
              </div>
            ) : (
              <div className="glass-card overflow-x-auto !p-0">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h4 className="font-semibold text-text-main">Unassigned Registrations ({unassignedRegs.length})</h4>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-text-muted">
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Assign Section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassignedRegs.map((reg) => (
                      <tr key={reg.REGISTRATION_ID} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2">
                          <span className="font-mono text-primary text-xs">{reg.ENROLLMENT_NUMBER}</span>
                          <span className="ml-2 text-text-main">{reg.FIRST_NAME} {reg.LAST_NAME}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-text-main">{reg.COURSE_CODE}</span>
                          <span className="ml-1 text-text-muted text-xs">{reg.COURSE_NAME}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`badge ${reg.STATUS === 'ACTIVE' ? 'badge-present' : 'badge-pending'}`}>{reg.STATUS}</span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <select
                              className="input-field !py-1 !px-2 !mb-0 text-xs min-w-[120px] appearance-none bg-surface"
                              defaultValue=""
                              onChange={(e) => handleAssignSection(reg.REGISTRATION_ID, e.target.value)}
                              disabled={assignLoading === reg.REGISTRATION_ID}
                            >
                              <option value="" disabled>Select section</option>
                              {(sectionOptions[reg.COURSE_ID] || []).map(sec => (
                                <option key={sec.SECTION_ID} value={sec.SECTION_ID}>Sec {sec.SECTION_NAME} - {sec.ROOM || 'TBA'}</option>
                              ))}
                            </select>
                            {assignLoading === reg.REGISTRATION_ID && <span className="text-xs text-text-muted">Assigning...</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-6">
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
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 text-text-muted hover:border-gray-300'
                      }`}>
                      📖 Theory
                    </button>
                    <button type="button"
                      onClick={() => setNewCourse({...newCourse, courseType: 'PRACTICAL'})}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                        newCourse.courseType === 'PRACTICAL'
                          ? 'border-accent bg-amber-50 text-amber-700'
                          : 'border-gray-200 text-text-muted hover:border-gray-300'
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
              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5">
                <button type="button" onClick={() => setShowCourseModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Create Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Section Modal */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-main">Add New Section</h3>
              <button onClick={() => setShowSectionModal(false)} className="text-text-muted hover:text-white text-xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleAddSection} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Section Name</label>
                  <input type="text" className="input-field" placeholder="e.g. A" value={newSection.sectionName} onChange={(e) => setNewSection({...newSection, sectionName: e.target.value})} required maxLength={10} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Semester</label>
                  <input type="text" className="input-field" placeholder="e.g. ODD-2025" value={newSection.semester} onChange={(e) => setNewSection({...newSection, semester: e.target.value})} required maxLength={20} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Capacity</label>
                  <input type="number" min="1" className="input-field" value={newSection.capacity} onChange={(e) => setNewSection({...newSection, capacity: e.target.value})} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Room</label>
                  <input type="text" className="input-field" placeholder="e.g. LH-101" value={newSection.room} onChange={(e) => setNewSection({...newSection, room: e.target.value})} maxLength={30} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Schedule</label>
                <input type="text" className="input-field" placeholder="e.g. Mon/Wed/Fri 09:00-10:00" value={newSection.schedule} onChange={(e) => setNewSection({...newSection, schedule: e.target.value})} maxLength={100} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Section Coordinator / Faculty</label>
                <select className="input-field appearance-none bg-surface" value={newSection.coordinatorId} onChange={(e) => setNewSection({...newSection, coordinatorId: e.target.value})}>
                  <option value="">No coordinator currently assigned</option>
                  {instructors.map(inst => <option key={inst.INSTRUCTOR_ID} value={inst.INSTRUCTOR_ID}>{inst.INSTRUCTOR_NAME}</option>)}
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5">
                <button type="button" onClick={() => setShowSectionModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Create Section</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Instructor Modal */}
      {showInstructorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-main">Add New Faculty</h3>
              <button onClick={() => setShowInstructorModal(false)} className="text-text-muted hover:text-white text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAddInstructor} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">First Name</label>
                  <input type="text" className="input-field" value={newInstructor.firstName} onChange={(e) => setNewInstructor({ ...newInstructor, firstName: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Last Name</label>
                  <input type="text" className="input-field" value={newInstructor.lastName} onChange={(e) => setNewInstructor({ ...newInstructor, lastName: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Email (optional)</label>
                <input type="email" className="input-field" placeholder="firstname@unitrack.edu" value={newInstructor.email} onChange={(e) => setNewInstructor({ ...newInstructor, email: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Department</label>
                <select className="input-field appearance-none bg-surface" value={newInstructor.deptId} onChange={(e) => setNewInstructor({ ...newInstructor, deptId: e.target.value })} required>
                  <option value="" disabled>Select a department</option>
                  {departments.map(d => <option key={d.DEPT_ID} value={d.DEPT_ID}>{d.DEPT_NAME}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Designation</label>
                  <input type="text" className="input-field" value={newInstructor.designation} onChange={(e) => setNewInstructor({ ...newInstructor, designation: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Phone (optional)</label>
                  <input type="text" className="input-field" value={newInstructor.phone} onChange={(e) => setNewInstructor({ ...newInstructor, phone: e.target.value })} />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5">
                <button type="button" onClick={() => setShowInstructorModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Create Faculty</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-text-main">Add New Student</h3>
              <button onClick={() => setShowStudentModal(false)} className="text-text-muted hover:text-white text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">First Name</label>
                  <input type="text" className="input-field" value={newStudent.firstName} onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Last Name</label>
                  <input type="text" className="input-field" value={newStudent.lastName} onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Email (optional)</label>
                <input type="email" className="input-field" placeholder="firstname@unitrack.edu" value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Department</label>
                <select className="input-field appearance-none bg-surface" value={newStudent.deptId} onChange={(e) => setNewStudent({ ...newStudent, deptId: e.target.value })} required>
                  <option value="" disabled>Select a department</option>
                  {departments.map(d => <option key={d.DEPT_ID} value={d.DEPT_ID}>{d.DEPT_NAME}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-muted">Admission Year</label>
                <input type="number" min="2000" max="2100" className="input-field" value={newStudent.admissionYear} onChange={(e) => setNewStudent({ ...newStudent, admissionYear: e.target.value })} required />
                <p className="text-xs text-text-muted mt-1">📌 Enrollment number (e.g. BT23CSE001) will be auto-generated</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">Phone (optional)</label>
                  <input type="text" className="input-field" value={newStudent.phone} onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-muted">DOB (optional)</label>
                  <input type="date" className="input-field" value={newStudent.dob} onChange={(e) => setNewStudent({ ...newStudent, dob: e.target.value })} />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-5">
                <button type="button" onClick={() => setShowStudentModal(false)} className="btn-ghost">Cancel</button>
                <button type="submit" className="btn-primary">Create Student</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
