const fs = require('fs');
const path = require('path');

const webHtml = fs.readFileSync('web/index.html', 'utf8');
const webCss = fs.readFileSync('web/styles.css', 'utf8');
const webJs = fs.readFileSync('web/app.js', 'utf8');

let distHtml = webHtml.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + webCss + '\n</style>');
distHtml = distHtml.replace('<script src="app.js"></script>', '<script>\n' + webJs + '\n</script>');

if (!fs.existsSync('dist_apps_script')) {
  fs.mkdirSync('dist_apps_script');
}
fs.writeFileSync('dist_apps_script/index.html', distHtml);

const gasFiles = fs.readdirSync('gas');
gasFiles.forEach(f => {
  fs.copyFileSync(path.join('gas', f), path.join('dist_apps_script', f));
});

console.log('✓ Successfully generated dist_apps_script bundle with index.html + ' + gasFiles.length + ' GS files.');
