const XLSX = require('./node_modules/xlsx');
const fs   = require('fs');
const path = require('path');

// Find the exact file
const dirs = ['C:\\Users\\TWc\\Downloads','C:\\Users\\TWc\\Desktop','C:\\Users\\TWc\\Documents'];
let found = null;
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.includes('Employees List') || f.includes('employees list')) {
      found = path.join(d, f);
      break;
    }
  }
  if (found) break;
}

if (!found) {
  // fallback: check all dirs for ManPower sheet
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.xlsx') && !f.endsWith('.xls')) continue;
      try {
        const wb = XLSX.readFile(path.join(d,f));
        if (wb.SheetNames.includes('ManPower')) {
          found = path.join(d, f);
          break;
        }
      } catch(e) {}
    }
    if (found) break;
  }
}

if (!found) { console.log('FILE NOT FOUND'); process.exit(1); }
console.log('FILE:', found);

const wb  = XLSX.readFile(found);
const ws  = wb.Sheets['ManPower'];
const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

const headers    = raw[0].map(h => String(h||'').trim());
const locIdx     = headers.indexOf('Location');
const projIdx    = headers.indexOf('Project_Name');
const nameIdx    = headers.indexOf('Name');
const empIdx     = headers.indexOf('EMP');
const idIdx      = headers.indexOf('ID_Number');
const seqIdx     = headers.indexOf('#');

console.log('Headers:', JSON.stringify(headers));
console.log('Location col index:', locIdx);
console.log('Project col index:', projIdx);
console.log('Name col index:', nameIdx);
console.log('EMP col index:', empIdx);
console.log('ID_Number col index:', idIdx);

// Build full employee list JSON
const employees = [];
const regMap    = {};   // loc -> { projects: Set, count }
const projMap   = {};   // proj -> count

for (let i = 1; i < raw.length; i++) {
  const row = raw[i];
  const loc  = String(row[locIdx]  || '').trim();
  const proj = String(row[projIdx] || '').trim();
  const name = String(row[nameIdx] || '').trim();
  const emp  = String(row[empIdx]  || '').trim();
  const id   = String(row[idIdx]   || '').trim();
  const seq  = String(row[seqIdx]  || '').trim();

  if (!name && !emp && !id) continue; // skip empty rows

  employees.push({ seq, name, empNo: emp, idNumber: id, project: proj, location: loc });

  if (loc) {
    if (!regMap[loc]) regMap[loc] = { count: 0, projects: new Set() };
    regMap[loc].count++;
    if (proj) regMap[loc].projects.add(proj);
  }
  if (proj) projMap[proj] = (projMap[proj] || 0) + 1;
}

console.log('\nTOTAL EMPLOYEE ROWS:', employees.length);

const regions = Object.keys(regMap).sort();
console.log('\nACTUAL REGIONS FROM EXCEL (' + regions.length + '):');
regions.forEach((r,i) => {
  const projs = Array.from(regMap[r].projects).sort();
  console.log(`  ${i+1}. '${r}' (${regMap[r].count} emps) -> [${projs.join(', ')}]`);
});

const projects = Object.keys(projMap).sort();
console.log('\nALL PROJECTS FROM EXCEL (' + projects.length + '):');
projects.forEach((p,i) => console.log(`  ${i+1}. '${p}' (${projMap[p]} emps)`));

// Emit JSON for use in app
const output = {
  file: path.basename(found),
  sheet: 'ManPower',
  headers: { location: 'Location', project: 'Project_Name', name: 'Name', empNo: 'EMP', idNumber: 'ID_Number' },
  totalRows: employees.length,
  regions: regions.map(r => ({ id: r, count: regMap[r].count, projects: Array.from(regMap[r].projects).sort() })),
  projects: projects.map(p => ({ name: p, count: projMap[p] })),
  sample: employees.slice(0, 5)
};

fs.writeFileSync('excel_structure.json', JSON.stringify(output, null, 2));
console.log('\nSaved to excel_structure.json');
