const CANDIDATE_PATHS = [
  '../bot/dm/home.js',
  '../bot/dm/home.ts',
  '../bot/dm/home.tsx',
  '../bot/dm/home',
];

function normalizeModule(mod) {
  if (!mod || typeof mod !== 'object') return null;
  const candidate = mod.default && typeof mod.default === 'object' ? mod.default : mod;
  if (candidate && typeof candidate.openPartyView === 'function') {
    return candidate;
  }
  return null;
}

async function tryImport(path) {
  try {
    const mod = await import(path);
    return normalizeModule(mod);
  } catch {
    return null;
  }
}

async function loadHomeViews() {
  if (globalThis.__dmHomeViews && typeof globalThis.__dmHomeViews.openPartyView === 'function') {
    return globalThis.__dmHomeViews;
  }

  for (const path of CANDIDATE_PATHS) {
    const mod = await tryImport(path);
    if (mod) {
      globalThis.__dmHomeViews = {
        ...(globalThis.__dmHomeViews || {}),
        ...mod,
      };
      return globalThis.__dmHomeViews;
    }
  }

  return globalThis.__dmHomeViews ?? null;
}

export { loadHomeViews };

export default { loadHomeViews };
