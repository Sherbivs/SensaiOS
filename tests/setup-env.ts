if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://placeholder.invalid/test-db';
}

if (!process.env.RENDER_DB_INTERNAL_URL) {
  process.env.RENDER_DB_INTERNAL_URL = 'postgres://internal.invalid/test-db';
}

if (!process.env.PRISMA_SKIP_INITIAL_CONNECT) {
  process.env.PRISMA_SKIP_INITIAL_CONNECT = 'true';
}
