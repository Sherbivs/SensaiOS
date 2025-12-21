// Database test script for Render
// Run: node /tmp/dbtest.mjs

// Use the existing Prisma client from the project
import { prisma as p } from "/opt/render/project/src/dist/shared/prisma.js";

// const p already initialized by the module

async function main() {
  console.log("=== Render Database Health Check ===\n");
  
  try {
    // Basic connectivity test
    const health = await p.$queryRaw`SELECT 1 as health, NOW() as timestamp`;
    console.log("✅ DB Connection: OK");
    console.log("   Timestamp:", health[0].timestamp);
    
    // Table counts
    const users = await p.user.count();
    console.log("\n📊 Table Counts:");
    console.log("   Users:", users);
    
    const species = await p.species.count();
    console.log("   Species:", species);
    
    const pokemonInstances = await p.pokemonInstance.count();
    console.log("   PokemonInstances:", pokemonInstances);
    
    const trainers = await p.trainer.count();
    console.log("   Trainers:", trainers);
    
    const errorLogs = await p.errorLog.count();
    console.log("   ErrorLogs:", errorLogs);
    
    // Check error learning tables (Phase 1 schema)
    console.log("\n📊 Error Learning Tables:");
    const errorResolutions = await p.errorResolution.count();
    console.log("   ErrorResolutions:", errorResolutions);
    
    const errorDependencies = await p.errorDependency.count();
    console.log("   ErrorDependencies:", errorDependencies);
    
    const errorKnowledge = await p.errorKnowledge.count();
    console.log("   ErrorKnowledge:", errorKnowledge);
    
    const errorCodeContext = await p.errorCodeContext.count();
    console.log("   ErrorCodeContext:", errorCodeContext);
    
    // Recent errors
    const recentErrors = await p.errorLog.findMany({
      take: 5,
      orderBy: { lastSeen: 'desc' },
      select: { errorId: true, errorName: true, severity: true, lastSeen: true, occurrenceCount: true }
    });
    
    if (recentErrors.length > 0) {
      console.log("\n📋 Recent Errors:");
      for (const err of recentErrors) {
        console.log(`   [${err.severity}] ${err.errorName} (x${err.occurrenceCount}) - ${err.lastSeen.toISOString()}`);
      }
    } else {
      console.log("\n📋 Recent Errors: None");
    }
    
    console.log("\n✅ All checks passed!");
    
  } catch (e) {
    console.error("❌ Error:", e.message);
    if (e.stack) console.error(e.stack);
  } finally {
    await p.$disconnect();
  }
}

main();
