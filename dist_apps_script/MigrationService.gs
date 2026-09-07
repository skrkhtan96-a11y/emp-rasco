/**
 * MigrationService.gs - Auto-create Database Tabs & Seed Data
 */

/**
 * Initialize all database sheets with headers
 */
function setupDatabaseStructure() {
  var ss = getSpreadsheet();

  var sheetSchemas = {
    'Regions': [
      'Region_ID', 'Region_Name_AR', 'Region_Name_EN', 'Status', 'Created_At', 'Created_By', 'Updated_At', 'Updated_By'
    ],
    'Employees': [
      'Employee_ID', 'Employee_Number', 'Employee_Name', 'Nationality', 'Job_Title',
      'Region_ID', 'Region_Name', 'Project_ID', 'Project_Name', 'Project_Manager', 'Mobile_Number', 'Iqama_Number',
      'Iqama_Expiry_Date', 'Passport_Number', 'Passport_Expiry_Date', 'Driving_License_Available',
      'Driving_License_Number', 'Driving_License_Expiry_Date', 'Forklift_License_Available',
      'Forklift_License_Number', 'Forklift_License_Expiry_Date', 'Employee_Status',
      'Profile_Completion_Percentage', 'Missing_Documents', 'Created_At', 'Created_By',
      'Updated_At', 'Updated_By'
    ],
    'Employee_Documents': [
      'Document_ID', 'Employee_ID', 'Employee_Name', 'Document_Type', 'Document_Number',
      'Issue_Date', 'Expiry_Date', 'Drive_File_ID', 'Drive_File_URL', 'Original_File_Name',
      'Upload_Date', 'Uploaded_By', 'Document_Status', 'Notes', 'Created_At', 'Updated_At'
    ],
    'Projects': [
      'Project_ID', 'Project_Name', 'Region_ID', 'Region_Name', 'Project_Manager', 'Manager_Email', 'Location',
      'Total_Employees', 'Created_At'
    ],
    'Users': [
      'User_ID', 'Full_Name', 'Email', 'Role', 'Region_ID', 'Region_Name', 'Project_ID', 'Project_Name', 'Status', 'Created_At'
    ],
    'Audit_Log': [
      'Log_ID', 'Timestamp', 'User_Email', 'User_Name', 'Action', 'Employee_ID',
      'Entity_Type', 'Old_Value', 'New_Value', 'Details'
    ],
    'Notifications': [
      'Notification_ID', 'Employee_ID', 'Employee_Name', 'Document_Type', 'Expiry_Date',
      'Days_Remaining', 'Notification_Level', 'Recipient', 'Sent_Date', 'Status'
    ],
    'Settings': [
      'Setting_Key', 'Setting_Value', 'Description', 'Updated_At'
    ]
  };

  Object.keys(sheetSchemas).forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) {
      sheet = ss.insertSheet(sName);
    }
    
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, sheetSchemas[sName].length)
        .setValues([sheetSchemas[sName]])
        .setFontWeight('bold')
        .setBackground('#0D9488')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  });

  console.log('Database sheets structure setup complete with RASSCO schema.');
}

/**
 * Get setting value by Key
 */
function getSetting(key) {
  var settings = getSheetDataAsObjects(CONFIG.SHEETS.SETTINGS);
  for (var i = 0; i < settings.length; i++) {
    if (settings[i].Setting_Key === key) {
      return settings[i].Setting_Value;
    }
  }
  return null;
}

/**
 * Set setting value by Key
 */
function setSetting(key, val) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sheet) return;

  var settings = getSheetDataAsObjects(CONFIG.SHEETS.SETTINGS);
  for (var i = 0; i < settings.length; i++) {
    if (settings[i].Setting_Key === key) {
      sheet.getRange(i + 2, 2).setValue(val);
      sheet.getRange(i + 2, 4).setValue(formatDateISO(new Date()));
      return;
    }
  }

  sheet.appendRow([key, val, '', formatDateISO(new Date())]);
}
