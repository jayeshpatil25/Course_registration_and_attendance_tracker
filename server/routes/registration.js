// ============================================================
// Registration Routes — with approval workflow
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

// POST /api/registration — register a student (status=PENDING, awaiting faculty approval)
router.post('/', verifyToken, authorize('student'), async (req, res) => {
  const { sectionId, semester } = req.body;
  const studentId = req.user.id;

  if (!sectionId || !semester) {
    return res.status(400).json({ error: 'sectionId and semester are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    // Check if already registered
    const check = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM REGISTRATION WHERE student_id = :s AND section_id = :sec AND semester = :sem`,
      { s: studentId, sec: sectionId, sem: semester }
    );
    if (check.rows[0][0] > 0) {
      return res.status(409).json({ error: 'Already registered for this course.' });
    }

    // Check capacity
    const capCheck = await conn.execute(
      `SELECT s.capacity,
              (SELECT COUNT(*) FROM REGISTRATION r WHERE r.section_id = s.section_id AND r.status IN ('ACTIVE','PENDING')) AS enrolled
       FROM SECTION s WHERE s.section_id = :sid`,
      { sid: sectionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (capCheck.rows.length > 0 && capCheck.rows[0].ENROLLED >= capCheck.rows[0].CAPACITY) {
      return res.status(409).json({ error: 'Section is at full capacity.' });
    }

    const result = await conn.execute(
      `INSERT INTO REGISTRATION (student_id, section_id, semester, status, approval_status)
       VALUES (:s, :sec, :sem, 'PENDING', 'PENDING')
       RETURNING registration_id INTO :id`,
      {
        s: studentId,
        sec: sectionId,
        sem: semester,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    return res.status(201).json({
      message: 'Registration submitted — pending faculty approval.',
      registrationId: result.outBinds.id[0],
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.errorNum && err.errorNum >= 20001 && err.errorNum <= 20099) {
      return res.status(409).json({ error: err.message.split('\n')[0] });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/registration/:studentId — list registrations
router.get('/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.section_id, r.semester, r.status, r.approval_status, r.registered_at,
              s.section_name, c.course_code, c.course_name, c.credits
       FROM REGISTRATION r
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE  c ON c.course_id  = s.course_id
       WHERE r.student_id = :sid
       ORDER BY r.registered_at DESC`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch registrations error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// DELETE /api/registration/:registrationId — drop a course
router.delete('/:registrationId', verifyToken, authorize('student'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE REGISTRATION SET status = 'DROPPED' WHERE registration_id = :rid AND student_id = :sid`,
      { rid: Number(registrationId), sid: req.user.id },
      { autoCommit: true }
    );
    return res.json({ message: 'Course dropped.' });
  } catch (err) {
    console.error('Drop error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET /api/registration/pending-approvals/:instructorId — pending registrations for coordinator
router.get('/pending-approvals/:instructorId', verifyToken, authorize('instructor'), async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.student_id, r.section_id, r.semester, r.registered_at,
              st.first_name, st.last_name, st.email,
              s.section_name, c.course_code, c.course_name
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
       JOIN SECTION_COORDINATOR sc ON sc.section_id = r.section_id AND sc.instructor_id = :iid
       WHERE r.approval_status = 'PENDING'
       ORDER BY r.registered_at DESC`,
      { iid: Number(instructorId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Pending approvals error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/registration/:registrationId/approve
router.put('/:registrationId/approve', verifyToken, authorize('instructor'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE REGISTRATION SET approval_status = 'APPROVED', status = 'ACTIVE', approved_by = :iid
       WHERE registration_id = :rid AND approval_status = 'PENDING'`,
      { iid: req.user.id, rid: Number(registrationId) },
      { autoCommit: true }
    );
    return res.json({ message: 'Registration approved.' });
  } catch (err) {
    console.error('Approve error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/registration/:registrationId/reject
router.put('/:registrationId/reject', verifyToken, authorize('instructor'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE REGISTRATION SET approval_status = 'REJECTED', status = 'REJECTED'
       WHERE registration_id = :rid AND approval_status = 'PENDING'`,
      { rid: Number(registrationId) },
      { autoCommit: true }
    );
    return res.json({ message: 'Registration rejected.' });
  } catch (err) {
    console.error('Reject error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
