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
      'BATCH', 'SECTION', 'COURSE_OFFERED_SEMESTER', 'COURSE', 'STUDENT', 'INSTRUCTOR', 'DEPT', 'COLLEGE',
      'ADMIN', 'ACTIVE_SEMESTER', 'ACADEMIC_SESSION'
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

    // Sessions + Active Session
    await conn.execute(`INSERT INTO ACADEMIC_SESSION (session_code, term, session_year) VALUES ('ODD-2025', 'ODD', 2025)`);
    await conn.execute(`INSERT INTO ACADEMIC_SESSION (session_code, term, session_year) VALUES ('EVEN-2026', 'EVEN', 2026)`);
    await conn.execute(`INSERT INTO ACTIVE_SEMESTER (id, session_code) VALUES (1, 'ODD-2025')`);
    console.log('  ✓ Sessions: ODD-2025, EVEN-2026');
    console.log('  ✓ Active session (session_code): ODD-2025');

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

    // Instructors
    const facultyNames = [
      'PS Deshpande',
      'OG Kakde',
      'Praveen Kumar',
      'Kumari Nidhi Lal',
      'Anshul Agrawal',
      'Ravindra Keskar',
      'UA Deshpande',
      'Meera Dhabu',
      'PVN Prashant',
      'Gaurav Mishra',
      'Swati Jaiswal',
      'Manish Kurhekar',
      'Shital Raut',
      'Poonam Sharma',
      'Neha Sharma',
      'D Hem kumar',
      'Mansi Radke',
    ];

    const faculty = [];
    for (const fullName of facultyNames) {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || '-';
      const email = `${firstName.toLowerCase()}@unitrack.edu`;
      const instructorId = await ins(
        `INSERT INTO INSTRUCTOR (first_name, last_name, email, password_hash, dept_id)
         VALUES (:f, :l, :e, :p, :d)
         RETURNING instructor_id INTO :id`,
        { f: firstName, l: lastName, e: email, p: passHash, d: csDept }
      );
      faculty.push({ instructorId, fullName, email });
    }
    console.log(`  ✓ Instructors (${faculty.length})`);

    // Students
    const studentsToSeed = [
      { fullName: 'Salil Phanse', admissionYear: 2023 },
      { fullName: 'Jayesh Patil', admissionYear: 2023 },
      { fullName: 'Himanshu Kumar', admissionYear: 2024 },
      { fullName: 'Dhanvanshi Hanchate', admissionYear: 2025 },
      { fullName: 'Vedant Singh', admissionYear: 2025 },
      { fullName: 'Pushpal Mahajan', admissionYear: 2023 },
      { fullName: 'Anand Kale', admissionYear: 2024 },
      { fullName: 'Medhansh Panchal', admissionYear: 2025 },
      { fullName: 'Arjun Gaikwad', admissionYear: 2023 },
      { fullName: 'Madhav Chandak', admissionYear: 2024 },
      { fullName: 'Shravani Sawai', admissionYear: 2023 },
      { fullName: 'Anagha Choudhary', admissionYear: 2024 },
      { fullName: 'Ankita Bagal', admissionYear: 2025 },
      { fullName: 'Prasanna Adnaik', admissionYear: 2023 },
      { fullName: 'Tanushree', admissionYear: 2024 },
    ];

    let studentCount = 0;
    for (const s of studentsToSeed) {
      const parts = s.fullName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || '-';
      const email = `${firstName.toLowerCase()}@unitrack.edu`;

      await ins(
        `INSERT INTO STUDENT (first_name, last_name, email, password_hash, dept_id, enrollment_year, admission_year, phone, dob, fa_id)
         VALUES (:f, :l, :e, :p, :d, :ey, :ay, NULL, NULL, NULL)
         RETURNING student_id INTO :id`,
        {
          f: firstName,
          l: lastName,
          e: email,
          p: passHash,
          d: csDept,
          ey: s.admissionYear,
          ay: s.admissionYear,
        }
      );
      studentCount++;
    }
    console.log(`  ✓ Students (${studentCount})`);

    // Courses
    const coursesBySemester = [
      {
        semester: 1,
        term: 'ODD',
        courses: [
          { code: 'MA101', name: 'Maths 1', credits: 4 },
          { code: 'CS101', name: 'Computer Programming', credits: 4 },
          { code: 'CH101', name: 'Chemistry', credits: 4 },
          { code: 'EE101', name: 'Electrical Engineering', credits: 4 },
          { code: 'HS101', name: 'Social Science', credits: 3 },
        ],
      },
      {
        semester: 2,
        term: 'EVEN',
        courses: [
          { code: 'PH102', name: 'Physics', credits: 4 },
          { code: 'ME102', name: 'Engineering Drawing', credits: 4 },
          { code: 'HS102', name: 'Communication Skills', credits: 3 },
          { code: 'ME103', name: 'Engineering Mechanics', credits: 4 },
          { code: 'MA102', name: 'Maths 2', credits: 4 },
        ],
      },
      {
        semester: 3,
        term: 'ODD',
        courses: [
          { code: 'EC201', name: 'Digital Circuits and Microprocessors', credits: 5 },
          { code: 'MA201', name: 'Discrete Maths and graph theory', credits: 4 },
          { code: 'CS201', name: 'Data structures and program design 1', credits: 5 },
          { code: 'MA202', name: 'Probability Theory', credits: 4 },
          { code: 'HS201', name: 'Technical Communication', credits: 3 },
        ],
      },
      {
        semester: 4,
        term: 'EVEN',
        courses: [
          { code: 'MA203', name: 'Linear Algebra', credits: 4 },
          { code: 'CS202', name: 'Data Strucutres and Program Design 2', credits: 5 },
          { code: 'CS203', name: 'Concepts of Programming Languages', credits: 4 },
          { code: 'CS204', name: 'Object Oriented Programming', credits: 4 },
          { code: 'CS205', name: 'Computer Organisation', credits: 4 },
        ],
      },
      {
        semester: 5,
        term: 'ODD',
        courses: [
          { code: 'CS301', name: 'Theory of Computation', credits: 4 },
          { code: 'CS302', name: 'Computer Networks', credits: 4 },
          { code: 'CS303', name: 'Operating Systems', credits: 4 },
          { code: 'CS304', name: 'Neuro and Fuzzy Techniques', credits: 4 },
          { code: 'CS305', name: 'Design and Analysis of Algorithms', credits: 4 },
        ],
      },
      {
        semester: 6,
        term: 'EVEN',
        courses: [
          { code: 'CS306', name: 'Language Processors', credits: 4 },
          { code: 'CS307', name: 'Database and Management systems', credits: 4 },
          { code: 'CS308', name: 'System and Network security', credits: 4 },
          { code: 'MA301', name: 'Game Theory', credits: 4 },
          { code: 'CS309', name: 'Image Processing and Understanding', credits: 4 },
          { code: 'CS310', name: 'Machine Learning', credits: 4 },
        ],
      },
    ];

    const courseIdByCode = new Map();
    for (const sem of coursesBySemester) {
      for (const c of sem.courses) {
        if (!courseIdByCode.has(c.code)) {
          const courseId = await ins(
            `INSERT INTO COURSE (course_code, course_name, dept_id, credits, course_type, description)
             VALUES (:cc, :cn, :d, :cr, 'THEORY', NULL)
             RETURNING course_id INTO :id`,
            { cc: c.code, cn: c.name, d: csDept, cr: c.credits }
          );
          courseIdByCode.set(c.code, courseId);
        }

        await conn.execute(
          `INSERT INTO COURSE_OFFERED_SEMESTER (course_id, semester_number)
           VALUES (:cid, :sem)`,
          { cid: courseIdByCode.get(c.code), sem: sem.semester }
        );
      }
    }
    console.log(`  ✓ Courses (${courseIdByCode.size}) + offered semesters mapped`);

    // Sections
    const sectionLetters = ['A', 'B'];
    let facultyIdx = 0;
    let sectionCount = 0;

    const sessionCodeForSemester = (semNum) => (semNum % 2 === 1 ? 'ODD-2025' : 'EVEN-2026');

    for (const sem of coursesBySemester) {
      const sessionCode = sessionCodeForSemester(sem.semester);
      for (const c of sem.courses) {
        const courseId = courseIdByCode.get(c.code);
        if (!courseId) continue;

        // pick two different instructors for A and B
        const instructorA = faculty[facultyIdx % faculty.length].instructorId;
        const instructorB = faculty[(facultyIdx + 1) % faculty.length].instructorId;
        facultyIdx += 2;

        for (const [i, letter] of sectionLetters.entries()) {
          const instructorId = i === 0 ? instructorA : instructorB;

          const secResult = await conn.execute(
            `INSERT INTO SECTION (section_name, course_id, session_code, target_semester, instructor_id, capacity, room, schedule)
             VALUES (:sname, :cid, :scode, :tsem, :iid, 60, NULL, NULL)
             RETURNING section_id INTO :id`,
            {
              sname: letter,
              cid: courseId,
              scode: sessionCode,
              tsem: sem.semester,
              iid: instructorId,
              id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
            },
            { autoCommit: false }
          );

          const newSectionId = secResult.outBinds.id[0];
          sectionCount++;

          // Keep existing UI happy: also mark the same instructor as coordinator
          await conn.execute(
            `INSERT INTO SECTION_COORDINATOR (section_id, instructor_id)
             VALUES (:sid, :iid)`,
            { sid: newSectionId, iid: instructorId },
            { autoCommit: false }
          );
        }
      }
    }

    console.log(`  ✓ Sections (${sectionCount}) — 2 per course offering with assigned instructors`);

    // Batches
    console.log(`  ✓ Batches (Skipped for custom reload)`);

    // Registrations
    console.log(`  ✓ Registrations (Skipped for custom reload)`);

    // Sample attendance
    console.log('  ✓ Sample attendance (Skipped for custom reload)');

    await conn.commit();

    console.log('\n══════════════════════════════════════════════');
    console.log('  SETUP COMPLETE!');
    console.log('══════════════════════════════════════════════');
    console.log('  Active Semester: ODD-2025');
    console.log('  College: VNIT Nagpur');
    console.log('');
    console.log('  Logins (password: password123):');
    console.log('    Admin:   admin@unitrack.edu');
    console.log('    (Other accounts cleared as per request)');
    console.log('══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌  Setup error:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

run();
