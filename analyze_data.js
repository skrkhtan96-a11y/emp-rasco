const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = 'C:\\Users\\TWc\\Desktop\\نسخة من Employees List.xlsx';
const workbook = XLSX.readFile(filePath);

let totalRows = 0;
let allEmployees = [];
let duplicatesEmpNo = [];
let duplicatesIqama = [];
let missingFields = { name: 0, idNumber: 0, empNo: 0, projectName: 0, location: 0 };
let projectsSet = new Set();
let locationsSet = new Set();

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  rows.forEach((row, index) => {
    totalRows++;
    
    // Clean string values (remove newlines, extra spaces)
    const empNo = String(row['EMP'] || '').trim();
    const name = String(row['Name'] || '').replace(/[\r\n]+/g, ' ').trim();
    const idNumber = String(row['ID_Number'] || '').replace(/[\r\n]+/g, '').trim();
    const projectName = String(row['Project_Name'] || '').replace(/[\r\n]+/g, ' ').trim();
    const location = String(row['Location'] || '').replace(/[\r\n]+/g, ' ').trim();
    
    if (!name) missingFields.name++;
    if (!idNumber) missingFields.idNumber++;
    if (!empNo) missingFields.empNo++;
    if (!projectName) missingFields.projectName++;
    if (!location) missingFields.location++;
    
    if (projectName) projectsSet.add(projectName);
    if (location) locationsSet.add(location);

    allEmployees.push({
      sheet: sheetName,
      rowNum: index + 2,
      empNo,
      name,
      idNumber,
      projectName,
      location,
      raw: row
    });
  });
});

console.log('=== DATA ANALYSIS SUMMARY ===');
console.log(`Total Sheets: ${workbook.SheetNames.length}`);
console.log(`Total Rows (Records): ${totalRows}`);
console.log(`Unique Projects (${projectsSet.size}):`, Array.from(projectsSet).slice(0, 15));
console.log(`Unique Locations (${locationsSet.size}):`, Array.from(locationsSet));

console.log('\nMissing Fields Count:');
console.log(missingFields);

// Check Duplicate EMP numbers
const empMap = {};
const iqamaMap = {};

allEmployees.forEach(emp => {
  if (emp.empNo) {
    if (!empMap[emp.empNo]) empMap[emp.empNo] = [];
    empMap[emp.empNo].push(emp);
  }
  if (emp.idNumber) {
    if (!iqamaMap[emp.idNumber]) iqamaMap[emp.idNumber] = [];
    iqamaMap[emp.idNumber].push(emp);
  }
});

const dupEmpNo = Object.keys(empMap).filter(k => empMap[k].length > 1);
const dupIqama = Object.keys(iqamaMap).filter(k => iqamaMap[k].length > 1);

console.log(`\nDuplicate Employee Numbers (Count: ${dupEmpNo.length}):`);
dupEmpNo.slice(0, 5).forEach(k => {
  console.log(`  EMP ${k}:`, empMap[k].map(e => `${e.name} (${e.sheet}, row ${e.rowNum})`));
});

console.log(`\nDuplicate Iqama Numbers (Count: ${dupIqama.length}):`);
dupIqama.slice(0, 5).forEach(k => {
  console.log(`  Iqama ${k}:`, iqamaMap[k].map(e => `${e.name} (${e.sheet}, row ${e.rowNum})`));
});
