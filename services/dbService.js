const { appendSheetRow, getSheetRows } = require('./googleSheetsService');

// In-memory cache for high-concurrency server responses, synchronized with Google Sheets
let memoryCache = {
  employees: [],
  documents: [],
  users: [],
  userAccess: [],
  activityLogs: [],
  notifications: [],
  settings: [],
  importHistory: [],
  exportHistory: []
};

let isInitialized = false;
let lastSyncTime = 0;
const CACHE_TTL_MS = 5000; // 5-second short-lived index cache

// Simple Async Mutex Lock for preventing race conditions during concurrent writes
class AsyncMutex {
  constructor() {
    this.queue = Promise.resolve();
  }
  runExclusive(task) {
    let res, rej;
    const p = new Promise((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    this.queue = this.queue.then(() => task().then(res).catch(rej)).catch(() => {});
    return p;
  }
}
const dbWriteMutex = new AsyncMutex();

/**
 * Standardized Header Schemas
 */
const SCHEMAS = {
  Employees: ['id', 'name', 'iqamaNumber', 'jobTitle', 'region', 'project', 'nationality', 'absherNumber', 'phone', 'status', 'portalStatus', 'updatedAt'],
  Employee_Documents: ['id', 'employeeId', 'iqamaNumber', 'employeeName', 'docType', 'storedFileName', 'originalFileName', 'folderName', 'folderId', 'mimeType', 'fileSize', 'webViewLink', 'uploadedAt', 'status'],
  Users: ['id', 'username', 'passwordHash', 'name', 'role', 'status', 'allowedRegions', 'allowedProjects', 'createdAt'],
  User_Access: ['userId', 'username', 'role', 'grantedBy', 'grantedAt'],
  Activity_Log: ['id', 'userId', 'userName', 'employeeId', 'action', 'details', 'timestamp', 'source'],
  Notifications: ['id', 'type', 'title', 'message', 'targetRole', 'employeeId', 'read', 'timestamp'],
  Settings: ['key', 'value', 'updatedAt'],
  Import_History: ['id', 'filename', 'importedCount', 'importedBy', 'timestamp'],
  Export_History: ['id', 'exportedCount', 'exportedBy', 'timestamp']
};

function mapRowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h] = row[idx] !== undefined ? row[idx] : '';
  });
  return obj;
}

function mapObjectToRow(headers, obj) {
  return headers.map(h => obj[h] !== undefined ? String(obj[h]) : '');
}

/**
 * Seed 1600 Employee Synthetic Dataset for Scale Benchmark
 */
