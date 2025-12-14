import { loadConfig } from "../config.js";
class MemoryCache {
    #store = new Map();
    #defaultTtl;
    constructor(defaultTtl) {
        this.#defaultTtl = defaultTtl;
    }
    get(key) {
        const record = this.#store.get(key);
        if (!record) {
            return null;
        }
        if (record.expiresAt <= Date.now()) {
            this.#store.delete(key);
            return null;
        }
        return record.value;
    }
    set(key, value, ttlMs) {
        const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : this.#defaultTtl;
        this.#store.set(key, { value, expiresAt: Date.now() + ttl });
    }
    del(key) {
        this.#store.delete(key);
    }
    clear() {
        this.#store.clear();
    }
    get size() {
        this.#evictExpired();
        return this.#store.size;
    }
    #evictExpired() {
        const now = Date.now();
        for (const [key, record] of this.#store.entries()) {
            if (record.expiresAt <= now) {
                this.#store.delete(key);
            }
        }
    }
}
const { cacheTtlMs } = loadConfig();
export const cache = new MemoryCache(cacheTtlMs);
export { MemoryCache };
