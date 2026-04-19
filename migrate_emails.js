const oracledb = require('oracledb');
const db = require('./server/config/database');

(async () => {
  await db.initialize();
  const conn = await db.getConnection();
  try {
    await conn.execute(`UPDATE ADMIN SET email = REPLACE(LOWER(email), 'unitrack.edu', 'aimsreg.edu')`);
    await conn.execute(`UPDATE STUDENT SET email = REPLACE(LOWER(email), 'unitrack.edu', 'aimsreg.edu')`);
    await conn.execute(`UPDATE INSTRUCTOR SET email = REPLACE(LOWER(email), 'unitrack.edu', 'aimsreg.edu')`);
    await conn.commit();
    console.log('Database emails successfully migrated to @aimsreg.edu!');
  } catch (err) {
    console.error(err);
  } finally {
    await conn.close();
    await db.close();
    process.exit(0);
  }
})();
