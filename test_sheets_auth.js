require('dotenv').config();
const { getSheetRows } = require('./services/googleSheetsService');

async function test() {
  console.log('Testing Google Sheets API Auth...');
  const start = Date.now();
  try {
    const res = await getSheetRows('Employees');
    console.log(`Finished in ${Date.now() - start}ms:`, res.rows ? `Found ${res.rows.length} rows` : res);
  } catch (err) {
    console.error(`Error in ${Date.now() - start}ms:`, err.message);
  }
}

test();
