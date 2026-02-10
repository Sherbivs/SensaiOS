import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FINGERPRINTS as PATTERN_MAX_FINGERPRINTS,
  calculateCorrelation,
  clearAllPatternState,
  getPatternDetectorStats,
  hasFingerprintObservation,
  recordFingerprintForTesting,
  recordErrorForCorrelation,
} from '../../../src/services/error-brain/pattern-detector.js';
import {
  MAX_FINGERPRINTS as IMPACT_MAX_FINGERPRINTS,
  clearAllImpactState,
  getImpactPredictorStats,
  hasErrorHistoryFingerprint,
  recordErrorCount,
} from '../../../src/services/error-brain/impact-predictor.js';

function buildErrorEvent(fingerprint: string, timestamp: number) {
  return {
    fingerprint,
    timestamp,
    severity: 3,
  };
}

beforeEach(() => {
  clearAllPatternState();
  clearAllImpactState();
});

describe('error-brain bounded maps', () => {
  it('caps fingerprint observations', () => {
    for (let i = 0; i < Math.ceil(PATTERN_MAX_FINGERPRINTS / 2) + 5; i += 1) {
      recordFingerprintForTesting(`fp-${i}`);
    }

    const stats = getPatternDetectorStats();
    expect(stats.fingerprintKeysTotal).toBeLessThanOrEqual(PATTERN_MAX_FINGERPRINTS);
    expect(stats.fingerprintsObserved).toBeGreaterThan(0);
  });

  it('keeps refreshed fingerprints during eviction', () => {
    const maxFingerprints = Math.ceil(PATTERN_MAX_FINGERPRINTS / 2);

    for (let i = 0; i < maxFingerprints; i += 1) {
      recordFingerprintForTesting(`fp-${i}`);
    }

    recordFingerprintForTesting('fp-0');
    recordFingerprintForTesting('fp-new');

    expect(hasFingerprintObservation('fp-0')).toBe(true);
    expect(hasFingerprintObservation('fp-1')).toBe(false);
  });

  it('drops evicted fingerprints from correlation calculations', () => {
    const baseTime = Date.now();

    recordErrorForCorrelation(buildErrorEvent('fp-0', baseTime));
    recordErrorForCorrelation(buildErrorEvent('fp-1', baseTime + 1));

    const maxFingerprints = Math.ceil(PATTERN_MAX_FINGERPRINTS / 2);
    for (let i = 2; i < maxFingerprints + 2; i += 1) {
      recordFingerprintForTesting(`fp-${i}`);
    }

    const correlation = calculateCorrelation('fp-0', 'fp-1');
    expect(correlation).toBeNull();
    expect(hasFingerprintObservation('fp-0')).toBe(false);
  });

  it('caps impact predictor history fingerprints', () => {
    for (let i = 0; i < IMPACT_MAX_FINGERPRINTS + 3; i += 1) {
      recordErrorCount(`impact-${i}`, i);
    }

    const stats = getImpactPredictorStats();
    expect(stats.fingerprintsWithHistory).toBe(IMPACT_MAX_FINGERPRINTS);
  });

  it('keeps refreshed impact history during eviction', () => {
    for (let i = 0; i < IMPACT_MAX_FINGERPRINTS; i += 1) {
      recordErrorCount(`impact-${i}`, 1);
    }

    recordErrorCount('impact-0', 2);
    recordErrorCount('impact-new', 3);

    expect(hasErrorHistoryFingerprint('impact-0')).toBe(true);
    expect(hasErrorHistoryFingerprint('impact-1')).toBe(false);
  });

  it('registers prune interval on schedule', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    await import('../../../src/services/error-brain/impact-predictor.js');

    expect(setIntervalSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('registers SIGTERM handler for prune shutdown', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const onceSpy = vi.spyOn(process, 'once');
    await import('../../../src/services/error-brain/impact-predictor.js');

    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    vi.useRealTimers();
  });
});
