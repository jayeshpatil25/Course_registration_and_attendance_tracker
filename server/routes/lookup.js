// ============================================================
// Lookup Routes — read-only reference data
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken } = require('../middleware/auth');

// GET /api/lookup/semesters — returns only the active semester
router.get('/semesters', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (result.rows.length > 0 && result.rows[0].SEMESTER) {
      const sem = result.rows[0].SEMESTER;
      // Format label from value (e.g. 'ODD-2025' -> 'Odd Semester 2025')
      const parts = sem.split('-');
      const label = `${parts[0].charAt(0)}${parts[0].slice(1).toLowerCase()} Semester ${parts[1]}`;
      return res.json([{ value: sem, label }]);
    }
    return res.json([]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/departments
router.get('/departments', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT dept_id, dept_name FROM DEPT ORDER BY dept_name`,
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

// GET /api/lookup/instructors
router.get('/instructors', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT instructor_id, first_name || ' ' || last_name AS instructor_name, dept_id 
       FROM INSTRUCTOR 
       ORDER BY instructor_name`,
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

// GET /api/lookup/courses?deptId=&semester=
// If semester is provided, only return courses that have sections in that semester
router.get('/courses', verifyToken, async (req, res) => {
  const { deptId, semester } = req.query;
  let conn;
  try {
    conn = await db.getConnection();
    let sql, binds = {};

    if (semester) {
      sql = `SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.credits, c.dept_id, c.course_type
             FROM COURSE c
             JOIN SECTION s ON s.course_id = c.course_id AND s.semester = :semester
             WHERE 1=1`;
      binds.semester = semester;
    } else {
      sql = `SELECT course_id, course_code, course_name, credits, dept_id, course_type FROM COURSE WHERE 1=1`;
    }

    if (deptId) {
      sql += ` AND c.dept_id = :deptId`;
      binds.deptId = Number(deptId);
    }
    sql += ` ORDER BY course_code`;
    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/sections?courseId=&semester=
router.get('/sections', verifyToken, async (req, res) => {
  const { courseId, semester } = req.query;
  let conn;
  try {
    conn = await db.getConnection();
    let sql = `SELECT s.section_id, s.section_name, s.course_id, s.semester,
                      s.capacity, s.room, s.schedule,
                      c.course_code, c.course_name,
                      i.first_name || ' ' || i.last_name AS coordinator_name
               FROM SECTION s
               JOIN COURSE c ON c.course_id = s.course_id
               LEFT JOIN SECTION_COORDINATOR sc ON sc.section_id = s.section_id
               LEFT JOIN INSTRUCTOR i ON i.instructor_id = sc.instructor_id
               WHERE 1=1`;
    const binds = {};
    if (courseId) { sql += ` AND s.course_id = :courseId`; binds.courseId = Number(courseId); }
    if (semester) { sql += ` AND s.semester = :semester`; binds.semester = semester; }
    sql += ` ORDER BY c.course_code, s.section_name`;
    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/batches?sectionId=
router.get('/batches', verifyToken, async (req, res) => {
  const { sectionId } = req.query;
  let conn;
  try {
    conn = await db.getConnection();
    let sql = `SELECT b.batch_id, b.batch_name, b.section_id, b.capacity,
                      i.first_name || ' ' || i.last_name AS coordinator_name
               FROM BATCH b
               LEFT JOIN BATCH_COORDINATOR bc ON bc.batch_id = b.batch_id
               LEFT JOIN INSTRUCTOR i ON i.instructor_id = bc.instructor_id`;
    const binds = {};
    if (sectionId) {
      sql += ` WHERE b.section_id = :sectionId`;
      binds.sectionId = Number(sectionId);
    }
    sql += ` ORDER BY b.batch_name`;
    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/section-students/:sectionId  — students registered in a section
router.get('/section-students/:sectionId', verifyToken, async (req, res) => {
  const { sectionId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT s.student_id, s.first_name, s.last_name, s.email
       FROM REGISTRATION r
       JOIN STUDENT s ON s.student_id = r.student_id
       WHERE r.section_id = :secid AND r.status = 'ACTIVE'
       ORDER BY s.last_name, s.first_name`,
      { secid: Number(sectionId) },
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

// GET /api/lookup/instructor-sections/:instructorId  — sections coordinated by an instructor (active semester only)
router.get('/instructor-sections/:instructorId', verifyToken, async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT sc.section_id, s.section_name, s.semester, s.room, s.schedule,
              c.course_code, c.course_name, c.credits
       FROM SECTION_COORDINATOR sc
       JOIN SECTION s ON s.section_id = sc.section_id
       JOIN COURSE  c ON c.course_id  = s.course_id
       WHERE sc.instructor_id = :iid
         AND s.semester = (SELECT semester FROM ACTIVE_SEMESTER WHERE id = 1)
       ORDER BY c.course_code`,
      { iid: Number(instructorId) },
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

// GET /api/lookup/student-course-details/:studentId — enriched registration details with coordinators & batch
router.get('/student-course-details/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.section_id, r.semester, r.status, r.registered_at,
              s.section_name, s.room, s.schedule,
              c.course_code, c.course_name, c.credits, c.course_type,
              sci.first_name || ' ' || sci.last_name AS section_coordinator,
              b.batch_id, b.batch_name,
              bci.first_name || ' ' || bci.last_name AS batch_coordinator
       FROM REGISTRATION r
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE  c ON c.course_id  = s.course_id
       LEFT JOIN SECTION_COORDINATOR sc ON sc.section_id = s.section_id
       LEFT JOIN INSTRUCTOR sci ON sci.instructor_id = sc.instructor_id
       LEFT JOIN BATCH b ON b.section_id = s.section_id
       LEFT JOIN BATCH_COORDINATOR bc ON bc.batch_id = b.batch_id
       LEFT JOIN INSTRUCTOR bci ON bci.instructor_id = bc.instructor_id
       WHERE r.student_id = :sid
       ORDER BY r.registered_at DESC`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Student course details error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/student-profile/:studentId
router.get('/student-profile/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT s.student_id, s.first_name, s.last_name, s.email, s.enrollment_year, s.semester, s.phone,
              d.dept_name, s.fa_id,
              fi.first_name || ' ' || fi.last_name AS fa_name
       FROM STUDENT s
       JOIN DEPT d ON d.dept_id = s.dept_id
       LEFT JOIN INSTRUCTOR fi ON fi.instructor_id = s.fa_id
       WHERE s.student_id = :sid`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows[0] || {});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/faculty-profile/:instructorId
router.get('/faculty-profile/:instructorId', verifyToken, async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT i.instructor_id, i.first_name, i.last_name, i.email, i.designation, i.phone, i.hire_date,
              d.dept_name,
              (SELECT COUNT(*) FROM SECTION_COORDINATOR sc WHERE sc.instructor_id = i.instructor_id) AS section_count
       FROM INSTRUCTOR i
       JOIN DEPT d ON d.dept_id = i.dept_id
       WHERE i.instructor_id = :iid`,
      { iid: Number(instructorId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows[0] || {});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/active-semester — public-ish (any logged in user)
router.get('/active-semester', verifyToken, async (_req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows.length > 0 ? { semester: result.rows[0].SEMESTER } : { semester: 'ODD-2025' });
  } catch (err) {
    console.error(err);
    return res.json({ semester: 'ODD-2025' }); // fallback
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/lookup/fa-students/:instructorId — students assigned to this FA
router.get('/fa-students/:instructorId', verifyToken, async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT s.student_id, s.first_name, s.last_name, s.email, s.enrollment_year, s.semester,
              d.dept_name
       FROM STUDENT s
       JOIN DEPT d ON d.dept_id = s.dept_id
       WHERE s.fa_id = :iid
       ORDER BY s.last_name, s.first_name`,
      { iid: Number(instructorId) },
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

module.exports = router;

