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
  const { sectionId } = req.body;
  const studentId = req.user.id;

  if (!sectionId) {
    return res.status(400).json({ error: 'sectionId is required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    // Fetch the admin-set active semester — this is the ONLY semester students can register in
    const semResult = await conn.execute(
      `SELECT semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const activeSemester = semResult.rows.length > 0 ? semResult.rows[0].SEMESTER : null;
    if (!activeSemester) {
      return res.status(403).json({ error: 'No active semester set. Contact admin.' });
    }

    // If client sent a semester, validate it matches — otherwise use active
    const semester = activeSemester;
    if (req.body.semester && req.body.semester !== activeSemester) {
      return res.status(403).json({ error: `Registration is only allowed for the active semester (${activeSemester}).` });
    }

    // Verify the section actually belongs to the active semester
    const secCheck = await conn.execute(
      `SELECT semester FROM SECTION WHERE section_id = :sid`,
      { sid: sectionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (secCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found.' });
    }
    if (secCheck.rows[0].SEMESTER !== activeSemester) {
      return res.status(403).json({ error: `This section does not belong to the active semester (${activeSemester}).` });
    }

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

// DELETE /api/registration/:registrationId — request a course drop (status=DROP_PENDING, awaiting faculty approval)
router.delete('/:registrationId', verifyToken, authorize('student'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `UPDATE REGISTRATION SET status = 'DROP_PENDING', approval_status = 'DROP_PENDING' 
       WHERE registration_id = :rid AND student_id = :sid AND status = 'ACTIVE'`,
      { rid: Number(registrationId), sid: req.user.id },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) {
       return res.status(400).json({ error: 'Cannot drop this course. Perhaps already pending drop or not active.' });
    }
    return res.json({ message: 'Drop request submitted — pending faculty approval.' });
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

// GET /api/registration/pending-drops/:instructorId — pending drop requests for coordinator
router.get('/pending-drops/:instructorId', verifyToken, authorize('instructor'), async (req, res) => {
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
       WHERE r.status = 'DROP_PENDING' OR r.approval_status = 'DROP_PENDING'
       ORDER BY r.registered_at DESC`,
      { iid: Number(instructorId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Pending drops error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/registration/:registrationId/approve-drop
router.put('/:registrationId/approve-drop', verifyToken, authorize('instructor'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE REGISTRATION SET status = 'DROPPED', approval_status = 'DROP_APPROVED', approved_by = :iid
       WHERE registration_id = :rid AND (status = 'DROP_PENDING' OR approval_status = 'DROP_PENDING')`,
      { iid: req.user.id, rid: Number(registrationId) },
      { autoCommit: true }
    );
    return res.json({ message: 'Drop approved.' });
  } catch (err) {
    console.error('Approve drop error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/registration/:registrationId/reject-drop
router.put('/:registrationId/reject-drop', verifyToken, authorize('instructor'), async (req, res) => {
  const { registrationId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.execute(
      `UPDATE REGISTRATION SET status = 'ACTIVE', approval_status = 'DROP_REJECTED'
       WHERE registration_id = :rid AND (status = 'DROP_PENDING' OR approval_status = 'DROP_PENDING')`,
      { rid: Number(registrationId) },
      { autoCommit: true }
    );
    return res.json({ message: 'Drop request rejected. Course is active again.' });
  } catch (err) {
    console.error('Reject drop error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
