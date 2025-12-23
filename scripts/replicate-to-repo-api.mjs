import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Octokit } from 'octokit';

const REPO_URL = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'data-cache';
const BASE_BRANCH = process.env.GITHUB_BASE_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const CACHE_DIR = process.env.CACHE_DIR || './data/cache';

if (!REPO_URL) {
  throw new Error('GITHUB_REPO not configured');
}
if (!TOKEN) {
  throw new Error('GITHUB_TOKEN not configured');
}

const repoUrl = new URL(REPO_URL);
const [owner, repoWithMaybeGit] = repoUrl.pathname.replace(/^\//, '').split('/');
const repo = repoWithMaybeGit.replace(/\.git$/, '');

const octokit = new Octokit({ auth: TOKEN });

async function ensureBranchExists() {
  try {
    await octokit.git.getRef({ owner, repo, ref: `heads/${BRANCH}` });
  } catch (error) {
    if (error.status !== 404) throw error;
    const base = await octokit.git.getRef({ owner, repo, ref: `heads/${BASE_BRANCH}` });
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${BRANCH}`,
      sha: base.data.object.sha,
    });
  }
}

async function listLocalFiles(dir, relativeBase = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = path.join(relativeBase, entry.name);
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listLocalFiles(absPath, relPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push({ relativePath: relPath, absolutePath: absPath });
    }
  }
  return files;
}

async function listRemoteFiles(prefix = 'data/cache') {
  const items = new Map();
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: prefix, ref: BRANCH });
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (entry.type === 'dir') {
          const nested = await listRemoteFiles(entry.path);
          nested.forEach((value, key) => items.set(key, value));
        } else if (entry.type === 'file') {
          items.set(entry.path, entry.sha);
        }
      }
    }
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  return items;
}

async function upsertFile(pathInRepo, absolutePath) {
  const contentBuffer = await readFile(absolutePath);
  const content = contentBuffer.toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path: pathInRepo, ref: BRANCH });
    if (!Array.isArray(data)) sha = data.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    branch: BRANCH,
    path: pathInRepo,
    message: `chore(cache): update ${pathInRepo}`,
    content,
    sha,
  });
}

async function deleteRemoteFile(pathInRepo, sha) {
  await octokit.repos.deleteFile({
    owner,
    repo,
    branch: BRANCH,
    path: pathInRepo,
    sha,
    message: `chore(cache): remove ${pathInRepo}`,
  });
}

export async function replicate() {
  await ensureBranchExists();

  try {
    await stat(CACHE_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`⚠️  Cache directory ${CACHE_DIR} does not exist; skipping replication.`);
      return;
    }
    throw error;
  }

  const localFiles = await listLocalFiles(CACHE_DIR);
  localFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (localFiles.length === 0) {
    console.warn(`⚠️  No files found in ${CACHE_DIR}; skipping replication.`);
    return;
  }

  const remoteFiles = await listRemoteFiles();
  const keptPaths = new Set();

  for (const file of localFiles) {
    const pathInRepo = path.posix.join('data/cache', file.relativePath.replace(/\\/g, '/'));
    await upsertFile(pathInRepo, file.absolutePath);
    keptPaths.add(pathInRepo);
  }

  for (const [pathInRepo, sha] of remoteFiles.entries()) {
    if (!keptPaths.has(pathInRepo)) {
      await deleteRemoteFile(pathInRepo, sha);
    }
  }

  console.log('🚀 Replicated cache to GitHub (Contents API).');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  replicate().catch((error) => {
    console.error('replicate_to_repo_api failed:', error);
    process.exit(1);
  });
}
