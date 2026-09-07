const XLSX = require('./node_modules/xlsx');
const fs   = require('fs');
const path = require('path');

// Find the file (Desktop first)
const dirs = ['C:\\Users\\TWc\\Desktop','C:\\Users\\TWc\\Downloads','C:\\Users\\TWc\\Documents'];
let found = null;
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    const fp = path.join(d, f);
    try {
      const wb = XLSX.readFile(fp, { bookSheets: true });
      if (wb.SheetNames && wb.SheetNames.includes('ManPower')) { found = fp; break; }
    } catch(e) {}
  }
  if (found) break;
}

if (!found) { console.log('FILE NOT FOUND'); process.exit(1); }
console.log('FILE:', found, '\n');

const wb = XLSX.readFile(found);
console.log('ALL SHEETS (' + wb.SheetNames.length + '):', JSON.stringify(wb.SheetNames));
console.log('\n' + '='.repeat(70));

for (const sheetName of wb.SheetNames) {
  const ws   = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const rows  = range.e.r - range.s.r + 1;
  const cols  = range.e.c - range.s.c + 1;

  console.log(`\nSHEET: "${sheetName}"  (${rows} rows × ${cols} cols)`);

  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length === 0) { console.log('  (empty)'); continue; }

  const headers = data[0].map(h => String(h || '').trim());
  console.log('  HEADERS:', JSON.stringify(headers));

  // Show first 3 data rows
  for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
    console.log(`  ROW ${i+1}:`, JSON.stringify(data[i].slice(0, 12).map(c => String(c||'').trim())));
  }

  // If big sheet, show distinct values for key columns
  if (rows > 20) {
    // Detect location/project columns
    const lh = headers.map(h => h.toLowerCase());
    const locIdx  = lh.findIndex(h => h === 'location' || h === 'loc' || h.includes('region'));
    const projIdx = lh.findIndex(h => h.includes('project') || h === 'proj');
    const nameIdx = lh.findIndex(h => h === 'name' || h.includes('emp name') || h.includes('employee name'));

    if (locIdx >= 0 || projIdx >= 0) {
      const locs = {}, projs = {}, locProj = {};
      let dataRows = 0;
      for (let i = 1; i < data.length; i++) {
        const row  = data[i];
        const loc  = locIdx  >= 0 ? String(row[locIdx]  || '').trim() : '';
        const proj = projIdx >= 0 ? String(row[projIdx] || '').trim() : '';
        const name = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
        if (!loc && !proj && !name) continue;
        dataRows++;
        if (loc)  { locs[loc]  = (locs[loc]  || 0) + 1; }
        if (proj) { projs[proj] = (projs[proj] || 0) + 1; }
        if (loc && proj) {
          if (!locProj[loc]) locProj[loc] = {};
          locProj[loc][proj] = (locProj[loc][proj] || 0) + 1;
        }
      }
      console.log(`  DATA ROWS: ${dataRows}`);
      if (locIdx  >= 0) {
        const sortedLocs = Object.keys(locs).sort();
        console.log(`  DISTINCT LOCATIONS (${sortedLocs.length}):`, JSON.stringify(sortedLocs));
        sortedLocs.forEach(loc => {
          const ps = Object.keys(locProj[loc] || {}).sort();
          if (ps.length) console.log(`    '${loc}' (${locs[loc]}) → [${ps.join(', ')}]`);
        });
      }
      if (projIdx >= 0) {
        const sortedProjs = Object.keys(projs).sort();
        console.log(`  DISTINCT PROJECTS (${sortedProjs.length}):`, JSON.stringify(sortedProjs));
      }
    }
  }
  console.log('-'.repeat(70));
}
console.log('\n=== DONE ===');
