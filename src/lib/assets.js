'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_PATH = path.join(process.cwd(), 'dist', 'assets', 'manifest.json');
let manifest = { sprites: {}, version_group: 'latest' };
try {
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
} catch (err) {
  // Keep a safe default; commands should handle undefined URLs gracefully
  console.warn('[assets] Failed to read manifest:', err?.message || err);
}

function getSpriteUrl(idOrName, style = 'artwork') {
  const sprites = manifest && manifest.sprites ? manifest.sprites : {};
  let entry = null;
  if (sprites[idOrName]) {
    entry = sprites[idOrName];
  } else {
    const nameLower = String(idOrName).toLowerCase();
    for (const v of Object.values(sprites)) {
      if (String(v.name).toLowerCase() === nameLower) {
        entry = v; break;
      }
    }
  }
  if (!entry) return null;

  if (style === 'sprite') {
    return entry.cdnSprite || entry.devSprite || entry.preferred || null;
  }
  return entry.cdnArt || entry.devArt || entry.preferred || null;
}

module.exports = { getSpriteUrl, manifest };
