/**
 * Runtime cache facade that fronts the database cache with an in-memory LRU layer.
 *
 * MIGRATION (2025-12-27): Moved from /Store/runtime-cache to PostgreSQL
 * Reference: docs/projects/STORE-WRITE-ELIMINATION.md
 *
 * ⚠️ IMPORTANT: This module now manages:
 * - RAM: In-memory LRU cache (5 MB hot layer, part of 2 GB RAM limit)
 * - Database: PostgreSQL CacheEntry table for persistence
 *
 * Resource Tracking:
 * - RAM usage: Tracked via in-memory map size (DEFAULT_MAX_MEMORY_BYTES = 5 MB)
 * - Database: CacheEntry table with sizeBytes tracking
 *
 * Entries are organized by namespace and optional shard. Values persist in database
 * while the in-memory layer serves hot paths and enforces RAM limits separately.
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();
import os from "node:os";
import { prisma } from "../../shared/prisma.js";
import { ensureError } from "../../shared/utils/error-utils.js";
import * as legacyCacheModule from "../cache.js";
import { errorTracker } from "../monitoring/error-tracker.js";
const legacyCache = legacyCacheModule.default || legacyCacheModule;
const { MAX_CACHE_PERCENT, MAX_CACHE_FILE_AGE_MS } = legacyCache;
// MIGRATION: Using database instead of /Store
// Cache namespace for database entries
const FACADE_CACHE_NAMESPACE = 'runtime-cache';
const CACHE_RECORD_VERSION = 1;
const DEFAULT_MAX_MEMORY_BYTES = 5 * 1024 * 1024; // 5 MiB hot layer (reduced from 16 MiB for memory optimization).
const DEFAULT_MAX_MEMORY_ITEMS = 200; // Reduced from 512 for memory optimization.
const MAINTENANCE_MIN_INTERVAL_MS = 5_000;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 10 * 60_000;
const namespaceMetrics = new Map();
const maintenanceStats = {
    runs: 0,
    lastRunAt: null,
    lastDurationMs: null,
    lastReason: null,
    lastError: null,
};
class InMemoryLru {
    #entries = new Map();
    #maxBytes;
    #maxItems;
    #totalBytes = 0;
    constructor(maxBytes, maxItems) {
        this.#maxBytes = Math.max(0, maxBytes);
        this.#maxItems = Math.max(1, maxItems);
    }
    get(key) {
        const entry = this.#entries.get(key);
        if (!entry)
            return undefined;
        // Touch the entry so it becomes the most recently used.
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        return entry;
    }
    set(key, entry) {
        if (entry.sizeBytes > this.#maxBytes && this.#maxBytes > 0) {
            // Item too large to store in-memory; skip but leave on disk.
            this.delete(key);
            return;
        }
        const existing = this.#entries.get(key);
        if (existing) {
            this.#totalBytes -= existing.sizeBytes;
            this.#entries.delete(key);
        }
        this.#entries.set(key, entry);
        this.#totalBytes += entry.sizeBytes;
        this.#enforce();
    }
    delete(key) {
        const entry = this.#entries.get(key);
        if (!entry)
            return;
        this.#entries.delete(key);
        this.#totalBytes -= entry.sizeBytes;
    }
    clear() {
        this.#entries.clear();
        this.#totalBytes = 0;
    }
    get size() {
        return this.#entries.size;
    }
    get totalBytes() {
        return this.#totalBytes;
    }
    stats() {
        return {
            items: this.#entries.size,
            bytes: this.#totalBytes,
            maxItems: this.#maxItems,
            maxBytes: this.#maxBytes,
        };
    }
    #enforce() {
        while (this.#entries.size > this.#maxItems || this.#totalBytes > this.#maxBytes) {
            const oldestKey = this.#entries.keys().next().value;
            if (!oldestKey)
                break;
            this.delete(oldestKey);
        }
    }
}
// MIGRATION: rootDir no longer needed - using database
const config = {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxMemoryItems: DEFAULT_MAX_MEMORY_ITEMS,
    rootDir: os.tmpdir(), // Unused, kept for backward compatibility
};
let memoryCache = new InMemoryLru(config.maxMemoryBytes, config.maxMemoryItems);
const inFlightHydrations = new Map();
let maintenanceTimer = null;
let maintenancePromise = null;
let lastMaintenanceRun = 0;
function ensureNamespaceMetrics(namespace) {
    let metrics = namespaceMetrics.get(namespace);
    if (!metrics) {
        metrics = {
            memoryHits: 0,
            diskHits: 0,
            misses: 0,
            hydrations: 0,
            inflightWaits: 0,
            touches: 0,
            evictions: 0,
            diskPrunes: 0,
            diskCleanups: 0,
            writes: 0,
            lastHitAt: null,
            lastMissAt: null,
            lastHydratedAt: null,
            lastEvictedAt: null,
            lastCleanupAt: null,
            lastWriteAt: null,
        };
        namespaceMetrics.set(namespace, metrics);
    }
    return metrics;
}
function recordHit(namespace, tier) {
    const metrics = ensureNamespaceMetrics(namespace);
    const stamp = Date.now();
    if (tier === "memory") {
        metrics.memoryHits += 1;
    }
    else {
        metrics.diskHits += 1;
    }
    metrics.lastHitAt = stamp;
}
function recordMiss(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.misses += 1;
    metrics.lastMissAt = Date.now();
}
function recordHydration(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.hydrations += 1;
    metrics.lastHydratedAt = Date.now();
}
function recordWait(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.inflightWaits += 1;
}
function recordTouchMetric(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.touches += 1;
}
function recordEvict(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.evictions += 1;
    metrics.lastEvictedAt = Date.now();
}
function recordWrite(namespace) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.writes += 1;
    metrics.lastWriteAt = Date.now();
}
function recordDiskRemoval(namespace, kind) {
    const metrics = ensureNamespaceMetrics(namespace);
    metrics.lastCleanupAt = Date.now();
    if (kind === "budget") {
        metrics.diskPrunes += 1;
    }
    else {
        metrics.diskCleanups += 1;
    }
}
function serializeError(err) {
    if (!err)
        return null;
    const error = ensureError(err);
    return { message: error.message, name: error.name };
}
// MIGRATION: Namespace extraction from database key instead of file path
function namespaceFromKey(key) {
    const parts = key.split("::");
    return parts[0] || "unknown";
}
function ensureMaintenanceTimer() {
    if (!maintenanceTimer) {
        startCacheMaintenanceScheduler();
    }
}
export function startCacheMaintenanceScheduler(intervalMs = DEFAULT_MAINTENANCE_INTERVAL_MS) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        stopCacheMaintenanceScheduler();
        return;
    }
    const clamped = Math.max(intervalMs, MAINTENANCE_MIN_INTERVAL_MS);
    if (maintenanceTimer) {
        clearInterval(maintenanceTimer);
        maintenanceTimer = null;
    }
    maintenanceTimer = setInterval(() => {
        scheduleMaintenance("scheduled");
    }, clamped);
    maintenanceTimer.unref?.();
}
export function stopCacheMaintenanceScheduler() {
    if (maintenanceTimer) {
        clearInterval(maintenanceTimer);
        maintenanceTimer = null;
    }
}
async function runImmediateMaintenance(reason) {
    if (maintenancePromise) {
        await maintenancePromise;
    }
    maintenancePromise = executeMaintenance(reason).finally(() => {
        lastMaintenanceRun = Date.now();
        maintenancePromise = null;
    });
    await maintenancePromise;
}
export async function runCacheMaintenanceNow(reason = "manual") {
    ensureMaintenanceTimer();
    await runImmediateMaintenance(reason);
}
export function configureCacheFacade(overrides) {
    if (typeof overrides.maxMemoryBytes === "number" && overrides.maxMemoryBytes >= 0) {
        config.maxMemoryBytes = overrides.maxMemoryBytes;
    }
    if (typeof overrides.maxMemoryItems === "number" && overrides.maxMemoryItems > 0) {
        config.maxMemoryItems = overrides.maxMemoryItems;
    }
    // MIGRATION: rootDir no longer used - database handles persistence
    if (typeof overrides.rootDir === "string" && overrides.rootDir.trim() !== "") {
        config.rootDir = overrides.rootDir.trim();
    }
    memoryCache = new InMemoryLru(config.maxMemoryBytes, config.maxMemoryItems);
    inFlightHydrations.clear();
    ensureMaintenanceTimer();
}
export async function getOrHydrate(options, hydrator) {
    ensureMaintenanceTimer();
    const composite = buildCompositeKey(options);
    const now = Date.now();
    const namespace = options.namespace;
    const memoryEntry = memoryCache.get(composite);
    if (memoryEntry && !isExpired(memoryEntry, now)) {
        recordHit(namespace, "memory");
        logger.debug('cache-facade', 'getOrHydrate', 'Cache hit (memory)', { metadata: buildLogMeta(options, "memory") });
        return memoryEntry.value;
    }
    if (memoryEntry) {
        memoryCache.delete(composite);
    }
    const diskEntry = await readFromDisk(options);
    if (diskEntry && !isExpired(diskEntry, now)) {
        recordHit(namespace, "disk");
        logger.debug('cache-facade', 'getOrHydrate', 'Cache hit (disk)', { metadata: buildLogMeta(options, "disk") });
        memoryCache.set(composite, diskEntry);
        return diskEntry.value;
    }
    if (diskEntry) {
        await safeUnlink(options);
    }
    const inFlight = inFlightHydrations.get(composite);
    if (inFlight) {
        recordWait(namespace);
        logger.debug('cache-facade', 'getOrHydrate', 'Cache wait (inflight)', { metadata: buildLogMeta(options, "inflight") });
        return inFlight;
    }
    const hydratePromise = (async () => {
        const lastValue = diskEntry?.value ?? memoryEntry?.value ?? null;
        recordMiss(namespace);
        recordHydration(namespace);
        const value = await hydrator({ ...options, lastValue });
        const record = buildRecord(options, value, Date.now());
        await persistRecord(record);
        memoryCache.set(composite, record);
        logger.debug('cache-facade', 'getOrHydrate', 'Cache miss (hydrate)', { metadata: buildLogMeta(options, "hydrate") });
        return value;
    })()
        .finally(() => {
        inFlightHydrations.delete(composite);
    });
    inFlightHydrations.set(composite, hydratePromise);
    return hydratePromise;
}
export async function touch(options) {
    ensureMaintenanceTimer();
    const composite = buildCompositeKey(options);
    const now = Date.now();
    const namespace = options.namespace;
    const memoryEntry = memoryCache.get(composite);
    if (memoryEntry && !isExpired(memoryEntry, now)) {
        const touched = { ...memoryEntry, ttlMs: options.ttlMs, expiresAt: now + options.ttlMs, storedAt: now };
        memoryCache.set(composite, touched);
        await persistRecord(touched);
        recordTouchMetric(namespace);
        logger.debug('cache-facade', 'touch', 'Cache touch (memory)', { metadata: buildLogMeta(options, "memory") });
        return true;
    }
    const diskRecord = await readFromDisk(options);
    if (diskRecord && !isExpired(diskRecord, now)) {
        const touched = { ...diskRecord, ttlMs: options.ttlMs, expiresAt: now + options.ttlMs, storedAt: now };
        memoryCache.set(composite, touched);
        await persistRecord(touched);
        recordTouchMetric(namespace);
        logger.debug('cache-facade', 'touch', 'Cache touch (disk)', { metadata: buildLogMeta(options, "disk") });
        return true;
    }
    return false;
}
export async function evict(descriptor) {
    ensureMaintenanceTimer();
    const composite = buildCompositeKey(descriptor);
    memoryCache.delete(composite);
    recordEvict(descriptor.namespace);
    await safeUnlink(descriptor);
    logger.debug('cache-facade', 'evict', 'Cache evict', { metadata: buildLogMeta(descriptor, "evict") });
}
/**
 * Peek at a cached value without triggering hydration.
 * Returns the cached value if found and not expired, or null otherwise.
 * Does NOT invoke the hydrator or update any access timestamps.
 */
