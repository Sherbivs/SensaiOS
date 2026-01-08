#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "render.yaml");

async function main() {
  let raw;
  try {
    raw = await readFile(repoRoot, "utf8");
  } catch (err) {
    console.error("guard_render: unable to read render.yaml", err);
    process.exit(1);
  }

  const services = parseServices(raw);
  const issues = [];

  for (const service of services) {
    if (!service || typeof service !== "object") continue;
    const type = service.type;
    if (type !== "web" && type !== "worker") continue;
    const name = service.name || "<unnamed service>";
    const envVars = Array.isArray(service.envVars) ? service.envVars : [];
    const dbVar = envVars.find((entry) => entry?.key === "DATABASE_URL");
    if (!dbVar) {
      issues.push(`Service "${name}" is missing envVars entry for DATABASE_URL.`);
      continue;
    }
    const fromDatabase = dbVar.fromDatabase;
    if (!fromDatabase || typeof fromDatabase !== "object") {
      issues.push(`Service "${name}" must map DATABASE_URL using fromDatabase.connectionString.`);
      continue;
    }
    if (fromDatabase.property !== "connectionString") {
      issues.push(
        `Service "${name}" should set fromDatabase.property to "connectionString" (found "${fromDatabase.property ?? "unknown"}").`
      );
    }
  }

  if (issues.length > 0) {
    console.log("[HALT] Render configuration guard did not pass:\n" + issues.map((msg) => ` - ${msg}`).join("\n"));
    console.log(
      "Hint: Render's fromDatabase.connectionString exposes the private-network URL for services on the same Render account."
    );
    process.exit(1);
  }
}

function parseServices(yaml) {
  const lines = yaml.split(/\r?\n/);
  const services = [];
  let current = null;
  let inEnvVars = false;
  let currentEnv = null;
  let inFromDatabase = false;

  const readValue = (text) => {
    const [, valueRaw = ""] = text.split(/:\s*/);
    return valueRaw.replace(/^"/, "").replace(/"$/, "").trim();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.match(/^\s*/)[0].length;

    if (indent === 2 && trimmed.startsWith("- type:")) {
      current = { type: readValue(trimmed), envVars: [], name: undefined };
      services.push(current);
      inEnvVars = false;
      currentEnv = null;
      inFromDatabase = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (indent === 4 && trimmed.startsWith("name:")) {
      current.name = readValue(trimmed);
      continue;
    }

    if (indent === 4 && trimmed === "envVars:") {
      inEnvVars = true;
      currentEnv = null;
      inFromDatabase = false;
      continue;
    }

    if (inEnvVars && indent === 6 && trimmed.startsWith("- key:")) {
      currentEnv = { key: readValue(trimmed) };
      current.envVars.push(currentEnv);
      inFromDatabase = false;
      continue;
    }

    if (inEnvVars && indent === 8 && trimmed === "fromDatabase:") {
      inFromDatabase = true;
      continue;
    }

    if (inEnvVars && inFromDatabase && indent === 10 && trimmed.startsWith("property:")) {
      if (currentEnv) {
        currentEnv.property = readValue(trimmed);
      }
      continue;
    }

    if (indent <= 4) {
      inEnvVars = false;
      currentEnv = null;
      inFromDatabase = false;
    }
  }

  return services;
}

await main();
