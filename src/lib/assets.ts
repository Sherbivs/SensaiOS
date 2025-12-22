import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getLogger } from '../shared/logging/index.js';

const logger = getLogger();

// ============================================================================
// Type Definitions
// ============================================================================

export interface SpriteEntry {
  name: string;
  cdnSprite?: string;
  devSprite?: string;
  cdnArt?: string;
  devArt?: string;
  preferred?: string;
}

export interface AssetManifest {
  sprites: Record<string, SpriteEntry>;
  version_group: string;
}

export type SpriteStyle = 'artwork' | 'sprite';

// ============================================================================
// Module State
// ============================================================================

const MANIFEST_PATH = path.join(process.cwd(), 'dist', 'assets', 'manifest.json');

let manifest: AssetManifest = { sprites: {}, version_group: 'latest' };

try {
  if (existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AssetManifest;
  }
} catch (err) {
  // Keep a safe default; commands should handle undefined URLs gracefully
  logger.warn('Assets', 'init', 'Failed to read manifest', { metadata: { error: (err as Error)?.message ?? String(err) } });
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Get sprite URL for a Pokemon by ID or name
 */
export function getSpriteUrl(idOrName: string | number, style: SpriteStyle = 'artwork'): string | null {
  const sprites = manifest?.sprites ?? {};
  let entry: SpriteEntry | null = null;

  // Try direct lookup by key
  if (sprites[idOrName as string]) {
    entry = sprites[idOrName as string];
  } else {
    // Search by name (case-insensitive)
    const nameLower = String(idOrName).toLowerCase();
    for (const v of Object.values(sprites)) {
      if (String(v.name).toLowerCase() === nameLower) {
        entry = v;
        break;
      }
    }
  }

  if (!entry) return null;

  if (style === 'sprite') {
    return entry.cdnSprite || entry.devSprite || entry.preferred || null;
  }
  return entry.cdnArt || entry.devArt || entry.preferred || null;
}

export { manifest };
