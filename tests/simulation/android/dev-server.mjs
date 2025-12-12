#!/usr/bin/env node

/**
 * Development API Server for Android Test App
 * 
 * This server runs on your local machine and allows the Android app
 * to communicate with the Infinity Gauntlet backend during testing.
 */

import http from 'http';
import { networkInterfaces } from 'os';

const PORT = 3000;
const HOSTNAME = '0.0.0.0'; // Listen on all interfaces

// Get local IP addresses
function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ interface: name, address: net.address });
      }
    }
  }
  
  return results;
}

// Simple in-memory storage for test data
const testResults = [];
const sessionData = new Map();
let requestCount = 0;

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// CORS headers for Android app
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Request handler
async function handleRequest(req, res) {
  requestCount++;
  
  const timestamp = new Date().toISOString();
  const logPrefix = `[${timestamp}] ${req.method} ${req.url}`;
  
  console.log(`\x1b[36m${logPrefix}\x1b[0m`);
  
  setCorsHeaders(res);
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  try {
    // API Routes
    if (path === '/api/health') {
      // Health check
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        uptime: process.uptime(),
        requests: requestCount,
        timestamp: new Date().toISOString()
      }));
      
    } else if (path === '/api/config') {
      // Get app configuration
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        apiVersion: '1.0.0',
        features: {
          starterSelection: true,
          wildEncounters: true,
          battleSystem: true,
          homesteadChannels: true
        },
        testMode: true,
        serverTime: new Date().toISOString()
      }));
      
    } else if (path === '/api/session' && req.method === 'POST') {
      // Create new test session
      const body = await parseBody(req);
      const sessionId = `session_${Date.now()}`;
      
      sessionData.set(sessionId, {
        id: sessionId,
        deviceInfo: body.deviceInfo || {},
        startTime: new Date().toISOString(),
        status: 'active'
      });
      
      console.log(`  \x1b[32m✓ Created session: ${sessionId}\x1b[0m`);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sessionId,
        message: 'Session created successfully'
      }));
      
    } else if (path.startsWith('/api/session/') && req.method === 'GET') {
      // Get session info
      const sessionId = path.split('/')[3];
      const session = sessionData.get(sessionId);
      
      if (session) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
      }
      
    } else if (path === '/api/test-result' && req.method === 'POST') {
      // Submit test result
      const body = await parseBody(req);
      const result = {
        id: `result_${Date.now()}`,
        ...body,
        receivedAt: new Date().toISOString()
      };
      
      testResults.push(result);
      
      console.log(`  \x1b[32m✓ Test result received: ${body.testName || 'unnamed'}\x1b[0m`);
      console.log(`    Status: ${body.status || 'unknown'}`);
      
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resultId: result.id,
        message: 'Test result recorded'
      }));
      
    } else if (path === '/api/test-results' && req.method === 'GET') {
      // Get all test results
      const sessionId = url.searchParams.get('session');
      let results = testResults;
      
      if (sessionId) {
        results = testResults.filter(r => r.sessionId === sessionId);
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        total: results.length,
        results: results
      }));
      
    } else if (path === '/api/command' && req.method === 'POST') {
      // Execute bot command (simulation)
      const body = await parseBody(req);
      const { command, channel, userId } = body;
      
      console.log(`  \x1b[33m⚡ Command: ${command} (channel: ${channel})\x1b[0m`);
      
      // Simulate command response
      let response = {
        success: true,
        command,
        channel,
        response: null
      };
      
      switch (command) {
        case '/starter':
          response.response = {
            type: 'starter_selection',
            message: 'Choose your starter Pokémon!',
            options: ['Bulbasaur', 'Charmander', 'Squirtle']
          };
          break;
          
        case '/home':
          response.response = {
            type: 'home_screen',
            message: 'Welcome home, Trainer!',
            party: []
          };
          break;
          
        case '/walk':
          response.response = {
            type: 'wild_encounter',
            message: 'A wild Pokémon appeared!',
            pokemon: {
              name: 'Pidgey',
              level: 5
            }
          };
          break;
          
        case '/heal':
          response.response = {
            type: 'heal_complete',
            message: 'Your Pokémon are fully healed!',
            healedCount: 3
          };
          break;
          
        case '/battle':
          response.response = {
            type: 'battle_start',
            message: 'A battle has begun!',
            opponent: 'Youngster Joey'
          };
          break;
          
        default:
          response.success = false;
          response.error = 'Unknown command';
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      
    } else if (path === '/api/stats' && req.method === 'GET') {
      // Get server statistics
      const passedTests = testResults.filter(r => r.status === 'passed').length;
      const failedTests = testResults.filter(r => r.status === 'failed').length;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uptime: process.uptime(),
        totalRequests: requestCount,
        activeSessions: sessionData.size,
        testResults: {
          total: testResults.length,
          passed: passedTests,
          failed: failedTests,
          passRate: testResults.length > 0 ? (passedTests / testResults.length * 100).toFixed(2) : 0
        }
      }));
      
    } else {
      // 404 - Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not Found',
        path: path,
        availableEndpoints: [
          'GET /api/health',
          'GET /api/config',
          'POST /api/session',
          'GET /api/session/:id',
          'POST /api/test-result',
          'GET /api/test-results',
          'POST /api/command',
          'GET /api/stats'
        ]
      }));
    }
    
  } catch (error) {
    console.error(`  \x1b[31m✗ Error: ${error.message}\x1b[0m`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  }
}

// Create HTTP server
const server = http.createServer(handleRequest);

// Start server
server.listen(PORT, HOSTNAME, () => {
  const ips = getLocalIPs();
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 Infinity Gauntlet Dev Server - RUNNING                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('\x1b[36m📍 Server Addresses:\x1b[0m');
  console.log(`   Local:    http://localhost:${PORT}`);
  
  for (const ip of ips) {
    console.log(`   Network:  http://${ip.address}:${PORT} (${ip.interface})`);
  }
  
  console.log('\n\x1b[33m🔗 Android App Configuration:\x1b[0m');
  if (ips.length > 0) {
    console.log(`   Base URL: http://${ips[0].address}:${PORT}/api`);
    console.log(`   Use this IP in your Android app's network configuration`);
  }
  
  console.log('\n\x1b[36m📡 Available Endpoints:\x1b[0m');
  console.log('   GET  /api/health        - Health check');
  console.log('   GET  /api/config        - App configuration');
  console.log('   POST /api/session       - Create test session');
  console.log('   GET  /api/session/:id   - Get session info');
  console.log('   POST /api/test-result   - Submit test result');
  console.log('   GET  /api/test-results  - Get all results');
  console.log('   POST /api/command       - Execute bot command');
  console.log('   GET  /api/stats         - Server statistics');
  
  console.log('\n\x1b[32m✓ Ready to accept connections from Android app\x1b[0m');
  console.log('\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n\x1b[33m⚠ Shutting down server...\x1b[0m');
  server.close(() => {
    console.log('\x1b[32m✓ Server stopped\x1b[0m');
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Total Requests: ${requestCount}`);
    console.log(`   Test Results: ${testResults.length}`);
    console.log(`   Sessions: ${sessionData.size}`);
    process.exit(0);
  });
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n\x1b[31m✗ Port ${PORT} is already in use\x1b[0m`);
    console.log('  Try stopping other applications or use a different port\n');
  } else {
    console.error(`\n\x1b[31m✗ Server error: ${err.message}\x1b[0m\n`);
  }
  process.exit(1);
});