export async function peek(descriptor) {
    const composite = buildCompositeKey(descriptor);
    const now = Date.now();
    // Check memory first
    const memoryRecord = memoryCache.get(composite);
    if (memoryRecord && !isExpired(memoryRecord, now)) {
        return memoryRecord.value;
    }
    // Check disk
    const diskRecord = await readFromDisk(descriptor);
    if (diskRecord && !isExpired(diskRecord, now)) {
        return diskRecord.value;
    }
    return null;
}
export function cacheRoot() {
    return config.rootDir;
}
function buildRecord(options, value, now) {
    return {
        version: CACHE_RECORD_VERSION,
        namespace: options.namespace,
        shard: options.shard,
        key: options.key,
        storedAt: now,
        ttlMs: options.ttlMs,
        expiresAt: now + options.ttlMs,
        value,
        sizeBytes: estimateSize(value),
    };
}
function estimateSize(value) {
    try {
        return Buffer.byteLength(JSON.stringify(value));
    }
    catch {
        return 0;
    }
}
function isExpired(record, now) {
    return now >= record.expiresAt;
}
function buildCompositeKey(descriptor) {
    return [descriptor.namespace, descriptor.shard ?? "default", descriptor.key].join("::");
}
function sanitizeSegment(segment) {
    return segment.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}
