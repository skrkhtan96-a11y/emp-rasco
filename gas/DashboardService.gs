/**
 * DashboardService.gs - Dashboard Metrics, KPI Cards & Reports Data Aggregation
 */

/**
 * Get aggregated Dashboard statistics
 */
function getDashboardMetrics() {
  var currentUser = getCurrentUserSession();
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);

  var stats = {
    totalEmployees: 0,
    activeEmployees: 0,
    totalProjects: 0,
    completeDocuments: 0,
    missingDocuments: 0,
    iqamaExpiringSoon: 0,
    iqamaExpired: 0,
    passportExpiringSoon: 0,
    drivingExpiringSoon: 0,
    forkliftExpiringSoon: 0,
    criticalCount: 0
  };

  var projectsSet = {};

  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];

    // RBAC Filter
    if (currentUser.Role === CONFIG.ROLES.PROJECT_MANAGER) {
      if (currentUser.Project_ID !== 'ALL' && String(emp.Project_ID) !== String(currentUser.Project_ID)) {
        continue;
      }
    }

    stats.totalEmployees++;
    if (emp.Employee_Status === 'Active') stats.activeEmployees++;
    if (emp.Project_Name) projectsSet[emp.Project_Name] = true;

    // Check completion
    var completion = parseInt(emp.Profile_Completion_Percentage, 10) || 0;
    if (completion === 100) {
      stats.completeDocuments++;
    } else {
      stats.missingDocuments++;
    }

    // Check Iqama Expiry
    var iqamaDays = getDaysRemaining(emp.Iqama_Expiry_Date);
    if (iqamaDays !== null) {
      if (iqamaDays < 0) stats.iqamaExpired++;
      else if (iqamaDays <= 30) stats.iqamaExpiringSoon++;
      if (iqamaDays <= 15) stats.criticalCount++;
    }

    // Check Passport Expiry
    var passDays = getDaysRemaining(emp.Passport_Expiry_Date);
    if (passDays !== null && passDays <= 30) stats.passportExpiringSoon++;

    // Check Driving License Expiry
    if (emp.Driving_License_Available === 'Yes') {
      var drvDays = getDaysRemaining(emp.Driving_License_Expiry_Date);
      if (drvDays !== null && drvDays <= 30) stats.drivingExpiringSoon++;
    }

    // Check Forklift License Expiry
    if (emp.Forklift_License_Available === 'Yes') {
      var flDays = getDaysRemaining(emp.Forklift_License_Expiry_Date);
      if (flDays !== null && flDays <= 30) stats.forkliftExpiringSoon++;
    }
  }

  stats.totalProjects = Object.keys(projectsSet).length;

  return createSuccessResponse(stats);
}
