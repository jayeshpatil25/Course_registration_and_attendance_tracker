// ============================================================
// Admin Routes — semester management, courses, FA assignment
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

// GET /api/admin/semester-list — get all available semesters
router.get('/semester-list', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT semester FROM SEMESTER_LIST ORDER BY created_at DESC`,
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

// POST /api/admin/semester-list — create a new semester
router.post('/semester-list', verifyToken, authorize('admin'), async (req, res) => {
  const { semester } = req.body;
  if (!semester) return res.status(400).json({ error: 'semester string is required.' });

  // Capitalize strictly per backend convention
  const semNorm = semester.trim().toUpperCase();

  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `INSERT INTO SEMESTER_LIST (semester) VALUES (:sem)`,
      { sem: semNorm },
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
      `SELECT semester FROM ACTIVE_SEMESTER WHERE id = 1`,
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
       WHEN MATCHED THEN UPDATE SET semester = :sem, updated_at = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (id, semester) VALUES (1, :sem)`,
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

// GET /api/admin/courses — all courses with their sections/semesters
router.get('/courses', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT c.course_id, c.course_code, c.course_name, c.credits, c.course_type, d.dept_name,
              s.section_id, s.section_name, s.semester, s.room, s.schedule,
              i.first_name || ' ' || i.last_name AS coordinator
       FROM COURSE c
       JOIN DEPT d ON d.dept_id = c.dept_id
       LEFT JOIN SECTION s ON s.course_id = c.course_id
       LEFT JOIN SECTION_COORDINATOR sc ON sc.section_id = s.section_id
       LEFT JOIN INSTRUCTOR i ON i.instructor_id = sc.instructor_id
       ORDER BY c.course_code, s.semester, s.section_name`,
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

// GET /api/admin/registrations — all registrations
router.get('/registrations', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.status, r.approval_status, r.semester,
              st.first_name || ' ' || st.last_name AS student_name,
              c.course_code, c.course_type, s.section_name
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
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
       VALUES (:code, :name, :dept, :credits, :desc, :ctype)
       RETURNING course_id INTO :id`,
      {
        code: courseCode.trim().toUpperCase(),
        name: courseName.trim(),
        dept: Number(deptId),
        credits: Number(credits),
        desc: description ? description.trim() : null,
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

// GET /api/admin/students — all students with FA info
router.get('/students', verifyToken, authorize('admin'), async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT s.student_id, s.first_name, s.last_name, s.email, s.enrollment_year, s.semester,
              d.dept_name, s.fa_id,
              fi.first_name || ' ' || fi.last_name AS fa_name
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

module.exports = router;
