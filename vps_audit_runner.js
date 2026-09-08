
const { getDriveFileMetadata, initDriveClient } = require('./services/googleDriveService');
const { getDocuments } = require('./services/dbService');
const crypto = require('crypto');

async function runDriveCheck(records) {
  const drive = initDriveClient();
  const driveResults = [];

  for (const rec of records) {
    const fileId = rec.doc.fileId;
    const origHash = rec.spec.originalHash;
    const origSize = rec.spec.originalSize;
    const empIqama = rec.spec.employee.iqamaNumber;
    const empName = rec.spec.employee.name;

    try {
      const meta = await getDriveFileMetadata(fileId);
      
      // Download content stream to verify hash & size
      let downloadedBuffer = null;
      let downloadedHash = null;
      let downloadError = null;

      if (drive && meta && meta.id) {
        const res = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        downloadedBuffer = Buffer.from(res.data);
        downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
      }

      driveResults.push({
        fileId: fileId,
        exists: !!meta && meta.id === fileId,
        name: meta ? meta.name : '',
        mimeType: meta ? meta.mimeType : '',
        driveSize: meta ? parseInt(meta.size || 0, 10) : 0,
        origSize: origSize,
        sizeMatch: meta ? parseInt(meta.size || 0, 10) === origSize : false,
        createdTime: meta ? meta.createdTime : '',
        parents: meta ? meta.parents : [],
        origHash: origHash,
        downloadedHash: downloadedHash,
        hashMatch: downloadedHash === origHash,
        folderNameValid: true
      });
    } catch (e) {
      driveResults.push({
        fileId: fileId,
        exists: false,
        error: e.message
      });
    }
  }

  const sheetsDocs = await getDocuments();
  console.log(JSON.stringify({ driveResults, sheetsDocsCount: sheetsDocs.length, sheetsDocs }));
}

const records = [];
runDriveCheck(records);
