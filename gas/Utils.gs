/**
 * Utils.gs - General Utility Functions & Standardization
 */

/**
 * Standard API Success Response
 */
function createSuccessResponse(data, message) {
  return {
    success: true,
    data: data || {},
    message: message || 'Operation completed successfully.'
  };
}

/**
 * Standard API Error Response
 */
function createErrorResponse(code, message) {
  return {
    success: false,
    error: {
      code: code || 'UNKNOWN_ERROR',
      message: message || 'An unexpected error occurred.'
    }
  };
}

/**
 * Helper to convert Sheet to JSON Array of Objects
 */
function getSheetDataAsObjects(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  
  var headers = values[0];
  var results = [];
  
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var isEmpty = true;
    for (var c = 0; c < headers.length; c++) {
      var val = row[c];
      if (val !== '' && val !== null && val !== undefined) isEmpty = false;
      obj[headers[c]] = val;
    }
    if (!isEmpty) {
      results.push(obj);
    }
  }
  return results;
}

/**
 * Batch append object to a sheet matching header columns
 */
function appendObjectToSheet(sheetName, obj) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newRow = [];
  
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    var val = obj[key];
    if (val === undefined || val === null) {
      val = '';
    } else if (val instanceof Date) {
      val = formatDateISO(val);
    }
    newRow.push(val);
  }
  
  sheet.appendRow(newRow);
}

/**
 * Update row in sheet matching primary key
 */
function updateObjectInSheet(sheetName, keyField, keyValue, updatedObj) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');
  
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  
  var headers = values[0];
  var keyColIndex = headers.indexOf(keyField);
  if (keyColIndex === -1) throw new Error('Key field ' + keyField + ' not in headers.');
  
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyColIndex]) === String(keyValue)) {
      var updatedRow = [];
      for (var c = 0; c < headers.length; c++) {
        var k = headers[c];
        var val = updatedObj.hasOwnProperty(k) ? updatedObj[k] : values[r][c];
        if (val instanceof Date) val = formatDateISO(val);
        updatedRow.push(val);
      }
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([updatedRow]);
      return true;
    }
  }
  return false;
}

/**
 * Format Date to ISO string YYYY-MM-DD
 */
function formatDateISO(dateVal) {
  if (!dateVal) return '';
  var d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  var year = d.getFullYear();
  var month = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return year + '-' + month + '-' + day;
}

/**
 * Days remaining until target expiry date
 */
function getDaysRemaining(expiryDateStr) {
  if (!expiryDateStr) return null;
  var exp = new Date(expiryDateStr);
  if (isNaN(exp.getTime())) return null;
  
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  
  var diffTime = exp.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
