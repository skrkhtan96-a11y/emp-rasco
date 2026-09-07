const { google } = require('googleapis');
const stream = require('stream');

let driveClient = null;

/**
 * Initialize Google Drive API Client using OAuth 2.0 User Credentials
 * This uses the user's real Drive storage quota under their Google Account.
 */
function initDriveClient() {
  if (driveClient) return driveClient;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

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
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('✓ Google Drive API OAuth2 User Client Initialized (Drive Upload Client)');
      return driveClient;
    } catch (err) {
      if (isStrictLive) {
        throw new Error(`GOOGLE DRIVE OAUTH2 AUTH FAIL: Failed to initialize OAuth2 Drive client: ${err.message}`);
      }
      console.error('❌ Google Drive OAuth2 Client Error:', err.message);
      return null;
    }
  } else {
    // Fallback: Check if JWT Service Account keys are set if OAuth2 keys not provided
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
          scopes: ['https://www.googleapis.com/auth/drive']
        });
        driveClient = google.drive({ version: 'v3', auth });
        console.log('✓ Google Drive API Service Account Client Initialized (Fallback)');
        return driveClient;
      } catch (err) {
        if (isStrictLive) throw new Error(`GOOGLE DRIVE AUTH FAIL: ${err.message}`);
      }
    }

    if (isStrictLive) {
      throw new Error('GOOGLE DRIVE AUTH FAIL: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN missing in process.env');
    }
    console.warn('⚠️ Drive API running in simulation mode until OAuth credentials set.');
    return null;
  }
}

/**
 * Get or Access Root Folder
 */
async function getRootDriveFolder(drive) {
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (rootId) {
    if (drive) {
      try {
        const rootFolder = await drive.files.get({
          fileId: rootId,
          fields: 'id, name, mimeType'
        });
        return rootFolder.data.id;
      } catch (err) {
        if (isStrictLive) {
          throw new Error(`GOOGLE DRIVE ROOT ACCESS FAIL: Could not access root folder ID '${rootId}': ${err.message}`);
        }
      }
    }
    return rootId;
  }

  if (!drive) {
    if (isStrictLive) throw new Error('GOOGLE DRIVE ROOT ACCESS FAIL: Drive client is null');
    return 'SIMULATION_ROOT_FOLDER';
  }

  // Search for root folder named "RASSCO Employee Documents"
  const res = await drive.files.list({
    q: "name = 'RASSCO Employee Documents' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)'
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create root folder
  const newFolder = await drive.files.create({
    requestBody: {
      name: 'RASSCO Employee Documents',
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });

  return newFolder.data.id;
}

/**
 * Get or Create Employee Folder
 * Operational Naming Pattern: [IqamaNumber] - [EmployeeName] - [EmployeeID]
 * Example: 1098765432 - أحمد محمد علي - 10001
 */
async function getEmployeeDriveFolder(employeeId, employeeName, iqamaNumber) {
  const drive = initDriveClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';
  const cleanIqama = String(iqamaNumber || 'NO_IQAMA').trim().replace(/\s+/g, '');
  const cleanName = String(employeeName || 'MEMBER').trim().replace(/[/\\?%*:|"<>]/g, '');
  const folderName = `${cleanIqama} - ${cleanName} - ${employeeId}`;

  if (!drive) {
    if (isStrictLive) throw new Error(`GOOGLE DRIVE CREATE FOLDER FAIL: Drive client is null for folder ${folderName}`);
    return {
      folderId: `DRIVE-FOLDER-${cleanIqama}`,
      folderName: folderName,
      isSimulation: true
    };
  }

  const rootFolderId = await getRootDriveFolder(drive);

  // Search for employee folder inside root
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)'
  });

  if (res.data.files && res.data.files.length > 0) {
    return {
      folderId: res.data.files[0].id,
      folderName: folderName,
      isSimulation: false
    };
  }

  // Create subfolder inside root
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId]
    },
    fields: 'id, name'
  });

  return {
    folderId: created.data.id,
    folderName: folderName,
    isSimulation: false
  };
}

