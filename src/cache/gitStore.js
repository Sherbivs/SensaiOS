'use strict';

const path = require('path');
const fs = require('fs-extra');
const simpleGit = require('simple-git');

const CLONE_DIR = process.env.CACHE_REPO_DIR || '/tmp/cache-repo';
const BRANCH = process.env.CACHE_BRANCH || 'data-cache';
const REPO_URL = process.env.REPO_URL;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function authUrl(url) {
  if (!GITHUB_TOKEN) {
    return url;
  }

  try {
    const remote = new URL(url);
    if (remote.protocol.startsWith('http')) {
      remote.username = 'x-access-token';
      remote.password = GITHUB_TOKEN;
      return remote.toString();
    }
  } catch {
    // fall through
  }

  return url;
}

async function cloneOrOpen() {
  if (!REPO_URL) {
    throw new Error('REPO_URL env var is required');
  }

  await fs.ensureDir(CLONE_DIR);
  const repoPath = path.join(CLONE_DIR, '.git');
  const exists = await fs.pathExists(repoPath);
  let git;

  if (!exists) {
    git = simpleGit();
    const authedUrl = authUrl(REPO_URL);
    try {
      await git.clone(authedUrl, CLONE_DIR, ['--depth', '1', '--branch', BRANCH]);
    } catch {
      await git.clone(authedUrl, CLONE_DIR, ['--depth', '1']);
    }

    git = simpleGit({ baseDir: CLONE_DIR });
    const locals = await git.branchLocal();
    if (locals.all.includes(BRANCH)) {
      await git.checkout(BRANCH);
    } else {
      await git.checkoutLocalBranch(BRANCH);
    }
  } else {
    git = simpleGit({ baseDir: CLONE_DIR });
    await git.fetch('origin').catch(() => {});
    await git.checkout(BRANCH).catch(async () => {
      await git.checkoutLocalBranch(BRANCH);
    });
    await git.pull('origin', BRANCH, { '--rebase': 'true' }).catch(() => {});
  }

  const name = process.env.GIT_USER_NAME || 'cache-bot';
  const email = process.env.GIT_USER_EMAIL || 'cache-bot@example.com';
  await git.addConfig('user.name', name);
  await git.addConfig('user.email', email);

  return git;
}

async function writeJSON(relativePath, data, pretty = false) {
  const destination = path.join(CLONE_DIR, relativePath);
  await fs.ensureDir(path.dirname(destination));
  const serialised = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await fs.writeFile(destination, serialised);
}

async function readJSON(relativePath) {
  const location = path.join(CLONE_DIR, relativePath);
  if (!(await fs.pathExists(location))) {
    return null;
  }

  const raw = await fs.readFile(location, 'utf8');
  return JSON.parse(raw);
}

async function commitAndPush(message) {
  const git = simpleGit({ baseDir: CLONE_DIR });
  const status = await git.status();
  if (status.isClean()) {
    return { pushed: false, reason: 'no changes' };
  }

  await git.add('.');
  await git.commit(message);

  await git.remote(['set-url', 'origin', authUrl(REPO_URL)]);
  await git.push('origin', BRANCH, { '--set-upstream': null });

  return { pushed: true };
}

module.exports = {
  cloneOrOpen,
  writeJSON,
  readJSON,
  commitAndPush,
  CLONE_DIR,
  BRANCH,
};
