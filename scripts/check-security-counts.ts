import { prisma } from "../src/shared/prisma.js";

async function checkCounts() {
  try {
    const roleCount = await prisma.roleChangeAudit.count();
    const baselineCount = await prisma.securityBaseline.count();
    
    console.log(`\n✅ Current database state:`);
    console.log(`   Role Changes: ${roleCount}`);
    console.log(`   Baselines: ${baselineCount}\n`);
    
  } catch (error) {
    console.error("❌ Query failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCounts();