function generate1600ScaleDataset() {
  const regions = ['الرياض', 'جدة', 'الخبر', 'أبها', 'القصيم', 'تبوك', 'نجران', 'الخرج'];
  const projects = ['مشروع المترو', 'مشروع المطار', 'Al Nemer', 'مشروع الجسر', 'مشروع المستشفى', 'مشروع البرج'];
  const jobTitles = ['سائق معدات ثقيلة', 'فني كهرباء', 'مهندس موقع', 'مشرف سلامة', 'مراقب عمال', 'فني ميكانيكا'];
  const nationalities = ['مصري', 'سعودي', 'هندي', 'باكستاني', 'يمني', 'سوداني'];

  const dataset = [];

  // Seed sample real employees first
  dataset.push({
    id: '1054',
    name: 'أحمد محمد علي',
    iqamaNumber: '2383840655',
    jobTitle: 'سائق معدات ثقيلة',
    region: 'الرياض',
    project: 'مشروع المترو',
    nationality: 'مصري',
    absherNumber: '0501234567',
    phone: '0501234567',
    status: 'مكتمل',
    portalStatus: 'تم الاستكمال',
    updatedAt: new Date().toISOString()
  });

  dataset.push({
    id: '1055',
    name: 'خالد عبدالله عمر',
    iqamaNumber: '1098765432',
    jobTitle: 'فني كهرباء',
    region: 'جدة',
    project: 'مشروع المطار',
    nationality: 'سعودي',
    absherNumber: '',
    phone: '0559876543',
    status: 'غير مكتمل',
    portalStatus: 'في الانتظار',
    updatedAt: new Date().toISOString()
  });

  dataset.push({
    id: '1056',
    name: 'محمد إبراهيم حسان',
    iqamaNumber: '2516571086',
    jobTitle: 'مشرف سلامة',
    region: 'الرياض',
    project: 'مشروع المترو',
    nationality: 'مصري',
    absherNumber: '',
    phone: '0509871234',
    status: 'غير مكتمل',
    portalStatus: 'في الانتظار',
    updatedAt: new Date().toISOString()
  });

  // Generate 1598 scale test employees
  for (let i = 3; i <= 1600; i++) {
    const empId = String(1000 + i);
    const iqama = '2' + String(100000000 + i).slice(-9);
    const reg = regions[i % regions.length];
    const prj = projects[i % projects.length];
    const job = jobTitles[i % jobTitles.length];
    const nat = nationalities[i % nationalities.length];
    const isCompleted = i % 3 === 0;

    dataset.push({
      id: empId,
      name: `موظف تجريبي ${i}`,
      iqamaNumber: iqama,
      jobTitle: job,
      region: reg,
      project: prj,
      nationality: nat,
      absherNumber: isCompleted ? `05${String(10000000 + i).slice(-8)}` : '',
      phone: `05${String(10000000 + i).slice(-8)}`,
      status: isCompleted ? 'مكتمل' : 'غير مكتمل',
      portalStatus: isCompleted ? 'تم الاستكمال' : 'في الانتظار',
      updatedAt: new Date().toISOString()
    });
  }

  return dataset;
}

/**
 * Initialize Database Sync with Cache Control
 */
async function initDb(forceRefresh = false) {
  const now = Date.now();
  if (isInitialized && !forceRefresh && (now - lastSyncTime < CACHE_TTL_MS)) {
    return memoryCache;
  }

  return dbWriteMutex.runExclusive(async () => {
    if (isInitialized && !forceRefresh && (Date.now() - lastSyncTime < CACHE_TTL_MS)) {
      return memoryCache;
    }

    try {
      // 1. Employees
      const empRes = await getSheetRows('Employees');
      if (empRes.rows && empRes.rows.length > 1) {
        const headers = empRes.rows[0];
        memoryCache.employees = empRes.rows.slice(1).map(r => mapRowToObject(headers, r));
      } else {
        memoryCache.employees = [];
        await appendSheetRow('Employees', SCHEMAS.Employees);
        if (process.env.SEED_SCALE_TEST === 'true') {
          const scaleEmps = generate1600ScaleDataset();
          memoryCache.employees = scaleEmps;
          for (let i = 0; i < Math.min(10, scaleEmps.length); i++) {
            await appendSheetRow('Employees', mapObjectToRow(SCHEMAS.Employees, scaleEmps[i]));
          }
        }
      }

      // 2. Documents
      const docRes = await getSheetRows('Employee_Documents');
      if (docRes.rows && docRes.rows.length > 1) {
        const headers = docRes.rows[0];
        memoryCache.documents = docRes.rows.slice(1).map(r => mapRowToObject(headers, r));
      } else {
        await appendSheetRow('Employee_Documents', SCHEMAS.Employee_Documents);
      }

      // 3. Users
      const userRes = await getSheetRows('Users');
      if (userRes.rows && userRes.rows.length > 1) {
        const headers = userRes.rows[0];
        memoryCache.users = userRes.rows.slice(1).map(r => mapRowToObject(headers, r));
      } else {
        const defaultUsers = [
          {
            id: 'USR-1',
            username: 'admin',
            passwordHash: '$2b$10$w3V87n8V9B...mock',
            name: 'المدير العام',
            role: 'Admin',
            status: 'نشط',
            allowedRegions: 'ALL',
            allowedProjects: 'ALL',
            createdAt: new Date().toISOString()
          },
          {
            id: 'USR-2',
            username: 'supervisor_riyadh',
            passwordHash: '$2b$10$w3V87n8V9B...mock',
            name: 'مشرف الرياض',
            role: 'Supervisor',
            status: 'نشط',
            allowedRegions: 'الرياض',
            allowedProjects: 'ALL',
            createdAt: new Date().toISOString()
          },
          {
            id: 'USR-3',
            username: 'supervisor_jeddah',
            passwordHash: '$2b$10$w3V87n8V9B...mock',
            name: 'مشرف جدة',
            role: 'Supervisor',
            status: 'نشط',
            allowedRegions: 'جدة',
            allowedProjects: 'ALL',
            createdAt: new Date().toISOString()
          }
        ];
        memoryCache.users = defaultUsers;
        await appendSheetRow('Users', SCHEMAS.Users);
        for (const u of defaultUsers) {
          await appendSheetRow('Users', mapObjectToRow(SCHEMAS.Users, u));
        }
      }

      // 4. Notifications
      const notifRes = await getSheetRows('Notifications');
      if (notifRes.rows && notifRes.rows.length > 1) {
        const headers = notifRes.rows[0];
        memoryCache.notifications = notifRes.rows.slice(1).map(r => mapRowToObject(headers, r));
      } else {
        await appendSheetRow('Notifications', SCHEMAS.Notifications);
      }

      // 5. Activity Log
      const actRes = await getSheetRows('Activity_Log');
      if (actRes.rows && actRes.rows.length > 1) {
        const headers = actRes.rows[0];
        memoryCache.activityLogs = actRes.rows.slice(1).map(r => mapRowToObject(headers, r));
      } else {
        await appendSheetRow('Activity_Log', SCHEMAS.Activity_Log);
      }

      isInitialized = true;
      lastSyncTime = Date.now();
      return memoryCache;

    } catch (err) {
      console.error('❌ DB Sync Error:', err.message);
      if (!memoryCache.employees) {
        memoryCache.employees = [];
      }
      isInitialized = true;
      lastSyncTime = Date.now();
      return memoryCache;
    }
  });
}

