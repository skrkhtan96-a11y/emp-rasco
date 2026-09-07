/**
 * EmployeeService.gs - Employee CRUD Operations & Search Engine
 */

/**
 * Get filtered employee list based on RBAC, Project ID, Search Query & Pagination
 */
function getEmployeesList(params) {
  params = params || {};
  var currentUser = getCurrentUserSession();

  var allEmps = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  var filtered = [];

  for (var i = 0; i < allEmps.length; i++) {
    var emp = allEmps[i];

    // RBAC Filter: PM can only see their project
    if (currentUser.Role === CONFIG.ROLES.PROJECT_MANAGER) {
      if (currentUser.Project_ID !== 'ALL' && String(emp.Project_ID) !== String(currentUser.Project_ID)) {
        continue;
      }
    }

    // Filter by Project
    if (params.projectId && params.projectId !== 'ALL' && String(emp.Project_ID) !== String(params.projectId)) {
      continue;
    }

    // Filter by Status
    if (params.status && params.status !== 'ALL' && emp.Employee_Status !== params.status) {
      continue;
    }

    // Search Query (Name, ID, Number, Iqama, Mobile, Project)
    if (params.search) {
      var q = String(params.search).toLowerCase().trim();
      var matchName = String(emp.Employee_Name || '').toLowerCase().indexOf(q) !== -1;
      var matchEmpNo = String(emp.Employee_Number || '').toLowerCase().indexOf(q) !== -1;
      var matchIqama = String(emp.Iqama_Number || '').toLowerCase().indexOf(q) !== -1;
      var matchPassport = String(emp.Passport_Number || '').toLowerCase().indexOf(q) !== -1;
      var matchProject = String(emp.Project_Name || '').toLowerCase().indexOf(q) !== -1;
      var matchMobile = String(emp.Mobile_Number || '').toLowerCase().indexOf(q) !== -1;

      if (!matchName && !matchEmpNo && !matchIqama && !matchPassport && !matchProject && !matchMobile) {
        continue;
      }
    }

    // Calculate dynamic expiry status badges for key documents
    emp.Iqama_Status = calculateDocumentStatus(emp.Iqama_Expiry_Date);
    emp.Passport_Status = calculateDocumentStatus(emp.Passport_Expiry_Date);
    emp.Driving_License_Status = emp.Driving_License_Available === 'Yes' ? calculateDocumentStatus(emp.Driving_License_Expiry_Date) : 'Not Applicable';
    emp.Forklift_License_Status = emp.Forklift_License_Available === 'Yes' ? calculateDocumentStatus(emp.Forklift_License_Expiry_Date) : 'Not Applicable';

    filtered.push(emp);
  }

  // Sorting
  var sortBy = params.sortBy || 'Employee_ID';
  var sortOrder = params.sortOrder || 'ASC';
  filtered.sort(function(a, b) {
    var valA = a[sortBy] || '';
    var valB = b[sortBy] || '';
    if (sortOrder === 'DESC') {
      return valA < valB ? 1 : (valA > valB ? -1 : 0);
    }
    return valA > valB ? 1 : (valA < valB ? -1 : 0);
  });

  // Pagination
  var page = parseInt(params.page, 10) || 1;
  var pageSize = parseInt(params.pageSize, 10) || 20;
  var startIndex = (page - 1) * pageSize;
  var paginated = filtered.slice(startIndex, startIndex + pageSize);

  return createSuccessResponse({
    employees: paginated,
    totalRecords: filtered.length,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(filtered.length / pageSize)
  });
}

/**
 * Get detailed Employee Profile including uploaded documents
 */
function getEmployeeProfile(employeeId) {
  var currentUser = getCurrentUserSession();
  var allEmps = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  var employee = null;

  for (var i = 0; i < allEmps.length; i++) {
    if (String(allEmps[i].Employee_ID) === String(employeeId)) {
      employee = allEmps[i];
      break;
    }
  }

  if (!employee) {
    return createErrorResponse('NOT_FOUND', 'الموظف غير موجود.');
  }

  // Permission Check
  var perm = validateUserPermission(employee.Project_ID, CONFIG.ROLES.VIEWER);
  if (!perm.allowed) {
    return createErrorResponse('ACCESS_DENIED', perm.message);
  }

  // Calculate statuses
  employee.Iqama_Status = calculateDocumentStatus(employee.Iqama_Expiry_Date);
  employee.Passport_Status = calculateDocumentStatus(employee.Passport_Expiry_Date);
  employee.Driving_License_Status = employee.Driving_License_Available === 'Yes' ? calculateDocumentStatus(employee.Driving_License_Expiry_Date) : 'Not Applicable';
  employee.Forklift_License_Status = employee.Forklift_License_Available === 'Yes' ? calculateDocumentStatus(employee.Forklift_License_Expiry_Date) : 'Not Applicable';

  // Fetch Uploaded Documents
  var allDocs = getSheetDataAsObjects(CONFIG.SHEETS.DOCUMENTS);
  var empDocs = [];
  for (var d = 0; d < allDocs.length; d++) {
    if (String(allDocs[d].Employee_ID) === String(employeeId)) {
      empDocs.push(allDocs[d]);
    }
  }

  return createSuccessResponse({
    employee: employee,
    documents: empDocs
  });
}

/**
 * Create or Update Employee
 */
function saveEmployee(employeeData) {
  var isNew = !employeeData.Employee_ID;
  
  var val = validateEmployeeData(employeeData, isNew);
  if (!val.isValid) {
    return createErrorResponse('VALIDATION_ERROR', val.errors.join(' '));
  }

  var currentUser = getCurrentUserSession();
  var perm = validateUserPermission(employeeData.Project_ID, CONFIG.ROLES.PROJECT_MANAGER);
  if (!perm.allowed) {
    return createErrorResponse('ACCESS_DENIED', perm.message);
  }

  var nowStr = formatDateISO(new Date());

  if (isNew) {
    employeeData.Employee_ID = 'EMP-' + Date.now();
    employeeData.Created_At = nowStr;
    employeeData.Created_By = currentUser.Email;
    employeeData.Updated_At = nowStr;
    employeeData.Updated_By = currentUser.Email;
    
    var comp = calculateEmployeeProfileCompletion(employeeData);
    employeeData.Profile_Completion_Percentage = comp.percentage;
    employeeData.Missing_Documents = comp.missingDocs.join(', ');

    appendObjectToSheet(CONFIG.SHEETS.EMPLOYEES, employeeData);
    logAuditAction('Employee Created', employeeData.Employee_ID, 'Employee', '', employeeData.Employee_Name, 'New employee created.');
    
    return createSuccessResponse(employeeData, 'تم إضافة الموظف بنجاح.');
  } else {
    employeeData.Updated_At = nowStr;
    employeeData.Updated_By = currentUser.Email;

    var compUpdate = calculateEmployeeProfileCompletion(employeeData);
    employeeData.Profile_Completion_Percentage = compUpdate.percentage;
    employeeData.Missing_Documents = compUpdate.missingDocs.join(', ');

    updateObjectInSheet(CONFIG.SHEETS.EMPLOYEES, 'Employee_ID', employeeData.Employee_ID, employeeData);
    logAuditAction('Employee Updated', employeeData.Employee_ID, 'Employee', '', employeeData.Employee_Name, 'Employee information updated.');

    return createSuccessResponse(employeeData, 'تم تحديث بيانات الموظف بنجاح.');
  }
}
