/**
 * DM Home View Loader
 * 
 * Lazy loader for DM home views module. Provides fallback-safe loading
 * of the home views for party, box, and other DM-based features.
 * 
 * @module commands/dm-home-loader
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 * @deprecated Migrating to HomesteadChannelManager - see architecture-bible/18-private-channel-architecture.md
 */

/**
 * Home views interface for DM-based gameplay
 */
export interface HomeViews {
  openPartyView?: (
    interaction: unknown,
    options?: { respond?: string; ackContent?: string }
  ) => Promise<void>;
  openBoxView?: (
    interaction: unknown,
    options?: { respond?: string; page?: number; ackContent?: string }
  ) => Promise<void>;
  openInventoryView?: (interaction: unknown, options?: unknown) => Promise<void>;
  openPokedexView?: (interaction: unknown, options?: unknown) => Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __dmHomeViews: HomeViews | undefined;
}

const CANDIDATE_PATHS = [
  '../bot/dm/home.js',
  '../bot/dm/home.ts',
  '../bot/dm/home.tsx',
  '../bot/dm/home',
];

/**
 * Normalize an imported module to extract home view functions
 */
function normalizeModule(mod: unknown): HomeViews | null {
  if (!mod || typeof mod !== 'object') return null;
  
  const modObj = mod as { default?: unknown };
  const candidate = modObj.default && typeof modObj.default === 'object' 
    ? modObj.default as HomeViews
    : mod as HomeViews;
  
  if (candidate && typeof candidate.openPartyView === 'function') {
    return candidate;
  }
  return null;
}

/**
 * Attempt to import a module by path
 */
async function tryImport(path: string): Promise<HomeViews | null> {
  try {
    const mod = await import(path);
    return normalizeModule(mod);
  } catch {
    return null;
  }
}

/**
 * Load home views module, using cached version if available.
 * Tries multiple candidate paths for resilience.
 * 
 * @returns Home views module or null if not available
 */
export async function loadHomeViews(): Promise<HomeViews | null> {
  // Return cached version if already loaded
  if (globalThis.__dmHomeViews && typeof globalThis.__dmHomeViews.openPartyView === 'function') {
    return globalThis.__dmHomeViews;
  }

  // Try each candidate path
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

export default { loadHomeViews };
