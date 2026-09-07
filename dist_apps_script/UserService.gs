/**
 * UserService.gs - User Management & System Permissions
 */

/**
 * Get list of all system users
 */
function getUsersList() {
  var user = getCurrentUserSession();
  if (user.Role !== CONFIG.ROLES.SUPER_ADMIN && user.Role !== CONFIG.ROLES.HR_ADMIN) {
    return createErrorResponse('ACCESS_DENIED', 'غير مصرح لك بإدارة المستخدمين.');
  }

  var users = getSheetDataAsObjects(CONFIG.SHEETS.USERS);
  return createSuccessResponse(users);
}

/**
 * Save / Create User
 */
function saveUser(userData) {
  var currentUser = getCurrentUserSession();
  if (currentUser.Role !== CONFIG.ROLES.SUPER_ADMIN) {
    return createErrorResponse('ACCESS_DENIED', 'تعديل المستخدمين متاح للمدير العام فقط.');
  }

  var isNew = !userData.User_ID;
  var nowStr = formatDateISO(new Date());

  if (isNew) {
    userData.User_ID = 'USR-' + Date.now();
    userData.Created_At = nowStr;
    appendObjectToSheet(CONFIG.SHEETS.USERS, userData);
    logAuditAction('User Created', '', 'User', '', userData.Email, 'Role: ' + userData.Role);
  } else {
    updateObjectInSheet(CONFIG.SHEETS.USERS, 'User_ID', userData.User_ID, userData);
    logAuditAction('User Updated', '', 'User', '', userData.Email, 'Role: ' + userData.Role);
  }

  return createSuccessResponse(userData, 'تم حفظ بيانات المستخدم بنجاح.');
}
