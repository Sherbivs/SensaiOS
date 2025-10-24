import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCallback);

const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;

function mask(repo) {
  if (!repo) throw new Error('GITHUB_REPO not configured');
  if (!TOKEN) return repo;
  return repo.replace('https://', `https://${TOKEN}@`);
}

export async function replicate() {
  await exec('git config user.email "cachebot@local"');
  await exec('git config user.name "Cache Bot"');
  await exec(`git checkout ${BRANCH}`);
  await exec('git pull --rebase || true');
  await exec('git add -A data/cache');

  try {
    await exec('git diff --cached --quiet');
    console.log('🟢 No cache changes to commit.');
    return;
  } catch {
    // There are staged changes
  }

  const message = `chore(cache): refresh Pokémon data ${new Date().toISOString()}`;
  await exec(`git commit -m "${message}"`);
  await exec(`git push ${mask(REPO)} ${BRANCH}`);
  console.log('🚀 Replicated cache to repo.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  replicate().catch((error) => {
    console.error('replicate_to_repo failed:', error);
    process.exit(1);
  });
}
