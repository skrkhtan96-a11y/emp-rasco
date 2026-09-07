const XLSX = require('./node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const downloadsDir = 'C:\\Users\\TWc\\Downloads';
const files = fs.readdirSync(downloadsDir)
  .filter(f => f.endsWith('.xlsx'))
  .map(f => ({ name: f, size: fs.statSync(path.join(downloadsDir, f)).size, path: path.join(downloadsDir, f) }))
  .sort((a, b) => b.size - a.size);

console.log('=== XLSX FILES (largest first) ===');
files.slice(0, 6).forEach(f => console.log(`  ${f.size.toLocaleString()} bytes  ${f.name}`));
console.log('\n');

// Inspect top 3
for (const f of files.slice(0, 3)) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`FILE: ${f.name}  (${f.size.toLocaleString()} bytes)`);
  console.log('='.repeat(70));

  try {
    const wb = XLSX.readFile(f.path, { sheetStubs: false, cellDates: false });
    console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
      const totalRows = range.e.r - range.s.r + 1;
      const totalCols = range.e.c - range.s.c + 1;

      console.log(`\n  Sheet: '${sheetName}'  rows=${totalRows}  cols=${totalCols}`);

      // Read all data
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length === 0) { console.log('  (empty)'); continue; }

      const headers = data[0].map(h => String(h || '').trim());
      console.log(`  Headers: ${JSON.stringify(headers.slice(0, 20))}`);

      if (data.length <= 2) { console.log('  (no data rows)'); continue; }

      // Show first 3 data rows
      for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
        console.log(`  Row ${i+1}: ${JSON.stringify(data[i].slice(0, 12))}`);
      }

      if (totalRows < 50) continue;

      console.log(`\n  *** EMPLOYEES SHEET DETECTED (${totalRows} rows) ***`);

      // Detect columns
      let locCol = -1, projCol = -1, nameCol = -1, empNoCol = -1, empIdCol = -1;

      headers.forEach((h, i) => {
        const lh = h.toLowerCase();
        if (locCol === -1 && (lh.includes('location') || lh.includes('region') || lh === 'loc')) locCol = i;
        if (projCol === -1 && (lh.includes('project') || lh === 'proj')) projCol = i;
        if (nameCol === -1 && (lh.includes('name') || lh.includes('full name') || lh.includes('employee name'))) nameCol = i;
        if (empNoCol === -1 && (lh.includes('emp no') || lh.includes('emp#') || lh.includes('employee no') || lh === 'emp' || lh.includes('employee number'))) empNoCol = i;
        if (empIdCol === -1 && (lh.includes('id') || lh.includes('emp id')) && !lh.includes('name')) empIdCol = i;
      });

      console.log(`\n  COLUMN DETECTION:`);
      console.log(`  Location/Region column: [${locCol}] '${headers[locCol] || 'NOT FOUND'}'`);
      console.log(`  Project column:         [${projCol}] '${headers[projCol] || 'NOT FOUND'}'`);
      console.log(`  Employee Name column:   [${nameCol}] '${headers[nameCol] || 'NOT FOUND'}'`);
      console.log(`  Employee No column:     [${empNoCol}] '${headers[empNoCol] || 'NOT FOUND'}'`);
      console.log(`  Employee ID column:     [${empIdCol}] '${headers[empIdCol] || 'NOT FOUND'}'`);

      // Extract distinct regions & projects
      const locationCounts = {};
      const projectsByLocation = {};
      const allProjects = new Set();
      let dataRows = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const loc = locCol >= 0 ? String(row[locCol] || '').trim() : '';
        const proj = projCol >= 0 ? String(row[projCol] || '').trim() : '';

        if (!loc && !proj) continue; // skip empty rows
        dataRows++;

        if (loc) {
          locationCounts[loc] = (locationCounts[loc] || 0) + 1;
          if (proj) {
            if (!projectsByLocation[loc]) projectsByLocation[loc] = {};
            projectsByLocation[loc][proj] = (projectsByLocation[loc][proj] || 0) + 1;
            allProjects.add(proj);
          }
        }
      }

      console.log(`\n  TOTAL DATA ROWS: ${dataRows}`);

      const sortedLocs = Object.keys(locationCounts).sort();
      console.log(`\n  ACTUAL REGIONS FROM EXCEL (${sortedLocs.length}):`);
      sortedLocs.forEach((loc, idx) => {
        const projCount = Object.keys(projectsByLocation[loc] || {}).length;
        console.log(`    ${idx+1}. '${loc}'  (${locationCounts[loc]} employees, ${projCount} projects)`);
      });

      console.log(`\n  REGION → PROJECTS MAPPING:`);
      sortedLocs.forEach(loc => {
        const projs = Object.keys(projectsByLocation[loc] || {}).sort();
        console.log(`    '${loc}' (${locationCounts[loc]} emps) → [${projs.map(p => `'${p}'`).join(', ')}]`);
      });

      const allProjList = Array.from(allProjects).sort();
      console.log(`\n  ALL DISTINCT PROJECTS FROM EXCEL (${allProjList.length}):`);
      allProjList.forEach((p, i) => console.log(`    ${i+1}. '${p}'`));
    }
  } catch(e) {
    console.log(`  ERROR reading file: ${e.message}`);
  }
}

console.log('\n=== DONE ===');
