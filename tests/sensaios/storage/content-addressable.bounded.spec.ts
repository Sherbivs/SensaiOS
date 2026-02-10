/**
 * Content-addressable storage bounded buffer tests
 * @module tests/sensaios/storage/content-addressable.bounded
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/observability/envelope/console.js', () => ({
  scopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ContentAddressableStorage } from '../../../src/sensaios/storage/content-addressable.js';

describe('ContentAddressableStorage bounds (MEMLEAK.PHASE2.2)', () => {
  it('should enforce MAX_BLOBS and evict oldest entries', async () => {
    const cas = new ContentAddressableStorage({ maxBlobs: 2 });

    const idA = await cas.put(Buffer.from('blob-a'));
    const idB = await cas.put(Buffer.from('blob-b'));
    const statsBefore = cas.getStats();
    expect(statsBefore.totalBlobs).toBe(2);

    const idC = await cas.put(Buffer.from('blob-c'));

    expect(cas.has(idA)).toBe(false);
    expect(cas.has(idB)).toBe(true);
    expect(cas.has(idC)).toBe(true);

    const statsAfter = cas.getStats();
    expect(statsAfter.totalBlobs).toBe(2);
  });

  it('should refresh LRU order on get', async () => {
    const cas = new ContentAddressableStorage({ maxBlobs: 2 });

    const idA = await cas.put(Buffer.from('blob-a'));
    const idB = await cas.put(Buffer.from('blob-b'));

    await cas.get(idA);
    const idC = await cas.put(Buffer.from('blob-c'));

    expect(cas.has(idA)).toBe(true);
    expect(cas.has(idB)).toBe(false);
    expect(cas.has(idC)).toBe(true);
  });

  it('should keep deduplicated blobs without growing totalBlobs', async () => {
    const cas = new ContentAddressableStorage({ maxBlobs: 1 });

    const idA = await cas.put(Buffer.from('same-content'));
    const idB = await cas.put(Buffer.from('same-content'));

    expect(idA).toBe(idB);
    const stats = cas.getStats();
    expect(stats.totalBlobs).toBe(1);
  });

  it('should report utilization metrics', async () => {
    const cas = new ContentAddressableStorage({ maxBlobs: 4 });

    await cas.put(Buffer.from('a'));
    await cas.put(Buffer.from('b'));

    const stats = cas.getStats();
    expect(stats.maxBlobs).toBe(4);
    expect(stats.totalBlobs).toBe(2);
    expect(stats.utilization).toBe(50);
  });
});
