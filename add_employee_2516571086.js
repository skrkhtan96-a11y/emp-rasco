const https = require('https');

const employeeData = {
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
  portalStatus: 'في الانتظار'
};

const dataStr = JSON.stringify(employeeData);

const req = https.request({
  hostname: 'hr.eissa.site',
  port: 443,
  path: '/api/employees',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(dataStr)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Add Employee Response:', body);
  });
});

req.on('error', console.error);
req.write(dataStr);
req.end();
