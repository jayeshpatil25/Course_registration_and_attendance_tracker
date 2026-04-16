/**
 * Setup script — drops tables, recreates schema + packages, seeds data.
 * Uses ODD-2025 / EVEN-2025, 4 instructors, admin user, approval workflow.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const oracledb = require('oracledb');
const fs = require('fs');
const bcrypt = require('bcryptjs');

async function run() {
  let conn;
  try {
    console.log(`\n🔌  Connecting as ${process.env.ORACLE_USER} @ ${process.env.ORACLE_CONNECT_STRING} ...`);
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
    });
    console.log('✅  Connected!\n');

    // ── 1. Drop all tables ──────────────────────────────────
    console.log('🗑  Dropping existing tables ...');
    const dropOrder = [
      'ATTENDANCE', 'REGISTRATION', 'BATCH_COORDINATOR', 'SECTION_COORDINATOR',
      'BATCH', 'SECTION', 'COURSE', 'STUDENT', 'INSTRUCTOR', 'DEPT', 'COLLEGE',
      'ADMIN', 'ACTIVE_SEMESTER'
    ];
    for (const tbl of dropOrder) {
      try { await conn.execute(`DROP TABLE ${tbl} CASCADE CONSTRAINTS PURGE`); console.log(`  ✓ Dropped ${tbl}`); }
      catch (err) { if (err.errorNum === 942) console.log(`  ⏭ ${tbl}`); }
    }

    // ── 2. Load schema.sql ──────────────────────────────────
    console.log('\n📄  Loading schema.sql ...');
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf-8');
    const ddls = schemaSql.split(/;\s*$/m).map(s => s.replace(/--.*$/gm, '').trim()).filter(s => s.length > 0);
    for (const stmt of ddls) {
      try { await conn.execute(stmt); const m = stmt.match(/(?:CREATE\s+(?:TABLE|INDEX)\s+)(\S+)/i); if (m) console.log(`  ✓ ${m[1]}`); }
      catch (err) { if (err.errorNum !== 955 && err.errorNum !== 1408) console.warn(`  ⚠ ${err.message.split('\n')[0]}`); }
    }
    await conn.commit();
    console.log('✅  Schema loaded');

    // ── 3. Load packages.sql ─────────────────────────────────
    console.log('\n📄  Loading packages.sql ...');
    const pkgSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'packages.sql'), 'utf-8');
    const blocks = pkgSql.split(/^\s*\/\s*$/m).map(b => b.trim()).filter(b => b.length > 10);
    for (const block of blocks) {
      try { await conn.execute(block); const m = block.match(/(?:CREATE\s+OR\s+REPLACE\s+PACKAGE\s+(?:BODY\s+)?)(\S+)/i); console.log(`  ✓ ${m ? m[1] : 'PL/SQL block'}`); }
      catch (err) { console.warn(`  ⚠ PL/SQL: ${err.message.split('\n')[0]}`); }
    }
    await conn.commit();
    console.log('✅  PL/SQL packages loaded');

    // ── 4. Seed Data ─────────────────────────────────────────
    console.log('\n🌱  Inserting seed data ...');
    const passHash = await bcrypt.hash('password123', 10);

    const ins = async (sql, binds) => {
      const r = await conn.execute(sql, { ...binds, id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } });
      return r.outBinds.id[0];
    };

    // Active Semester
    await conn.execute(
      `INSERT INTO ACTIVE_SEMESTER (id, semester) VALUES (1, 'ODD-2025')`
    );
    console.log('  ✓ Active semester: ODD-2025');

    // Admin
    await conn.execute(
      `INSERT INTO ADMIN (admin_name, email, password_hash) VALUES (:n, :e, :p)`,
      { n: 'System Admin', e: 'admin@unitrack.edu', p: passHash }
    );
    console.log('  ✓ Admin user');

    // College
    const collegeId = await ins(
      `INSERT INTO COLLEGE (college_name, address, email) VALUES (:n, :a, :e) RETURNING college_id INTO :id`,
      { n: 'VNIT - Visvesvaraya National Institute of Technology', a: 'South Ambazari Road, Nagpur 440010', e: 'admin@vnit.ac.in' }
    );

    // Departments
    const csDept = await ins(`INSERT INTO DEPT (dept_name, college_id) VALUES (:n, :c) RETURNING dept_id INTO :id`, { n: 'Computer Science & Engineering', c: collegeId });
    const ecDept = await ins(`INSERT INTO DEPT (dept_name, college_id) VALUES (:n, :c) RETURNING dept_id INTO :id`, { n: 'Electronics & Communication Engineering', c: collegeId });
    console.log(`  ✓ Departments`);

    // Instructors (4 total)
    const faculty = [
      { fn: 'Rajesh', ln: 'Kumar', email: 'rajesh@unitrack.edu', dept: csDept },
      { fn: 'Priya', ln: 'Sharma', email: 'priya@unitrack.edu', dept: csDept },
      { fn: 'Arjun', ln: 'Mehta', email: 'arjun@unitrack.edu', dept: ecDept },
      { fn: 'Kavita', ln: 'Desai', email: 'kavita@unitrack.edu', dept: ecDept },
    ];
    const instrIds = [];
    for (const f of faculty) {
      instrIds.push(await ins(
        `INSERT INTO INSTRUCTOR (first_name, last_name, email, password_hash, dept_id, designation) VALUES (:fn, :ln, :em, :pw, :d, 'Professor') RETURNING instructor_id INTO :id`,
        { fn: f.fn, ln: f.ln, em: f.email, pw: passHash, d: f.dept }
      ));
    }
    console.log(`  ✓ Instructors (${instrIds.length})`);

    // Students (5)
    const studentData = [
      { fn: 'Amit', ln: 'Patel', email: 'amit@unitrack.edu', dept: csDept },
      { fn: 'Sneha', ln: 'Reddy', email: 'sneha@unitrack.edu', dept: csDept },
      { fn: 'Vikram', ln: 'Singh', email: 'vikram@unitrack.edu', dept: ecDept },
      { fn: 'Neha', ln: 'Gupta', email: 'neha@unitrack.edu', dept: csDept },
      { fn: 'Rohit', ln: 'Joshi', email: 'rohit@unitrack.edu', dept: ecDept },
    ];
    const stuIds = [];
    for (const s of studentData) {
      stuIds.push(await ins(
        `INSERT INTO STUDENT (first_name, last_name, email, password_hash, dept_id, enrollment_year, fa_id) VALUES (:fn, :ln, :em, :pw, :d, 2025, :fa) RETURNING student_id INTO :id`,
        { fn: s.fn, ln: s.ln, em: s.email, pw: passHash, d: s.dept, fa: s.dept === csDept ? instrIds[0] : instrIds[2] }
      ));
    }
    console.log(`  ✓ Students (${stuIds.length})`);

    // Courses (5)
    const courseData = [
      { code: 'CS101', name: 'Data Structures', dept: csDept, cr: 4 },
      { code: 'CS201', name: 'Database Systems', dept: csDept, cr: 4 },
      { code: 'CS301', name: 'Operating Systems', dept: csDept, cr: 3 },
      { code: 'EC101', name: 'Digital Electronics', dept: ecDept, cr: 3 },
      { code: 'EC201', name: 'Signal Processing', dept: ecDept, cr: 4 },
    ];
    const courseIds = [];
    for (const c of courseData) {
      courseIds.push(await ins(
        `INSERT INTO COURSE (course_code, course_name, dept_id, credits) VALUES (:co, :cn, :d, :cr) RETURNING course_id INTO :id`,
        { co: c.code, cn: c.name, d: c.dept, cr: c.cr }
      ));
    }
    console.log(`  ✓ Courses (${courseIds.length})`);

    // Sections — ODD-2025, with MWF schedules (3 classes/week)
    const secData = [
      { name: 'A', courseIdx: 0, sem: 'ODD-2025', room: 'LH-101', sched: 'Mon/Wed/Fri 09:00-10:00', faculty: instrIds[0] },
      { name: 'B', courseIdx: 0, sem: 'ODD-2025', room: 'LH-102', sched: 'Mon/Wed/Fri 10:00-11:00', faculty: instrIds[1] },
      { name: 'A', courseIdx: 1, sem: 'ODD-2025', room: 'LH-201', sched: 'Tue/Thu/Sat 11:00-12:00', faculty: instrIds[0] },
      { name: 'A', courseIdx: 2, sem: 'ODD-2025', room: 'LH-301', sched: 'Mon/Wed/Fri 14:00-15:00', faculty: instrIds[1] },
      { name: 'A', courseIdx: 3, sem: 'ODD-2025', room: 'LH-401', sched: 'Tue/Thu/Sat 14:00-15:00', faculty: instrIds[2] },
      { name: 'A', courseIdx: 4, sem: 'ODD-2025', room: 'LH-402', sched: 'Mon/Wed/Fri 11:00-12:00', faculty: instrIds[3] },
      // EVEN semester
      { name: 'A', courseIdx: 0, sem: 'EVEN-2025', room: 'LH-101', sched: 'Tue/Thu/Sat 09:00-10:00', faculty: instrIds[1] },
      { name: 'A', courseIdx: 3, sem: 'EVEN-2025', room: 'LH-401', sched: 'Mon/Wed/Fri 11:00-12:00', faculty: instrIds[2] },
    ];
    const secIds = [];
    for (const s of secData) {
      const sid = await ins(
        `INSERT INTO SECTION (section_name, course_id, semester, capacity, room, schedule) VALUES (:sn, :cid, :sem, 60, :rm, :sc) RETURNING section_id INTO :id`,
        { sn: s.name, cid: courseIds[s.courseIdx], sem: s.sem, rm: s.room, sc: s.sched }
      );
      secIds.push(sid);
      await conn.execute(`INSERT INTO SECTION_COORDINATOR (section_id, instructor_id) VALUES (:s, :i)`, { s: sid, i: s.faculty });
    }
    console.log(`  ✓ Sections (${secIds.length})`);

    // Batches (B1, B2, LAB per ODD section)
    for (let i = 0; i < 6; i++) {
      const secId = secIds[i];
      const secFac = secData[i].faculty;
      for (const bn of ['B1', 'B2']) {
        const bid = await ins(`INSERT INTO BATCH (batch_name, section_id, capacity) VALUES (:bn, :sid, 30) RETURNING batch_id INTO :id`, { bn, sid: secId });
        await conn.execute(`INSERT INTO BATCH_COORDINATOR (batch_id, instructor_id) VALUES (:b, :i)`, { b: bid, i: secFac });
      }
      // LAB batch with different coordinator
      const labFac = i < 3 ? instrIds[1] : instrIds[3];
      const labId = await ins(`INSERT INTO BATCH (batch_name, section_id, capacity) VALUES (:bn, :sid, 20) RETURNING batch_id INTO :id`, { bn: 'LAB', sid: secId });
      await conn.execute(`INSERT INTO BATCH_COORDINATOR (batch_id, instructor_id) VALUES (:b, :i)`, { b: labId, i: labFac });
    }
    console.log(`  ✓ Batches`);

    // Registrations — mix of ACTIVE (approved) and PENDING
    const regData = [
      // Approved registrations
      { stu: stuIds[0], sec: secIds[0], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[0] },
      { stu: stuIds[0], sec: secIds[2], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[0] },
      { stu: stuIds[1], sec: secIds[0], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[0] },
      { stu: stuIds[1], sec: secIds[3], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[1] },
      { stu: stuIds[2], sec: secIds[4], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[2] },
      { stu: stuIds[2], sec: secIds[5], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[3] },
      { stu: stuIds[3], sec: secIds[1], status: 'ACTIVE', approval: 'APPROVED', by: instrIds[1] },
      // Pending registrations (for faculty to approve)
      { stu: stuIds[3], sec: secIds[2], status: 'PENDING', approval: 'PENDING', by: null },
      { stu: stuIds[4], sec: secIds[4], status: 'PENDING', approval: 'PENDING', by: null },
      { stu: stuIds[4], sec: secIds[0], status: 'PENDING', approval: 'PENDING', by: null },
    ];
    for (const r of regData) {
      await conn.execute(
        `INSERT INTO REGISTRATION (student_id, section_id, semester, status, approval_status, approved_by) VALUES (:s, :sec, 'ODD-2025', :st, :ap, :approver)`,
        { s: r.stu, sec: r.sec, st: r.status, ap: r.approval, approver: r.by }
      );
    }
    console.log(`  ✓ Registrations (${regData.length} — ${regData.filter(r=>r.status==='PENDING').length} pending)`);

    // Sample attendance (5 days for CS101 Sec A)
    const today = new Date();
    for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().slice(0, 10);
      for (const stuId of [stuIds[0], stuIds[1]]) {
        const status = Math.random() > 0.2 ? 'PRESENT' : 'ABSENT';
        try {
          await conn.execute(
            `INSERT INTO ATTENDANCE (student_id, section_id, attendance_date, status, marked_by) VALUES (:s, :sec, TO_DATE(:d, 'YYYY-MM-DD'), :st, :mb)`,
            { s: stuId, sec: secIds[0], d: dateStr, st: status, mb: instrIds[0] }
          );
        } catch (err) { /* skip duplicates */ }
      }
    }
    console.log('  ✓ Sample attendance');

    await conn.commit();

    console.log('\n══════════════════════════════════════════════');
    console.log('  SETUP COMPLETE!');
    console.log('══════════════════════════════════════════════');
    console.log('  Active Semester: ODD-2025');
    console.log('  College: VNIT Nagpur');
    console.log('');
    console.log('  Logins (password: password123):');
    console.log('    Admin:   admin@unitrack.edu');
    console.log('    Student: amit@unitrack.edu');
    console.log('    Student: sneha@unitrack.edu');
    console.log('    Student: neha@unitrack.edu');
    console.log('    Faculty: rajesh@unitrack.edu (CS101-A, CS201-A)');
    console.log('    Faculty: priya@unitrack.edu  (CS101-B, CS301-A)');
    console.log('    Faculty: arjun@unitrack.edu  (EC101-A)');
    console.log('    Faculty: kavita@unitrack.edu (EC201-A)');
    console.log('══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌  Setup error:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

run();
