#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LEDGER_BEGIN = "<!-- LEDGER:BEGIN -->";
const LEDGER_END = "<!-- LEDGER:END -->";

const exec = (command) => {
  try {
    return execSync(command, { encoding: "utf8" }).trimEnd();
  } catch (error) {
    throw new Error(`Failed running command: ${command}\n${error.message}`);
  }
};

const safeExec = (command) => {
  try {
    return execSync(command, { encoding: "utf8" }).trimEnd();
  } catch (error) {
    return "";
  }
};

const normalizePath = (filePath) => {
  if (!filePath) return filePath;
  const arrowMatch = filePath.match(/^(.*)(?: -> | => )(.*)$/);
  if (arrowMatch) {
    return arrowMatch[2];
  }

  const braceMatch = filePath.match(/^(.*)\{([^{}]+) => ([^{}]+)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, , newName, suffix] = braceMatch;
    return `${prefix}${newName}${suffix}`;
  }

  return filePath;
};

const getLedgerLines = () => {
  const commitList = exec("git rev-list --max-count=200 HEAD")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const timestamp = new Date().toISOString().replace(/\..+Z$/, "Z");
  const branch = exec("git rev-parse --abbrev-ref HEAD");

  const lines = [""];
  lines.push(`**Generated:** ${timestamp}  |  **Branch:** ${branch}`);
  lines.push("");

  for (const commit of commitList) {
    const shortSha = exec(`git rev-parse --short ${commit}`);
    const author = exec(`git show -s --format=%an ${commit}`);
    const date = exec(`git show -s --format=%ad --date=format:%Y-%m-%d ${commit}`);
    const subject = exec(`git show -s --format=%s ${commit}`).replace(/\|/g, "\\|");

    lines.push(`- **${shortSha}** — ${date} — ${author} — _logic intent:_ ${subject}`);

    const filesRaw = safeExec(`git show --name-only --pretty="" ${commit}`);
    if (!filesRaw) continue;

    const files = filesRaw
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(normalizePath);

    for (const file of files) {
      if (/\.min\./.test(file)) continue;

      const hunksRaw = safeExec(`git show --unified=0 ${commit} -- "${file}"`);
      if (!hunksRaw) {
        lines.push(`  - \`${file}\``);
        continue;
      }

      const ranges = hunksRaw
        .split("\n")
        .filter((line) => line.startsWith("@@ "))
        .map((line) => {
          const match = line.match(/\+([0-9]+)(,[0-9]+)?/);
          return match ? `+${match[1]}${match[2] ?? ""}` : "";
        })
        .filter(Boolean)
        .join(" ");

      if (ranges) {
        lines.push(`  - \`${file}\` — ~lines: ${ranges}`);
      } else {
        lines.push(`  - \`${file}\``);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
};

const updatePromptLedger = (ledgerSection) => {
  const promptPath = "Prompt.md";
  const promptContent = readFileSync(promptPath, "utf8");

  if (!promptContent.includes(LEDGER_BEGIN) || !promptContent.includes(LEDGER_END)) {
    throw new Error("Prompt.md is missing ledger markers.");
  }

  const replacementBlock = `${LEDGER_BEGIN}\n${ledgerSection}\n${LEDGER_END}`;
  const ledgerRegex = new RegExp(`${LEDGER_BEGIN}[\\s\\S]*?${LEDGER_END}`);
  const updatedPrompt = promptContent.replace(ledgerRegex, replacementBlock);

  writeFileSync(promptPath, updatedPrompt);
};

const ledgerBlock = getLedgerLines();
updatePromptLedger(ledgerBlock);

console.log("Ledger updated in Prompt.md.");
