/**
 * DocumentService.gs - Employee Documents Registration, Status & Expiry Mathematics
 */

/**
 * Get document status based on Expiry Date
 */
function calculateDocumentStatus(expiryDateStr) {
  if (!expiryDateStr) return 'Missing';
  var days = getDaysRemaining(expiryDateStr);
  if (days === null) return 'Missing';
  
  if (days < CONFIG.EXPIRY_THRESHOLDS.EXPIRED) {
    return 'Expired';
  } else if (days <= CONFIG.EXPIRY_THRESHOLDS.CRITICAL) {
    return 'Critical';
  } else if (days <= CONFIG.EXPIRY_THRESHOLDS.EXPIRING_SOON) {
    return 'Expiring Soon';
  } else if (days <= CONFIG.EXPIRY_THRESHOLDS.WARNING) {
    return 'Warning';
  } else {
    return 'Valid';
  }
}

/**
 * Register or replace document for employee
 */
function uploadEmployeeDocument(employeeId, docType, docNumber, issueDate, expiryDate, fileData, notes) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return createErrorResponse('CONCURRENCY_ERROR', 'النظام مشغول حالياً، يرجى المحاولة بعد لحظات.');
  }

  try {
    var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
    var employee = null;
    for (var i = 0; i < employees.length; i++) {
      if (String(employees[i].Employee_ID) === String(employeeId)) {
        employee = employees[i];
        break;
      }
    }
    
    if (!employee) {
      lock.releaseLock();
      return createErrorResponse('EMPLOYEE_NOT_FOUND', 'الموظف غير موجود بالنظام.');
    }

    // Permission Check
    var perm = validateUserPermission(employee.Project_ID, CONFIG.ROLES.PROJECT_MANAGER);
    if (!perm.allowed) {
      lock.releaseLock();
      return createErrorResponse('ACCESS_DENIED', perm.message);
    }

    // Validation
    var val = validateDocumentUpload(docType, fileData);
    if (!val.isValid) {
      lock.releaseLock();
      return createErrorResponse('INVALID_FILE', val.message);
    }

    // Upload to Drive
    var driveRes = saveFileToDrive(employeeId, employee.Employee_Name, docType, fileData);
    var status = calculateDocumentStatus(expiryDate);

    var docId = 'DOC-' + Date.now();
    var nowStr = formatDateISO(new Date());

    var docRecord = {
      Document_ID: docId,
      Employee_ID: employeeId,
      Employee_Name: employee.Employee_Name,
      Document_Type: docType,
      Document_Number: docNumber || '',
      Issue_Date: formatDateISO(issueDate),
      Expiry_Date: formatDateISO(expiryDate),
      Drive_File_ID: driveRes.fileId,
      Drive_File_URL: driveRes.fileUrl,
      Original_File_Name: fileData.fileName,
      Upload_Date: nowStr,
      Uploaded_By: perm.user.Email,
      Document_Status: status,
      Notes: notes || '',
      Created_At: nowStr,
      Updated_At: nowStr
    };

    // Save to Employee_Documents sheet
    appendObjectToSheet(CONFIG.SHEETS.DOCUMENTS, docRecord);

    // Update Employee Profile fields accordingly
    updateEmployeeDocumentSummary(employee, docType, docNumber, expiryDate);

    logAuditAction('Document Uploaded', employeeId, 'Document', '', docType + ': ' + docNumber, 'Uploaded file: ' + fileData.fileName);

    lock.releaseLock();
    return createSuccessResponse(docRecord, 'تم رفع الوثيقة بنجاح.');
  } catch (e) {
    lock.releaseLock();
    return createErrorResponse('SERVER_ERROR', e.toString());
  }
}

/**
 * Update summary doc numbers & recalculate completion % in Employees Sheet
 */
function updateEmployeeDocumentSummary(employee, docType, docNumber, expiryDate) {
  var expFormatted = formatDateISO(expiryDate);
  var updated = {};
  
  if (docType === 'Iqama') {
    updated.Iqama_Number = docNumber || employee.Iqama_Number;
    updated.Iqama_Expiry_Date = expFormatted;
  } else if (docType === 'Passport') {
    updated.Passport_Number = docNumber || employee.Passport_Number;
    updated.Passport_Expiry_Date = expFormatted;
  } else if (docType === 'Driving License') {
    updated.Driving_License_Available = 'Yes';
    updated.Driving_License_Number = docNumber || employee.Driving_License_Number;
    updated.Driving_License_Expiry_Date = expFormatted;
  } else if (docType === 'Forklift License') {
    updated.Forklift_License_Available = 'Yes';
    updated.Forklift_License_Number = docNumber || employee.Forklift_License_Number;
    updated.Forklift_License_Expiry_Date = expFormatted;
  }
  
  // Recalculate completion percentage & missing docs
  var empFull = Object.assign({}, employee, updated);
  var completion = calculateEmployeeProfileCompletion(empFull);
  
  updated.Profile_Completion_Percentage = completion.percentage;
  updated.Missing_Documents = completion.missingDocs.join(', ');
  updated.Updated_At = formatDateISO(new Date());

  updateObjectInSheet(CONFIG.SHEETS.EMPLOYEES, 'Employee_ID', employee.Employee_ID, updated);
}

/**
 * Compute Profile Completion % & Missing Required Documents
 */
function calculateEmployeeProfileCompletion(emp) {
  var totalPoints = 0;
  var earnedPoints = 0;
  var missingDocs = [];

  // 1. Basic Info (Name, ID, Project) -> 20 points
  totalPoints += 20;
  if (emp.Employee_Name && emp.Employee_Number && emp.Project_Name) {
    earnedPoints += 20;
  }

  // 2. Iqama (Required for all employees) -> 40 points (20 for image/num, 20 for expiry)
  totalPoints += 40;
  if (emp.Iqama_Number && emp.Iqama_Expiry_Date) {
    earnedPoints += 40;
  } else {
    missingDocs.push('بيانات الإقامة');
  }

  // 3. Passport (Required) -> 20 points
  totalPoints += 20;
  if (emp.Passport_Number && emp.Passport_Expiry_Date) {
    earnedPoints += 20;
  } else {
    missingDocs.push('بيانات الجواز');
  }

  // 4. Driving License (Conditional) -> 10 points if Available = Yes
  if (emp.Driving_License_Available === 'Yes') {
    totalPoints += 10;
    if (emp.Driving_License_Number && emp.Driving_License_Expiry_Date) {
      earnedPoints += 10;
    } else {
      missingDocs.push('رخصة القيادة');
    }
  }

  // 5. Forklift License (Conditional) -> 10 points if Available = Yes
  if (emp.Forklift_License_Available === 'Yes') {
    totalPoints += 10;
    if (emp.Forklift_License_Number && emp.Forklift_License_Expiry_Date) {
      earnedPoints += 10;
    } else {
      missingDocs.push('رخصة الفوركلفت');
    }
  }

  var percentage = Math.round((earnedPoints / totalPoints) * 100);

  return {
    percentage: percentage,
    missingDocs: missingDocs
  };
}
