const { google } = require('googleapis');

let sheetsClient = null;
let cachedSpreadsheetId = null;

function withTimeout(promise, timeoutMs = 5000, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), timeoutMs))
  ]);
}

/**
 * Initialize Google Sheets API Client
 * Uses OAuth2 User Session (or Service Account JWT Fallback)
 */
function initSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

  // 1. Prefer Service Account Credentials (Direct JWT Authentication)
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    try {
      privateKey = privateKey.replace(/\\n/g, '\n');
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      sheetsClient = google.sheets({ version: 'v4', auth });
      console.log('✓ Google Sheets API Service Account Client Initialized');
      return sheetsClient;
    } catch (err) {
      console.error('❌ Service Account Sheets Auth Error:', err.message);
    }
  }

  // 2. OAuth2 Fallback
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        process.env.APP_BASE_URL || 'http://localhost:3000'
      );
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      sheetsClient = google.sheets({ version: 'v4', auth: oauth2Client });
      console.log('✓ Google Sheets API OAuth2 User Client Initialized');
      return sheetsClient;
    } catch (err) {
      console.error('❌ Google Sheets OAuth2 Client Error:', err.message);
    }
  }

  if (isStrictLive) {
    throw new Error('GOOGLE AUTH FAIL: Service Account or OAuth2 credentials missing in process.env');
  }
  return null;
}

/**
 * Get or Create Central Database Spreadsheet
 */
async function getOrCreateSpreadsheet(sheets) {
  if (cachedSpreadsheetId) return cachedSpreadsheetId;
  const envSheetId = process.env.GOOGLE_SHEET_ID;

  if (envSheetId) {
    cachedSpreadsheetId = envSheetId;
    return envSheetId;
  }

  // Create new Spreadsheet under User's account
  const newSheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'RASSCO_Employee_System_DB'
      },
      sheets: [
        { properties: { title: 'Employee_Documents' } },
        { properties: { title: 'Employees' } },
        { properties: { title: 'Users' } },
        { properties: { title: 'Activity_Log' } },
        { properties: { title: 'Notifications' } }
      ]
    }
  });

  cachedSpreadsheetId = newSheet.data.spreadsheetId;
  console.log(`✓ Created new Google Spreadsheet: ID = ${cachedSpreadsheetId}`);
  return cachedSpreadsheetId;
}

const verifiedTabs = new Set();

/**
 * Ensure sheet tab exists (Cached per server lifecycle)
 */
async function ensureSheetTabExists(sheets, spreadsheetId, sheetName) {
  const cacheKey = `${spreadsheetId}_${sheetName}`;
  if (verifiedTabs.has(cacheKey)) return;

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { addSheet: { properties: { title: sheetName } } }
          ]
        }
      });
    }
    verifiedTabs.add(cacheKey);
  } catch (err) {
    console.warn(`Could not verify sheet tab '${sheetName}':`, err.message);
  }
}

/**
 * Append Row to a specific Google Sheet
 */
async function appendSheetRow(sheetName, rowData) {
  _appendSheetRowInternal(sheetName, rowData).catch(err => {
    console.warn(`Background Sheet Append Warning (${sheetName}):`, err.message);
  });
  return { sheetName, rowData, status: 'queued' };
}

async function _appendSheetRowInternal(sheetName, rowData) {
  const sheets = initSheetsClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

  if (!sheets) {
    if (isStrictLive) {
      throw new Error(`GOOGLE SHEETS WRITE FAIL: Sheets client missing in process.env`);
    }
    return {
      sheetName,
      rowData,
      isSimulation: true
    };
  }

  try {
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    await ensureSheetTabExists(sheets, spreadsheetId, sheetName);

    const values = Array.isArray(rowData) ? rowData : Object.values(rowData);

    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values]
      }
    });

    return {
      spreadsheetId,
      updates: res.data.updates,
      isSimulation: false
    };
  } catch (err) {
    if (isStrictLive) {
      throw new Error(`GOOGLE SHEETS WRITE FAIL: ${err.message}`);
    }
    console.error(`❌ Google Sheets append error on ${sheetName}:`, err.message);
    return {
      sheetName,
      rowData,
      error: err.message,
      isSimulation: true
    };
  }
}

/**
 * Read Rows from a Google Sheet
 */
async function getSheetRows(sheetName) {
  return withTimeout(_getSheetRowsInternal(sheetName), 4000, {
    sheetName,
    rows: [],
    isSimulation: true,
    error: 'Google Sheets read timeout (4s limit exceeded)'
  });
}

async function _getSheetRowsInternal(sheetName) {
  const sheets = initSheetsClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

  if (!sheets) {
    if (isStrictLive) {
      throw new Error(`GOOGLE SHEETS READ FAIL: Sheets client missing in process.env`);
    }
    return {
      sheetName,
      rows: [],
      isSimulation: true
    };
  }

  try {
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    await ensureSheetTabExists(sheets, spreadsheetId, sheetName);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`
    });

    return {
      sheetName,
      spreadsheetId,
      rows: res.data.values || [],
      isSimulation: false
    };
  } catch (err) {
    if (isStrictLive) {
      throw new Error(`GOOGLE SHEETS READ FAIL: ${err.message}`);
    }
    console.error(`❌ Google Sheets read error on ${sheetName}:`, err.message);
    return {
      sheetName,
      rows: [],
      error: err.message,
      isSimulation: true
    };
  }
}

/**
 * Batch Append Rows to Google Sheet (Single API Call for Scale)
 */
async function batchAppendSheetRows(sheetName, rowsArray) {
  _batchAppendSheetRowsInternal(sheetName, rowsArray).catch(err => {
    console.warn(`Background Batch Sheet Append Warning (${sheetName}):`, err.message);
  });
  return { sheetName, count: rowsArray ? rowsArray.length : 0, status: 'queued' };
}

async function _batchAppendSheetRowsInternal(sheetName, rowsArray) {
  if (!rowsArray || rowsArray.length === 0) return;
  const sheets = initSheetsClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

  if (!sheets) {
    if (isStrictLive) throw new Error(`GOOGLE SHEETS BATCH WRITE FAIL: Sheets client missing`);
    return { sheetName, count: rowsArray.length, isSimulation: true };
  }

  try {
    const spreadsheetId = await getOrCreateSpreadsheet(sheets);
    await ensureSheetTabExists(sheets, spreadsheetId, sheetName);

    const values = rowsArray.map(rowData => Array.isArray(rowData) ? rowData : Object.values(rowData));

    // Batch append in 500 row chunks to respect Google API body payload limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      const chunk = values.slice(i, i + CHUNK_SIZE);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: chunk }
      });
    }

    return { spreadsheetId, count: values.length, isSimulation: false };
  } catch (err) {
    console.error(`❌ Google Sheets batch append error on ${sheetName}:`, err.message);
    return { sheetName, count: rowsArray.length, error: err.message, isSimulation: true };
  }
}

module.exports = {
  initSheetsClient,
  getOrCreateSpreadsheet,
  appendSheetRow,
  batchAppendSheetRows,
  getSheetRows
};

