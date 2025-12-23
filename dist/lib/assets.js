import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();
// ============================================================================
// Module State
// ============================================================================
const MANIFEST_PATH = path.join(process.cwd(), 'dist', 'assets', 'manifest.json');
let manifest = { sprites: {}, version_group: 'latest' };
try {
    if (existsSync(MANIFEST_PATH)) {
        manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    }
}
catch (err) {
    // Keep a safe default; commands should handle undefined URLs gracefully
    logger.warn('Assets', 'init', 'Failed to read manifest', { metadata: { error: err?.message ?? String(err) } });
}
// ============================================================================
// Exported Functions
// ============================================================================
/**
 * Get sprite URL for a Pokemon by ID or name
 */
export function getSpriteUrl(idOrName, style = 'artwork') {
    const sprites = manifest?.sprites ?? {};
    let entry = null;
    // Try direct lookup by key
    if (sprites[idOrName]) {
        entry = sprites[idOrName];
    }
    else {
        // Search by name (case-insensitive)
        const nameLower = String(idOrName).toLowerCase();
        for (const v of Object.values(sprites)) {
            if (String(v.name).toLowerCase() === nameLower) {
                entry = v;
                break;
            }
        }
    }
    if (!entry)
        return null;
    if (style === 'sprite') {
        return entry.cdnSprite || entry.devSprite || entry.preferred || null;
    }
    return entry.cdnArt || entry.devArt || entry.preferred || null;
}
export { manifest };
