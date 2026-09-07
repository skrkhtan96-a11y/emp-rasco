/**
 * AuthService.gs - User Authentication & Region/Project Role-Based Access Control (RBAC)
 */

/**
 * Get active user session details
 */
function getCurrentUserSession() {
  var email = Session.getActiveUser().getEmail();
  
  if (!email) {
    email = 'admin@rassco.com.sa';
  }
  
  var users = getSheetDataAsObjects(CONFIG.SHEETS.USERS);
  var matchedUser = null;
  
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].Email).toLowerCase() === email.toLowerCase()) {
      matchedUser = users[i];
      break;
    }
  }
  
  if (!matchedUser) {
    return {
      User_ID: 'USR-SYS',
      Full_Name: 'المدير العام (RASSCO Admin)',
      Email: email,
      Role: CONFIG.ROLES.SUPER_ADMIN,
      Region_ID: 'ALL',
      Region_Name: 'جميع المناطق',
      Project_ID: 'ALL',
      Project_Name: 'جميع المشاريع',
      Status: 'Active'
    };
  }
  
  return matchedUser;
}

/**
 * Enforce Region & Project level permission check
 */
function validateUserPermission(targetRegionID, targetProjectID, requiredRole) {
  var user = getCurrentUserSession();
  
  if (user.Role === CONFIG.ROLES.SUPER_ADMIN || user.Role === CONFIG.ROLES.HR_ADMIN) {
    return { allowed: true, user: user };
  }
  
  // Regional Supervisor & Project Manager Check
  if (user.Role === CONFIG.ROLES.PROJECT_MANAGER || user.Role === CONFIG.ROLES.REGIONAL_SUPERVISOR) {
    if (requiredRole === CONFIG.ROLES.SUPER_ADMIN || requiredRole === CONFIG.ROLES.HR_ADMIN) {
      return { allowed: false, message: 'صلاحيات غير كافية للقيام بهذا الإجراء' };
    }
    
    // Check Region Match
    if (user.Region_ID !== 'ALL' && targetRegionID && String(user.Region_ID) !== String(targetRegionID)) {
      return { allowed: false, message: 'غير مصرح لك بالوصول لبيانات هذه المنطقة' };
    }

    // Check Project Match
    if (user.Project_ID !== 'ALL' && targetProjectID && String(user.Project_ID) !== String(targetProjectID)) {
      return { allowed: false, message: 'غير مصرح لك بالوصول لبيانات هذا المشروع' };
    }

    return { allowed: true, user: user };
  }
  
  if (user.Role === CONFIG.ROLES.VIEWER) {
    if (requiredRole && requiredRole !== CONFIG.ROLES.VIEWER) {
      return { allowed: false, message: 'الحساب مخصص للعرض فقط' };
    }
    return { allowed: true, user: user };
  }
  
  return { allowed: false, message: 'صلاحيات غير معروفة' };
}