// ------------------------------------
// Server-Side Query, Search & Pagination
// ------------------------------------
async function queryEmployees({
  search = '',
  region = 'ALL',
  project = 'ALL',
  status = 'ALL',
  portalStatus = 'ALL',
  page = 1,
  limit = 50,
  userRole = 'Admin',
  userAllowedRegion = 'ALL',
  userAllowedProject = 'ALL'
}) {
  await initDb();

  let filtered = memoryCache.employees;

  // 1. Backend Authorization Scope
  if (userRole === 'Supervisor' || userRole === 'Regional Supervisor') {
    if (userAllowedRegion && userAllowedRegion !== 'ALL') {
      const allowedLocs = String(userAllowedRegion).split(',').map(s => s.trim().toUpperCase());
      filtered = filtered.filter(e => allowedLocs.includes(String(e.region).trim().toUpperCase()));
    }
    if (userAllowedProject && userAllowedProject !== 'ALL') {
      const allowedPrjs = String(userAllowedProject).split(',').map(s => s.trim().toUpperCase());
      filtered = filtered.filter(e => allowedPrjs.includes(String(e.project).trim().toUpperCase()));
    }
  }

  // 2. Exact Server-Side Filters
  if (region && region !== 'ALL') {
    const regNorm = String(region).trim().toUpperCase();
    filtered = filtered.filter(e => String(e.region).trim().toUpperCase() === regNorm);
  }

  if (project && project !== 'ALL') {
    const prjNorm = String(project).trim().toUpperCase();
    filtered = filtered.filter(e => String(e.project).trim().toUpperCase() === prjNorm);
  }

  if (status && status !== 'ALL') {
    filtered = filtered.filter(e => String(e.status).trim() === String(status).trim());
  }

  if (portalStatus && portalStatus !== 'ALL') {
    filtered = filtered.filter(e => String(e.portalStatus).trim() === String(portalStatus).trim());
  }

  // 3. Server-Side Search
  if (search && search.trim() !== '') {
    const query = String(search).trim().toLowerCase();
    filtered = filtered.filter(e =>
      String(e.name || '').toLowerCase().includes(query) ||
      String(e.id || '').toLowerCase().includes(query) ||
      String(e.iqamaNumber || '').toLowerCase().includes(query)
    );
  }

  // 4. Server-Side Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(limit, 10) || 50));
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (pageNum - 1) * pageSize;
  const paginatedData = filtered.slice(startIndex, startIndex + pageSize);

  return {
    page: pageNum,
    limit: pageSize,
    totalCount: totalCount,
    totalPages: totalPages,
    data: paginatedData
  };
}

