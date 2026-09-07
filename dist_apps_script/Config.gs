/**
 * Config.gs - RASSCO Employee Documents Management System
 * System Constants, Configuration & Sheet Names
 */

var CONFIG = {
  APP_NAME: 'نظام إدارة وثائق الموظفين | RASSCO - شركة راس السعودية المحدودة',
  COMPANY_NAME_AR: 'شركة راس السعودية المحدودة',
  COMPANY_NAME_EN: 'RAS SAUDI COMPANY LTD (RASSCO)',
  VERSION: '2.0.0',
  SHEETS: {
    REGIONS: 'Regions',
    EMPLOYEES: 'Employees',
    DOCUMENTS: 'Employee_Documents',
    PROJECTS: 'Projects',
    USERS: 'Users',
    USER_ACCESS: 'User_Access',
    USER_ACTIVITY_LOG: 'User_Activity_Log',
    AUDIT_LOG: 'Audit_Log',
    NOTIFICATIONS: 'Notifications',
    SETTINGS: 'Settings'
  },
  DRIVE: {
    ROOT_FOLDER_NAME: 'RASSCO Employee Documents'
  },
  EXPIRY_THRESHOLDS: {
    EXPIRED: 0,
    CRITICAL: 15,
    EXPIRING_SOON: 30,
    WARNING: 60
  },
  FILLING_STATUS: {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    NEEDS_REVIEW: 'Needs Review'
  },
  ROLES: {
    SUPER_ADMIN: 'Super Admin',
    HR_ADMIN: 'HR Admin',
    REGIONAL_SUPERVISOR: 'Regional Supervisor',
    PROJECT_MANAGER: 'Project Manager',
    PROJECT_SUPERVISOR: 'Project Supervisor',
    VIEWER: 'Viewer'
  }
};

/**
 * Get active spreadsheet instance
 */
function getSpreadsheet() {
  var id = getSetting('Spreadsheet_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      console.warn('Could not open spreadsheet by ID setting: ' + e);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}
