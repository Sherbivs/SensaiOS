#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const docTargets = [
  "AGENTS.md",
  "README.md",
  "docs/ai-env-setup.md",
  "docs/db-control-suite.md",
  "ops/DB_BOOTSTRAP.md",
  "masterroutetable.md"
];

const checks = [
  {
    description: "reference Key/Dev/.env",
    pattern: /Key\/Dev\/\.env/
  },
  {
    description: "reference Key/Prod/.env",
    pattern: /Key\/Prod\/\.env/
  },
  {
    description: "include npx prisma generate guidance",
    pattern: /npx prisma generate/
  }
];

async function main() {
  const failures = [];

  for (const relative of docTargets) {
    const fullPath = path.join(repoRoot, relative);
    let contents;

    try {
      contents = await readFile(fullPath, "utf8");
    } catch (error) {
      failures.push(`${relative}: unable to read file (${error.message})`);
      continue;
    }

    for (const check of checks) {
      if (!check.pattern.test(contents)) {
        failures.push(`${relative}: missing ${check.description}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("DB connection documentation guard failed:");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }

  console.log("✅ DB connection docs mention Key/Dev, Key/Prod, and Prisma regenerate guidance consistently.");
}

await main().catch((error) => {
  console.error("DB connection documentation guard encountered an unexpected error:", error);
  process.exit(1);
});
