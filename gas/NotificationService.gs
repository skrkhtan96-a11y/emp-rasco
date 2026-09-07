/**
 * NotificationService.gs - Time-Driven Daily Triggers & Email Alert Dispatcher
 */

/**
 * Daily Time-Driven Trigger Function
 * Checks expiry dates for all employee documents at 90, 60, 30, 15, 7, 1, and 0 days
 */
function checkAndSendDocumentAlerts() {
  console.log('Starting daily document expiry check...');
  var employees = getSheetDataAsObjects(CONFIG.SHEETS.EMPLOYEES);
  var existingAlerts = getSheetDataAsObjects(CONFIG.SHEETS.NOTIFICATIONS);

  var alertThresholds = [90, 60, 30, 15, 7, 1, 0];

  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];
    
    checkDocumentExpiryAlert(emp, 'Iqama', emp.Iqama_Expiry_Date, alertThresholds, existingAlerts);
    checkDocumentExpiryAlert(emp, 'Passport', emp.Passport_Expiry_Date, alertThresholds, existingAlerts);

    if (emp.Driving_License_Available === 'Yes') {
      checkDocumentExpiryAlert(emp, 'Driving License', emp.Driving_License_Expiry_Date, alertThresholds, existingAlerts);
    }
    if (emp.Forklift_License_Available === 'Yes') {
      checkDocumentExpiryAlert(emp, 'Forklift License', emp.Forklift_License_Expiry_Date, alertThresholds, existingAlerts);
    }
  }

  console.log('Daily expiry check completed.');
}

/**
 * Check single document for alert triggers
 */
function checkDocumentExpiryAlert(emp, docType, expiryDateStr, thresholds, existingAlerts) {
  if (!expiryDateStr) return;
  var days = getDaysRemaining(expiryDateStr);
  if (days === null) return;

  for (var t = 0; t < thresholds.length; t++) {
    var threshold = thresholds[t];
    
    // Check if days remaining matches threshold milestone
    if (days === threshold || (days < 0 && threshold === 0)) {
      var level = days < 0 ? 'Expired' : threshold + ' Days Warning';
      
      // Check if duplicate alert already sent today for this milestone
      var alreadySent = false;
      var todayStr = formatDateISO(new Date());

      for (var a = 0; a < existingAlerts.length; a++) {
        var alt = existingAlerts[a];
        if (String(alt.Employee_ID) === String(emp.Employee_ID) &&
            alt.Document_Type === docType &&
            String(alt.Notification_Level) === String(level) &&
            alt.Sent_Date === todayStr) {
          alreadySent = true;
          break;
        }
      }

      if (!alreadySent) {
        sendExpiryNotificationEmail(emp, docType, expiryDateStr, days, level);
      }
    }
  }
}

/**
 * Dispatch Email Alert via GmailApp
 */
function sendExpiryNotificationEmail(emp, docType, expiryDateStr, daysRemaining, level) {
  try {
    var recipient = 'hr@company.com';
    var subject = 'تنبيه انتهاء وثيقة: ' + docType + ' للموظف ' + emp.Employee_Name;

    var statusText = daysRemaining < 0 ? 'منتهية بالفعل' : 'متبقي ' + daysRemaining + ' يوم على الانتهاء';

    var body = 'تحية طيبة وبعد،\n\n' +
      'نفيدكم بتنبيه حول وثيقة موظف في مشروع: ' + emp.Project_Name + '\n\n' +
      'اسم الموظف: ' + emp.Employee_Name + '\n' +
      'رقم الموظف: ' + emp.Employee_Number + '\n' +
      'نوع الوثيقة: ' + docType + '\n' +
      'تاريخ الانتهاء: ' + expiryDateStr + '\n' +
      'الحالة الحالية: ' + statusText + '\n\n' +
      'يرجى اتخاذ الإجراء اللازم لتجديد الوثيقة أو تحديث ملف الموظف عبر البوابة.\n\n' +
      'نظام إدارة وثائق الموظفين';

    GmailApp.sendEmail(recipient, subject, body);

    // Record Notification in Sheet
    var notifId = 'NOTIF-' + Date.now();
    var record = {
      Notification_ID: notifId,
      Employee_ID: emp.Employee_ID,
      Employee_Name: emp.Employee_Name,
      Document_Type: docType,
      Expiry_Date: formatDateISO(expiryDateStr),
      Days_Remaining: daysRemaining,
      Notification_Level: level,
      Recipient: recipient,
      Sent_Date: formatDateISO(new Date()),
      Status: 'Sent'
    };

    appendObjectToSheet(CONFIG.SHEETS.NOTIFICATIONS, record);
  } catch (e) {
    console.error('Failed to send alert email: ' + e);
  }
}

/**
 * Setup Time-Driven Daily Trigger programmatically
 */
function createDailyNotificationTrigger() {
  // Remove existing triggers to avoid duplication
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendDocumentAlerts') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new daily trigger at 08:00 AM
  ScriptApp.newTrigger('checkAndSendDocumentAlerts')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  console.log('Daily notification trigger created successfully.');
}
