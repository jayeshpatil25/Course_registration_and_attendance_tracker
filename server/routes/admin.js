// ============================================================
// Admin Routes — semester management, courses, FA assignment
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

async function makeUniqueEmail(conn, tableName, email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw) return raw;

  const at = raw.indexOf('@');
  if (at <= 0) return raw;

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  // Try base, then base1, base2... (bounded)
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? `${local}@${domain}` : `${local}${i}@${domain}`;
    const exists = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE email = :e`,
      { e: candidate },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((exists.rows[0]?.CNT || 0) === 0) return candidate;
  }

  // fallback (should never happen)
  return `${local}${Date.now()}@${domain}`;
}

async function deleteSectionById(conn, sectionId) {
  // Deletes in dependency order to satisfy FKs
  await conn.execute(`DELETE FROM ATTENDANCE WHERE section_id = :sid`, { sid: sectionId });
  await conn.execute(`DELETE FROM REGISTRATION WHERE section_id = :sid`, { sid: sectionId });

  // batches under section
  await conn.execute(
    `DELETE FROM BATCH_COORDINATOR WHERE batch_id IN (SELECT batch_id FROM BATCH WHERE section_id = :sid)`,
    { sid: sectionId }
  );
  await conn.execute(`DELETE FROM BATCH WHERE section_id = :sid`, { sid: sectionId });

  await conn.execute(`DELETE FROM SECTION_COORDINATOR WHERE section_id = :sid`, { sid: sectionId });
  await conn.execute(`DELETE FROM SECTION WHERE section_id = :sid`, { sid: sectionId });
}

// GET /api/admin/semester-list — get all available sessions
router.get('/semester-list', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT session_code AS semester
       FROM ACADEMIC_SESSION
       ORDER BY session_year DESC,
                CASE term WHEN 'ODD' THEN 2 ELSE 1 END DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    // Map to { value, label } for frontend
    const mapped = result.rows.map(r => {
      let label = r.SEMESTER;
      if (label.includes('-')) {
        const parts = label.split('-');
        label = `${parts[0].charAt(0)}${parts[0].slice(1).toLowerCase()} Semester ${parts[1]}`;
      }
      return { value: r.SEMESTER, label };
    });
    return res.json(mapped);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// POST /api/admin/semester-list — create a new session (accepts e.g. ODD-2025)
router.post('/semester-list', verifyToken, authorize('admin'), async (req, res) => {
  const { semester } = req.body;
  if (!semester) return res.status(400).json({ error: 'semester string is required.' });

  // Capitalize strictly per backend convention
  const semNorm = semester.trim().toUpperCase();
  const parts = semNorm.split('-');
  if (parts.length !== 2 || !['ODD', 'EVEN'].includes(parts[0]) || !/^\d{4}$/.test(parts[1])) {
    return res.status(400).json({ error: 'semester must look like ODD-2025 or EVEN-2026' });
  }
  const term = parts[0];
  const sessionYear = Number(parts[1]);

  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `INSERT INTO ACADEMIC_SESSION (session_code, term, session_year)
       VALUES (:code, :term, :yr)`,
      { code: semNorm, term, yr: sessionYear },
      { autoCommit: true }
    );
    return res.status(201).json({ message: 'Semester added successfully.', semester: semNorm });
  } catch (err) {
    console.error(err);
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Semester already exists.' });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/admin/semester — get active semester
router.get('/semester', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT session_code AS semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows.length > 0 ? result.rows[0] : { SEMESTER: null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/admin/semester — update active semester (admin only)
router.put('/semester', verifyToken, authorize('admin'), async (req, res) => {
  const { semester } = req.body;
  if (!semester) return res.status(400).json({ error: 'semester is required.' });

  let conn;
  try {
    conn = await db.getConnection();
    // Upsert: MERGE into single-row table
    await conn.execute(
      `MERGE INTO ACTIVE_SEMESTER a
       USING (SELECT 1 AS id FROM DUAL) d ON (a.id = d.id)
       WHEN MATCHED THEN UPDATE SET session_code = :sem, updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (id, session_code) VALUES (1, :sem)`,
      { sem: semester },
      { autoCommit: true }
    );
    return res.json({ message: `Active semester set to ${semester}`, semester });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/admin/courses — courses with sections for the active semester
router.get('/courses', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    // Get active semester
    const semResult = await conn.execute(
      `SELECT session_code FROM ACTIVE_SEMESTER WHERE id = 1`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const activeSem = semResult.rows.length > 0 ? semResult.rows[0].SESSION_CODE : null;

    const result = await conn.execute(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits, c.course_type, d.dept_name,
              s.section_id, s.section_name, s.session_code AS semester, s.target_semester, s.room, s.schedule,
              CASE WHEN i.instructor_id IS NULL THEN NULL ELSE i.first_name || ' ' || i.last_name END AS coordinator
       FROM COURSE c
       JOIN DEPT d ON d.dept_id = c.dept_id
       LEFT JOIN SECTION s ON s.course_id = c.course_id AND (:sem IS NULL OR s.session_code = :sem)
       LEFT JOIN SECTION_COORDINATOR sc ON sc.section_id = s.section_id
       LEFT JOIN INSTRUCTOR i ON i.instructor_id = sc.instructor_id
       WHERE EXISTS (
         SELECT 1 FROM COURSE_OFFERED_SEMESTER cos
         JOIN ACADEMIC_SESSION acs ON acs.session_code = cos.session_code
         WHERE cos.course_id = c.course_id
         AND (:sem2 IS NULL OR cos.session_code = :sem2)
       )
       ORDER BY c.course_code, s.session_code, s.section_name`,
      { sem: activeSem, sem2: activeSem },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/admin/registrations — all registrations
