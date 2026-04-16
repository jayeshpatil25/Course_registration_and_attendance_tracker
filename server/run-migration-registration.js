const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const oracledb = require('oracledb');
const dbConfig = require('./config/database');

async function migrateRegistration() {
  let conn;
  try {
    await dbConfig.initialize();
    conn = await dbConfig.getConnection();

    console.log("Running registration-workflow migrations...\n");

    // ─── 1. Add course_type to COURSE table ────────────────────────────
    console.log("1. Adding course_type column to COURSE...");
    try {
      await conn.execute(
        `ALTER TABLE COURSE ADD course_type VARCHAR2(15) DEFAULT 'THEORY' NOT NULL`
      );
      console.log("   ✓ course_type column added.");
    } catch (e) {
      if (e.errorNum === 1430) {
        console.log("   ⏭ course_type column already exists.");
      } else {
        throw e;
      }
    }

    // Add CHECK constraint for course_type
    try {
      await conn.execute(
        `ALTER TABLE COURSE ADD CONSTRAINT chk_course_type CHECK (course_type IN ('THEORY', 'PRACTICAL'))`
      );
      console.log("   ✓ chk_course_type constraint added.");
    } catch (e) {
      if (e.errorNum === 2264 || e.errorNum === 2261) {
        console.log("   ⏭ chk_course_type constraint already exists.");
      } else {
        throw e;
      }
    }

    // Auto-set existing courses based on code convention: CSP* = PRACTICAL, else THEORY
    try {
      const result = await conn.execute(
        `UPDATE COURSE SET course_type = 'PRACTICAL' WHERE REGEXP_LIKE(course_code, '^[A-Z]{2,4}P[0-9]')`,
        [],
        { autoCommit: true }
      );
      console.log(`   ✓ Updated ${result.rowsAffected} courses to PRACTICAL based on code pattern.`);
    } catch (e) {
      console.log("   ⚠ Could not auto-set practical courses:", e.message);
    }

    // ─── 2. Add fa_id (Faculty Advisor) to STUDENT table ───────────────
    console.log("\n2. Adding fa_id column to STUDENT...");
    try {
      await conn.execute(
        `ALTER TABLE STUDENT ADD fa_id NUMBER(10)`
      );
      console.log("   ✓ fa_id column added.");
    } catch (e) {
      if (e.errorNum === 1430) {
        console.log("   ⏭ fa_id column already exists.");
      } else {
        throw e;
      }
    }

    // Add FK constraint
    try {
      await conn.execute(
        `ALTER TABLE STUDENT ADD CONSTRAINT fk_student_fa FOREIGN KEY (fa_id) REFERENCES INSTRUCTOR(instructor_id)`
      );
      console.log("   ✓ fk_student_fa constraint added.");
    } catch (e) {
      if (e.errorNum === 2264 || e.errorNum === 2275) {
        console.log("   ⏭ fk_student_fa constraint already exists.");
      } else {
        throw e;
      }
    }

    // Add index on fa_id
    try {
      await conn.execute(`CREATE INDEX idx_student_fa ON STUDENT(fa_id)`);
      console.log("   ✓ idx_student_fa index created.");
    } catch (e) {
      if (e.errorNum === 955) {
        console.log("   ⏭ idx_student_fa index already exists.");
      } else {
        throw e;
      }
    }

    // ─── 3. Widen REGISTRATION status CHECK to include DROP_PENDING ────
    console.log("\n3. Updating REGISTRATION status constraints...");
    try {
      await conn.execute(`ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_status`);
      console.log("   ✓ Dropped old chk_reg_status.");
    } catch (e) {
      if (e.errorNum === 2443) {
        console.log("   ⏭ chk_reg_status already dropped.");
      } else {
        console.log("   ⚠ Could not drop chk_reg_status:", e.message);
      }
    }
    try {
      await conn.execute(
        `ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_status CHECK (status IN ('ACTIVE','PENDING','DROPPED','COMPLETED','REJECTED','DROP_PENDING','CANCELLED'))`
      );
      console.log("   ✓ New chk_reg_status added (includes DROP_PENDING, CANCELLED).");
    } catch (e) {
      if (e.errorNum === 2264) {
        console.log("   ⏭ chk_reg_status constraint already exists.");
      } else {
        console.log("   ⚠ Could not add chk_reg_status:", e.message);
      }
    }

    // Widen approval_status CHECK
    try {
      await conn.execute(`ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_approval`);
      console.log("   ✓ Dropped old chk_reg_approval.");
    } catch (e) {
      if (e.errorNum === 2443) {
        console.log("   ⏭ chk_reg_approval already dropped.");
      } else {
        console.log("   ⚠ Could not drop chk_reg_approval:", e.message);
      }
    }
    try {
      await conn.execute(
        `ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_approval CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','DROP_PENDING','DROP_APPROVED','DROP_REJECTED'))`
      );
      console.log("   ✓ New chk_reg_approval added.");
    } catch (e) {
      if (e.errorNum === 2264) {
        console.log("   ⏭ chk_reg_approval constraint already exists.");
      } else {
        console.log("   ⚠ Could not add chk_reg_approval:", e.message);
      }
    }

    console.log("\n✅ Registration-workflow migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) { console.error("Error closing connection:", err); }
    }
    setTimeout(() => process.exit(0), 1000);
  }
}

migrateRegistration();
