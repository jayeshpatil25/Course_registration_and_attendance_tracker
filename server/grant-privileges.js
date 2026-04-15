/**
 * Test connectivity for vedant/oracle with different connect strings
 */
const oracledb = require('oracledb');

const connectStrings = [
  'localhost:1521/XE',
  'localhost:1521/XEPDB1',
  'localhost:1521/ORCL',
  'localhost:1521/FREE',
  'localhost:1521',
];

async function test() {
  for (const cs of connectStrings) {
    try {
      console.log(`  Trying vedant@${cs} ...`);
      const conn = await oracledb.getConnection({
        user: 'vedant',
        password: 'oracle',
        connectString: cs,
      });
      console.log(`  ✅  SUCCESS: vedant/oracle@${cs}`);
      const r = await conn.execute(`SELECT SYS_CONTEXT('USERENV','CON_NAME') AS cname FROM DUAL`);
      console.log(`  Container: ${r.rows[0][0]}`);
      await conn.close();
      return cs;
    } catch (err) {
      console.log(`  ❌  ${err.message.split('\n')[0]}`);
    }
  }
  console.log('\n❌  No connection succeeded.');
}

test();
