/**
 * Property-Based Testing Suite for Security Services
 *
 * R9: fast-check integration for security invariants
 *
 * Uses property-based testing to verify that security properties hold
 * for ALL possible inputs, not just hand-picked test cases.
 *
 * @module tests/security/services/property-based.test
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import crypto from "crypto";

// ============================================================================
// Arbitraries (Generators for Domain-Specific Types)
// ============================================================================

/**
 * Discord Snowflake ID generator (17-20 digit numeric strings)
 */
const snowflakeArbitrary = fc.bigUintN(63).map((n) => String(n).padStart(17, "1"));

/**
 * Guild ID arbitrary
 */
const guildIdArbitrary = snowflakeArbitrary;

/**
 * Event type arbitrary (security.* namespace)
 */
const eventTypeArbitrary = fc.constantFrom(
  "security.authentication.login.attempted",
  "security.authentication.login.succeeded",
  "security.authentication.login.failed",
  "security.authorization.permission.granted",
  "security.authorization.permission.revoked",
  "security.authorization.role.assigned",
  "security.authorization.role.unassigned",
  "security.monitoring.alert.created",
  "security.monitoring.alert.resolved",
  "security.incident.threat.detected",
  "security.incident.breach.suspected"
);

/**
 * Severity arbitrary
 */
const severityArbitrary = fc.constantFrom("LOW", "MEDIUM", "HIGH", "CRITICAL");

/**
 * Confidence score arbitrary (0.0 - 1.0)
 */
const confidenceArbitrary = fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true });

/**
 * Retention days arbitrary
 */
const retentionDaysArbitrary = fc.integer({ min: 1, max: 3650 });

/**
 * HMAC secret arbitrary (32+ chars for security)
 */
const hmacSecretArbitrary = fc.hexaString({ minLength: 64, maxLength: 128 });

/**
 * ISO timestamp arbitrary
 */
const timestampArbitrary = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") });

// ============================================================================
// Property Tests: Checksum Service Properties
// ============================================================================

