/**
 * inspect_localstorage.js
 * Reads localStorage data from the browser storage files
 * to find actual imported employee data structure
 */
const XLSX = require('./node_modules/xlsx');
const fs = require('fs');
const path = require('path');

// Search for ALL xlsx files in all common locations
const searchPaths = [
  'C:\\Users\\TWc\\Downloads',
  'C:\\Users\\TWc\\Desktop',
  'C:\\Users\\TWc\\Documents',
  'C:\\Users\\TWc\\OneDrive',
  'C:\\Users\\TWc',
  'C:\\Users\\TWc\\AppData\\Roaming',
];

console.log('=== SEARCHING FOR EMPLOYEE XLSX FILES ===\n');

let allXlsx = [];
for (const searchDir of searchPaths) {
  try {
    if (!fs.existsSync(searchDir)) continue;
    const scan = (dir, depth) => {
      if (depth > 3) return;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && depth < 2) {
              scan(fullPath, depth + 1);
            } else if (item.toLowerCase().endsWith('.xlsx') || item.toLowerCase().endsWith('.xls')) {
              allXlsx.push({ path: fullPath, size: stat.size, name: item, mtime: stat.mtime });
            }
          } catch(e) {}
        }
      } catch(e) {}
    };
    scan(searchDir, 0);
  } catch(e) {}
}

allXlsx.sort((a, b) => b.size - a.size);

console.log(`Found ${allXlsx.length} xlsx files:`);
allXlsx.forEach(f => console.log(`  ${f.size.toLocaleString().padStart(10)} bytes  ${f.path}`));

// Now inspect each file > 10KB for employee data
console.log('\n=== INSPECTING FILES > 10KB FOR EMPLOYEE DATA ===\n');

const candidateKeywords = ['location', 'project', 'emp', 'employee', 'name', 'iqama', 'iqamma', 'passport', 'موظف', 'مشروع', 'منطقة'];

for (const f of allXlsx.filter(f => f.size > 10000)) {
  try {
    const wb = XLSX.readFile(f.path, { sheetStubs: false });
    
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws['!ref']) continue;
      
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 10) continue;
      
      const headers = data[0].map(h => String(h || '').trim().toLowerCase());
      const headerStr = headers.join(' ');
      
      // Check if this looks like employees list
      const matchScore = candidateKeywords.filter(k => headerStr.includes(k)).length;
      if (matchScore < 2) continue;
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✓ EMPLOYEE FILE CANDIDATE: ${f.name}  (${f.size.toLocaleString()} bytes)`);
      console.log(`  Sheet: '${sheetName}'  rows=${data.length}  match_score=${matchScore}`);
      
      const origHeaders = data[0].map(h => String(h || '').trim());
      console.log(`  ALL HEADERS: ${JSON.stringify(origHeaders)}`);
      console.log(`  Sample Row 2: ${JSON.stringify(data[1] ? data[1].slice(0, 10) : [])}`);
      console.log(`  Sample Row 3: ${JSON.stringify(data[2] ? data[2].slice(0, 10) : [])}`);
      
      // Detect key columns
      let locCol = -1, projCol = -1, nameCol = -1, empNoCol = -1;
      origHeaders.forEach((h, i) => {
        const lh = h.toLowerCase();
        if (locCol === -1 && (lh === 'location' || lh === 'loc' || lh.includes('region'))) locCol = i;
        if (projCol === -1 && (lh.includes('project') || lh === 'proj')) projCol = i;
        if (nameCol === -1 && (lh.includes('name') || lh === 'full name')) nameCol = i;
        if (empNoCol === -1 && (lh === 'emp' || lh === 'emp no' || lh.includes('employee no') || lh.includes('emp#'))) empNoCol = i;
      });
      
      console.log(`\n  Location col: [${locCol}] '${origHeaders[locCol] || 'NOT FOUND'}'`);
      console.log(`  Project col:  [${projCol}] '${origHeaders[projCol] || 'NOT FOUND'}'`);
      console.log(`  Name col:     [${nameCol}] '${origHeaders[nameCol] || 'NOT FOUND'}'`);
      console.log(`  EmpNo col:    [${empNoCol}] '${origHeaders[empNoCol] || 'NOT FOUND'}'`);
      
      // Extract distinct values
      if (locCol >= 0 || projCol >= 0) {
        const locs = {}, projs = {}, locProj = {};
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const loc = locCol >= 0 ? String(row[locCol] || '').trim() : '';
          const proj = projCol >= 0 ? String(row[projCol] || '').trim() : '';
          if (loc) {
            locs[loc] = (locs[loc] || 0) + 1;
            if (proj) {
              if (!locProj[loc]) locProj[loc] = {};
              locProj[loc][proj] = (locProj[loc][proj] || 0) + 1;
              projs[proj] = (projs[proj] || 0) + 1;
            }
          }
        }
        
        const sortedLocs = Object.keys(locs).sort();
        console.log(`\n  ACTUAL REGIONS FROM EXCEL (${sortedLocs.length}):`);
        sortedLocs.forEach((loc, i) => {
          const projs = Object.keys(locProj[loc] || {}).sort();
          console.log(`    ${i+1}. '${loc}'  (${locs[loc]} emps, ${projs.length} projects)`);
          projs.forEach(p => console.log(`       → '${p}' (${locProj[loc][p]})`));
        });
        
        console.log(`\n  ALL PROJECTS (${Object.keys(projs).length}):`);
        Object.keys(projs).sort().forEach((p, i) => console.log(`    ${i+1}. '${p}' (${projs[p]} emps)`));
      }
    }
  } catch(e) {
    // skip unreadable files
  }
}

console.log('\n=== DONE ===');
