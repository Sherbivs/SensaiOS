import { prisma } from "../src/shared/prisma.js";

async function testInsert() {
  try {
    console.log("Testing RoleChangeAudit insert...");
    
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
    
    console.log("✅ Insert successful:", test);
    
    // Clean up test record
    await prisma.roleChangeAudit.delete({ where: { id: test.id } });
    console.log("✅ Test record deleted");
    
  } catch (error) {
    console.error("❌ Insert failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testInsert();
