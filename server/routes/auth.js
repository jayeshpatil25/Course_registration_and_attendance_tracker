// ============================================================
// Auth Routes — Login (Student, Faculty & Admin)
// ============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');
const db = require('../config/database');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required.' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    let query;
    if (role === 'student') {
      query = `SELECT student_id AS id, first_name, last_name, email, password_hash, dept_id FROM STUDENT WHERE email = :email`;
    } else if (role === 'instructor') {
      query = `SELECT instructor_id AS id, first_name, last_name, email, password_hash, dept_id FROM INSTRUCTOR WHERE email = :email`;
    } else if (role === 'admin') {
      query = `SELECT admin_id AS id, admin_name AS first_name, '' AS last_name, email, password_hash, 0 AS dept_id FROM ADMIN WHERE email = :email`;
    } else {
      return res.status(400).json({ error: 'role must be "student", "instructor", or "admin".' });
    }

    const result = await conn.execute(query, { email }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      {
        id: user.ID,
        role,
        firstName: user.FIRST_NAME,
        lastName: user.LAST_NAME,
        deptId: user.DEPT_ID,
        email: user.EMAIL,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      token,
      user: {
        id: user.ID,
        firstName: user.FIRST_NAME,
        lastName: user.LAST_NAME,
        email: user.EMAIL,
        role,
        deptId: user.DEPT_ID,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
