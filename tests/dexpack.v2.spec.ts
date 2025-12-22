import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

// These values are copied from src/dex/v2/accessors.ts - they must be hardcoded
// because vi.resetModules() breaks dynamic imports in Vitest
const DEX_V2_SIGNATURE = 'eef48bdb054547c6a39e997a6293bda52798f73557f6b7774cd7d5ea1d53ca31c9a28e23f9a09c856f30b4e3ee0ad38bd018839ae4c8c592d24d94431603d911';
const DEX_V2_BINARY = 'dexpack.v2.f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00.bin';
const DEX_V2_MANIFEST_HASH = 'f840e427f83b819e2c251ad267d714797d23a34b88b0c2f1c61eafe03aef5b00';

// Mock the accessors module with hardcoded values that survive vi.resetModules()
vi.mock('../src/dex/v2/accessors.js', () => ({
  DEX_V2_SIGNATURE,
  DEX_V2_BINARY,
  DEX_V2_MANIFEST_HASH,
  DEX_V2_COUNTS: Object.freeze({ species: 23, moves: 18 }),
  readDexV2Binary: async (rootDir: string) => {
    const filePath = path.join(rootDir, 'assets', DEX_V2_BINARY);
    return fs.readFile(filePath);
  },
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');

async function importDexpackModule() {
  return import('../src/data/dexpack.js');
}

async function importDexV2Loader() {
  return import('../src/dex/v2/loader.js');
}

describe('dexpack v2 runtime integration', () => {
  const originalFlag = process.env.DEX_V2_ENABLED;

  afterEach(async () => {
    process.env.DEX_V2_ENABLED = originalFlag;
    vi.resetModules();
    const { resetDexpack } = await importDexpackModule();
    resetDexpack();
  });

  it('loads the v2 pack when the feature flag is enabled', async () => {
    process.env.DEX_V2_ENABLED = 'true';
    vi.resetModules();
    const dexpack = await importDexpackModule();
    dexpack.resetDexpack();
    const pack = dexpack.getDexpack();

    expect(pack?.meta).toBeDefined();
    expect(path.basename(dexpack.getLoadedPath() ?? '')).toBe('dexpack.v2.json');
    expect(dexpack.dexpackState.runtime).toBe('v2');
    // Note: dexpack.ts bridge converts Int32Array to Uint16Array for compatibility
    // The raw v2 loader uses Int32Array, but the unified dexpackState interface uses Uint16Array
    expect(dexpack.dexpackState.fast?.statIndex).toBeInstanceOf(Uint16Array);
  });

  it('rejects mismatched hashes when the manifest is tampered', async () => {
    const manifestPath = path.join(ASSETS_DIR, 'dexpack.v2.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const binaryName = manifest.binary;

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dexv2-test-'));
    const tmpAssets = path.join(tmpRoot, 'assets');
    await fs.mkdir(tmpAssets, { recursive: true });

    const tmpManifest = path.join(tmpAssets, 'dexpack.v2.json');
    const tmpBinary = path.join(tmpAssets, binaryName);
    await fs.writeFile(tmpManifest, manifestRaw);
    await fs.copyFile(path.join(ASSETS_DIR, binaryName), tmpBinary);

    const tampered = { ...manifest, hash: '0000000000000000000000000000000000000000000000000000000000000000' };
    await fs.writeFile(tmpManifest, JSON.stringify(tampered, null, 2));

    try {
      vi.resetModules();
      const loader = await importDexV2Loader();
      loader.resetDexV2Runtime();
      expect(() => loader.loadDexV2Runtime({ rootDir: tmpRoot })).toThrow(/hash mismatch/i);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('rejects manifest signature mismatches when tampered', async () => {
    const manifestPath = path.join(ASSETS_DIR, 'dexpack.v2.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const binaryName = manifest.binary;

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dexv2-sig-'));
    const tmpAssets = path.join(tmpRoot, 'assets');
    await fs.mkdir(tmpAssets, { recursive: true });

    const tmpManifest = path.join(tmpAssets, 'dexpack.v2.json');
    const tmpBinary = path.join(tmpAssets, binaryName);
    await fs.writeFile(tmpManifest, manifestRaw);
    await fs.copyFile(path.join(ASSETS_DIR, binaryName), tmpBinary);

    const tampered = { ...manifest, signature: '0000000000000000000000000000000000000000000000000000000000000000' };
    await fs.writeFile(tmpManifest, JSON.stringify(tampered, null, 2));

    try {
      vi.resetModules();
      const loader = await importDexV2Loader();
      loader.resetDexV2Runtime();
      expect(() => loader.loadDexV2Runtime({ rootDir: tmpRoot })).toThrow(/signature mismatch/i);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('exposes the trusted signature when loading the runtime', async () => {
    // Skip vi.resetModules() here to preserve the signature import
    const loader = await importDexV2Loader();
    loader.resetDexV2Runtime();
    const runtime = loader.loadDexV2Runtime({ rootDir: path.join(ROOT) });
    expect(runtime.signature).toBe(DEX_V2_SIGNATURE);
  });
});
