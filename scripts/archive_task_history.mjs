#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const tasklistPath = path.join(repoRoot, 'Tasklist.md');
const archiveDir = path.join(repoRoot, 'ops', 'ARCHIVE');

const args = process.argv.slice(2);
const limitArgIndex = args.findIndex((arg) => arg === '--limit');
const limit = (() => {
  if (limitArgIndex !== -1 && args[limitArgIndex + 1]) {
    const parsed = Number.parseInt(args[limitArgIndex + 1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (process.env.TASKLIST_DONE_LIMIT) {
    const envParsed = Number.parseInt(process.env.TASKLIST_DONE_LIMIT, 10);
    if (!Number.isNaN(envParsed) && envParsed > 0) {
      return envParsed;
    }
  }
  return 100;
})();

const collateDependencies = (tasks) => {
  const referenced = new Set();
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      referenced.add(dep);
    }
  }
  return referenced;
};

const parseTasks = (content) => {
  const tasks = [];
  const taskRegex = /^- id: [\s\S]*?(?=(?:\n- id: )|\n## |\n$)/gm;
  let match;

  while ((match = taskRegex.exec(content)) !== null) {
    const rawBlock = match[0];
    let start = match.index;
    let end = start + rawBlock.length;

    // Include trailing blank lines so removal keeps Markdown tidy.
    while (end < content.length && content[end] === '\n') {
      end += 1;
    }

    const idMatch = rawBlock.match(/^- id:\s*(\S+)/m);
    const statusMatch = rawBlock.match(/status:\s*([A-Z_]+)/);
    const dependsMatch = rawBlock.match(/depends_on:\s*\[([^\]]*)\]/);

    const id = idMatch ? idMatch[1] : 'UNKNOWN';
    const status = statusMatch ? statusMatch[1] : 'UNKNOWN';
    const dependsOn = dependsMatch && dependsMatch[1].trim().length
      ? dependsMatch[1].split(',').map((token) => token.trim()).filter(Boolean)
      : [];

    tasks.push({ id, status, dependsOn, rawBlock, start, end });
  }

  return tasks;
};

const ensureArchiveDir = async () => {
  await fs.mkdir(archiveDir, { recursive: true });
};

const resolveArchivePath = async (dateStamp) => {
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0
      ? path.join(archiveDir, `tasks-${dateStamp}.md`)
      : path.join(archiveDir, `tasks-${dateStamp}-${String(suffix).padStart(2, '0')}.md`);

    try {
      await fs.access(candidate);
      suffix += 1;
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return candidate;
      }
      throw err;
    }
  }
};

const buildArchiveContent = (tasks, metadata) => {
  const header = [
    `# Task Archive — ${metadata.archiveDate}`,
    `Generated UTC: ${metadata.generatedUtc}`,
    `Source File: Tasklist.md`,
    `Limit Applied: ${metadata.limit}`,
    `Archived Count: ${tasks.length}`,
    '',
  ].join('\n');

  const body = tasks
    .map((task) => task.rawBlock.trimEnd())
    .join('\n\n---\n\n');

  return `${header}${body}\n`;
};

const removeTaskBlocks = (content, removals) => {
  if (removals.length === 0) {
    return content;
  }

  const sorted = [...removals].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;

  for (const segment of sorted) {
    segments.push(content.slice(cursor, segment.start));
    cursor = segment.end;
  }

  segments.push(content.slice(cursor));

  const joined = segments.join('');
  return joined.replace(/\n{3,}/g, '\n\n');
};

const main = async () => {
  const original = await fs.readFile(tasklistPath, 'utf8');
  const tasks = parseTasks(original);
  if (tasks.length === 0) {
    console.error('No tasks detected in Tasklist.md — aborting.');
    process.exit(1);
  }

  const dependencies = collateDependencies(tasks);
  const doneTasks = tasks.filter((task) => task.status === 'DONE');

  if (doneTasks.length <= limit) {
    console.log(`No trimming needed — ${doneTasks.length} DONE task(s) ≤ limit ${limit}.`);
    return;
  }

  const archivable = doneTasks.filter((task) => !dependencies.has(task.id));
  const excess = doneTasks.length - limit;

  if (archivable.length === 0) {
    console.warn('Done tasks exceed limit but none are eligible for archival (all still referenced).');
    return;
  }

  const toArchive = archivable.slice(0, Math.min(excess, archivable.length));

  if (toArchive.length === 0) {
    console.warn('No eligible tasks could be archived without violating dependencies.');
    return;
  }

  const updatedTasklist = removeTaskBlocks(original, toArchive);

  const now = new Date();
  const isoNow = now.toISOString();
  const dateStamp = isoNow.slice(0, 10).replace(/-/g, '');

  await ensureArchiveDir();
  const archivePath = await resolveArchivePath(dateStamp);
  const archiveContent = buildArchiveContent(toArchive, {
    archiveDate: isoNow.slice(0, 10),
    generatedUtc: isoNow,
    limit,
  });

  await fs.writeFile(tasklistPath, updatedTasklist.trimEnd() + '\n');
  await fs.writeFile(archivePath, archiveContent);

  console.log(`Archived ${toArchive.length} task(s) to ${path.relative(repoRoot, archivePath)}.`);
  const remainingDone = doneTasks.length - toArchive.length;
  if (remainingDone > limit) {
    console.warn(`Remaining DONE tasks (${remainingDone}) still exceed limit (${limit}) due to protected dependencies.`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
