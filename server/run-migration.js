const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const oracledb = require('oracledb');
const dbConfig = require('./config/database');

async function migrate() {
  let conn;
  try {
    await dbConfig.initialize();
    conn = await dbConfig.getConnection();
    
    console.log("Running migrations...");

    // 1. Update chk_reg_status
    await conn.execute(`ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_status`);
    await conn.execute(`ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_status CHECK (status IN ('ACTIVE', 'PENDING', 'DROPPED', 'COMPLETED', 'REJECTED', 'DROP_PENDING'))`);
    console.log("REGISTRATION status constraint updated.");

    // 2. Update chk_reg_approval
    await conn.execute(`ALTER TABLE REGISTRATION DROP CONSTRAINT chk_reg_approval`);
    await conn.execute(`ALTER TABLE REGISTRATION ADD CONSTRAINT chk_reg_approval CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'DROP_PENDING', 'DROP_APPROVED', 'DROP_REJECTED'))`);
    console.log("REGISTRATION approval_status constraint updated.");

    // 3. Update chk_att_status
    await conn.execute(`UPDATE ATTENDANCE SET status = 'PRESENT' WHERE status IN ('LATE', 'EXCUSED')`);
    await conn.execute(`COMMIT`);
    
    await conn.execute(`ALTER TABLE ATTENDANCE DROP CONSTRAINT chk_att_status`);
    await conn.execute(`ALTER TABLE ATTENDANCE ADD CONSTRAINT chk_att_status CHECK (status IN ('PRESENT', 'ABSENT', 'CANCELLED'))`);
    console.log("ATTENDANCE status constraint updated.");

    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}

migrate();