/**
 * Upload File Buffer to Google Drive via OAuth2 User Session
 * File Naming Pattern: [IqamaNumber]_[CleanName]_[DocType]_[Timestamp].[ext]
 * Example: 1098765432_أحمد_محمد_علي_Iqama_2026-09-07_20-40-00.png
 */
async function uploadFileToDrive({ employeeId, employeeName, iqamaNumber, docType, fileBuffer, originalName, mimeType }) {
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';
  const cleanIqama = String(iqamaNumber || 'NO_IQAMA').trim().replace(/\s+/g, '');
  const cleanName = String(employeeName || 'MEMBER').trim().replace(/[\s/\\?%*:|"<>]+/g, '_');
  const sanitizedDocType = String(docType || 'Document').replace(/[\s/\\?%*:|"<>]+/g, '_');

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const ext = (originalName || 'file.png').split('.').pop().toLowerCase();

  const storedFileName = `${cleanIqama}_${cleanName}_${sanitizedDocType}_${dateStr}_${timeStr}.${ext}`;

  const drive = initDriveClient();
  const folderInfo = await getEmployeeDriveFolder(employeeId, employeeName, iqamaNumber);

  if (!drive) {
    if (isStrictLive) throw new Error(`GOOGLE DRIVE REAL UPLOAD FAIL: Drive client is null when uploading ${storedFileName}`);
    const fileId = `DRIVE-FILE-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    return {
      fileId: fileId,
      folderId: folderInfo.folderId,
      folderName: folderInfo.folderName,
      storedFileName: storedFileName,
      originalFileName: originalName || storedFileName,
      mimeType: mimeType || 'image/png',
      fileSize: fileBuffer ? fileBuffer.length : 0,
      webViewLink: `#file-preview-${fileId}`,
      isSimulation: true
    };
  }

  // Stream upload
  const bufferStream = new stream.PassThrough();
  bufferStream.end(fileBuffer);

  const fileMetadata = {
    name: storedFileName,
    parents: [folderInfo.folderId]
  };

  const media = {
    mimeType: mimeType || 'application/octet-stream',
    body: bufferStream
  };

  const uploadRes = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, webContentLink, size, mimeType'
  });

  return {
    fileId: uploadRes.data.id,
    folderId: folderInfo.folderId,
    folderName: folderInfo.folderName,
    storedFileName: uploadRes.data.name,
    originalFileName: originalName || uploadRes.data.name,
    mimeType: uploadRes.data.mimeType || mimeType,
    fileSize: uploadRes.data.size || fileBuffer.length,
    webViewLink: uploadRes.data.webViewLink || uploadRes.data.webContentLink,
    isSimulation: false
  };
}

/**
 * Get File Metadata by File ID
 */
async function getDriveFileMetadata(fileId) {
  const drive = initDriveClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';

  if (!drive) {
    if (isStrictLive) throw new Error(`DRIVE FILE METADATA READBACK FAIL: Drive client null for fileId '${fileId}'`);
    return {
      fileId: fileId,
      name: 'simulated_file.png',
      mimeType: 'image/png',
      size: 1024,
      isSimulation: true
    };
  }

  const res = await drive.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, size, webViewLink, parents, createdTime'
  });

  return {
    ...res.data,
    isSimulation: false
  };
}

/**
 * Search Drive Files or Folders by Iqama Number
 */
async function searchDriveByIqama(iqamaNumber) {
  const drive = initDriveClient();
  const isStrictLive = process.env.GOOGLE_MODE === 'LIVE' || process.env.REQUIRE_LIVE_GOOGLE === 'true';
  const cleanIqama = String(iqamaNumber).trim();

  if (!drive) {
    if (isStrictLive) throw new Error(`DRIVE SEARCH BY FULL IQAMA FAIL: Drive client null for Iqama '${cleanIqama}'`);
    return {
      query: cleanIqama,
      files: [],
      isSimulation: true
    };
  }

  const res = await drive.files.list({
    q: `name contains '${cleanIqama}' and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink, parents)'
  });

  return {
    query: cleanIqama,
    files: res.data.files || [],
    isSimulation: false
  };
}

module.exports = {
  initDriveClient,
  getRootDriveFolder,
  getEmployeeDriveFolder,
  uploadFileToDrive,
  getDriveFileMetadata,
  searchDriveByIqama
};
