import { prisma } from "../src/shared/prisma.js";
import { printSuccess, printError, formatKeyValueList } from "../src/utils/output-formatter.js";

async function checkCounts() {
  try {
    const roleCount = await prisma.roleChangeAudit.count();
    const baselineCount = await prisma.securityBaseline.count();
    
    printSuccess('Current database state:');
    console.log(formatKeyValueList([
      ['Role Changes', String(roleCount)],
      ['Baselines', String(baselineCount)],
    ]));
    
  } catch (error) {
    printError(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await prisma.$disconnect();
  }
}

checkCounts();
