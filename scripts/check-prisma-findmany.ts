import fs from 'node:fs';

// Load PROD_DATABASE_URL from secrets file (local) or use existing env var (Render)
console.log('Checking for PROD_DATABASE_URL...');
console.log('  Environment variable set:', !!process.env.PROD_DATABASE_URL);
console.log('  /etc/secrets/Infinity-Gauntlet.env exists:', fs.existsSync('/etc/secrets/Infinity-Gauntlet.env'));
console.log('  secrets/Infinity-Gauntlet.env exists:', fs.existsSync('secrets/Infinity-Gauntlet.env'));

if (!process.env.PROD_DATABASE_URL) {
  // Try Render secret file location first, then local
  const envFile = fs.existsSync('/etc/secrets/Infinity-Gauntlet.env')
    ? '/etc/secrets/Infinity-Gauntlet.env'
    : 'secrets/Infinity-Gauntlet.env';
  
  if (!fs.existsSync(envFile)) {
    console.error('❌ secrets file not found and PROD_DATABASE_URL not set');
    console.error('   Tried:', envFile);
    console.error('   Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')).join(', '));
    process.exit(1);
  }
  
  console.log('✅ Loading PROD_DATABASE_URL from:', envFile);
  const content = fs.readFileSync(envFile, 'utf8');
  const match = content.split(/\r?\n/).find((l) => l.startsWith('PROD_DATABASE_URL='));
  if (!match) {
    console.error('PROD_DATABASE_URL not found in secrets file');
    process.exit(1);
  }
  const prodUrl = match.split('=', 2)[1];
  process.env.PROD_DATABASE_URL = prodUrl;
} else {
  console.log('✅ Using PROD_DATABASE_URL from environment');
}

// Import prisma client
import('../src/shared/prisma.js')
  .then(({ prisma }) => {
    return prisma.errorLog.findMany({ take: 1 });
  })
  .then((rows) => {
    console.log('Query succeeded, rows:', rows.length);
    console.dir(rows, { depth: 2 });
    process.exit(0);
  })
  .catch((err) => {
    console.error('Prisma findMany error:');
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  });
