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
 * Pattern: [Employee_ID] - [Employee_Name]
 */
function getEmployeeDriveFolder(employeeId, employeeName) {
  var rootFolder = getRootDriveFolder();
  var folderName = employeeId + ' - ' + employeeName;
  
  var subFolders = rootFolder.getFoldersByName(folderName);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  
  return rootFolder.createFolder(folderName);
}

/**
 * Upload Base64 File to Employee Drive Folder
 */
function saveFileToDrive(employeeId, employeeName, docType, fileData) {
  var empFolder = getEmployeeDriveFolder(employeeId, employeeName);
  
  // Convert Base64 string to Blob
  var bytes = Utilities.base64Decode(fileData.base64Content);
  var ext = fileData.fileName.split('.').pop().toLowerCase();
  var mimeType = MimeType.PDF;
  if (ext === 'jpg' || ext === 'jpeg') mimeType = MimeType.JPEG;
  if (ext === 'png') mimeType = MimeType.PNG;
  
  var sanitizedDocType = docType.replace(/\s+/g, '_');
  var newFileName = employeeId + '_' + sanitizedDocType + '_' + Date.now() + '.' + ext;
  
  var blob = Utilities.newBlob(bytes, mimeType, newFileName);
  var driveFile = empFolder.createFile(blob);
  
  // Ensure non-public restricted view
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return {
    fileId: driveFile.getId(),
    fileUrl: driveFile.getUrl(),
    fileName: newFileName
  };
}
