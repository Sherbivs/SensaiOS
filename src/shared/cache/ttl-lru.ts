export type Clock = () => number;

const defaultClock: Clock = () => Date.now();

type Entry<V> = {
  value: V;
  timestamp: number;
};

export type TtlLruCacheOptions = {
  max: number;
  ttlMs: number;
  clock?: Clock;
};

export class TtlLruCache<K, V> {
  #store = new Map<K, Entry<V>>();
  #max: number;
  #ttlMs: number;
  #clock: Clock;

  constructor(options: TtlLruCacheOptions) {
    if (!Number.isFinite(options.max) || options.max <= 0) {
      throw new Error("TtlLruCache max must be a positive number");
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("TtlLruCache ttlMs must be a positive number");
    }
    this.#max = Math.floor(options.max);
    this.#ttlMs = options.ttlMs;
    this.#clock = options.clock ?? defaultClock;
  }

  get(key: K): V | undefined {
    const entry = this.#store.get(key);
    if (!entry) {
      return undefined;
    }

    if (this.#isExpired(entry)) {
      this.#store.delete(key);
      return undefined;
    }

    // LRU touch: move to the end
    this.#store.delete(key);
    this.#store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const entry: Entry<V> = { value, timestamp: this.#clock() };
    if (this.#store.has(key)) {
      this.#store.delete(key);
    }
    this.#store.set(key, entry);
    this.#evictIfNeeded();
  }

  delete(key: K): void {
    this.#store.delete(key);
  }

  clear(): void {
    this.#store.clear();
  }

  get size(): number {
    this.#purgeExpired();
    return this.#store.size;
  }

  #evictIfNeeded(): void {
    this.#purgeExpired();
    while (this.#store.size > this.#max) {
      const oldestKey = this.#store.keys().next().value as K | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.#store.delete(oldestKey);
    }
  }

  #purgeExpired(): void {
    for (const [key, entry] of this.#store.entries()) {
      if (this.#isExpired(entry)) {
        this.#store.delete(key);
      }
    }
  }

  #isExpired(entry: Entry<V>): boolean {
    return this.#clock() - entry.timestamp >= this.#ttlMs;
  }
}