async function getEmployees() {
  await initDb();
  return memoryCache.employees;
}

async function getEmployeeById(id) {
  await initDb();
  return memoryCache.employees.find(e => String(e.id) === String(id));
}

async function getEmployeeByIqama(iqamaNumber) {
  await initDb();
  if (!iqamaNumber) return null;
  const rawClean = String(iqamaNumber).trim();
  const normalized = rawClean
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '');

  return memoryCache.employees.find(e => {
    const empIqamaNorm = String(e.iqamaNumber || '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
    const empIdNorm = String(e.id || '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');

    if (normalized && (empIqamaNorm === normalized || empIdNorm === normalized)) {
      return true;
    }
    return String(e.iqamaNumber).trim() === rawClean || String(e.id).trim() === rawClean;
  });
}

async function saveEmployee(empData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const emp = {
      id: empData.id || empData.Employee_ID || String(Date.now()),
      name: empData.name || empData.Employee_Name || '',
      iqamaNumber: empData.iqamaNumber || empData.Iqama_Number || empData.National_ID || '',
      jobTitle: empData.jobTitle || empData.Job_Title || empData.Occupation || '',
      region: empData.region || empData.Region_ID || empData.Location || '',
      project: empData.project || empData.Project_Name || empData.Project_ID || '',
      nationality: empData.nationality || empData.Nationality || '',
      absherNumber: empData.absherNumber || empData.Absher_Number || empData.Mobile_Number || '',
      phone: empData.phone || empData.Phone || '',
      status: empData.status || empData.Status || 'غير مكتمل',
      portalStatus: empData.portalStatus || empData.Portal_Status || 'في الانتظار',
      updatedAt: new Date().toISOString()
    };

    const idx = memoryCache.employees.findIndex(e => String(e.id) === String(emp.id) || (emp.iqamaNumber && String(e.iqamaNumber).trim() === String(emp.iqamaNumber).trim()));

    if (idx !== -1) {
      memoryCache.employees[idx] = { ...memoryCache.employees[idx], ...emp };
      appendSheetRow('Employees', mapObjectToRow(SCHEMAS.Employees, memoryCache.employees[idx])).catch(err => console.error('Sheet append error:', err.message));
      return memoryCache.employees[idx];
    } else {
      memoryCache.employees.push(emp);
      appendSheetRow('Employees', mapObjectToRow(SCHEMAS.Employees, emp)).catch(err => console.error('Sheet append error:', err.message));
      return emp;
    }
  });
}

async function updateEmployee(id, updateData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const idx = memoryCache.employees.findIndex(e => String(e.id) === String(id));
    if (idx === -1) return null;

    const updated = {
      ...memoryCache.employees[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    memoryCache.employees[idx] = updated;
    appendSheetRow('Employees', mapObjectToRow(SCHEMAS.Employees, updated)).catch(err => console.error('Sheet append error:', err.message));
    return updated;
  });
}

// ------------------------------------
// Document Operations
// ------------------------------------
async function getDocuments() {
  await initDb();
  return memoryCache.documents;
}

async function getDocumentsByEmployeeId(empId) {
  await initDb();
  return memoryCache.documents.filter(d => String(d.employeeId) === String(empId));
}

