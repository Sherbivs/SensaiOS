import { prisma } from "../src/shared/prisma.js";
import { printInfo, printSuccess, printError } from "../src/utils/output-formatter.js";

async function testInsert() {
  try {
    printInfo('Testing RoleChangeAudit insert...');
    
    const test = await prisma.roleChangeAudit.create({
      data: {
        guildId: "TEST",
        guildName: "Test Guild",
        memberId: "M1",
        memberTag: "M1#0001",
        changeType: "addition",
        roleId: "R1",
        roleName: "TestRole",
        executorId: "SYSTEM",
        executorTag: "SYSTEM#0000",
        executorRoles: [],
        authorized: true,
        reverted: false,
        origin: "test",
        checksum: "abc123",
      },
    });
    
    printSuccess(`Insert successful: ${JSON.stringify(test)}`);
    
    // Clean up test record
    await prisma.roleChangeAudit.delete({ where: { id: test.id } });
    printSuccess('Test record deleted');
    
  } catch (error) {
    printError(`Insert failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await prisma.$disconnect();
  }
}

testInsert();
