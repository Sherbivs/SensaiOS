/**
 * Vitest Configuration for Database Integration Tests
 * 
 * This configuration is used exclusively for database integration tests.
 * It uses a different setup file (setup-database.ts) that:
 * - Loads real database credentials
 * - Detects local vs cloud environment
 * - Enables Prisma connections (no PRISMA_SKIP_INITIAL_CONNECT)
 * 
 * Usage: npm run test:database
 * 
 * Environment Variables:
 * - IG_ENVIRONMENT=local  → Use ONPREMISE-DEV-PRIMARY
 * - IG_ENVIRONMENT=cloud  → Use PROD_DATABASE_URL
 * - Not set               → Auto-detect based on available variables
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use database-specific setup instead of global setup-env.ts
    setupFiles: ['tests/setup-database.ts'],
    
    // Only include database integration test files
    include: [
      'tests/homestead-database-security.spec.ts',
      'tests/**/*.database.spec.ts',
      'tests/**/*.integration.spec.ts',
    ],
    
    // Increase timeout for database operations
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // Run tests sequentially to avoid database conflicts
    sequence: {
      concurrent: false,
    },
    
    // Reporter configuration
    reporters: ['verbose'],
  },
});
