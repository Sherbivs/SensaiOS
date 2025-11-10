import fs from 'node:fs';

// Load PROD_DATABASE_URL from secrets file
const envFile = 'secrets/Infinity-Gauntlet.env';
if (!fs.existsSync(envFile)) {
  console.error('secrets file not found:', envFile);
  process.exit(1);
}
const content = fs.readFileSync(envFile, 'utf8');
const match = content.split(/\r?\n/).find((l) => l.startsWith('PROD_DATABASE_URL='));
if (!match) {
  console.error('PROD_DATABASE_URL not found in secrets file');
  process.exit(1);
}
const prodUrl = match.split('=', 2)[1];
process.env.PROD_DATABASE_URL = prodUrl;

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
