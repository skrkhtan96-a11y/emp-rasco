/**
 * AuditService.gs - System Activity Logging & Productive Action Tracking
 */

/**
 * Log activity in User_Activity_Log
 */
function logUserActivity(activityType, isProductive, employeeId, employeeName, details) {
  try {
    var user = getCurrentUserSession();
    var now = new Date();

    var logRecord = {
      Activity_ID: 'ACT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      Timestamp: formatDateISO(now) + ' ' + now.toLocaleTimeString('en-US', { hour12: false }),
      User_ID: user ? user.User_ID : 'USR-SYS',
      User_Name: user ? user.Full_Name : 'System',
      User_Email: user ? user.Email : 'system@rassco.com.sa',
      Role: user ? user.Role : 'System',
      Region_ID: user ? user.Region_ID : 'ALL',
      Project_ID: user ? user.Project_ID : 'ALL',
      Employee_ID: employeeId || '',
      Employee_Name: employeeName || '',
      Activity_Type: activityType,
      Is_Productive: isProductive === true ? true : false,
      Entity_Type: 'Employee',
      Entity_ID: employeeId || '',
      Details: details || ''
    };

    appendObjectToSheet(CONFIG.SHEETS.USER_ACTIVITY_LOG, logRecord);

    // Update user Last_Activity timestamp if productive action
    if (isProductive && user && user.User_ID) {
      updateObjectInSheet(CONFIG.SHEETS.USERS, 'User_ID', user.User_ID, {
        Last_Activity: formatDateISO(now) + ' ' + now.toLocaleTimeString('en-US', { hour12: false })
      });
    }
  } catch (e) {
    console.error('Error logging user activity: ' + e);
  }
}
