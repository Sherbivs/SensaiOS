/**
 * Runtime cache facade that fronts the on-disk cache with an in-memory LRU layer.
 *
 * Entries are organized by namespace and optional shard. Values live on disk under
 * `/Store/runtime-cache/<namespace>/<shard?>` so they persist beyond process restarts,
 * while the in-memory layer serves hot paths and enforces RAM limits separately.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { log } from "../../shared/log.js";
import * as legacyCacheModule from "../cache.js";
import { errorTracker } from "../monitoring/error-tracker.js";
const legacyCache = legacyCacheModule.default || legacyCacheModule;
const { MAX_CACHE_PERCENT, MAX_CACHE_FILE_AGE_MS } = legacyCache;
// On Render with persistent disk mounted at /Store
// Locally falls back to Store/ in project directory
const PRIMARY_RUNTIME_CACHE_DIR = process.env.RENDER
    ? "/Store/runtime-cache"
    : path.join(process.cwd(), "Store", "runtime-cache");
const FALLBACK_RUNTIME_CACHE_DIR = path.join(process.cwd(), "Store", "runtime-cache");
const CACHE_RECORD_VERSION = 1;
const WORKSPACE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB safety ceiling mirroring the legacy cache.
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
const config = {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxMemoryItems: DEFAULT_MAX_MEMORY_ITEMS,
    rootDir: resolveRuntimeRoot(),
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
    if (err instanceof Error) {
        return { message: err.message, name: err.name };
    }
    if (typeof err === "object") {
        const value = err;
        const message = typeof value.message === "string" ? value.message : JSON.stringify(value);
        const name = typeof value.name === "string" ? value.name : undefined;
        return { message, name };
    }
    return { message: String(err) };
}
function namespaceFromPath(filePath) {
    const relative = path.relative(config.rootDir, filePath);
    if (!relative || relative.startsWith("..")) {
        return "unknown";
    }
    const [first] = relative.split(path.sep);
    return first || "unknown";
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
    if (typeof overrides.rootDir === "string" && overrides.rootDir.trim() !== "") {
        const resolved = ensureDirSync(overrides.rootDir.trim()) ? overrides.rootDir.trim() : config.rootDir;
        config.rootDir = resolved;
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
        log.debug("cache.hit", buildLogMeta(options, "memory"));
        return memoryEntry.value;
    }
    if (memoryEntry) {
        memoryCache.delete(composite);
    }
    const diskEntry = await readFromDisk(options);
    if (diskEntry && !isExpired(diskEntry, now)) {
        recordHit(namespace, "disk");
        log.debug("cache.hit", buildLogMeta(options, "disk"));
        memoryCache.set(composite, diskEntry);
        return diskEntry.value;
    }
    if (diskEntry) {
        await safeUnlink(options);
    }
    const inFlight = inFlightHydrations.get(composite);
    if (inFlight) {
        recordWait(namespace);
        log.debug("cache.wait", buildLogMeta(options, "inflight"));
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
        log.debug("cache.miss", buildLogMeta(options, "hydrate"));
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
        log.debug("cache.touch", buildLogMeta(options, "memory"));
        return true;
    }
    const diskRecord = await readFromDisk(options);
    if (diskRecord && !isExpired(diskRecord, now)) {
        const touched = { ...diskRecord, ttlMs: options.ttlMs, expiresAt: now + options.ttlMs, storedAt: now };
        memoryCache.set(composite, touched);
        await persistRecord(touched);
        recordTouchMetric(namespace);
        log.debug("cache.touch", buildLogMeta(options, "disk"));
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
    log.debug("cache.evict", buildLogMeta(descriptor, "evict"));
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
function namespaceDir(namespace, shard) {
    const ns = sanitizeSegment(namespace);
    const dir = shard ? path.join(config.rootDir, ns, sanitizeSegment(shard)) : path.join(config.rootDir, ns);
    ensureDirSync(dir);
    return dir;
}
function recordPath(descriptor) {
    const dir = namespaceDir(descriptor.namespace, descriptor.shard);
    const filename = `${sanitizeSegment(descriptor.key)}.json`;
    return path.join(dir, filename);
}
async function readFromDisk(descriptor) {
    const filePath = recordPath(descriptor);
    try {
        const raw = await fsPromises.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.version !== CACHE_RECORD_VERSION) {
            await fsPromises.unlink(filePath);
            return null;
        }
        if (typeof parsed.expiresAt !== "number") {
            await fsPromises.unlink(filePath);
            return null;
        }
        parsed.sizeBytes = estimateSize(parsed.value);
        return parsed;
    }
    catch (err) {
        if (err?.code === "ENOENT") {
            return null;
        }
        log.warn("cache.read.error", buildLogMeta(descriptor, "disk", err));
        return null;
    }
}
async function persistRecord(record) {
    const filePath = recordPath(record);
    try {
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        await fsPromises.writeFile(filePath, JSON.stringify(record), "utf8");
    }
    catch (err) {
        log.error("cache.write.error", err, buildLogMeta(record, "disk"));
    }
    recordWrite(record.namespace);
    scheduleMaintenance("write");
}
async function safeUnlink(descriptor) {
    const filePath = recordPath(descriptor);
    try {
        await fsPromises.unlink(filePath);
    }
    catch (err) {
        if (err?.code === "ENOENT") {
            return;
        }
        log.warn("cache.unlink.error", buildLogMeta(descriptor, "disk", err));
    }
}
function resolveRuntimeRoot() {
    if (ensureDirSync(PRIMARY_RUNTIME_CACHE_DIR)) {
        return PRIMARY_RUNTIME_CACHE_DIR;
    }
    if (ensureDirSync(FALLBACK_RUNTIME_CACHE_DIR)) {
        return FALLBACK_RUNTIME_CACHE_DIR;
    }
    // Fallback to OS tmp if both destinations fail.
    const tmp = path.join(os.tmpdir(), "infinity-gauntlet-runtime-cache");
    ensureDirSync(tmp);
    return tmp;
}
function ensureDirSync(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const probe = path.join(dir, ".write-test");
        fs.writeFileSync(probe, String(Date.now()));
        fs.unlinkSync(probe);
        return true;
    }
    catch (err) {
        // Track cache write failure (fire-and-forget to avoid blocking)
        errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
            category: 'CACHE',
            operation: 'cache:ensureDirWritable',
            customData: { dir },
        }).catch(() => { }); // Prevent unhandled rejection
        log.warn("cache.dir.failure", { dir, err });
        return false;
    }
}
function buildLogMeta(descriptor, source, err) {
    const meta = {
        namespace: descriptor.namespace,
        shard: descriptor.shard ?? "default",
        key: descriptor.key,
        source,
    };
    if (err instanceof Error) {
        meta.err = { message: err.message, name: err.name };
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
        await errorTracker.captureError(err instanceof Error ? err : new Error(String(err)), {
            category: 'CACHE',
            operation: 'cache:maintenance',
            customData: { reason },
        });
        log.warn("cache.maintenance.error", { reason, err: error });
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
        log.info("cache.maintenance", meta);
    }
    try {
        await collectCacheMetrics({ log: true, maintenanceReason: reason });
    }
    catch (err) {
        log.debug("cache.metrics.collect.error", { reason, err: serializeError(err) });
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
async function enforceDiskBudget() {
    const entries = await listDiskEntries();
    let totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const budget = calculateMaintenanceBudget();
    for (const entry of entries) {
        if (totalSize <= budget.maxAllowedBytes)
            break;
        try {
            await fsPromises.unlink(entry.filePath);
            totalSize -= entry.size;
            recordDiskRemoval(namespaceFromPath(entry.filePath), "budget");
            log.warn("cache.prune.disk", { file: path.basename(entry.filePath), size: entry.size });
        }
        catch (err) {
            if (err?.code === "ENOENT") {
                continue;
            }
            log.warn("cache.prune.error", { file: entry.filePath, err });
        }
    }
}
async function cleanExpiredFiles() {
    const entries = await listDiskEntries();
    const now = Date.now();
    for (const entry of entries) {
        if (now - entry.mtimeMs <= MAX_CACHE_FILE_AGE_MS)
            continue;
        try {
            await fsPromises.unlink(entry.filePath);
            recordDiskRemoval(namespaceFromPath(entry.filePath), "expired");
            log.info("cache.cleanup.disk", { file: path.basename(entry.filePath) });
        }
        catch (err) {
            if (err?.code === "ENOENT") {
                continue;
            }
            log.warn("cache.cleanup.error", { file: entry.filePath, err });
        }
    }
}
function calculateMaintenanceBudget() {
    const { free } = getDiskStats(config.rootDir);
    const approx = approxFreeBytes(config.rootDir, free);
    const maxAllowedBytes = Math.min(Math.floor(approx * MAX_CACHE_PERCENT), Math.floor(WORKSPACE_LIMIT_BYTES * MAX_CACHE_PERCENT));
    return {
        approxBytes: approx,
        maxAllowedBytes,
    };
}
function getDiskStats(dir) {
    try {
        const stats = fs.statfsSync(dir);
        const free = Number(stats.bavail) * Number(stats.bsize);
        const total = Number(stats.blocks) * Number(stats.bsize);
        return { free, total };
    }
    catch (err) {
        log.warn("cache.disk.stats", { dir, err });
        return { free: 0, total: 0 };
    }
}
function approxFreeBytes(dir, diskFree) {
    if (diskFree > 0) {
        return Math.min(diskFree, WORKSPACE_LIMIT_BYTES);
    }
    const mem = os.freemem();
    if (mem > 0) {
        return Math.min(mem, WORKSPACE_LIMIT_BYTES);
    }
    // Last resort, use directory size as a signal.
    try {
        const stats = fs.statSync(dir);
        return Math.min(stats.size ?? WORKSPACE_LIMIT_BYTES, WORKSPACE_LIMIT_BYTES);
    }
    catch {
        return WORKSPACE_LIMIT_BYTES;
    }
}
async function listDiskEntries() {
    const entries = [];
    async function walk(current) {
        let dirEntries;
        try {
            dirEntries = await fsPromises.readdir(current, { withFileTypes: true });
        }
        catch (err) {
            if (err?.code === "ENOENT") {
                return;
            }
            log.warn("cache.walk.error", { dir: current, err });
            return;
        }
        await Promise.all(dirEntries.map(async (entry) => {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                return;
            }
            if (!entry.isFile()) {
                return;
            }
            try {
                const stats = await fsPromises.stat(fullPath);
                entries.push({ filePath: fullPath, size: stats.size, mtimeMs: stats.mtimeMs });
            }
            catch (err) {
                log.warn("cache.stat.error", { file: fullPath, err });
            }
        }));
    }
    await walk(config.rootDir);
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    return entries;
}
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
export async function collectCacheMetrics(options = {}) {
    ensureMaintenanceTimer();
    const [entries, budget] = await Promise.all([listDiskEntries(), Promise.resolve(calculateMaintenanceBudget())]);
    const memoryStats = memoryCache.stats();
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    const oldestEntryMs = entries.length ? entries[0].mtimeMs : null;
    const newestEntryMs = entries.length ? entries[entries.length - 1].mtimeMs : null;
    const namespaceDisk = new Map();
    for (const entry of entries) {
        const ns = namespaceFromPath(entry.filePath);
        let stats = namespaceDisk.get(ns);
        if (!stats) {
            stats = { entries: 0, bytes: 0, oldest: null, newest: null };
            namespaceDisk.set(ns, stats);
        }
        stats.entries += 1;
        stats.bytes += entry.size;
        stats.oldest = stats.oldest === null ? entry.mtimeMs : Math.min(stats.oldest, entry.mtimeMs);
        stats.newest = stats.newest === null ? entry.mtimeMs : Math.max(stats.newest, entry.mtimeMs);
    }
    const namespaces = new Set([...namespaceMetrics.keys(), ...namespaceDisk.keys()]);
    const snapshotNamespaces = [];
    for (const ns of namespaces) {
        const metrics = ensureNamespaceMetrics(ns);
        const disk = namespaceDisk.get(ns) ?? { entries: 0, bytes: 0, oldest: null, newest: null };
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
            diskEntries: disk.entries,
            diskBytes: disk.bytes,
            oldestEntryIso: toIso(disk.oldest),
            newestEntryIso: toIso(disk.newest),
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
            entries: entries.length,
            bytes: totalBytes,
            approxFreeBytes: budget.approxBytes,
            maxAllowedBytes: budget.maxAllowedBytes,
            rootDir: config.rootDir,
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
        log.info("cache.metrics", snapshot);
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
