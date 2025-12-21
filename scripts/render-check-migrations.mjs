// Check production migration status
import { prisma } from "/opt/render/project/src/dist/shared/prisma.js";

try {
  const migs = await prisma.$queryRaw`
    SELECT migration_name, finished_at 
    FROM _prisma_migrations 
    ORDER BY finished_at DESC 
    LIMIT 10
  `;
  
  console.log("=== Last 10 Migrations Applied ===");
  for (const m of migs) {
    const finished = m.finished_at ? m.finished_at.toISOString().slice(0,19) : 'PENDING';
    console.log(`  ${finished} | ${m.migration_name}`);
  }
  
  // Check if error_learning_phase1 is applied
  const errorLearning = migs.find(m => m.migration_name.includes('error_learning'));
  if (errorLearning) {
    console.log("\n✅ Error Learning migration IS applied");
  } else {
    console.log("\n❌ Error Learning migration NOT applied");
  }
  
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await prisma.$disconnect();
}
