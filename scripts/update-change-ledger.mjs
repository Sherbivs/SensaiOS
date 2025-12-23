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

const collectCommitDetails = (limit) => {
  const commitList = exec(`git rev-list --max-count=${limit} HEAD`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return commitList.map((commit) => {
    const shortSha = exec(`git rev-parse --short ${commit}`);
    const author = exec(`git show -s --format=%an ${commit}`);
    const date = exec(`git show -s --format=%ad --date=format:%Y-%m-%d ${commit}`);
    const rawSubject = exec(`git show -s --format=%s ${commit}`).replace(/\|/g, "\\|");
    const subjectLimit = 160;
    const subject = rawSubject.length > subjectLimit ? `${rawSubject.slice(0, subjectLimit - 1)}…` : rawSubject;

    const filesRaw = safeExec(`git show --name-only --pretty="" ${commit}`);
    const files = filesRaw
      ? filesRaw
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map(normalizePath)
          .filter((file) => !/\.min\./.test(file))
      : [];

    const maxFiles = 5;
    const displayed = files.slice(0, maxFiles).map((file) => `\`${file}\``);
    const extraCount = files.length > maxFiles ? files.length - maxFiles : 0;
    const filesSummary = files.length
      ? `${displayed.join(", ")}${extraCount ? `, +${extraCount} more` : ""}`
      : "(no file changes detected)";

    return {
      shortSha,
      author,
      date,
      subject,
      filesSummary,
    };
  });
};

const renderLedger = (entries, { timestamp, branch, note } = {}) => {
  const lines = [""];
  lines.push(`**Generated:** ${timestamp}  |  **Branch:** ${branch}`);
  if (note) {
    lines.push(`**Note:** ${note}`);
  }
  lines.push("");

  for (const entry of entries) {
    lines.push(`- **${entry.shortSha}** — ${entry.date} — ${entry.author} — _logic intent:_ ${entry.subject}`);
    lines.push(`  Files: ${entry.filesSummary}`);
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

const MAX_COMMITS = 200;
const SUMMARY_COMMITS = 10;
const commitDetails = collectCommitDetails(MAX_COMMITS);

const timestamp = new Date().toISOString().replace(/\..+Z$/, "Z");
const branch = exec("git rev-parse --abbrev-ref HEAD");

const fullLedger = renderLedger(commitDetails, { timestamp, branch });
const summaryLedger = renderLedger(commitDetails.slice(0, SUMMARY_COMMITS), {
  timestamp,
  branch,
  note: "Full 200-entry ledger lives in ops/change-ledger.md",
});

const shouldPrintOnly = process.argv.includes("--print") || process.env.LEDGER_PRINT === "1";

if (shouldPrintOnly) {
  console.log(fullLedger);
} else {
  updatePromptLedger(summaryLedger);
  writeFileSync("ops/change-ledger.md", `# Recent Change Ledger (200 commits)\n\n${fullLedger}`);
  console.log("Ledger updated in Prompt.md and ops/change-ledger.md.");
}
