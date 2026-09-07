/**
 * clean_app.js — removes the leftover old duplicate block from app.js
 * The duplicate block starts at the first orphaned `allRows.push({` after
 * the new confirmExcelImport closing brace, and ends just before
 * "// Template Preserving Export Engine\nfunction exportDataToOfficialExcel()"
 */
const fs = require('fs');
const filePath = 'C:\\Users\\TWc\\.gemini\\antigravity\\scratch\\employee-doc-system\\web\\app.js';

let src = fs.readFileSync(filePath, 'utf8');
const originalLen = src.length;

// The old block is everything between these two markers:
// Marker 1 (end of new confirmExcelImport):
const START_MARKER = "  switchView('employees');\n}\n\n\n// Template Preserving Export Engine\n\n";
// Marker 2 (start of the real export function):
const END_MARKER   = "// Template Preserving Export Engine\nfunction exportDataToOfficialExcel()";

const start = src.indexOf(START_MARKER);
const end   = src.indexOf(END_MARKER);

console.log('start marker at:', start);
console.log('end marker at:  ', end);

if (start !== -1 && end !== -1 && end > start) {
  // Replace everything between start and end with just the end marker
  const before = src.slice(0, start + "  switchView('employees');\n}\n\n".length);
  const after  = src.slice(end);
  src = before + after;
  console.log(`Removed ${originalLen - src.length} bytes of duplicate code`);
  fs.writeFileSync(filePath, src, 'utf8');
  console.log('Done. File saved.');
} else {
  // Try to find the problem area and show it
  const confirmEnd = src.lastIndexOf("  switchView('employees');\n}");
  console.log('Last switchView confirmEnd at:', confirmEnd);
  
  // Show what's around that area
  if (confirmEnd > 0) {
    console.log('\n--- Context around confirmEnd ---');
    console.log(src.slice(confirmEnd - 50, confirmEnd + 500));
  }
}
