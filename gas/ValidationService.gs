/**
 * ValidationService.gs - Backend Input Validation & Safety
 */

/**
 * Validate employee creation / update payloads
 */
function validateEmployeeData(payload, isNew) {
  var errors = [];
  
  if (!payload.Employee_Name || String(payload.Employee_Name).trim().length < 2) {
    errors.push('اسم الموظف مطلوب ويجب أن يتكون من حرفين على الأقل.');
  }
  
  if (payload.Iqama_Number) {
    var iqamaStr = String(payload.Iqama_Number).trim();
    if (!/^\d{10}$/.test(iqamaStr)) {
      errors.push('رقم الإقامة / الهوية يجب أن يتكون من 10 أرقام.');
    }
  }
  
  if (isNew) {
    if (payload.Employee_Number && isDuplicateEmployeeNumber(payload.Employee_Number, null)) {
      errors.push('رقم الموظف مكرر في النظام.');
    }
    if (payload.Iqama_Number && isDuplicateIqamaNumber(payload.Iqama_Number, null)) {
      errors.push('رقم الإقامة مكرر لموظف آخر.');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Check if employee number is duplicate
 */
function isDuplicateEmployeeNumber(empNo, excludeId) {
  if (!empNo) return false;
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].Employee_Number) === String(empNo)) {
      if (!excludeId || String(employees[i].Employee_ID) !== String(excludeId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if iqama number is duplicate
 */
function isDuplicateIqamaNumber(iqamaNo, excludeId) {
  if (!iqamaNo) return false;
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].Iqama_Number) === String(iqamaNo)) {
      if (!excludeId || String(employees[i].Employee_ID) !== String(excludeId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validate document upload file parameters
 */
function validateDocumentUpload(docType, fileData) {
  var allowedTypes = ['PDF', 'JPG', 'JPEG', 'PNG'];
  var allowedDocTypes = ['Iqama', 'Passport', 'Driving License', 'Forklift License', 'Other'];
  
  if (allowedDocTypes.indexOf(docType) === -1) {
    return { isValid: false, message: 'نوع المستند غير مدعوم.' };
  }
  
  if (!fileData || !fileData.base64Content || !fileData.fileName) {
    return { isValid: false, message: 'ملف المستند غير مكتمل.' };
  }
  
  var ext = fileData.fileName.split('.').pop().toUpperCase();
  if (allowedTypes.indexOf(ext) === -1) {
    return { isValid: false, message: 'صيغة الملف غير مسموح بها. الصيغ المسموحة: PDF, JPG, JPEG, PNG.' };
  }
  
  // Max size 10MB check
  var approxSizeBytes = (fileData.base64Content.length * 3) / 4;
  if (approxSizeBytes > 10 * 1024 * 1024) {
    return { isValid: false, message: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 MB).' };
  }
  
  return { isValid: true };
}
