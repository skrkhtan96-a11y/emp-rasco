require('dotenv').config();
const { getEmployeeByIqama, getDocumentsByEmployeeId, initDb } = require('./services/dbService');

async function debug() {
  console.log('1. Calling initDb()...');
  const t0 = Date.now();
  await initDb();
  console.log(`✓ initDb finished in ${Date.now() - t0}ms`);

  console.log('2. Calling getEmployeeByIqama("2516571086")...');
  const t1 = Date.now();
  const emp = await getEmployeeByIqama('2516571086');
  console.log(`✓ getEmployeeByIqama finished in ${Date.now() - t1}ms:`, emp);

  if (emp) {
    console.log('3. Calling getDocumentsByEmployeeId...');
    const t2 = Date.now();
    const docs = await getDocumentsByEmployeeId(emp.id);
    console.log(`✓ getDocumentsByEmployeeId finished in ${Date.now() - t2}ms:`, docs);
  }
}

debug().catch(err => console.error('❌ Debug error:', err));
