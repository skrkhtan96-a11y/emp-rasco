const https = require('https');

function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Health Check ---');
  const health = await makeRequest('https://hr.eissa.site/api/health');
  console.log('Health:', health);

  console.log('\n--- Employees List ---');
  const employeesRes = await makeRequest('https://hr.eissa.site/api/employees?limit=100');
  console.log('Total Employees:', employeesRes.totalCount);
  console.log('Sample Employees:', employeesRes.data ? employeesRes.data.slice(0, 5) : employeesRes);

  console.log('\n--- Verify Iqama 2516571086 ---');
  const verify1 = await makeRequest('https://hr.eissa.site/api/portal/verify-iqama', 'POST', { iqamaNumber: '2516571086' });
  console.log('Verify 2516571086:', verify1);

  console.log('\n--- Verify Iqama 2383840655 ---');
  const verify2 = await makeRequest('https://hr.eissa.site/api/portal/verify-iqama', 'POST', { iqamaNumber: '2383840655' });
  console.log('Verify 2383840655:', verify2);
}

run().catch(console.error);
