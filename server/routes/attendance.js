// ============================================================
// Attendance Routes — calls PL/SQL ATTENDANCE_PKG
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

// POST /api/attendance/mark   — bulk mark attendance for a section
router.post('/mark', verifyToken, authorize('instructor'), async (req, res) => {
  const { sectionId, date, records } = req.body;
  // records = [{ studentId, status }, ...]

  if (!sectionId || !date || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'sectionId, date, and records[] are required.' });
  }

  const studentIds = records.map((r) => r.studentId).join(',');
  const statuses = records.map((r) => r.status).join(',');

  let conn;
  try {
    conn = await db.getConnection();

    const result = await conn.execute(
      `BEGIN
         ATTENDANCE_PKG.BULK_MARK_ATTENDANCE(
           :p_section_id, TO_DATE(:p_att_date, 'YYYY-MM-DD'),
           :p_student_ids, :p_statuses, :p_marked_by, :p_count
         );
       END;`,
      {
        p_section_id: sectionId,
        p_att_date: date,
        p_student_ids: studentIds,
        p_statuses: statuses,
        p_marked_by: req.user.id,
        p_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    return res.json({
      message: 'Attendance marked successfully.',
      count: result.outBinds.p_count,
    });
  } catch (err) {
    console.error('Mark attendance error:', err);
    if (err.errorNum && err.errorNum >= 20001 && err.errorNum <= 20099) {
      return res.status(409).json({ error: err.message.split('\n')[0] });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/attendance/percentage/:studentId/:sectionId
router.get('/percentage/:studentId/:sectionId', verifyToken, async (req, res) => {
  const { studentId, sectionId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `BEGIN
         :pct := ATTENDANCE_PKG.GET_ATTENDANCE_PCT(:sid, :secid);
       END;`,
      {
        sid: Number(studentId),
        secid: Number(sectionId),
        pct: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return res.json({ percentage: result.outBinds.pct });
  } catch (err) {
    console.error('Attendance pct error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/attendance/section/:sectionId/date/:date  — list attendance for a section on a date
router.get('/section/:sectionId/date/:date', verifyToken, authorize('instructor'), async (req, res) => {
  const { sectionId, date } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT a.attendance_id, a.student_id, s.first_name, s.last_name, a.status
       FROM ATTENDANCE a
       JOIN STUDENT s ON s.student_id = a.student_id
       WHERE a.section_id = :secid
         AND a.attendance_date = TO_DATE(:adate, 'YYYY-MM-DD')
       ORDER BY s.last_name, s.first_name`,
      { secid: Number(sectionId), adate: date },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch attendance error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/attendance/student/:studentId  — all attendance records for a student
router.get('/student/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT a.attendance_id, a.section_id, sec.section_name,
              c.course_code, c.course_name,
              a.attendance_date, a.status
       FROM ATTENDANCE a
       JOIN SECTION sec ON sec.section_id = a.section_id
       JOIN COURSE  c   ON c.course_id    = sec.course_id
       WHERE a.student_id = :sid
       ORDER BY a.attendance_date DESC`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Student attendance error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
