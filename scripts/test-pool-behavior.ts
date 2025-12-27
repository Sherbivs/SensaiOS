#!/usr/bin/env tsx
/**
 * Test Pool Behavior - Diagnose Connection Closure
 * 
 * This script tests the pg.Pool behavior to understand why
 * connections are closing prematurely.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment
const envPath = join(__dirname, "../secrets/Infinity-Gauntlet.env");
const envContents = readFileSync(envPath, "utf-8");
for (const line of envContents.split("\n")) {
  const match = line.match(/^PROD_DATABASE_URL=(.+)$/);
  if (match) {
    process.env.PROD_DATABASE_URL = match[1].trim();
  }
}

const databaseUrl = process.env.PROD_DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ PROD_DATABASE_URL not found");
  process.exit(1);
}

console.log("\n" + "═".repeat(63));
console.log("  Pool Behavior Test");
console.log("═".repeat(63) + "\n");

// Create pool with EXACT settings from prisma.ts + explicit SSL
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 20,
  min: 2,
  idleTimeoutMillis: 300_000,       // 5 minutes
  connectionTimeoutMillis: 30_000,  // 30 seconds
  statement_timeout: 60_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: false,
  // SSL configuration (Render requires SSL)
  ssl: {
    rejectUnauthorized: false, // Render uses self-signed certs
  },
});

// Pool event listeners
pool.on('error', (err, client) => {
  console.error('❌ Pool error:', err.message);
  console.error('   Client:', client ? 'present' : 'none');
});

pool.on('connect', (client) => {
  console.log('✅ Pool: new client connected');
});

pool.on('acquire', (client) => {
  console.log('📥 Pool: client acquired from pool');
});

pool.on('remove', (client) => {
  console.log('🗑️  Pool: client removed from pool');
});

async function testPoolBehavior() {
  try {
    console.log("📊 Testing pool behavior...\n");

    // Test 1: Simple query
    console.log("Test 1: Simple COUNT query");
    const result1 = await pool.query("SELECT COUNT(*) FROM role_change_audit;");
    console.log(`  ✅ Result: ${result1.rows[0].count} rows`);
    console.log(`  📊 Pool: totalCount=${pool.totalCount}, idleCount=${pool.idleCount}, waitingCount=${pool.waitingCount}\n`);

    // Wait 2 seconds (simulate idle time between operations)
    console.log("⏳ Waiting 2 seconds (simulate idle time)...\n");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Another query
    console.log("Test 2: Second COUNT query");
    const result2 = await pool.query("SELECT COUNT(*) FROM security_baselines;");
    console.log(`  ✅ Result: ${result2.rows[0].count} rows`);
    console.log(`  📊 Pool: totalCount=${pool.totalCount}, idleCount=${pool.idleCount}, waitingCount=${pool.waitingCount}\n`);

    // Wait 5 seconds
    console.log("⏳ Waiting 5 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test 3: Query after longer idle
    console.log("Test 3: Query after 5s idle");
    const result3 = await pool.query("SELECT 1 as test;");
    console.log(`  ✅ Result: ${result3.rows[0].test}`);
    console.log(`  📊 Pool: totalCount=${pool.totalCount}, idleCount=${pool.idleCount}, waitingCount=${pool.waitingCount}\n`);

    // Test 4: Multiple sequential queries (simulate batch migration)
    console.log("Test 4: Simulating batch migration (5 queries)");
    for (let i = 1; i <= 5; i++) {
      const result = await pool.query("SELECT $1 as batch_num;", [i]);
      console.log(`  Batch ${i}: ${result.rows[0].batch_num} ✅`);
      console.log(`    Pool: totalCount=${pool.totalCount}, idleCount=${pool.idleCount}`);
      // Wait 500ms between batches (simulate processing time)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("\n✅ All tests passed! Pool is stable.\n");
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    console.error("   Code:", error.code);
    console.error("   Stack:", error.stack);
    console.error(`   Pool state: totalCount=${pool.totalCount}, idleCount=${pool.idleCount}\n`);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("🔌 Pool closed\n");
  }
}

testPoolBehavior();