// MIGRATION: Build database key instead of file path
function buildDbKey(descriptor) {
    const ns = sanitizeSegment(descriptor.namespace);
    const shard = descriptor.shard ? sanitizeSegment(descriptor.shard) : "default";
    const key = sanitizeSegment(descriptor.key);
    return `${ns}::${shard}::${key}`;
}
// MIGRATION: Read from database instead of disk
async function readFromDisk(descriptor) {
    const dbKey = buildDbKey(descriptor);
    try {
        const entry = await prisma.cacheEntry.findUnique({
            where: { key: dbKey },
        });
        if (!entry) {
            return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = entry.value;
        if (!parsed || parsed.version !== CACHE_RECORD_VERSION) {
            // Invalid entry, remove it
            await prisma.cacheEntry.delete({ where: { key: dbKey } }).catch(() => { });
            return null;
        }
        const record = {
            namespace: descriptor.namespace,
            key: descriptor.key,
            shard: descriptor.shard,
            version: parsed.version,
            storedAt: parsed.storedAt,
            ttlMs: parsed.ttlMs,
            expiresAt: parsed.expiresAt,
            value: parsed.value,
            sizeBytes: estimateSize(parsed.value),
        };
        return record;
    }
    catch (err) {
        const error = ensureError(err);
        logger.warn('cache-facade', 'readFromDb', 'Cache read error', { error: { name: error.name, message: error.message }, metadata: buildLogMeta(descriptor, "db") });
        return null;
    }
}
// MIGRATION: Persist to database instead of disk
async function persistRecord(record) {
    const dbKey = buildDbKey(record);
    try {
        const payload = {
            version: record.version,
            storedAt: record.storedAt,
            ttlMs: record.ttlMs,
            expiresAt: record.expiresAt,
            value: record.value,
        };
        await prisma.cacheEntry.upsert({
            where: { key: dbKey },
            update: {
                value: payload,
                sizeBytes: record.sizeBytes,
                accessCount: { increment: 1 },
                lastAccessedAt: new Date(),
                expiresAt: new Date(record.expiresAt),
            },
            create: {
                key: dbKey,
                namespace: FACADE_CACHE_NAMESPACE,
                value: payload,
                sizeBytes: record.sizeBytes,
                accessCount: 1,
                lastAccessedAt: new Date(),
                expiresAt: new Date(record.expiresAt),
            },
        });
    }
    catch (err) {
        const error = ensureError(err);
        logger.error('cache-facade', 'persistRecord', 'Cache write error', { error: { name: error.name, message: error.message }, metadata: buildLogMeta(record, "db") });
    }
    recordWrite(record.namespace);
    scheduleMaintenance("write");
}
// MIGRATION: Delete from database instead of file
async function safeUnlink(descriptor) {
    const dbKey = buildDbKey(descriptor);
    try {
        await prisma.cacheEntry.delete({ where: { key: dbKey } });
    }
    catch (err) {
        // Ignore not found errors
        const error = ensureError(err);
        if (!String(error.message).includes('Record to delete does not exist')) {
            logger.warn('cache-facade', 'safeUnlink', 'Cache delete error', { error: { name: error.name, message: error.message }, metadata: buildLogMeta(descriptor, "db") });
        }
    }
}
// MIGRATION: No longer needed - using database
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveRuntimeRoot() {
    return os.tmpdir(); // Unused but kept for backward compatibility
}
function buildLogMeta(descriptor, source, err) {
    const meta = {
        namespace: descriptor.namespace,
        shard: descriptor.shard ?? "default",
        key: descriptor.key,
        source,
    };
    if (err) {
        const error = ensureError(err);
        meta.err = { message: error.message, name: error.name };
    }
    return meta;
}
async function executeMaintenance(reason) {
    const started = Date.now();
    let error = null;
    try {
        await enforceDiskBudget();
        await cleanExpiredFiles();
    }
    catch (err) {
        error = serializeError(err);
        // Track maintenance failure
        await errorTracker.captureError(ensureError(err), {
            category: 'CACHE',
            operation: 'cache:maintenance',
            customData: { reason },
        });
        logger.warn('cache-facade', 'executeMaintenance', 'Cache maintenance error', { error: error ? { name: error.name || 'Error', message: error.message } : undefined, metadata: { reason } });
    }
    finally {
        const finished = Date.now();
        maintenanceStats.runs += 1;
        maintenanceStats.lastRunAt = finished;
        maintenanceStats.lastDurationMs = finished - started;
        maintenanceStats.lastReason = reason;
        maintenanceStats.lastError = error;
        const meta = {
            reason,
            durationMs: maintenanceStats.lastDurationMs,
            runs: maintenanceStats.runs,
        };
        if (error) {
            meta.err = error;
        }
        logger.info('cache-facade', 'executeMaintenance', 'Cache maintenance completed', { durationMs: maintenanceStats.lastDurationMs ?? undefined, metadata: { reason, runs: maintenanceStats.runs, hasError: Boolean(error) } });
    }
    try {
        await collectCacheMetrics({ log: true, maintenanceReason: reason });
    }
    catch (err) {
        const e = serializeError(err);
        logger.debug('cache-facade', 'executeMaintenance', 'Cache metrics collect error', { error: e ? { name: e.name || 'Error', message: e.message } : undefined, metadata: { reason } });
    }
}
function scheduleMaintenance(reason = "write") {
    const now = Date.now();
    if (maintenancePromise)
        return;
    if (reason === "write" && now - lastMaintenanceRun < MAINTENANCE_MIN_INTERVAL_MS)
        return;
    void runImmediateMaintenance(reason);
}
// MIGRATION: Database-based disk budget enforcement
async function enforceDiskBudget() {
    try {
        // Get total cache size from database
        const result = await prisma.cacheEntry.aggregate({
            where: { namespace: FACADE_CACHE_NAMESPACE },
            _sum: { sizeBytes: true },
            _count: true,
        });
        const totalSize = result._sum.sizeBytes || 0;
        const maxAllowedBytes = 100 * 1024 * 1024; // 100 MB limit for runtime cache
        if (totalSize > maxAllowedBytes) {
            // Delete oldest entries until under budget
            const entriesToDelete = await prisma.cacheEntry.findMany({
                where: { namespace: FACADE_CACHE_NAMESPACE },
                orderBy: { lastAccessedAt: 'asc' },
                take: Math.ceil(result._count / 4), // Delete 25% of entries
                select: { key: true, sizeBytes: true },
            });
            for (const entry of entriesToDelete) {
                await prisma.cacheEntry.delete({ where: { key: entry.key } }).catch(() => { });
                logger.warn('cache-facade', 'enforceDiskBudget', 'Cache prune db', { metadata: { key: entry.key, size: entry.sizeBytes } });
            }
        }
    }
    catch (err) {
        const error = ensureError(err);
        logger.warn('cache-facade', 'enforceDiskBudget', 'Cache budget enforcement error', { error: { name: error.name, message: error.message } });
    }
}
// MIGRATION: Database-based cleanup for expired entries
async function cleanExpiredFiles() {
    try {
        const result = await prisma.cacheEntry.deleteMany({
            where: {
                namespace: FACADE_CACHE_NAMESPACE,
                expiresAt: { lt: new Date() },
            },
        });
        if (result.count > 0) {
            logger.info('cache-facade', 'cleanExpiredFiles', 'Cache cleanup db', { metadata: { deletedCount: result.count } });
        }
    }
    catch (err) {
        const error = ensureError(err);
        logger.warn('cache-facade', 'cleanExpiredFiles', 'Cache cleanup error', { error: { name: error.name, message: error.message } });
    }
}
// MIGRATION: No longer needed - database handles storage
function calculateMaintenanceBudget() {
    return {
        approxBytes: 100 * 1024 * 1024, // 100 MB approximate
        maxAllowedBytes: 100 * 1024 * 1024, // 100 MB limit
    };
}
// MIGRATION: Remove unused disk functions - using database now
// getDiskStats, approxFreeBytes, listDiskEntries, namespaceFromPath removed
function toIso(timestamp) {
    if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
        return null;
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.valueOf())) {
        return null;
    }
    return date.toISOString();
}
// MIGRATION: Database-based metrics collection
export async function collectCacheMetrics(options = {}) {
    ensureMaintenanceTimer();
    // Get stats from database
    const [dbStats, budget] = await Promise.all([
        prisma.cacheEntry.aggregate({
            where: { namespace: FACADE_CACHE_NAMESPACE },
            _sum: { sizeBytes: true },
            _count: true,
            _min: { lastAccessedAt: true },
            _max: { lastAccessedAt: true },
        }).catch(() => ({ _sum: { sizeBytes: 0 }, _count: 0, _min: { lastAccessedAt: null }, _max: { lastAccessedAt: null } })),
        Promise.resolve(calculateMaintenanceBudget()),
    ]);
    const memoryStats = memoryCache.stats();
    const totalBytes = dbStats._sum.sizeBytes || 0;
    const entryCount = dbStats._count || 0;
    const oldestEntryMs = dbStats._min.lastAccessedAt?.getTime() ?? null;
    const newestEntryMs = dbStats._max.lastAccessedAt?.getTime() ?? null;
    const namespaces = new Set([...namespaceMetrics.keys()]);
    const snapshotNamespaces = [];
    for (const ns of namespaces) {
        const metrics = ensureNamespaceMetrics(ns);
        snapshotNamespaces.push({
            namespace: ns,
            memoryHits: metrics.memoryHits,
            diskHits: metrics.diskHits,
            misses: metrics.misses,
            hydrations: metrics.hydrations,
            inflightWaits: metrics.inflightWaits,
            touches: metrics.touches,
            evictions: metrics.evictions,
            diskPrunes: metrics.diskPrunes,
            diskCleanups: metrics.diskCleanups,
            writes: metrics.writes,
            lastHitIso: toIso(metrics.lastHitAt),
            lastMissIso: toIso(metrics.lastMissAt),
            lastHydratedIso: toIso(metrics.lastHydratedAt),
            lastEvictedIso: toIso(metrics.lastEvictedAt),
            lastCleanupIso: toIso(metrics.lastCleanupAt),
            lastWriteIso: toIso(metrics.lastWriteAt),
            diskEntries: entryCount,
            diskBytes: totalBytes,
            oldestEntryIso: toIso(oldestEntryMs),
            newestEntryIso: toIso(newestEntryMs),
        });
    }
    snapshotNamespaces.sort((a, b) => {
        const bytesDelta = (b.diskBytes ?? 0) - (a.diskBytes ?? 0);
        if (bytesDelta !== 0)
            return bytesDelta;
        return a.namespace.localeCompare(b.namespace);
    });
    const snapshot = {
        generatedAtIso: new Date().toISOString(),
        memory: {
            items: memoryStats.items,
            bytes: memoryStats.bytes,
            maxItems: memoryStats.maxItems,
            maxBytes: memoryStats.maxBytes,
        },
        disk: {
            entries: entryCount,
            bytes: totalBytes,
            approxFreeBytes: budget.approxBytes,
            maxAllowedBytes: budget.maxAllowedBytes,
            rootDir: 'database', // MIGRATION: Now using database
            oldestEntryIso: toIso(oldestEntryMs),
            newestEntryIso: toIso(newestEntryMs),
        },
        maintenance: {
            runs: maintenanceStats.runs,
            lastRunIso: toIso(maintenanceStats.lastRunAt),
            lastDurationMs: maintenanceStats.lastDurationMs,
            lastReason: maintenanceStats.lastReason,
            lastError: maintenanceStats.lastError,
            pending: Boolean(maintenancePromise),
            origin: options.maintenanceReason ?? null,
        },
        namespaces: snapshotNamespaces,
    };
    if (options.log) {
        logger.info('cache-facade', 'collectCacheMetrics', 'Cache metrics snapshot', { metadata: snapshot });
    }
    return snapshot;
}
export function resetCacheMetrics() {
    namespaceMetrics.clear();
    maintenanceStats.runs = 0;
    maintenanceStats.lastRunAt = null;
    maintenanceStats.lastDurationMs = null;
    maintenanceStats.lastReason = null;
    maintenanceStats.lastError = null;
}
if (process.env.NODE_ENV !== "test") {
    startCacheMaintenanceScheduler();
}
