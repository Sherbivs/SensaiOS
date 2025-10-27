#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "src");
const repoBase = path.resolve(__dirname, "..", "..");

const prismaImportPattern = /from\s+["']@prisma\/client["']/;
const ensureImportPattern = /from\s+["'][^"']*env\/ensure-db-url(?:\.[jt]s)?["']/;

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (/\.(ts|tsx|js|jsx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeImports(contents) {
  const lines = contents.split(/\r?\n/);
  const imports = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("import")) return;
    imports.push({ line: trimmed, index });
  });
  return imports;
}

function firstNonCommentImport(imports) {
  return imports.find(({ line }) => !line.startsWith("import type"));
}

async function main() {
  let files = [];
  try {
    const rootStat = await stat(repoRoot);
    if (!rootStat.isDirectory()) {
      throw new Error("src directory missing");
    }
    files = await collectFiles(repoRoot);
  } catch (err) {
    console.error("require-ensure-db-preload: unable to traverse src/", err);
    process.exit(1);
  }

  const issues = [];

  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const imports = analyzeImports(contents);
    const ensureImport = imports.find(({ line }) => ensureImportPattern.test(line));
    const prismaImports = imports.filter(
      ({ line }) => prismaImportPattern.test(line) && !line.startsWith("import type")
    );
    const relPath = path.relative(repoBase, file);
    const normalized = relPath.split(path.sep).join("/");

    if (normalized === "src/models/index.ts") {
      const firstImport = firstNonCommentImport(imports);
      if (!firstImport || !ensureImportPattern.test(firstImport.line)) {
        issues.push(`${normalized}: must import env/ensure-db-url before any other runtime import.`);
      }
    }

    if (prismaImports.length > 0) {
      if (!ensureImport) {
        issues.push(`${normalized}: imports @prisma/client without importing env/ensure-db-url in the same module.`);
        continue;
      }
      const ensureIndex = imports.indexOf(ensureImport);
      const firstPrismaIndex = imports.indexOf(prismaImports[0]);
      if (ensureIndex === -1 || firstPrismaIndex === -1 || ensureIndex > firstPrismaIndex) {
        issues.push(`${normalized}: env/ensure-db-url import must appear before @prisma/client imports.`);
      }
    }
  }

  if (issues.length > 0) {
    console.error("Prisma preload guard failed:\n" + issues.map((msg) => ` - ${msg}`).join("\n"));
    process.exit(1);
  }
}

await main();