router.get('/registrations', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.status, r.approval_status, r.session_code AS semester,
              st.first_name || ' ' || st.last_name AS student_name,
              c.course_code, c.course_type,
              CASE WHEN s.section_id IS NULL THEN 'Pending' ELSE s.section_name END AS section_name
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN COURSE c ON c.course_id = r.course_id
       LEFT JOIN SECTION s ON s.section_id = r.section_id
       ORDER BY r.registered_at DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// POST /api/admin/courses — create a new course
router.post('/courses', verifyToken, authorize('admin'), async (req, res) => {
  const { courseCode, courseName, deptId, credits, description, courseType } = req.body;

  if (!courseCode || !courseName || !deptId || !credits) {
    return res.status(400).json({ error: 'Course Code, Name, Department, and Credits are required.' });
  }

  const cType = (courseType || 'THEORY').toUpperCase();
  if (!['THEORY', 'PRACTICAL'].includes(cType)) {
    return res.status(400).json({ error: 'courseType must be THEORY or PRACTICAL.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `INSERT INTO COURSE (course_code, course_name, dept_id, credits, description, course_type)
       VALUES (:code, :name, :dept, :credits, :descr, :ctype)
       RETURNING course_id INTO :id`,
      {
        code: courseCode.trim().toUpperCase(),
        name: courseName.trim(),
        dept: Number(deptId),
        credits: Number(credits),
        descr: description ? description.trim() : null,
        ctype: cType,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    return res.status(201).json({
      message: 'Course created successfully.',
      courseId: result.outBinds.id[0]
    });
  } catch (err) {
    console.error('Create course error:', err);
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Course code already exists.' });
    }
    if (err.errorNum === 2290 && err.message.includes('CHK_COURSE_CREDITS')) {
       return res.status(400).json({ error: 'Credits must be between 1 and 6.' });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// POST /api/admin/sections — create a section and assign a coordinator
router.post('/sections', verifyToken, authorize('admin'), async (req, res) => {
  const { courseId, sectionName, semester, targetSemester, capacity, room, schedule, coordinatorId } = req.body;

  if (!courseId || !sectionName || !semester || !capacity) {
    return res.status(400).json({ error: 'Course, Section Name, Semester, and Capacity are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    
    // Insert section first
    const secResult = await conn.execute(
      `INSERT INTO SECTION (course_id, section_name, session_code, target_semester, capacity, room, schedule)
       VALUES (:cid, :sname, :sem, :tsem, :cap, :room, :sched)
       RETURNING section_id INTO :id`,
      {
        cid: Number(courseId),
        sname: sectionName.trim().toUpperCase(),
        sem: semester.trim().toUpperCase(),
        tsem: targetSemester ? Number(targetSemester) : null,
        cap: Number(capacity),
        room: room ? room.trim() : null,
        sched: schedule ? schedule.trim() : null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );
    
    const newSectionId = secResult.outBinds.id[0];

    // Assign coordinator if provided
    if (coordinatorId) {
      await conn.execute(
        `INSERT INTO SECTION_COORDINATOR (section_id, instructor_id)
         VALUES (:sid, :iid)`,
        { sid: newSectionId, iid: Number(coordinatorId) },
        { autoCommit: false }
      );
    }
    
    await conn.execute('COMMIT');

    return res.status(201).json({
      message: 'Section created and coordinator assigned successfully.',
      sectionId: newSectionId
    });
  } catch (err) {
    console.error('Create section error:', err);
    if (conn) await conn.execute('ROLLBACK');
    if (err.errorNum === 1) {
      return res.status(409).json({ error: 'Section already exists for this course and semester.' });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// DELETE /api/admin/sections/:sectionId — delete a section (and all dependent data)
router.delete('/sections/:sectionId', verifyToken, authorize('admin'), async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  if (!sectionId) return res.status(400).json({ error: 'Invalid sectionId.' });

  let conn;
  try {
    conn = await db.getConnection();
    const exists = await conn.execute(
      `SELECT section_id FROM SECTION WHERE section_id = :sid`,
      { sid: sectionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Section not found.' });

    await deleteSectionById(conn, sectionId);
    await conn.execute('COMMIT');
    return res.json({ message: 'Section deleted successfully.' });
  } catch (err) {
    console.error('Delete section error:', err);
    try { if (conn) await conn.execute('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// DELETE /api/admin/courses/:courseId — delete course + all its sections + dependent data
router.delete('/courses/:courseId', verifyToken, authorize('admin'), async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: 'Invalid courseId.' });

  let conn;
  try {
    conn = await db.getConnection();
    const exists = await conn.execute(
      `SELECT course_id, course_code FROM COURSE WHERE course_id = :cid`,
      { cid: courseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });

    const sections = await conn.execute(
      `SELECT section_id FROM SECTION WHERE course_id = :cid`,
      { cid: courseId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    for (const s of sections.rows) {
      await deleteSectionById(conn, s.SECTION_ID);
    }

    await conn.execute(`DELETE FROM COURSE_OFFERED_SEMESTER WHERE course_id = :cid`, { cid: courseId });
    await conn.execute(`DELETE FROM COURSE WHERE course_id = :cid`, { cid: courseId });
    await conn.execute('COMMIT');

    return res.json({ message: `Course deleted successfully.` });
  } catch (err) {
    console.error('Delete course error:', err);
    try { if (conn) await conn.execute('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/admin/students — all students with FA info
router.get('/students', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT s.student_id, s.enrollment_number, s.first_name, s.last_name, s.email, s.admission_year,
              CALC_STUDENT_SEMESTER(s.admission_year, (SELECT session_code FROM ACTIVE_SEMESTER WHERE id = 1)) AS semester,
              d.dept_name, d.dept_code, s.fa_id,
              CASE WHEN fi.instructor_id IS NULL THEN NULL ELSE fi.first_name || ' ' || fi.last_name END AS fa_name
       FROM STUDENT s
       JOIN DEPT d ON d.dept_id = s.dept_id
       LEFT JOIN INSTRUCTOR fi ON fi.instructor_id = s.fa_id
       ORDER BY s.last_name, s.first_name`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// POST /api/admin/students — create a new student (password defaults to password123)
// Auto-generates enrollment_number in format BT{YY}{DEPT_CODE}{NNN}
router.post('/students', verifyToken, authorize('admin'), async (req, res) => {
  const { firstName, lastName, email, deptId, admissionYear, phone, dob } = req.body;
  if (!firstName || !lastName || !deptId || !admissionYear) {
    return res.status(400).json({ error: 'firstName, lastName, deptId, admissionYear are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const passHash = await bcrypt.hash('password123', 10);

    // Get dept_code for enrollment number
    const deptResult = await conn.execute(
      `SELECT dept_code FROM DEPT WHERE dept_id = :did`,
      { did: Number(deptId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (deptResult.rows.length === 0) {
      return res.status(400).json({ error: 'Department not found.' });
    }
    const deptCode = deptResult.rows[0].DEPT_CODE;
    const yearSuffix = String(admissionYear).slice(-2);

    // Find the next roll number for this year+dept combination
    const maxResult = await conn.execute(
      `SELECT MAX(enrollment_number) AS max_enroll FROM STUDENT
       WHERE enrollment_number LIKE :pattern`,
      { pattern: `BT${yearSuffix}${deptCode}%` },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    let nextNum = 1;
    if (maxResult.rows[0].MAX_ENROLL) {
      const existing = maxResult.rows[0].MAX_ENROLL;
      const numPart = existing.slice(-3);
      nextNum = parseInt(numPart, 10) + 1;
    }
    const enrollmentNumber = `BT${yearSuffix}${deptCode}${String(nextNum).padStart(3, '0')}`;

    const requestedEmail = email
      ? String(email).trim().toLowerCase()
      : `${String(firstName).trim().toLowerCase()}@unitrack.edu`;
    const studentEmail = await makeUniqueEmail(conn, 'STUDENT', requestedEmail);

    const result = await conn.execute(
      `INSERT INTO STUDENT (enrollment_number, first_name, last_name, email, password_hash, dept_id, admission_year, phone, dob)
       VALUES (:en, :f, :l, :e, :p, :d, :ay, :ph, :dob)
       RETURNING student_id INTO :id`,
      {
        en: enrollmentNumber,
        f: String(firstName).trim(),
        l: String(lastName).trim(),
        e: studentEmail,
        p: passHash,
        d: Number(deptId),
        ay: Number(admissionYear),
        ph: phone ? String(phone).trim() : null,
        dob: dob ? new Date(dob) : null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    return res.status(201).json({
      message: 'Student created successfully.',
      studentId: result.outBinds.id[0],
      email: studentEmail,
      enrollmentNumber
    });
  } catch (err) {
    console.error('Create student error:', err);
    if (err.errorNum === 1) return res.status(409).json({ error: 'Student email or enrollment number already exists.' });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// DELETE /api/admin/students/:studentId — delete student (blocked if they have registrations/attendance)
router.delete('/students/:studentId', verifyToken, authorize('admin'), async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!studentId) return res.status(400).json({ error: 'Invalid studentId.' });

  let conn;
  try {
    conn = await db.getConnection();
    const regCnt = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM REGISTRATION WHERE student_id = :sid`,
      { sid: studentId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const attCnt = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM ATTENDANCE WHERE student_id = :sid`,
      { sid: studentId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((regCnt.rows[0]?.CNT || 0) > 0 || (attCnt.rows[0]?.CNT || 0) > 0) {
      return res.status(409).json({ error: 'Cannot delete student: existing registrations/attendance found.' });
    }

    const result = await conn.execute(
      `DELETE FROM STUDENT WHERE student_id = :sid`,
      { sid: studentId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Student not found.' });
    return res.json({ message: 'Student deleted successfully.' });
  } catch (err) {
    console.error('Delete student error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/admin/instructors — list instructors (for admin management UI)
router.get('/instructors', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT instructor_id, first_name, last_name, email, dept_id, designation, phone, hire_date
       FROM INSTRUCTOR
       ORDER BY first_name, last_name`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('List instructors error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// POST /api/admin/instructors — create a new instructor (password defaults to password123)
router.post('/instructors', verifyToken, authorize('admin'), async (req, res) => {
  const { firstName, lastName, email, deptId, designation, phone } = req.body;
  if (!firstName || !lastName || !deptId) {
    return res.status(400).json({ error: 'firstName, lastName, deptId are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const passHash = await bcrypt.hash('password123', 10);
    const requestedEmail = email
      ? String(email).trim().toLowerCase()
      : `${String(firstName).trim().toLowerCase()}@unitrack.edu`;
    const instructorEmail = await makeUniqueEmail(conn, 'INSTRUCTOR', requestedEmail);

    const result = await conn.execute(
      `INSERT INTO INSTRUCTOR (first_name, last_name, email, password_hash, dept_id, designation, phone)
       VALUES (:f, :l, :e, :p, :d, :des, :ph)
       RETURNING instructor_id INTO :id`,
      {
        f: String(firstName).trim(),
        l: String(lastName).trim(),
        e: instructorEmail,
        p: passHash,
        d: Number(deptId),
        des: designation ? String(designation).trim() : 'Assistant Professor',
        ph: phone ? String(phone).trim() : null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );
    return res.status(201).json({ message: 'Instructor created successfully.', instructorId: result.outBinds.id[0], email: instructorEmail });
  } catch (err) {
    console.error('Create instructor error:', err);
    if (err.errorNum === 1) return res.status(409).json({ error: 'Instructor email already exists.' });
    if (err.errorNum === 2290) return res.status(400).json({ error: 'Invalid designation.' });
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// DELETE /api/admin/instructors/:instructorId — delete instructor (blocked if referenced)
router.delete('/instructors/:instructorId', verifyToken, authorize('admin'), async (req, res) => {
  const instructorId = Number(req.params.instructorId);
  if (!instructorId) return res.status(400).json({ error: 'Invalid instructorId.' });

  let conn;
  try {
    conn = await db.getConnection();

    const refs = await conn.execute(
      `SELECT
         (SELECT COUNT(*) FROM STUDENT WHERE fa_id = :iid) AS fa_cnt,
         (SELECT COUNT(*) FROM SECTION WHERE instructor_id = :iid) AS teaches_cnt,
         (SELECT COUNT(*) FROM SECTION_COORDINATOR WHERE instructor_id = :iid) AS sc_cnt,
         (SELECT COUNT(*) FROM BATCH_COORDINATOR WHERE instructor_id = :iid) AS bc_cnt,
         (SELECT COUNT(*) FROM REGISTRATION WHERE approved_by = :iid) AS appr_cnt,
         (SELECT COUNT(*) FROM ATTENDANCE WHERE marked_by = :iid) AS mark_cnt
       FROM DUAL`,
      { iid: instructorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const r = refs.rows[0];
    const totalRefs = (r.FA_CNT || 0) + (r.TEACHES_CNT || 0) + (r.SC_CNT || 0) + (r.BC_CNT || 0) + (r.APPR_CNT || 0) + (r.MARK_CNT || 0);
    if (totalRefs > 0) {
      return res.status(409).json({
        error: 'Cannot delete instructor: they are referenced (FA/sections/coordinator/approvals/attendance). Remove those links first.',
        refs: r,
      });
    }

    const result = await conn.execute(
      `DELETE FROM INSTRUCTOR WHERE instructor_id = :iid`,
      { iid: instructorId },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Instructor not found.' });
    return res.json({ message: 'Instructor deleted successfully.' });
  } catch (err) {
    console.error('Delete instructor error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/admin/assign-fa — assign a Faculty Advisor to a student
router.put('/assign-fa', verifyToken, authorize('admin'), async (req, res) => {
  const { studentId, instructorId } = req.body;
  if (!studentId || !instructorId) {
    return res.status(400).json({ error: 'studentId and instructorId are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `UPDATE STUDENT SET fa_id = :fid WHERE student_id = :sid`,
      { fid: Number(instructorId), sid: Number(studentId) },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    return res.json({ message: 'Faculty Advisor assigned successfully.' });
  } catch (err) {
    console.error('Assign FA error:', err);
    if (err.errorNum === 2291) {
      return res.status(400).json({ error: 'Instructor not found.' });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/admin/bulk-assign-fa — assign FA to multiple students at once
router.put('/bulk-assign-fa', verifyToken, authorize('admin'), async (req, res) => {
  const { studentIds, instructorId } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0 || !instructorId) {
    return res.status(400).json({ error: 'studentIds array and instructorId are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    let updated = 0;
    for (const sid of studentIds) {
      const result = await conn.execute(
        `UPDATE STUDENT SET fa_id = :fid WHERE student_id = :sid`,
        { fid: Number(instructorId), sid: Number(sid) }
      );
      updated += result.rowsAffected;
    }
    await conn.execute('COMMIT');
    return res.json({ message: `Faculty Advisor assigned to ${updated} student(s).`, count: updated });
  } catch (err) {
    console.error('Bulk assign FA error:', err);
    try { if (conn) await conn.execute('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/admin/unassigned-registrations — registrations without a section
// ────────────────────────────────────────────────────────────
router.get('/unassigned-registrations', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.student_id, r.course_id, r.session_code AS semester, r.status, r.approval_status,
              st.enrollment_number, st.first_name, st.last_name,
              c.course_code, c.course_name, c.course_type
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN COURSE c ON c.course_id = r.course_id
       WHERE r.section_id IS NULL
         AND r.status NOT IN ('DROPPED', 'REJECTED', 'CANCELLED')
       ORDER BY st.enrollment_number, c.course_code`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Unassigned registrations error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// ────────────────────────────────────────────────────────────
// PUT /api/admin/assign-section — assign a section to a registration
// ────────────────────────────────────────────────────────────
router.put('/assign-section', verifyToken, authorize('admin'), async (req, res) => {
  const { registrationId, sectionId } = req.body;
  if (!registrationId || !sectionId) {
    return res.status(400).json({ error: 'registrationId and sectionId are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    // Verify the section belongs to the same course as the registration
    const regResult = await conn.execute(
      `SELECT course_id, section_id FROM REGISTRATION WHERE registration_id = :rid`,
      { rid: Number(registrationId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (regResult.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found.' });
    }
    const regCourseId = regResult.rows[0].COURSE_ID;

    const secResult = await conn.execute(
      `SELECT course_id FROM SECTION WHERE section_id = :sid`,
      { sid: Number(sectionId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (secResult.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found.' });
    }
    if (secResult.rows[0].COURSE_ID !== regCourseId) {
      return res.status(400).json({ error: 'Section does not belong to the same course as the registration.' });
    }

    await conn.execute(
      `UPDATE REGISTRATION SET section_id = :sid WHERE registration_id = :rid`,
      { sid: Number(sectionId), rid: Number(registrationId) },
      { autoCommit: true }
    );
    return res.json({ message: 'Section assigned successfully.' });
  } catch (err) {
    console.error('Assign section error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
