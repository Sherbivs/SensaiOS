// List all tables in the database
import { prisma as p } from "/opt/render/project/src/dist/shared/prisma.js";

const tables = await p.$queryRaw`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name
`;

console.log("=== Database Tables ===");
for (const t of tables) {
  console.log(`  - ${t.table_name}`);
}

await p.$disconnect();
