const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const oracledb = require('oracledb');
const dbConfig = require('./config/database');

async function migrateAdmin() {
  let conn;
  try {
    await dbConfig.initialize();
    conn = await dbConfig.getConnection();
    
    console.log("Running admin migrations...");

    // 1. Create SEMESTER_LIST table
    console.log("Creating SEMESTER_LIST table...");
    try {
      await conn.execute(`
        CREATE TABLE SEMESTER_LIST (
            semester VARCHAR2(20) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
      `);
      console.log("SEMESTER_LIST table created.");
    } catch (e) {
      if (e.errorNum === 955) {
        console.log("SEMESTER_LIST table already exists.");
      } else {
        throw e;
      }
    }

    // 2. Seed table
    console.log("Seeding SEMESTER_LIST table...");
    const defaultSemesters = ['ODD-2024', 'EVEN-2024', 'ODD-2025', 'EVEN-2025'];
    
    for (const sem of defaultSemesters) {
      try {
         await conn.execute(
           `INSERT INTO SEMESTER_LIST (semester) VALUES (:sem)`,
           { sem },
           { autoCommit: true }
         );
         console.log(`Seeded: ${sem}`);
      } catch (e) {
         if (e.errorNum === 1) { // DUP_VAL_ON_INDEX
           console.log(`Skipped seeding: ${sem} (already exists)`);
         } else {
           throw e;
         }
      }
    }

    console.log("Admin API migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
    // ensure node process exits quickly
    setTimeout(() => process.exit(0), 1000); 
  }
}

migrateAdmin();