async function saveDocument(docData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const doc = {
      id: docData.fileId || `DOC-${Date.now()}`,
      employeeId: docData.employeeId || '',
      iqamaNumber: docData.iqamaNumber || '',
      employeeName: docData.employeeName || '',
      docType: docData.docType || 'Document',
      storedFileName: docData.storedFileName || '',
      originalFileName: docData.originalFileName || '',
      folderName: docData.folderName || '',
      folderId: docData.folderId || '',
      mimeType: docData.mimeType || '',
      fileSize: docData.fileSize || 0,
      webViewLink: docData.webViewLink || '',
      uploadedAt: new Date().toISOString(),
      status: 'مرفوع'
    };

    memoryCache.documents.push(doc);
    await appendSheetRow('Employee_Documents', mapObjectToRow(SCHEMAS.Employee_Documents, doc));
    return doc;
  });
}

// ------------------------------------
// User Operations
// ------------------------------------
async function getUsers() {
  await initDb();
  return memoryCache.users;
}

async function getUserByUsername(username) {
  await initDb();
  const clean = String(username).trim().toLowerCase();
  return memoryCache.users.find(u => String(u.username).trim().toLowerCase() === clean);
}

async function saveUser(userData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const user = {
      id: userData.id || `USR-${Date.now()}`,
      username: userData.username || '',
      passwordHash: userData.passwordHash || '',
      name: userData.name || '',
      role: userData.role || 'Supervisor',
      status: userData.status || 'نشط',
      allowedRegions: userData.allowedRegions || 'ALL',
      allowedProjects: userData.allowedProjects || 'ALL',
      createdAt: new Date().toISOString()
    };

    memoryCache.users.push(user);
    await appendSheetRow('Users', mapObjectToRow(SCHEMAS.Users, user));
    return user;
  });
}

async function updateUser(id, updateData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const idx = memoryCache.users.findIndex(u => String(u.id) === String(id));
    if (idx === -1) return null;

    const updated = {
      ...memoryCache.users[idx],
      ...updateData
    };

    memoryCache.users[idx] = updated;
    await appendSheetRow('Users', mapObjectToRow(SCHEMAS.Users, updated));
    return updated;
  });
}

// ------------------------------------
// Notifications & Activity Operations
// ------------------------------------
async function getNotifications() {
  await initDb();
  return memoryCache.notifications;
}

async function addNotification(notifData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const notif = {
      id: notifData.id || `NTF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: notifData.type || 'INFO',
      title: notifData.title || 'إشعار جديد',
      message: notifData.message || '',
      targetRole: notifData.targetRole || 'ALL',
      employeeId: notifData.employeeId || '',
      read: 'false',
      timestamp: new Date().toISOString()
    };

    memoryCache.notifications.unshift(notif);
    await appendSheetRow('Notifications', mapObjectToRow(SCHEMAS.Notifications, notif));
    return notif;
  });
}

async function markNotificationRead(id) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const item = memoryCache.notifications.find(n => String(n.id) === String(id));
    if (item) {
      item.read = 'true';
      await appendSheetRow('Notifications', mapObjectToRow(SCHEMAS.Notifications, item));
    }
    return item;
  });
}

async function getActivityLogs() {
  await initDb();
  return memoryCache.activityLogs;
}

async function addActivityLog(logData) {
  return dbWriteMutex.runExclusive(async () => {
    await initDb();
    const log = {
      id: logData.id || `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userId: logData.userId || 'SYSTEM',
      userName: logData.userName || 'النظام',
      employeeId: logData.employeeId || '',
      action: logData.action || 'نشاط',
      details: logData.details || '',
      timestamp: new Date().toISOString(),
      source: logData.source || 'WEB'
    };

    memoryCache.activityLogs.unshift(log);
    await appendSheetRow('Activity_Log', mapObjectToRow(SCHEMAS.Activity_Log, log));
    return log;
  });
}

module.exports = {
  initDb,
  queryEmployees,
  getEmployees,
  getEmployeeById,
  getEmployeeByIqama,
  saveEmployee,
  updateEmployee,
  getDocuments,
  getDocumentsByEmployeeId,
  saveDocument,
  getUsers,
  getUserByUsername,
  saveUser,
  updateUser,
  getNotifications,
  addNotification,
  markNotificationRead,
  getActivityLogs,
  addActivityLog
};
