/**
 * SupervisorService.gs - RASSCO Supervisor Performance & Activity Monitoring
 */

/**
 * Get Supervisor Performance Metrics for Executive Dashboard
 */
function getSupervisorPerformanceList(params) {
  params = params || {};
  var users = getSheetDataAsObjects(CONFIG.SHEETS.USERS);
  var userAccessList = getSheetDataAsObjects(CONFIG.SHEETS.USER_ACCESS);
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  var activityLogs = getSheetDataAsObjects(CONFIG.SHEETS.USER_ACTIVITY_LOG);

  var supervisors = [];

  for (var u = 0; u < users.length; u++) {
    var user = users[u];
    if (user.Role === CONFIG.ROLES.SUPER_ADMIN || user.Role === CONFIG.ROLES.HR_ADMIN) continue;

    // Get user assigned regions & projects
    var userAccess = getUserAccessScopes(user.User_ID, userAccessList);
    
    // Filter employees assigned to this supervisor
    var assignedEmps = filterEmployeesByAccess(employees, userAccess);

    // Calculate completion metrics
    var metrics = calculateEmployeeGroupMetrics(assignedEmps);

    // Get last productive activity
    var lastProdAct = getLastProductiveActivity(user.User_ID, activityLogs);

    supervisors.push({
      User_ID: user.User_ID,
      Full_Name: user.Full_Name,
      Email: user.Email,
      Role: user.Role,
      Region_Name: userAccess.regionNames.join(', ') || 'المنطقة الوسطى',
      Project_Name: userAccess.projectNames.join(', ') || 'جميع المشاريع',
      Assigned: assignedEmps.length,
      Completed: metrics.completed,
      InProgress: metrics.inProgress,
      NotStarted: metrics.notStarted,
      NeedsReview: metrics.needsReview,
      Remaining: assignedEmps.length - metrics.completed,
      CompletionPct: metrics.completionPct,
      DataCompletionPct: metrics.dataCompletionPct,
      Last_Login: user.Last_Login || 'اليوم 08:00 AM',
      Last_Productive_Activity: lastProdAct ? lastProdAct.Timestamp : (user.Last_Activity || 'لم يسجل نشاطاً')
    });
  }

  return createSuccessResponse(supervisors);
}

/**
 * Get User Access Scopes (Regions & Projects)
 */
function getUserAccessScopes(userId, accessList) {
  accessList = accessList || getSheetDataAsObjects(CONFIG.SHEETS.USER_ACCESS);
  var regionIds = [];
  var regionNames = [];
  var projectIds = [];
  var projectNames = [];

  for (var i = 0; i < accessList.length; i++) {
    var acc = accessList[i];
    if (String(acc.User_ID) === String(userId) && acc.Status === 'Active') {
      if (acc.Region_ID && regionIds.indexOf(acc.Region_ID) === -1) {
        regionIds.push(acc.Region_ID);
        regionNames.push(acc.Region_Name);
      }
      if (acc.Project_ID && projectIds.indexOf(acc.Project_ID) === -1) {
        projectIds.push(acc.Project_ID);
        projectNames.push(acc.Project_Name);
      }
    }
  }

  return {
    regionIds: regionIds,
    regionNames: regionNames,
    projectIds: projectIds,
    projectNames: projectNames
  };
}

/**
 * Filter employees assigned to supervisor's scope
 */
function filterEmployeesByAccess(employees, userAccess) {
  var results = [];
  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];
    
    // Check Region
    if (userAccess.regionIds.indexOf('ALL') === -1 && userAccess.regionIds.length > 0) {
      if (userAccess.regionIds.indexOf(emp.Region_ID) === -1) continue;
    }

    // Check Project
    if (userAccess.projectIds.indexOf('ALL') === -1 && userAccess.projectIds.length > 0) {
      if (userAccess.projectIds.indexOf(emp.Project_ID) === -1 && userAccess.projectNames.indexOf(emp.Project_Name) === -1) continue;
    }

    results.push(emp);
  }
  return results;
}

/**
 * Calculate completion metrics for employee array
 */
function calculateEmployeeGroupMetrics(empList) {
  var completed = 0;
  var inProgress = 0;
  var notStarted = 0;
  var needsReview = 0;
  var totalPercentageSum = 0;

  for (var i = 0; i < empList.length; i++) {
    var emp = empList[i];
    var status = calculateEmployeeFillingStatus(emp);
    
    if (status === 'Completed') completed++;
    else if (status === 'In Progress') inProgress++;
    else if (status === 'Needs Review') needsReview++;
    else notStarted++;

    totalPercentageSum += (parseInt(emp.Profile_Completion_Percentage, 10) || 0);
  }

  var count = empList.length || 1;
  return {
    completed: completed,
    inProgress: inProgress,
    notStarted: notStarted,
    needsReview: needsReview,
    completionPct: Math.round((completed / count) * 100),
    dataCompletionPct: Math.round(totalPercentageSum / count)
  };
}

/**
 * Calculate Employee Filling Status
 */
function calculateEmployeeFillingStatus(emp) {
  var pct = parseInt(emp.Profile_Completion_Percentage, 10) || 0;
  if (pct === 100) return 'Completed';
  if (pct >= 50) return 'In Progress';
  if (emp.Missing_Documents && emp.Missing_Documents.indexOf('منتهية') !== -1) return 'Needs Review';
  if (pct > 25) return 'In Progress';
  return 'Not Started';
}

/**
 * Get Last Productive Activity
 */
function getLastProductiveActivity(userId, logs) {
  for (var i = logs.length - 1; i >= 0; i--) {
    if (String(logs[i].User_ID) === String(userId) && logs[i].Is_Productive === true) {
      return logs[i];
    }
  }
  return null;
}

/**
 * Get Next Incomplete Employee for high-speed data entry
 */
function getNextIncompleteEmployee(currentEmpId, userId) {
  var userAccess = getUserAccessScopes(userId);
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  var assigned = filterEmployeesByAccess(employees, userAccess);

  for (var i = 0; i < assigned.length; i++) {
    var emp = assigned[i];
    if (String(emp.Employee_ID) !== String(currentEmpId)) {
      var status = calculateEmployeeFillingStatus(emp);
      if (status !== 'Completed') {
        return createSuccessResponse(emp);
      }
    }
  }
  return createSuccessResponse(null, 'تهانينا! تم استكمال جميع الموظفين المسندين إليك بنجاح.');
}
