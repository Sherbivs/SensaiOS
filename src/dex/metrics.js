import { log } from "../shared/log.js";

const DEFAULT_RUNTIME = "unknown";

function serializeCounts(counts) {
  if (!counts || typeof counts !== "object") {
    return undefined;
  }
  const { species, moves } = counts;
  return {
    species: typeof species === "number" ? species : undefined,
    moves: typeof moves === "number" ? moves : undefined,
  };
}

export function recordDexLoad({ runtime = DEFAULT_RUNTIME, source, counts, manifestHash, path } = {}) {
  log.info("dex.metrics.load", {
    runtime,
    source,
    counts: serializeCounts(counts),
    manifestHash,
    path,
  });
}

export function recordDexFallback({ runtime = DEFAULT_RUNTIME, reason, error, counts } = {}) {
  log.warn("dex.metrics.fallback", error instanceof Error ? error : undefined, {
    runtime,
    reason,
    message: error instanceof Error ? error.message : undefined,
    counts: serializeCounts(counts),
  });
}

export function recordDexLookup({ runtime = DEFAULT_RUNTIME, query, resolution, found, durationMs } = {}) {
  log.debug("dex.metrics.lookup", {
    runtime,
    query,
    resolution,
    found: Boolean(found),
    durationMs: typeof durationMs === "number" && Number.isFinite(durationMs) ? Math.max(0, durationMs) : undefined,
  });
}

export function recordDexLookupMiss({ runtime = DEFAULT_RUNTIME, query, attemptedResolutions } = {}) {
  log.debug("dex.metrics.lookup_miss", {
    runtime,
    query,
    attemptedResolutions,
  });
}
