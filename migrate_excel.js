const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = 'C:\\Users\\TWc\\Desktop\\نسخة من Employees List.xlsx';

if (!fs.existsSync(filePath)) {
  console.error('Source Excel file not found:', filePath);
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
let rawEmployees = [];

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  rows.forEach((r, idx) => {
    const empNo = String(r['EMP'] || '').trim();
    const name = String(r['Name'] || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const idNumber = String(r['ID_Number'] || '').replace(/[\r\n]+/g, '').trim();
    const projectName = String(r['Project_Name'] || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'General';
    const location = String(r['Location'] || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'RUH';

    rawEmployees.push({
      originalSheet: sheetName,
      excelRowIndex: idx + 2,
      empNo,
      name,
      idNumber,
      projectName,
      location
    });
  });
});

console.log(`Extracted ${rawEmployees.length} raw records from Excel.`);

// Defined Regions Map
const regionsMap = {
  'REG-01': { Region_ID: 'REG-01', Region_Name_AR: 'المنطقة الوسطى (الرياض)', Region_Name_EN: 'Central Region (Riyadh)', Status: 'Active' },
  'REG-02': { Region_ID: 'REG-02', Region_Name_AR: 'المنطقة الغربية (جدة ومكة والمدينة)', Region_Name_EN: 'Western Region (Jeddah & Madinah)', Status: 'Active' },
  'REG-03': { Region_ID: 'REG-03', Region_Name_AR: 'المنطقة الشرقية (الخبر والدمام)', Region_Name_EN: 'Eastern Region (Khobar & Dammam)', Status: 'Active' },
  'REG-04': { Region_ID: 'REG-04', Region_Name_AR: 'المنطقة الجنوبية (أبها وعسير وجازان)', Region_Name_EN: 'Southern Region (Abha & Jizan)', Status: 'Active' },
  'REG-05': { Region_ID: 'REG-05', Region_Name_AR: 'منطقة القصيم (بريدة وعنيزة)', Region_Name_EN: 'Qassim Region (Buraidah)', Status: 'Active' },
  'REG-06': { Region_ID: 'REG-06', Region_Name_AR: 'المنطقة الشمالية (حائل وتبوك والجوف)', Region_Name_EN: 'Northern Region (Hail & Tabuk)', Status: 'Active' }
};

function getRegionByLocation(loc) {
  const upper = (loc || '').toUpperCase();
  if (upper.includes('JED') || upper.includes('MAK') || upper.includes('MED') || upper.includes('MAD') || upper.includes('YNB') || upper.includes('YANBAE')) {
    return regionsMap['REG-02'];
  }
  if (upper.includes('KHOBAR') || upper.includes('DAM') || upper.includes('DMM') || upper.includes('DHAHRAN') || upper.includes('HSA') || upper.includes('HAS') || upper.includes('HFOF')) {
    return regionsMap['REG-03'];
  }
  if (upper.includes('ABHA') || upper.includes('AHB') || upper.includes('GIZ') || upper.includes('MHL') || upper.includes('SQR') || upper.includes('NAJ') || upper.includes('ALBAHA')) {
    return regionsMap['REG-04'];
  }
  if (upper.includes('QSM') || upper.includes('BRD') || upper.includes('UNZ') || upper.includes('RASS') || upper.includes('MZH')) {
    return regionsMap['REG-05'];
  }
  if (upper.includes('HAIL') || upper.includes('ALJUAF') || upper.includes('ARAR') || upper.includes('TBK') || upper.includes('TUU') || upper.includes('SKA')) {
    return regionsMap['REG-06'];
  }
  return regionsMap['REG-01'];
}

// Collect Unique Projects with Region Mapping
const projectsMap = {};
let prjCounter = 1;

rawEmployees.forEach(emp => {
  const reg = getRegionByLocation(emp.location);
  if (!projectsMap[emp.projectName]) {
    const prjId = `PRJ-${String(prjCounter++).padStart(3, '0')}`;
    projectsMap[emp.projectName] = {
      Project_ID: prjId,
      Project_Name: emp.projectName,
      Region_ID: reg.Region_ID,
      Region_Name: reg.Region_Name_AR,
      Project_Manager: 'مشرف المشروع',
      Manager_Email: 'pm@rassco.com.sa',
      Location: emp.location,
      Total_Employees: 0,
      Created_At: new Date().toISOString()
    };
  }
  projectsMap[emp.projectName].Total_Employees++;
});

const projectsList = Object.values(projectsMap);

// Process & Deduplicate Employees
const employeesMap = {};
let empCounter = 10001;
let sysNoCounter = 1;

rawEmployees.forEach(raw => {
  const dedupKey = raw.idNumber || raw.empNo || raw.name;
  
  let empNum = raw.empNo;
  if (!empNum || empNum === 'OutSource') {
    empNum = `SYS-${String(sysNoCounter++).padStart(4, '0')}`;
  }

  const projectInfo = projectsMap[raw.projectName] || { Project_ID: 'PRJ-001', Project_Name: raw.projectName, Region_ID: 'REG-01', Region_Name: 'المنطقة الوسطى (الرياض)' };
  const reg = getRegionByLocation(raw.location);

  if (!employeesMap[dedupKey]) {
    const empId = String(empCounter++);
    
    employeesMap[dedupKey] = {
      Employee_ID: empId,
      Employee_Number: empNum,
      Employee_Name: raw.name || 'موظف بدون اسم',
      Nationality: 'سعودي / مقيم',
      Job_Title: raw.originalSheet,
      Region_ID: reg.Region_ID,
      Region_Name: reg.Region_Name_AR,
      Project_ID: projectInfo.Project_ID,
      Project_Name: raw.projectName,
      Project_Manager: projectInfo.Project_Manager,
      Mobile_Number: '',
      Iqama_Number: raw.idNumber,
      Iqama_Expiry_Date: '',
      Passport_Number: '',
      Passport_Expiry_Date: '',
      Driving_License_Available: 'No',
      Driving_License_Number: '',
      Driving_License_Expiry_Date: '',
      Forklift_License_Available: 'No',
      Forklift_License_Number: '',
      Forklift_License_Expiry_Date: '',
      Employee_Status: 'Active',
      Filling_Status: 'Not Started', // Phase 2: Filling status
      Profile_Completion_Percentage: 25,
      Missing_Documents: 'بيانات الإقامة, بيانات الجواز',
      First_Filled_By_ID: '',
      First_Filled_By_Name: '',
      First_Filled_At: '',
      Last_Updated_By_ID: '',
      Last_Updated_By_Name: '',
      Last_Updated_At: '',
      Completed_By_ID: '',
      Completed_By_Name: '',
      Completed_At: '',
      Created_At: new Date().toISOString(),
      Created_By: 'System Migration',
      Updated_At: new Date().toISOString(),
      Updated_By: 'System Migration'
    };
  }
});

const finalEmployees = Object.values(employeesMap);

console.log(`Cleaned & Processed ${finalEmployees.length} unique employee records.`);
console.log(`Created ${projectsList.length} unique project records mapped to 6 Regions.`);

// Create Seed Users
const seedUsers = [
  {
    User_ID: 'USR-001',
    Full_Name: 'المدير العام (RASSCO Admin)',
    Email: 'admin@rassco.com.sa',
    Password_Hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', // admin123
    Role: 'Super Admin',
    Status: 'Active',
    Last_Login: new Date().toISOString(),
    Last_Activity: new Date().toISOString(),
    Created_At: new Date().toISOString()
  },
  {
    User_ID: 'USR-002',
    Full_Name: 'مدير الموارد البشرية (HR Manager)',
    Email: 'hr@rassco.com.sa',
    Password_Hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    Role: 'HR Admin',
    Status: 'Active',
    Last_Login: new Date().toISOString(),
    Last_Activity: new Date().toISOString(),
    Created_At: new Date().toISOString()
  },
  {
    User_ID: 'USR-003',
    Full_Name: 'مشرف منطقة القصيم (أحمد علي)',
    Email: 'sup.qassim@rassco.com.sa',
    Password_Hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    Role: 'Regional Supervisor',
    Status: 'Active',
    Last_Login: new Date().toISOString(),
    Last_Activity: new Date().toISOString(),
    Created_At: new Date().toISOString()
  },
  {
    User_ID: 'USR-004',
    Full_Name: 'مدير مشروع النمر (محمد صالح)',
    Email: 'pm.nemer@rassco.com.sa',
    Password_Hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    Role: 'Project Manager',
    Status: 'Active',
    Last_Login: new Date().toISOString(),
    Last_Activity: new Date().toISOString(),
    Created_At: new Date().toISOString()
  }
];

// Create Seed User_Access Mapping (Multi-Region / Multi-Project Access)
const seedUserAccess = [
  { Access_ID: 'ACC-001', User_ID: 'USR-001', Region_ID: 'ALL', Region_Name: 'جميع المناطق', Project_ID: 'ALL', Project_Name: 'جميع المشاريع', Access_Level: 'Full', Status: 'Active' },
  { Access_ID: 'ACC-002', User_ID: 'USR-002', Region_ID: 'ALL', Region_Name: 'جميع المناطق', Project_ID: 'ALL', Project_Name: 'جميع المشاريع', Access_Level: 'Full', Status: 'Active' },
  { Access_ID: 'ACC-003', User_ID: 'USR-003', Region_ID: 'REG-05', Region_Name: 'منطقة القصيم (بريدة وعنيزة)', Project_ID: 'ALL', Project_Name: 'مشاريع القصيم', Access_Level: 'Supervisor', Status: 'Active' },
  { Access_ID: 'ACC-004', User_ID: 'USR-004', Region_ID: 'REG-01', Region_Name: 'المنطقة الوسطى (الرياض)', Project_ID: projectsMap['Al Nemer'] ? projectsMap['Al Nemer'].Project_ID : 'PRJ-001', Project_Name: 'Al Nemer', Access_Level: 'Supervisor', Status: 'Active' }
];

// Create Seed Activity Log
const seedActivityLogs = [
  {
    Activity_ID: 'ACT-001',
    Timestamp: new Date().toISOString(),
    User_ID: 'USR-001',
    User_Name: 'المدير العام (RASSCO Admin)',
    User_Email: 'admin@rassco.com.sa',
    Role: 'Super Admin',
    Region_ID: 'ALL',
    Project_ID: 'ALL',
    Employee_ID: '',
    Employee_Name: '',
    Activity_Type: 'Excel Imported',
    Is_Productive: true,
    Entity_Type: 'System',
    Entity_ID: 'MIGRATION-01',
    Details: 'تم استيراد وتنظيف 1,529 موظفاً و 45 مشروعاً و 6 مناطق بالكامل'
  }
];

// Save JSON seed files
const seedDir = path.join(__dirname, 'seed');
if (!fs.existsSync(seedDir)) {
  fs.mkdirSync(seedDir, { recursive: true });
}

fs.writeFileSync(path.join(seedDir, 'regions.json'), JSON.stringify(Object.values(regionsMap), null, 2), 'utf8');
fs.writeFileSync(path.join(seedDir, 'employees.json'), JSON.stringify(finalEmployees, null, 2), 'utf8');
fs.writeFileSync(path.join(seedDir, 'projects.json'), JSON.stringify(projectsList, null, 2), 'utf8');
fs.writeFileSync(path.join(seedDir, 'users.json'), JSON.stringify(seedUsers, null, 2), 'utf8');
fs.writeFileSync(path.join(seedDir, 'user_access.json'), JSON.stringify(seedUserAccess, null, 2), 'utf8');
fs.writeFileSync(path.join(seedDir, 'activity_logs.json'), JSON.stringify(seedActivityLogs, null, 2), 'utf8');

console.log('Successfully saved Phase 2 updated seed files (including user_access & activity_logs) to:', seedDir);
