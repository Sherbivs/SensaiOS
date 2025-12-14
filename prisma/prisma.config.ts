import { defineConfig } from '@prisma/client/runtime/wasm.js';

export default defineConfig({
  // Production database (Render-managed PostgreSQL)
  datasourceUrl: process.env.PROD_DATABASE_URL,
  
  // Optional: Configure connection pooling
  // datasources: {
  //   db: {
  //     url: process.env.PROD_DATABASE_URL,
  //   },
  // },
});
