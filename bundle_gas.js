const fs = require('fs');
const path = require('path');

const gasDir = path.join(__dirname, 'gas');
const webDir = path.join(__dirname, 'web');
const outputDir = path.join(__dirname, 'dist_apps_script');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy all .gs files
const gsFiles = fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'));
gsFiles.forEach(file => {
  const content = fs.readFileSync(path.join(gasDir, file), 'utf8');
  fs.writeFileSync(path.join(outputDir, file), content, 'utf8');
});

// Inline index.html with styles.css and app.js for Google Apps Script HTML output
const htmlContent = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(webDir, 'styles.css'), 'utf8');
const jsContent = fs.readFileSync(path.join(webDir, 'app.js'), 'utf8');

const combinedHtml = htmlContent
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${cssContent}\n</style>`)
  .replace('<script src="app.js"></script>', `<script>\n${jsContent}\n</script>`);

fs.writeFileSync(path.join(outputDir, 'index.html'), combinedHtml, 'utf8');

console.log('Successfully bundled Google Apps Script project into:', outputDir);
console.log('Files generated:');
fs.readdirSync(outputDir).forEach(f => console.log(' - ' + f));
