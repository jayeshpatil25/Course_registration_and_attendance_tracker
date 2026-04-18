// ============================================================
// Registration Routes — with approval workflow
// ============================================================
const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const db = require('../config/database');
const { verifyToken, authorize } = require('../middleware/auth');

// ────────────────────────────────────────────────────────────
// POST /api/registration — register a student for a SINGLE course
//   (kept for backward compat; status=PENDING, awaiting FA approval)
// ────────────────────────────────────────────────────────────
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
      `SELECT session_code AS semester FROM ACTIVE_SEMESTER WHERE id = 1`,
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
      `SELECT session_code AS semester FROM SECTION WHERE section_id = :sid`,
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
      `SELECT COUNT(*) AS cnt FROM REGISTRATION WHERE student_id = :s AND section_id = :sec AND session_code = :sem`,
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
      `INSERT INTO REGISTRATION (student_id, section_id, session_code, status, approval_status)
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

// ────────────────────────────────────────────────────────────
// POST /api/registration/bulk — APPLY FOR REGISTRATION
//   Registers student for multiple courses at once.
//   Validates max 6 Theory + 4 Practical.
// ────────────────────────────────────────────────────────────
router.post('/bulk', verifyToken, authorize('student'), async (req, res) => {
  const { sectionIds } = req.body;
  const studentId = req.user.id;

  if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
    return res.status(400).json({ error: 'sectionIds array is required and must not be empty.' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    // Get active semester
    const semResult = await conn.execute(
      `SELECT session_code AS semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const activeSemester = semResult.rows.length > 0 ? semResult.rows[0].SEMESTER : null;
    if (!activeSemester) {
      return res.status(403).json({ error: 'No active semester set. Contact admin.' });
    }

    // Count already-registered courses for this student in this semester (non-dropped)
    const existingResult = await conn.execute(
      `SELECT c.course_type, COUNT(*) AS cnt
       FROM REGISTRATION r
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
       WHERE r.student_id = :sid AND r.session_code = :sem AND r.status IN ('ACTIVE', 'PENDING')
       GROUP BY c.course_type`,
      { sid: studentId, sem: activeSemester },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    let existingTheory = 0, existingPractical = 0;
    for (const row of existingResult.rows) {
      if (row.COURSE_TYPE === 'THEORY') existingTheory = row.CNT;
      if (row.COURSE_TYPE === 'PRACTICAL') existingPractical = row.CNT;
    }

    // Validate each section and count new Theory/Practical
    let newTheory = 0, newPractical = 0;
    const validatedSections = [];

    for (const secId of sectionIds) {
      // Verify section exists and belongs to active semester, fetch course type
      const secCheck = await conn.execute(
        `SELECT s.section_id, s.session_code AS semester, s.capacity, c.course_type, c.course_code,
                (SELECT COUNT(*) FROM REGISTRATION r WHERE r.section_id = s.section_id AND r.status IN ('ACTIVE','PENDING')) AS enrolled
         FROM SECTION s
         JOIN COURSE c ON c.course_id = s.course_id
         WHERE s.section_id = :sid`,
        { sid: Number(secId) },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (secCheck.rows.length === 0) {
        return res.status(404).json({ error: `Section ${secId} not found.` });
      }
      const sec = secCheck.rows[0];

      if (sec.SEMESTER !== activeSemester) {
        return res.status(403).json({ error: `Section for ${sec.COURSE_CODE} does not belong to the active semester.` });
      }

      if (sec.ENROLLED >= sec.CAPACITY) {
        return res.status(409).json({ error: `Section for ${sec.COURSE_CODE} is at full capacity.` });
      }

      // Check for any existing registration for this section and semester
      const dupCheck = await conn.execute(
        `SELECT registration_id, status FROM REGISTRATION WHERE student_id = :s AND section_id = :sec AND session_code = :sem`,
        { s: studentId, sec: Number(secId), sem: activeSemester },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      let existingRegId = null;
      if (dupCheck.rows.length > 0) {
        const existingStatus = dupCheck.rows[0].STATUS;
        if (['ACTIVE', 'PENDING', 'DROP_PENDING'].includes(existingStatus)) {
          return res.status(409).json({ error: `Already registered for ${sec.COURSE_CODE}.` });
        }
        existingRegId = dupCheck.rows[0].REGISTRATION_ID;
      }

      if (sec.COURSE_TYPE === 'THEORY') newTheory++;
      else newPractical++;

      sec.existingRegId = existingRegId;
      validatedSections.push(sec);
    }

    // Enforce limits: max 6 theory, max 4 practical
    const totalTheory = existingTheory + newTheory;
    const totalPractical = existingPractical + newPractical;

    if (totalTheory > 6) {
      return res.status(400).json({
        error: `Cannot register for more than 6 theory courses. You have ${existingTheory} existing + ${newTheory} new = ${totalTheory}.`
      });
    }
    if (totalPractical > 4) {
      return res.status(400).json({
        error: `Cannot register for more than 4 practical courses. You have ${existingPractical} existing + ${newPractical} new = ${totalPractical}.`
      });
    }

    // All validations passed — insert or update all registrations
    const registrationIds = [];
    for (const sec of validatedSections) {
      if (sec.existingRegId) {
        await conn.execute(
          `UPDATE REGISTRATION 
           SET status = 'PENDING', approval_status = 'PENDING', approved_by = NULL, registered_at = SYSTIMESTAMP
           WHERE registration_id = :rid`,
          { rid: sec.existingRegId },
          { autoCommit: false }
        );
        registrationIds.push(sec.existingRegId);
      } else {
        const result = await conn.execute(
          `INSERT INTO REGISTRATION (student_id, section_id, session_code, status, approval_status)
           VALUES (:s, :sec, :sem, 'PENDING', 'PENDING')
           RETURNING registration_id INTO :id`,
          {
            s: studentId,
            sec: Number(sec.SECTION_ID),
            sem: activeSemester,
            id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
          { autoCommit: false }
        );
        registrationIds.push(result.outBinds.id[0]);
      }
    }

    // Commit all at once
    await conn.execute('COMMIT');

    return res.status(201).json({
      message: `Registration submitted for ${sectionIds.length} course(s) — pending Faculty Advisor approval.`,
      registrationIds,
      summary: { theory: totalTheory, practical: totalPractical }
    });
  } catch (err) {
    console.error('Bulk registration error:', err);
    try { if (conn) await conn.execute('ROLLBACK'); } catch (_) {}
    if (err.errorNum && err.errorNum >= 20001 && err.errorNum <= 20099) {
      return res.status(409).json({ error: err.message.split('\n')[0] });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/registration/:studentId — list registrations
// ────────────────────────────────────────────────────────────
router.get('/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.section_id, r.session_code AS semester, r.status, r.approval_status, r.registered_at,
              s.section_name, c.course_code, c.course_name, c.credits, c.course_type
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

// ────────────────────────────────────────────────────────────
// DELETE /api/registration/:registrationId — request a course drop
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// GET /api/registration/pending-approvals/:instructorId
//   Returns pending registrations for students whose FA is this instructor
// ────────────────────────────────────────────────────────────
router.get('/pending-approvals/:instructorId', verifyToken, authorize('instructor'), async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.student_id, r.section_id, r.session_code AS semester, r.registered_at,
              st.first_name, st.last_name, st.email,
              s.section_name, c.course_code, c.course_name, c.course_type, c.credits
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
       WHERE r.approval_status = 'PENDING'
         AND st.fa_id = :iid
       ORDER BY st.last_name, st.first_name, r.registered_at DESC`,
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

// ────────────────────────────────────────────────────────────
// PUT /api/registration/:registrationId/approve
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// PUT /api/registration/approve-student/:studentId — BATCH approve all pending for a student
// ────────────────────────────────────────────────────────────
router.put('/approve-student/:studentId', verifyToken, authorize('instructor'), async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();

    // Verify this instructor is the FA for this student
    const faCheck = await conn.execute(
      `SELECT fa_id FROM STUDENT WHERE student_id = :sid`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (faCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (faCheck.rows[0].FA_ID !== req.user.id) {
      return res.status(403).json({ error: 'You are not the Faculty Advisor for this student.' });
    }

    const result = await conn.execute(
      `UPDATE REGISTRATION SET approval_status = 'APPROVED', status = 'ACTIVE', approved_by = :iid
       WHERE student_id = :sid AND approval_status = 'PENDING'`,
      { iid: req.user.id, sid: Number(studentId) },
      { autoCommit: true }
    );
    return res.json({ message: `Approved ${result.rowsAffected} registration(s) for this student.`, count: result.rowsAffected });
  } catch (err) {
    console.error('Batch approve error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// ────────────────────────────────────────────────────────────
// PUT /api/registration/reject-student/:studentId — BATCH reject all pending for a student
// ────────────────────────────────────────────────────────────
router.put('/reject-student/:studentId', verifyToken, authorize('instructor'), async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();

    // Verify FA
    const faCheck = await conn.execute(
      `SELECT fa_id FROM STUDENT WHERE student_id = :sid`,
      { sid: Number(studentId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (faCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (faCheck.rows[0].FA_ID !== req.user.id) {
      return res.status(403).json({ error: 'You are not the Faculty Advisor for this student.' });
    }

    const result = await conn.execute(
      `UPDATE REGISTRATION SET approval_status = 'REJECTED', status = 'REJECTED'
       WHERE student_id = :sid AND approval_status = 'PENDING'`,
      { sid: Number(studentId) },
      { autoCommit: true }
    );
    return res.json({ message: `Rejected ${result.rowsAffected} registration(s) for this student.`, count: result.rowsAffected });
  } catch (err) {
    console.error('Batch reject error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

// ────────────────────────────────────────────────────────────
// PUT /api/registration/:registrationId/reject
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// GET /api/registration/pending-drops/:instructorId
// ────────────────────────────────────────────────────────────
router.get('/pending-drops/:instructorId', verifyToken, authorize('instructor'), async (req, res) => {
  const { instructorId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();
    const result = await conn.execute(
      `SELECT r.registration_id, r.student_id, r.section_id, r.session_code AS semester, r.registered_at,
              st.first_name, st.last_name, st.email,
              s.section_name, c.course_code, c.course_name, c.course_type
       FROM REGISTRATION r
       JOIN STUDENT st ON st.student_id = r.student_id
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
       WHERE (r.status = 'DROP_PENDING' OR r.approval_status = 'DROP_PENDING')
         AND st.fa_id = :iid
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

// ────────────────────────────────────────────────────────────
// PUT /api/registration/:registrationId/approve-drop
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// PUT /api/registration/:registrationId/reject-drop
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// GET /api/registration/status-summary/:studentId
//   Returns an overall registration status for a student in the active semester
// ────────────────────────────────────────────────────────────
router.get('/status-summary/:studentId', verifyToken, async (req, res) => {
  const { studentId } = req.params;
  let conn;
  try {
    conn = await db.getConnection();

    // Get active semester
    const semResult = await conn.execute(
      `SELECT session_code AS semester FROM ACTIVE_SEMESTER WHERE id = 1`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const activeSemester = semResult.rows.length > 0 ? semResult.rows[0].SEMESTER : null;

    if (!activeSemester) {
      return res.json({ status: 'NO_SEMESTER', semester: null, theoryCount: 0, practicalCount: 0 });
    }

    // Count registrations by status and course type
    const result = await conn.execute(
      `SELECT r.status, r.approval_status, c.course_type, COUNT(*) AS cnt
       FROM REGISTRATION r
       JOIN SECTION s ON s.section_id = r.section_id
       JOIN COURSE c ON c.course_id = s.course_id
       WHERE r.student_id = :sid AND r.session_code = :sem
       GROUP BY r.status, r.approval_status, c.course_type`,
      { sid: Number(studentId), sem: activeSemester },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let pending = 0, approved = 0, total = 0;
    let theoryCount = 0, practicalCount = 0;
    for (const row of result.rows) {
      if (row.STATUS === 'PENDING') pending += row.CNT;
      if (row.STATUS === 'ACTIVE' && row.APPROVAL_STATUS === 'APPROVED') approved += row.CNT;
      if (row.STATUS !== 'DROPPED' && row.STATUS !== 'REJECTED' && row.STATUS !== 'CANCELLED') {
        total += row.CNT;
        if (row.COURSE_TYPE === 'THEORY') theoryCount += row.CNT;
        if (row.COURSE_TYPE === 'PRACTICAL') practicalCount += row.CNT;
      }
    }

    let overallStatus = 'NOT_REGISTERED';
    if (total > 0 && pending > 0 && approved === 0) overallStatus = 'PENDING';
    else if (total > 0 && pending === 0 && approved > 0) overallStatus = 'APPROVED';
    else if (total > 0 && pending > 0 && approved > 0) overallStatus = 'PARTIALLY_APPROVED';

    return res.json({
      status: overallStatus,
      semester: activeSemester,
      total, pending, approved,
      theoryCount, practicalCount
    });
  } catch (err) {
    console.error('Status summary error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