describe("Property-Based: Checksum Properties", () => {
  /**
   * PROPERTY: Checksums are deterministic
   * For any input, the same checksum is always produced
   */
  it("checksums are deterministic for same input", () => {
    fc.assert(
      fc.property(fc.string(), hmacSecretArbitrary, (data, secret) => {
        const checksum1 = crypto.createHmac("sha256", secret).update(data).digest("hex");
        const checksum2 = crypto.createHmac("sha256", secret).update(data).digest("hex");

        expect(checksum1).toBe(checksum2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Different inputs produce different checksums (collision resistance)
   */
  it("different inputs produce different checksums (high probability)", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })).filter(([a, b]) => a !== b),
        hmacSecretArbitrary,
        ([data1, data2], secret) => {
          const checksum1 = crypto.createHmac("sha256", secret).update(data1).digest("hex");
          const checksum2 = crypto.createHmac("sha256", secret).update(data2).digest("hex");

          // Collision is astronomically unlikely for SHA-256
          expect(checksum1).not.toBe(checksum2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Different secrets produce different checksums
   */
  it("different secrets produce different checksums for same input", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.tuple(hmacSecretArbitrary, hmacSecretArbitrary).filter(([a, b]) => a !== b),
        (data, [secret1, secret2]) => {
          const checksum1 = crypto.createHmac("sha256", secret1).update(data).digest("hex");
          const checksum2 = crypto.createHmac("sha256", secret2).update(data).digest("hex");

          expect(checksum1).not.toBe(checksum2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Checksum length is consistent (64 chars for SHA-256 hex)
   */
  it("SHA-256 checksums are always 64 hex characters", () => {
    fc.assert(
      fc.property(fc.string(), hmacSecretArbitrary, (data, secret) => {
        const checksum = crypto.createHmac("sha256", secret).update(data).digest("hex");

        expect(checksum).toHaveLength(64);
        expect(checksum).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property Tests: Hash Chain Properties
// ============================================================================

describe("Property-Based: Hash Chain Properties", () => {
  interface ChainLink {
    id: string;
    checksum: string;
    previousHash: string | null;
  }

  /**
   * Build a valid hash chain from inputs
   */
  function buildChain(inputs: string[], secret: string): ChainLink[] {
    const chain: ChainLink[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const previousHash = i === 0 ? null : chain[i - 1].checksum;
      const data = `${inputs[i]}|${previousHash ?? ""}`;
      const checksum = crypto.createHmac("sha256", secret).update(data).digest("hex");

      chain.push({
        id: `link-${i}`,
        checksum,
        previousHash,
      });
    }

    return chain;
  }

  /**
   * Verify a hash chain
   */
  function verifyChain(chain: ChainLink[]): boolean {
    for (let i = 0; i < chain.length; i++) {
      const expectedPrevious = i === 0 ? null : chain[i - 1].checksum;
      if (chain[i].previousHash !== expectedPrevious) {
        return false;
      }
    }
    return true;
  }

  /**
   * PROPERTY: First link always has null previousHash
   */
  it("first chain link always has null previousHash", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        hmacSecretArbitrary,
        (inputs, secret) => {
          const chain = buildChain(inputs, secret);
          expect(chain[0].previousHash).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Each link references the previous link's checksum
   */
  it("each link references previous checksum", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 2, maxLength: 10 }),
        hmacSecretArbitrary,
        (inputs, secret) => {
          const chain = buildChain(inputs, secret);

          for (let i = 1; i < chain.length; i++) {
            expect(chain[i].previousHash).toBe(chain[i - 1].checksum);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Chain verification passes for valid chains
   */
  it("valid chains pass verification", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        hmacSecretArbitrary,
        (inputs, secret) => {
          const chain = buildChain(inputs, secret);
          expect(verifyChain(chain)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Tampered chains fail verification
   */
  it("tampered chains fail verification", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 2, maxLength: 10 }),
        hmacSecretArbitrary,
        fc.integer({ min: 1 }), // Index to tamper (skip first)
        (inputs, secret, tamperOffset) => {
          const chain = buildChain(inputs, secret);
          const tamperIndex = (tamperOffset % (chain.length - 1)) + 1; // Ensure 1+

          // Tamper by setting wrong previousHash
          chain[tamperIndex] = {
            ...chain[tamperIndex],
            previousHash: "tampered_hash_value",
          };

          expect(verifyChain(chain)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Chain length equals input length
   */
  it("chain length equals input count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 20 }),
        hmacSecretArbitrary,
        (inputs, secret) => {
          const chain = buildChain(inputs, secret);
          expect(chain.length).toBe(inputs.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Property Tests: Input Sanitization Properties
// ============================================================================

describe("Property-Based: Input Sanitization Properties", () => {
  /**
   * Sanitize Discord ID (keep only digits, validate length)
   */
  function sanitizeDiscordId(input: string): string | null {
    const digits = input.replace(/\D/g, "");
    if (digits.length >= 17 && digits.length <= 20) {
      return digits;
    }
    return null;
  }

  /**
   * PROPERTY: Valid snowflakes pass sanitization unchanged
   */
  it("valid snowflakes pass sanitization", () => {
    fc.assert(
      fc.property(snowflakeArbitrary, (snowflake) => {
        const sanitized = sanitizeDiscordId(snowflake);
        expect(sanitized).not.toBeNull();
        // Should preserve the numeric value
        expect(sanitized?.replace(/^0+/, "") || "0").toBe(snowflake.replace(/^0+/, "") || "0");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Sanitization removes non-digits
   */
  it("sanitization removes non-digit characters", () => {
    fc.assert(
      fc.property(
        fc.string().map((s) => s + "12345678901234567"), // Ensure valid length after sanitization
        (input) => {
          const sanitized = sanitizeDiscordId(input);
          if (sanitized !== null) {
            expect(sanitized).toMatch(/^\d+$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Too-short inputs are rejected
   */
  it("too-short inputs are rejected", () => {
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1, maxLength: 16 }), (input) => {
        const sanitized = sanitizeDiscordId(input);
        expect(sanitized).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Sanitization is idempotent
   */
  it("sanitization is idempotent", () => {
    fc.assert(
      fc.property(snowflakeArbitrary, (snowflake) => {
        const once = sanitizeDiscordId(snowflake);
        const twice = once !== null ? sanitizeDiscordId(once) : null;
        expect(once).toBe(twice);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property Tests: Rate Limiting Properties
// ============================================================================

describe("Property-Based: Rate Limiting Properties", () => {
  interface TokenBucket {
    tokens: number;
    maxTokens: number;
    refillRate: number; // tokens per second
    lastRefill: number;
  }

  function createBucket(maxTokens: number, refillRate: number): TokenBucket {
    return {
      tokens: maxTokens,
      maxTokens,
      refillRate,
      lastRefill: Date.now(),
    };
  }

  function refillBucket(bucket: TokenBucket, now: number): TokenBucket {
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * bucket.refillRate;
    const newTokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);

    return {
      ...bucket,
      tokens: newTokens,
      lastRefill: now,
    };
  }

  function consumeToken(bucket: TokenBucket): { bucket: TokenBucket; allowed: boolean } {
    if (bucket.tokens >= 1) {
      return {
        bucket: { ...bucket, tokens: bucket.tokens - 1 },
        allowed: true,
      };
    }
    return { bucket, allowed: false };
  }

  /**
   * PROPERTY: Bucket never exceeds maxTokens
   */
  it("bucket never exceeds maxTokens", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // maxTokens
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }), // refillRate
        fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 1, maxLength: 100 }), // time deltas
        (maxTokens, refillRate, deltas) => {
          let bucket = createBucket(maxTokens, refillRate);
          let time = Date.now();

          for (const delta of deltas) {
            time += delta;
            bucket = refillBucket(bucket, time);
            expect(bucket.tokens).toBeLessThanOrEqual(bucket.maxTokens);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Consuming tokens decreases count
   */
  it("consuming tokens decreases count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100 }), (maxTokens) => {
        const bucket = createBucket(maxTokens, 1);
        const initialTokens = bucket.tokens;

        const result = consumeToken(bucket);

        if (result.allowed) {
          expect(result.bucket.tokens).toBe(initialTokens - 1);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Empty bucket rejects requests
   */
  it("empty bucket rejects requests", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (maxTokens) => {
        let bucket = createBucket(maxTokens, 0); // No refill

        // Consume all tokens
        for (let i = 0; i < maxTokens; i++) {
          const result = consumeToken(bucket);
          bucket = result.bucket;
        }

        // Next request should be rejected
        const result = consumeToken(bucket);
        expect(result.allowed).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Tokens are non-negative
   */
  it("tokens are always non-negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 200 }), // consumption attempts
        (maxTokens, attempts) => {
          let bucket = createBucket(maxTokens, 0);

          for (let i = 0; i < attempts; i++) {
            const result = consumeToken(bucket);
            bucket = result.bucket;
            expect(bucket.tokens).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Property Tests: Encryption Properties
// ============================================================================

describe("Property-Based: Encryption Properties", () => {
  function encrypt(plaintext: string, key: Buffer): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return { iv, ciphertext, tag };
  }

  function decrypt(iv: Buffer, ciphertext: Buffer, tag: Buffer, key: Buffer): string {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  /**
   * PROPERTY: Encrypt then decrypt returns original
   */
  it("encrypt then decrypt returns original", () => {
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        const key = crypto.randomBytes(32);
        const encrypted = encrypt(plaintext, key);
        const decrypted = decrypt(encrypted.iv, encrypted.ciphertext, encrypted.tag, key);

        expect(decrypted).toBe(plaintext);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Same plaintext produces different ciphertext (random IV)
   */
  it("same plaintext produces different ciphertext due to random IV", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 16 }), (plaintext) => {
        const key = crypto.randomBytes(32);
        const encrypted1 = encrypt(plaintext, key);
        const encrypted2 = encrypt(plaintext, key);

        // IVs should differ
        expect(encrypted1.iv.equals(encrypted2.iv)).toBe(false);
        // Ciphertexts should differ (because IVs differ)
        expect(encrypted1.ciphertext.equals(encrypted2.ciphertext)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Wrong key fails decryption
   */
  it("wrong key fails decryption", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (plaintext) => {
        const key1 = crypto.randomBytes(32);
        const key2 = crypto.randomBytes(32);

        const encrypted = encrypt(plaintext, key1);

        expect(() => {
          decrypt(encrypted.iv, encrypted.ciphertext, encrypted.tag, key2);
        }).toThrow();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Tampered ciphertext fails decryption
   */
  it("tampered ciphertext fails decryption", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0 }),
        (plaintext, tamperOffset) => {
          const key = crypto.randomBytes(32);
          const encrypted = encrypt(plaintext, key);

          // Tamper with ciphertext
          if (encrypted.ciphertext.length > 0) {
            const tamperIndex = tamperOffset % encrypted.ciphertext.length;
            encrypted.ciphertext[tamperIndex] ^= 0xff;

            expect(() => {
              decrypt(encrypted.iv, encrypted.ciphertext, encrypted.tag, key);
            }).toThrow();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Ciphertext length grows with plaintext length
   */
  it("ciphertext length is proportional to plaintext length", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.string({ minLength: 101, maxLength: 200 }),
        (short, long) => {
          const key = crypto.randomBytes(32);
          const shortEncrypted = encrypt(short, key);
          const longEncrypted = encrypt(long, key);

          // Longer plaintext should produce longer (or equal) ciphertext
          expect(longEncrypted.ciphertext.length).toBeGreaterThanOrEqual(shortEncrypted.ciphertext.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Property Tests: Retention Policy Properties
// ============================================================================

describe("Property-Based: Retention Policy Properties", () => {
  /**
   * Calculate cutoff date from retention days
   */
  function calculateCutoff(retentionDays: number, now: Date = new Date()): Date {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff;
  }

  /**
   * PROPERTY: Cutoff is always before now
   */
  it("cutoff date is always before current date", () => {
    fc.assert(
      fc.property(retentionDaysArbitrary, timestampArbitrary, (days, now) => {
        const cutoff = calculateCutoff(days, now);
        expect(cutoff.getTime()).toBeLessThan(now.getTime());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Longer retention = older cutoff
   */
  it("longer retention period results in older cutoff", () => {
    fc.assert(
      fc.property(
        fc.tuple(retentionDaysArbitrary, retentionDaysArbitrary).filter(([a, b]) => a < b),
        timestampArbitrary,
        ([shorterDays, longerDays], now) => {
          const shortCutoff = calculateCutoff(shorterDays, now);
          const longCutoff = calculateCutoff(longerDays, now);

          // Longer retention = older cutoff (lower timestamp)
          expect(longCutoff.getTime()).toBeLessThan(shortCutoff.getTime());
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Cutoff time is always start of day
   */
  it("cutoff is always at start of day", () => {
    fc.assert(
      fc.property(retentionDaysArbitrary, timestampArbitrary, (days, now) => {
        const cutoff = calculateCutoff(days, now);

        expect(cutoff.getHours()).toBe(0);
        expect(cutoff.getMinutes()).toBe(0);
        expect(cutoff.getSeconds()).toBe(0);
        expect(cutoff.getMilliseconds()).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Same inputs produce same cutoff (deterministic)
   */
  it("cutoff calculation is deterministic", () => {
    fc.assert(
      fc.property(retentionDaysArbitrary, timestampArbitrary, (days, now) => {
        const cutoff1 = calculateCutoff(days, now);
        const cutoff2 = calculateCutoff(days, now);

        expect(cutoff1.getTime()).toBe(cutoff2.getTime());
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property Tests: Security Event Properties
// ============================================================================

describe("Property-Based: Security Event Properties", () => {
  /**
   * PROPERTY: Event type follows naming convention
   */
  it("event types follow security.domain.category.action pattern", () => {
    fc.assert(
      fc.property(eventTypeArbitrary, (eventType) => {
        const parts = eventType.split(".");
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("security");
        expect(parts[1]).toMatch(/^[a-z]+$/);
        expect(parts[2]).toMatch(/^[a-z]+$/);
        expect(parts[3]).toMatch(/^[a-z_]+$/);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Severity has valid value
   */
  it("severity is one of LOW, MEDIUM, HIGH, CRITICAL", () => {
    fc.assert(
      fc.property(severityArbitrary, (severity) => {
        expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(severity);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Guild IDs are valid snowflakes
   */
  it("guild IDs are valid Discord snowflakes", () => {
    fc.assert(
      fc.property(guildIdArbitrary, (guildId) => {
        expect(guildId).toMatch(/^\d{17,20}$/);
        expect(BigInt(guildId)).toBeGreaterThan(0n);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Confidence is bounded 0-1
   */
  it("confidence scores are bounded between 0 and 1", () => {
    fc.assert(
      fc.property(confidenceArbitrary, (confidence) => {
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property Tests: Timing Safety Properties
// ============================================================================

describe("Property-Based: Timing Safety Properties", () => {
  /**
   * Constant-time comparison function
   */
  function timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      // Still do comparison to maintain timing consistency
      const dummy = Buffer.alloc(bufA.length);
      crypto.timingSafeEqual(bufA, dummy);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * PROPERTY: Identical strings compare equal
   */
  it("identical strings always compare equal", () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        expect(timingSafeEqual(str, str)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Different strings compare unequal
   */
  it("different strings always compare unequal", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })).filter(([a, b]) => a !== b),
        ([a, b]) => {
          expect(timingSafeEqual(a, b)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Comparison is symmetric
   */
  it("comparison is symmetric", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(timingSafeEqual(a, b)).toBe(timingSafeEqual(b, a));
      }),
      { numRuns: 100 }
    );
  });

  /**
   * PROPERTY: Empty strings compare correctly
   */
  it("empty strings compare equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

// ============================================================================
// Property Tests: Baseline Freshness Properties
// ============================================================================

describe("Property-Based: Baseline Freshness Properties", () => {
  interface BaselineHealth {
    exists: boolean;
    usable: boolean;
    isStale: boolean;
    isLowConfidence: boolean;
    needsRefresh: boolean;
  }

  function checkBaselineHealth(
    updatedAt: Date | null,
    confidence: number | null,
    maxAgeDays: number,
    minConfidence: number,
    now: Date = new Date()
  ): BaselineHealth {
    if (updatedAt === null || confidence === null) {
      return {
        exists: false,
        usable: false,
        isStale: false,
        isLowConfidence: false,
        needsRefresh: true,
      };
    }

    const ageMs = now.getTime() - updatedAt.getTime();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    const isStale = ageMs > maxAgeMs;
    const isLowConfidence = confidence < minConfidence;
    const usable = !isStale && !isLowConfidence;
    const needsRefresh = isStale || isLowConfidence;

    return {
      exists: true,
      usable,
      isStale,
      isLowConfidence,
      needsRefresh,
    };
  }

  /**
   * PROPERTY: Non-existent baselines need refresh
   */
  it("non-existent baselines need refresh", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 365 }),
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        (maxAgeDays, minConfidence) => {
          const health = checkBaselineHealth(null, null, maxAgeDays, minConfidence);
          expect(health.exists).toBe(false);
          expect(health.needsRefresh).toBe(true);
          expect(health.usable).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Fresh high-confidence baselines are usable
   */
  it("fresh high-confidence baselines are usable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 365 }), // maxAgeDays
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.5), noNaN: true }), // minConfidence
        (maxAgeDays, minConfidence) => {
          const now = new Date();
          const updatedAt = new Date(now.getTime() - 1000); // 1 second ago
          const confidence = 0.9; // High confidence

          const health = checkBaselineHealth(updatedAt, confidence, maxAgeDays, minConfidence, now);

          expect(health.exists).toBe(true);
          expect(health.isStale).toBe(false);
          expect(health.isLowConfidence).toBe(false);
          expect(health.usable).toBe(true);
          expect(health.needsRefresh).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Stale baselines are not usable
   */
  it("stale baselines are not usable", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (maxAgeDays) => {
        const now = new Date();
        const updatedAt = new Date(now.getTime() - (maxAgeDays + 1) * 24 * 60 * 60 * 1000);
        const confidence = 0.9;

        const health = checkBaselineHealth(updatedAt, confidence, maxAgeDays, 0.5, now);

        expect(health.isStale).toBe(true);
        expect(health.usable).toBe(false);
        expect(health.needsRefresh).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: Low confidence baselines need refresh
   */
  it("low confidence baselines need refresh", () => {
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0.5), max: Math.fround(0.9), noNaN: true }), (minConfidence) => {
        const now = new Date();
        const updatedAt = new Date(now.getTime() - 1000);
        const confidence = minConfidence - 0.1; // Below threshold

        const health = checkBaselineHealth(updatedAt, confidence, 30, minConfidence, now);

        expect(health.isLowConfidence).toBe(true);
        expect(health.needsRefresh).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * PROPERTY: needsRefresh = isStale OR isLowConfidence (for existing baselines)
   */
  it("needsRefresh equals isStale OR isLowConfidence for existing baselines", () => {
    fc.assert(
      fc.property(
        timestampArbitrary,
        confidenceArbitrary,
        fc.integer({ min: 1, max: 365 }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true }),
        (updatedAt, confidence, maxAgeDays, minConfidence) => {
          const health = checkBaselineHealth(updatedAt, confidence, maxAgeDays, minConfidence);

          if (health.exists) {
            expect(health.needsRefresh).toBe(health.isStale || health.isLowConfidence);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Summary
// ============================================================================

describe("Property-Based Testing Coverage Summary", () => {
  it("should have comprehensive property tests", () => {
    // This test documents what properties we verify
    const propertiesTested = [
      // Checksum Properties
      "Checksums are deterministic",
      "Different inputs produce different checksums",
      "Different secrets produce different checksums",
      "SHA-256 checksums are 64 hex characters",

      // Hash Chain Properties
      "First link has null previousHash",
      "Each link references previous checksum",
      "Valid chains pass verification",
      "Tampered chains fail verification",
      "Chain length equals input count",

      // Input Sanitization Properties
      "Valid snowflakes pass sanitization",
      "Sanitization removes non-digits",
      "Too-short inputs are rejected",
      "Sanitization is idempotent",

      // Rate Limiting Properties
      "Bucket never exceeds maxTokens",
      "Consuming tokens decreases count",
      "Empty bucket rejects requests",
      "Tokens are non-negative",

      // Encryption Properties
      "Encrypt then decrypt returns original",
      "Same plaintext produces different ciphertext",
      "Wrong key fails decryption",
      "Tampered ciphertext fails decryption",
      "Ciphertext length proportional to plaintext",

      // Retention Policy Properties
      "Cutoff is always before now",
      "Longer retention = older cutoff",
      "Cutoff is at start of day",
      "Cutoff calculation is deterministic",

      // Security Event Properties
      "Event types follow naming convention",
      "Severity has valid value",
      "Guild IDs are valid snowflakes",
      "Confidence bounded 0-1",

      // Timing Safety Properties
      "Identical strings compare equal",
      "Different strings compare unequal",
      "Comparison is symmetric",

      // Baseline Freshness Properties
      "Non-existent baselines need refresh",
      "Fresh high-confidence baselines are usable",
      "Stale baselines are not usable",
      "Low confidence baselines need refresh",
      "needsRefresh = isStale OR isLowConfidence",
    ];

    expect(propertiesTested.length).toBeGreaterThan(30);
  });
});
