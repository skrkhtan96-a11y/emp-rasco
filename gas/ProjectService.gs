/**
 * ProjectService.gs - Projects Listing & Management
 */

/**
 * Get all projects with current employee counts
 */
function getProjectsList() {
  var projects = getSheetDataAsObjects(CONFIG.SHEETS.PROJECTS);
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);

  // Recalculate live employee count per project
  var counts = {};
  for (var i = 0; i < employees.length; i++) {
    var pId = employees[i].Project_ID || 'UNASSIGNED';
    counts[pId] = (counts[pId] || 0) + 1;
  }

  for (var p = 0; p < projects.length; p++) {
    var prj = projects[p];
    prj.Total_Employees = counts[prj.Project_ID] || 0;
  }

  return createSuccessResponse(projects);
}
