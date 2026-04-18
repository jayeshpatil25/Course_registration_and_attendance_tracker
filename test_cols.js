const oracledb = require('oracledb');
const db = require('./server/config/database');
(async () => {
  await db.initialize();
  const conn = await db.getConnection();
  const result = await conn.execute(`SELECT column_name, data_type FROM user_tab_cols WHERE table_name = 'COURSE_OFFERED_SEMESTER'`);
  console.log(result.rows);
  await conn.close();
  await db.close();
  process.exit(0);
})();
