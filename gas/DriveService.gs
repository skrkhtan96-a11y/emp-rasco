/**
 * DriveService.gs - Google Drive Folder & Document File Management
 */

/**
 * Get or create Root Drive Folder
 */
function getRootDriveFolder() {
  var folderId = getSetting('Drive_Root_Folder_ID');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      console.warn('Could not open Root Folder by ID, searching by name: ' + e);
    }
  }
  
  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE.ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    var folder = folders.next();
    setSetting('Drive_Root_Folder_ID', folder.getId());
    return folder;
  }
  
  var newRoot = DriveApp.createFolder(CONFIG.DRIVE.ROOT_FOLDER_NAME);
  setSetting('Drive_Root_Folder_ID', newRoot.getId());
  return newRoot;
}

/**
 * Get or create Employee Folder
 * Operational Naming Pattern: [IqamaNumber] - [EmployeeName] - [EmployeeID]
 * Example: 2383840655 - Ahmed Mohammed - 1054
 */
function getEmployeeDriveFolder(employeeId, employeeName, iqamaNumber) {
  var rootFolder = getRootDriveFolder();
  var cleanIqama = String(iqamaNumber || 'NO_IQAMA').trim().replace(/\s+/g, '');
  var cleanName = String(employeeName || 'MEMBER').trim().replace(/[/\\?%*:|"<>]/g, '');
  var folderName = cleanIqama + ' - ' + cleanName + ' - ' + employeeId;
  
  var subFolders = rootFolder.getFoldersByName(folderName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  
  return rootFolder.createFolder(folderName);
}

/**
 * Upload Base64 File to Employee Drive Folder
 * File Naming Pattern: [IqamaNumber]_[CleanName]_[DocType]_[Timestamp].[ext]
 * Example: 2383840655_Ahmed_Mohammed_Iqama_2026-09-07_19-25-44.jpg
 */
function saveFileToDrive(employeeId, employeeName, iqamaNumber, docType, fileData) {
  var empFolder = getEmployeeDriveFolder(employeeId, employeeName, iqamaNumber);
  var cleanIqama = String(iqamaNumber || 'NO_IQAMA').trim().replace(/\s+/g, '');
  var cleanName = String(employeeName || 'MEMBER').trim().replace(/[\s/\\?%*:|"<>]+/g, '_');
  var sanitizedDocType = docType.replace(/[\s/\\?%*:|"<>]+/g, '_');
  
  var now = new Date();
  var timeStampStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
  
  var ext = (fileData.fileName || 'file.jpg').split('.').pop().toLowerCase();
  var mimeType = MimeType.PDF;
  if (ext === 'jpg' || ext === 'jpeg') mimeType = MimeType.JPEG;
  if (ext === 'png') mimeType = MimeType.PNG;
  
  var storedFileName = cleanIqama + '_' + cleanName + '_' + sanitizedDocType + '_' + timeStampStr + '.' + ext;
  
  var bytes = Utilities.base64Decode(fileData.base64Content);
  var blob = Utilities.newBlob(bytes, mimeType, storedFileName);
  var driveFile = empFolder.createFile(blob);
  
  // Restricted access (non-public)
  driveFile.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
  
  return {
    fileId: driveFile.getId(),
    folderId: empFolder.getId(),
    fileUrl: driveFile.getUrl(),
    storedFileName: storedFileName,
    originalFileName: fileData.fileName
  };
}
