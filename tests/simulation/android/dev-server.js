/**
 * Development Server for Android App Callbacks
 * Receives test results, logs, and status updates from the Android simulation app
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const LOG_DIR = path.join(__dirname, 'logs');
const RESULTS_DIR = path.join(__dirname, 'test-results');

// Create directories if they don't exist
[LOG_DIR, RESULTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Get network interfaces
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  
  return ips;
}

// Log storage
const logs = [];
const testResults = [];

// Request handler
const server = http.createServer((req, res) => {
  // Enable CORS for Android app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  
  // Handle different endpoints
  if (req.url === '/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      message: 'Dev server is running',
      timestamp,
      serverIP: getNetworkIPs()[0]?.address
    }));
  }
  
  else if (req.url === '/log' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const logEntry = JSON.parse(body);
        logEntry.receivedAt = timestamp;
        logs.push(logEntry);
        
        // Write to file
        const logFile = path.join(LOG_DIR, `android-app-${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        
        console.log(`  📝 Log: [${logEntry.level}] ${logEntry.message}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'logged' }));
      } catch (err) {
        console.error('  ❌ Error parsing log:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }
  
  else if (req.url === '/test-result' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const result = JSON.parse(body);
        result.receivedAt = timestamp;
        testResults.push(result);
        
        // Write to file
        const resultFile = path.join(RESULTS_DIR, `test-${result.testId || Date.now()}.json`);
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
        
        console.log(`  🧪 Test Result: ${result.testName} - ${result.status} (${result.duration}ms)`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'recorded', resultId: result.testId }));
      } catch (err) {
        console.error('  ❌ Error parsing test result:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }
  
  else if (req.url === '/test-batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const batch = JSON.parse(body);
        batch.receivedAt = timestamp;
        
        // Write batch to file
        const batchFile = path.join(RESULTS_DIR, `batch-${batch.batchId || Date.now()}.json`);
        fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2));
        
        console.log(`  📦 Test Batch: ${batch.tests?.length || 0} tests, ${batch.passed || 0} passed, ${batch.failed || 0} failed`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'recorded', batchId: batch.batchId }));
      } catch (err) {
        console.error('  ❌ Error parsing test batch:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }
  
  else if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      logsReceived: logs.length,
      testsReceived: testResults.length,
      uptime: process.uptime(),
      timestamp
    }));
  }
  
  else if (req.url === '/dashboard' && req.method === 'GET') {
    // Simple HTML dashboard
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Infinity Gauntlet - Dev Server Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      padding: 20px;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 30px; font-size: 2.5em; }
    .card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 15px;
      padding: 20px;
      margin-bottom: 20px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat { 
      background: rgba(255,255,255,0.05);
      padding: 15px;
      border-radius: 10px;
      text-align: center;
    }
    .stat-value { font-size: 2em; font-weight: bold; }
    .stat-label { opacity: 0.8; margin-top: 5px; }
    .log-entry {
      background: rgba(0,0,0,0.3);
      padding: 10px;
      margin: 5px 0;
      border-radius: 5px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .level-info { border-left: 3px solid #4CAF50; }
    .level-warn { border-left: 3px solid #FF9800; }
    .level-error { border-left: 3px solid #F44336; }
    .refresh-btn {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1em;
    }
    .refresh-btn:hover { background: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 Infinity Gauntlet Dev Server</h1>
    
    <div class="card">
      <h2>📊 Statistics</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value" id="logs-count">${logs.length}</div>
          <div class="stat-label">Logs Received</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="tests-count">${testResults.length}</div>
          <div class="stat-label">Tests Completed</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="uptime">${Math.floor(process.uptime())}s</div>
          <div class="stat-label">Uptime</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>📝 Recent Logs <button class="refresh-btn" onclick="location.reload()">Refresh</button></h2>
      <div id="logs">
        ${logs.slice(-10).reverse().map(log => `
          <div class="log-entry level-${log.level || 'info'}">
            <strong>[${log.timestamp || ''}]</strong> ${log.message || ''}
          </div>
        `).join('')}
        ${logs.length === 0 ? '<p style="opacity: 0.6; padding: 20px; text-align: center;">No logs yet. Waiting for Android app...</p>' : ''}
      </div>
    </div>
    
    <div class="card">
      <h2>🧪 Recent Test Results</h2>
      <div>
        ${testResults.slice(-5).reverse().map(test => `
          <div class="log-entry">
            <strong>${test.testName || 'Unknown Test'}</strong><br>
            Status: ${test.status || 'N/A'} | Duration: ${test.duration || 0}ms<br>
            <small>Received: ${test.receivedAt || ''}</small>
          </div>
        `).join('')}
        ${testResults.length === 0 ? '<p style="opacity: 0.6; padding: 20px; text-align: center;">No test results yet.</p>' : ''}
      </div>
    </div>
  </div>
  
  <script>
    // Auto-refresh every 5 seconds
    setTimeout(() => location.reload(), 5000);
  </script>
</body>
</html>
    `;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
  
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 Infinity Gauntlet Development Server                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const ips = getNetworkIPs();
  
  console.log('📡 Server listening on:');
  console.log(`   Local:   http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`   Network: http://${ip.address}:${PORT} (${ip.name})`);
  });
  
  console.log('\n📱 Configure Android app to use:');
  if (ips.length > 0) {
    console.log(`   BASE_URL = "http://${ips[0].address}:${PORT}"`);
  }
  
  console.log('\n🌐 Endpoints:');
  console.log('   GET  /ping          - Health check');
  console.log('   GET  /status        - Server status');
  console.log('   GET  /dashboard     - Web dashboard');
  console.log('   POST /log           - Receive app logs');
  console.log('   POST /test-result   - Receive test results');
  console.log('   POST /test-batch    - Receive test batch results');
  
  console.log('\n📂 Data storage:');
  console.log(`   Logs:    ${LOG_DIR}`);
  console.log(`   Results: ${RESULTS_DIR}`);
  
  console.log('\n✅ Server is ready! Open dashboard at:');
  console.log(`   http://localhost:${PORT}/dashboard\n`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Waiting for Android app connections...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down server...');
  console.log(`📊 Final stats: ${logs.length} logs, ${testResults.length} test results`);
  server.close(() => {
    console.log('✅ Server stopped\n');
    process.exit(0);
  });
});
