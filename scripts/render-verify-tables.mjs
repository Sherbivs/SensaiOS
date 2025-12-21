// Verify Error Learning tables exist
import { prisma } from "/opt/render/project/src/dist/shared/prisma.js";

try {
  console.log("=== Error Learning Tables Check ===");
  
  const [ek, er, ed, ec] = await Promise.all([
    prisma.errorKnowledge.count(),
    prisma.errorResolution.count(),
    prisma.errorDependency.count(),
    prisma.errorCodeContext.count()
  ]);
  
  console.log("✅ ErrorKnowledge:", ek);
  console.log("✅ ErrorResolution:", er);
  console.log("✅ ErrorDependency:", ed);
  console.log("✅ ErrorCodeContext:", ec);
  console.log("\n✅ All Error Learning tables exist!");
  
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await prisma.$disconnect();
}
