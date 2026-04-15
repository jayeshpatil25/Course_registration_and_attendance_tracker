// ============================================================
// Admin Routes — semester management
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

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
      `SELECT c.course_id, c.course_code, c.course_name, c.credits, d.dept_name,
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
              c.course_code, s.section_name
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

module.exports = router;
