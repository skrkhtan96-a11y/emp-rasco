require('dotenv').config();
const { getSheetRows } = require('./services/googleSheetsService');

async function run() {
  console.log('Testing getSheetRows Employees...');
  try {
    const res = await getSheetRows('Employees');
    console.log('Result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
