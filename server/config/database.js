// ============================================================
// Oracle Connection Pool Configuration
// ============================================================
const oracledb = require('oracledb');

// Use Thin mode (no Oracle Instant Client required for 21c+)
// If you need Thick mode, uncomment: oracledb.initOracleClient();

async function initialize() {
  try {
    await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      poolMin: 4,
      poolMax: 20,
      poolIncrement: 2,
    });
    console.log('✅  Oracle connection pool created');
  } catch (err) {
    console.error('❌  Oracle pool creation failed:', err.message);
    process.exit(1);
  }
}

async function close() {
  try {
    await oracledb.getPool().close(10);
    console.log('🔌  Oracle pool closed');
  } catch (err) {
    console.error('Error closing pool:', err.message);
  }
}

async function getConnection() {
  return oracledb.getPool().getConnection();
}

module.exports = { initialize, close, getConnection };
