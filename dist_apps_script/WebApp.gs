/**
 * WebApp.gs - Main Entry Point for Google Apps Script Web App
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle(CONFIG.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Universal API Gateway Handler for Frontend Client Calls
 */
function apiCall(action, payload) {
  try {
    payload = payload || {};

    switch (action) {
      case 'getDashboardMetrics':
        return getDashboardMetrics();

      case 'getEmployeesList':
        return getEmployeesList(payload);

      case 'getEmployeeProfile':
        return getEmployeeProfile(payload.employeeId);

      case 'saveEmployee':
        return saveEmployee(payload);

      case 'uploadDocument':
        return uploadEmployeeDocument(
          payload.employeeId,
          payload.docType,
          payload.docNumber,
          payload.issueDate,
          payload.expiryDate,
          payload.fileData,
          payload.notes
        );

      case 'getSupervisorPerformanceList':
        return getSupervisorPerformanceList(payload);

      case 'getNextIncompleteEmployee':
        return getNextIncompleteEmployee(payload.currentEmpId, payload.userId);

      case 'getProjectsList':
        return getProjectsList();

      case 'getUsersList':
        return getUsersList();

      case 'saveUser':
        return saveUser(payload);

      case 'getCurrentUser':
        return createSuccessResponse(getCurrentUserSession());

      default:
        return createErrorResponse('INVALID_ACTION', 'Action ' + action + ' is not defined.');
    }
  } catch (err) {
    console.error('API Error (' + action + '): ' + err);
    return createErrorResponse('SERVER_EXCEPTION', err.toString());
  }
}
