/**
 * Crypto Provider Tests
 *
 * @module tests/security/crypto/crypto-provider.test
 * @description Comprehensive test suite for cryptographic provider abstraction.
 * Tests provider interface, default implementations, FIPS compliance,
 * and registry management.
 *
 * @research S11: Cryptographic Agility (Sprint 1)
 *
 * Test Categories:
 * 1. Default Provider - Hash, HMAC, Encryption
 * 2. FIPS Provider - Algorithm restrictions
 * 3. Provider Registry - Registration, switching
 * 4. Convenience Functions - Top-level API
 * 5. Security & Edge Cases
 *
 * @author Testing Specialist (Sprint 1)
 * @since 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  // Provider Classes
  DefaultCryptoProvider,
  FIPSCryptoProvider,
  // Provider Management
  getCryptoProvider,
  getCryptoProviderByName,
  setCryptoProvider,
  registerCryptoProvider,
  unregisterCryptoProvider,
  getCurrentProviderName,
  listCryptoProviders,
  resetCryptoRegistry,
  // Convenience Functions
  hash,
  verifyHashProvider,
  sign,
  verify,
  encrypt,
  decrypt,
  deriveKey,
  // Types
  type ICryptoProvider,
  type HashAlgorithm,
  type HmacAlgorithm,
  type EncryptionAlgorithm,
} from "../../../src/shared/crypto/index.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_DATA = "test data for cryptographic operations";
const TEST_SECRET = "test-secret-key-minimum-length-for-hmac-operations";
const TEST_KEY = crypto.randomBytes(32); // 256-bit key

function createTestProvider(): ICryptoProvider {
  return new DefaultCryptoProvider();
}

// ============================================================================
// Test Suite
// ============================================================================

describe("CryptoProvider", () => {
  // Reset registry after each test to prevent cross-test pollution
  afterEach(() => {
    resetCryptoRegistry();
  });

  // ==========================================================================
  // 1. Default Provider
  // ==========================================================================

  describe("DefaultCryptoProvider", () => {
    let provider: DefaultCryptoProvider;

    beforeEach(() => {
      provider = new DefaultCryptoProvider();
    });

    describe("Metadata", () => {
      it("should return provider metadata", () => {
        const metadata = provider.getMetadata();
        expect(metadata.name).toBe("default");
        expect(metadata.version).toBe("1.0.0");
        expect(metadata.hashAlgorithms).toContain("sha256");
        expect(metadata.hmacAlgorithms).toContain("sha256");
        expect(metadata.encryptionAlgorithms).toContain("aes-256-gcm");
      });

      it("should report capabilities correctly", () => {
        const { capabilities } = provider.getMetadata();
        expect(capabilities.supportsHash).toBe(true);
        expect(capabilities.supportsHmac).toBe(true);
        expect(capabilities.supportsEncryption).toBe(true);
        expect(capabilities.supportsKdf).toBe(true);
        expect(capabilities.fipsCompliant).toBe(false);
      });
    });

    describe("Hashing", () => {
      it("should hash data with SHA-256 (default)", () => {
        const hashValue = provider.hash(TEST_DATA);
        expect(hashValue).toHaveLength(64); // SHA-256 = 256 bits = 64 hex chars
        expect(hashValue).toMatch(/^[a-f0-9]+$/);
      });

      it("should hash data with SHA-384", () => {
        const hashValue = provider.hash(TEST_DATA, "sha384");
        expect(hashValue).toHaveLength(96); // SHA-384 = 384 bits = 96 hex chars
      });

      it("should hash data with SHA-512", () => {
        const hashValue = provider.hash(TEST_DATA, "sha512");
        expect(hashValue).toHaveLength(128); // SHA-512 = 512 bits = 128 hex chars
      });

      it("should hash data with SHA3-256", () => {
        const hashValue = provider.hash(TEST_DATA, "sha3-256");
        expect(hashValue).toHaveLength(64);
      });

      it("should produce deterministic hashes", () => {
        const hash1 = provider.hash(TEST_DATA);
        const hash2 = provider.hash(TEST_DATA);
        expect(hash1).toBe(hash2);
      });

      it("should produce different hashes for different data", () => {
        const hash1 = provider.hash("data one");
        const hash2 = provider.hash("data two");
        expect(hash1).not.toBe(hash2);
      });

      it("should verify hash correctly", () => {
        const hashValue = provider.hash(TEST_DATA);
        expect(provider.verifyHash(TEST_DATA, hashValue)).toBe(true);
      });

      it("should reject incorrect hash", () => {
        const wrongHash = "a".repeat(64);
        expect(provider.verifyHash(TEST_DATA, wrongHash)).toBe(false);
      });

      it("should hash Buffer input", () => {
        const buffer = Buffer.from(TEST_DATA);
        const hashValue = provider.hash(buffer);
        expect(hashValue).toHaveLength(64);
      });
    });

    describe("HMAC Signing", () => {
      it("should sign data with HMAC-SHA256 (default)", () => {
        const signature = provider.sign(TEST_DATA, TEST_SECRET);
        expect(signature).toHaveLength(64);
        expect(signature).toMatch(/^[a-f0-9]+$/);
      });

      it("should sign data with HMAC-SHA384", () => {
        const signature = provider.sign(TEST_DATA, TEST_SECRET, "sha384");
        expect(signature).toHaveLength(96);
      });

      it("should sign data with HMAC-SHA512", () => {
        const signature = provider.sign(TEST_DATA, TEST_SECRET, "sha512");
        expect(signature).toHaveLength(128);
      });

      it("should produce deterministic signatures", () => {
        const sig1 = provider.sign(TEST_DATA, TEST_SECRET);
        const sig2 = provider.sign(TEST_DATA, TEST_SECRET);
        expect(sig1).toBe(sig2);
      });

      it("should produce different signatures for different secrets", () => {
        const sig1 = provider.sign(TEST_DATA, "secret1");
        const sig2 = provider.sign(TEST_DATA, "secret2");
        expect(sig1).not.toBe(sig2);
      });

      it("should verify valid signature", () => {
        const signature = provider.sign(TEST_DATA, TEST_SECRET);
        expect(provider.verify(TEST_DATA, signature, TEST_SECRET)).toBe(true);
      });

      it("should reject invalid signature", () => {
        const wrongSignature = "b".repeat(64);
        expect(provider.verify(TEST_DATA, wrongSignature, TEST_SECRET)).toBe(false);
      });

      it("should reject signature with wrong secret", () => {
        const signature = provider.sign(TEST_DATA, TEST_SECRET);
        expect(provider.verify(TEST_DATA, signature, "wrong-secret")).toBe(false);
      });
    });

    describe("Encryption", () => {
      it("should encrypt and decrypt with AES-256-GCM (default)", () => {
        const plaintext = "sensitive data to encrypt";
        const payload = provider.encrypt(plaintext, TEST_KEY);

        expect(payload.algorithm).toBe("aes-256-gcm");
        expect(payload.ciphertext).toBeTruthy();
        expect(payload.iv).toBeTruthy();
        expect(payload.authTag).toBeTruthy();
        expect(payload.provider).toBe("default");

        const decrypted = provider.decrypt(payload, TEST_KEY);
        expect(decrypted).toBe(plaintext);
      });

      it("should encrypt and decrypt with AES-256-CBC", () => {
        const plaintext = "data for CBC mode";
        const payload = provider.encrypt(plaintext, TEST_KEY, "aes-256-cbc");

        expect(payload.algorithm).toBe("aes-256-cbc");
        expect(payload.authTag).toBeUndefined(); // CBC doesn't use auth tag

        const decrypted = provider.decrypt(payload, TEST_KEY);
        expect(decrypted).toBe(plaintext);
      });

      it("should encrypt and decrypt with ChaCha20-Poly1305", () => {
        const plaintext = "data for ChaCha20";
        const payload = provider.encrypt(plaintext, TEST_KEY, "chacha20-poly1305");

        expect(payload.algorithm).toBe("chacha20-poly1305");
        expect(payload.authTag).toBeTruthy();

        const decrypted = provider.decrypt(payload, TEST_KEY);
        expect(decrypted).toBe(plaintext);
      });

      it("should produce different ciphertext each time (random IV)", () => {
        const plaintext = "same plaintext";
        const payload1 = provider.encrypt(plaintext, TEST_KEY);
        const payload2 = provider.encrypt(plaintext, TEST_KEY);

        expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
        expect(payload1.iv).not.toBe(payload2.iv);
      });

      it("should fail decryption with wrong key", () => {
        const plaintext = "secret message";
        const payload = provider.encrypt(plaintext, TEST_KEY);
        const wrongKey = crypto.randomBytes(32);

        expect(() => provider.decrypt(payload, wrongKey)).toThrow();
      });

      it("should fail with invalid key length", () => {
        const shortKey = crypto.randomBytes(16); // 128-bit instead of 256-bit
        expect(() => provider.encrypt("test", shortKey)).toThrow(/Key must be 32 bytes/);
      });

      it("should fail decryption with tampered ciphertext", () => {
        const payload = provider.encrypt("test", TEST_KEY);
        payload.ciphertext = Buffer.from("tampered").toString("base64");

        expect(() => provider.decrypt(payload, TEST_KEY)).toThrow();
      });
    });

    describe("Key Derivation", () => {
      it("should derive key from password", () => {
        const salt = crypto.randomBytes(16);
        const key = provider.deriveKey("password123", salt);

        expect(key).toBeInstanceOf(Buffer);
        expect(key.length).toBe(32); // Default 256-bit key
      });

      it("should derive key with custom length", () => {
        const salt = crypto.randomBytes(16);
        const key = provider.deriveKey("password", salt, 64);

        expect(key.length).toBe(64);
      });

      it("should produce deterministic keys", () => {
        const salt = Buffer.from("fixed-salt-for-test");
        const key1 = provider.deriveKey("password", salt);
        const key2 = provider.deriveKey("password", salt);

        expect(key1.equals(key2)).toBe(true);
      });

      it("should produce different keys for different salts", () => {
        const salt1 = crypto.randomBytes(16);
        const salt2 = crypto.randomBytes(16);
        const key1 = provider.deriveKey("password", salt1);
        const key2 = provider.deriveKey("password", salt2);

        expect(key1.equals(key2)).toBe(false);
      });
    });

    describe("Custom Configuration", () => {
      it("should accept custom default hash algorithm", () => {
        const customProvider = new DefaultCryptoProvider({
          defaultHashAlgorithm: "sha512",
        });
        const hashValue = customProvider.hash(TEST_DATA);
        expect(hashValue).toHaveLength(128); // SHA-512
      });

      it("should accept custom default HMAC algorithm", () => {
        const customProvider = new DefaultCryptoProvider({
          defaultHmacAlgorithm: "sha384",
        });
        const signature = customProvider.sign(TEST_DATA, TEST_SECRET);
        expect(signature).toHaveLength(96); // SHA-384
      });

      it("should accept custom default encryption algorithm", () => {
        const customProvider = new DefaultCryptoProvider({
          defaultEncryptionAlgorithm: "aes-256-cbc",
        });
        const payload = customProvider.encrypt("test", TEST_KEY);
        expect(payload.algorithm).toBe("aes-256-cbc");
      });
    });
  });

  // ==========================================================================
  // 2. FIPS Provider
  // ==========================================================================

  describe("FIPSCryptoProvider", () => {
    let provider: FIPSCryptoProvider;

    beforeEach(() => {
      provider = new FIPSCryptoProvider();
    });

    describe("Metadata", () => {
      it("should identify as FIPS provider", () => {
        const metadata = provider.getMetadata();
        expect(metadata.name).toBe("fips");
        expect(metadata.capabilities.fipsCompliant).toBe(true);
      });

      it("should not include non-FIPS algorithms", () => {
        const metadata = provider.getMetadata();
        expect(metadata.hashAlgorithms).not.toContain("sha3-256");
        expect(metadata.encryptionAlgorithms).not.toContain("chacha20-poly1305");
      });
    });

    describe("FIPS Compliance", () => {
      it("should allow FIPS-approved hash algorithms", () => {
        expect(() => provider.hash(TEST_DATA, "sha256")).not.toThrow();
        expect(() => provider.hash(TEST_DATA, "sha384")).not.toThrow();
        expect(() => provider.hash(TEST_DATA, "sha512")).not.toThrow();
      });

      it("should reject non-FIPS hash algorithms", () => {
        expect(() => provider.hash(TEST_DATA, "sha3-256")).toThrow(/not FIPS 140-2 approved/);
      });

      it("should allow FIPS-approved HMAC algorithms", () => {
        expect(() => provider.sign(TEST_DATA, TEST_SECRET, "sha256")).not.toThrow();
        expect(() => provider.sign(TEST_DATA, TEST_SECRET, "sha384")).not.toThrow();
        expect(() => provider.sign(TEST_DATA, TEST_SECRET, "sha512")).not.toThrow();
      });

      it("should allow FIPS-approved encryption algorithms", () => {
        expect(() => provider.encrypt("test", TEST_KEY, "aes-256-gcm")).not.toThrow();
        expect(() => provider.encrypt("test", TEST_KEY, "aes-256-cbc")).not.toThrow();
      });

      it("should reject non-FIPS encryption algorithms", () => {
        expect(() => provider.encrypt("test", TEST_KEY, "chacha20-poly1305")).toThrow(/not FIPS 140-2 approved/);
      });
    });
  });

  // ==========================================================================
  // 3. Provider Registry
  // ==========================================================================

  describe("Provider Registry", () => {
    beforeEach(() => {
      resetCryptoRegistry();
    });

    describe("Default State", () => {
      it("should have default provider registered", () => {
        const providers = listCryptoProviders();
        expect(providers).toContain("default");
      });

      it("should have FIPS provider registered", () => {
        const providers = listCryptoProviders();
        expect(providers).toContain("fips");
      });

      it("should use default provider initially", () => {
        expect(getCurrentProviderName()).toBe("default");
      });
    });

    describe("Provider Switching", () => {
      it("should switch to FIPS provider", () => {
        setCryptoProvider("fips");
        expect(getCurrentProviderName()).toBe("fips");
        expect(getCryptoProvider().getMetadata().name).toBe("fips");
      });

      it("should switch back to default provider", () => {
        setCryptoProvider("fips");
        setCryptoProvider("default");
        expect(getCurrentProviderName()).toBe("default");
      });

      it("should throw when switching to unknown provider", () => {
        expect(() => setCryptoProvider("unknown")).toThrow(/not registered/);
      });
    });

    describe("Custom Provider Registration", () => {
      it("should register custom provider", () => {
        const customProvider = createTestProvider();
        registerCryptoProvider("custom", customProvider);
        
        expect(listCryptoProviders()).toContain("custom");
        expect(getCryptoProviderByName("custom")).toBeDefined();
      });

      it("should use registered custom provider", () => {
        const customProvider = createTestProvider();
        registerCryptoProvider("custom", customProvider);
        setCryptoProvider("custom");
        
        expect(getCurrentProviderName()).toBe("custom");
      });

      it("should throw when registering duplicate name", () => {
        const customProvider = createTestProvider();
        registerCryptoProvider("custom", customProvider);
        
        expect(() => registerCryptoProvider("custom", customProvider)).toThrow(/already registered/);
      });
    });

    describe("Provider Unregistration", () => {
      it("should unregister custom provider", () => {
        registerCryptoProvider("custom", createTestProvider());
        const result = unregisterCryptoProvider("custom");
        
        expect(result).toBe(true);
        expect(listCryptoProviders()).not.toContain("custom");
      });

      it("should return false for unknown provider", () => {
        const result = unregisterCryptoProvider("unknown");
        expect(result).toBe(false);
      });

      it("should not allow unregistering default provider", () => {
        expect(() => unregisterCryptoProvider("default")).toThrow(/Cannot unregister/);
      });

      it("should not allow unregistering active provider", () => {
        registerCryptoProvider("custom", createTestProvider());
        setCryptoProvider("custom");
        
        expect(() => unregisterCryptoProvider("custom")).toThrow(/active provider/);
      });
    });

    describe("Registry Reset", () => {
      it("should reset to default state", () => {
        registerCryptoProvider("custom", createTestProvider());
        setCryptoProvider("fips");
        
        resetCryptoRegistry();
        
        expect(getCurrentProviderName()).toBe("default");
        expect(listCryptoProviders()).toEqual(["default", "fips"]);
      });
    });
  });

  // ==========================================================================
  // 4. Convenience Functions
  // ==========================================================================

  describe("Convenience Functions", () => {
    beforeEach(() => {
      resetCryptoRegistry();
    });

    describe("hash()", () => {
      it("should hash using current provider", () => {
        const result = hash(TEST_DATA);
        expect(result).toHaveLength(64);
      });

      it("should accept algorithm parameter", () => {
        const result = hash(TEST_DATA, "sha512");
        expect(result).toHaveLength(128);
      });

      it("should use provider's hash when switched", () => {
        setCryptoProvider("fips");
        const result = hash(TEST_DATA, "sha256");
        expect(result).toHaveLength(64);
      });
    });

    describe("verifyHashProvider()", () => {
      it("should verify hash using current provider", () => {
        const hashValue = hash(TEST_DATA);
        expect(verifyHashProvider(TEST_DATA, hashValue)).toBe(true);
      });
    });

    describe("sign() and verify()", () => {
      it("should sign using current provider", () => {
        const signature = sign(TEST_DATA, TEST_SECRET);
        expect(signature).toHaveLength(64);
      });

      it("should verify signature using current provider", () => {
        const signature = sign(TEST_DATA, TEST_SECRET);
        expect(verify(TEST_DATA, signature, TEST_SECRET)).toBe(true);
      });

      it("should work after provider switch", () => {
        setCryptoProvider("fips");
        const signature = sign(TEST_DATA, TEST_SECRET, "sha256");
        expect(verify(TEST_DATA, signature, TEST_SECRET, "sha256")).toBe(true);
      });
    });

    describe("encrypt() and decrypt()", () => {
      it("should encrypt using current provider", () => {
        const payload = encrypt("test", TEST_KEY);
        expect(payload.ciphertext).toBeTruthy();
      });

      it("should decrypt using current provider", () => {
        const payload = encrypt("test message", TEST_KEY);
        const decrypted = decrypt(payload, TEST_KEY);
        expect(decrypted).toBe("test message");
      });

      it("should work after provider switch", () => {
        setCryptoProvider("fips");
        const payload = encrypt("fips data", TEST_KEY, "aes-256-gcm");
        const decrypted = decrypt(payload, TEST_KEY);
        expect(decrypted).toBe("fips data");
      });
    });

    describe("deriveKey()", () => {
      it("should derive key using current provider", () => {
        const salt = crypto.randomBytes(16);
        const key = deriveKey("password", salt);
        expect(key.length).toBe(32);
      });

      it("should work after provider switch", () => {
        setCryptoProvider("fips");
        const salt = crypto.randomBytes(16);
        const key = deriveKey("password", salt, 64);
        expect(key.length).toBe(64);
      });
    });
  });

  // ==========================================================================
  // 5. Security & Edge Cases
  // ==========================================================================

  describe("Security & Edge Cases", () => {
    let provider: DefaultCryptoProvider;

    beforeEach(() => {
      provider = new DefaultCryptoProvider();
    });

    describe("Timing-Safe Operations", () => {
      it("should use timing-safe comparison for hash verification", () => {
        const hashValue = provider.hash(TEST_DATA);
        
        // Measure verification times for valid and invalid hashes
        const startValid = performance.now();
        for (let i = 0; i < 100; i++) {
          provider.verifyHash(TEST_DATA, hashValue);
        }
        const validTime = performance.now() - startValid;

        const startInvalid = performance.now();
        const wrongHash = "0".repeat(64);
        for (let i = 0; i < 100; i++) {
          provider.verifyHash(TEST_DATA, wrongHash);
        }
        const invalidTime = performance.now() - startInvalid;

        // Times should be similar (within reasonable variance)
        const ratio = Math.max(validTime, invalidTime) / Math.min(validTime, invalidTime);
        expect(ratio).toBeLessThan(3);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty string hashing", () => {
        const hashValue = provider.hash("");
        expect(hashValue).toHaveLength(64);
      });

      it("should handle empty string signing", () => {
        const signature = provider.sign("", TEST_SECRET);
        expect(signature).toHaveLength(64);
        expect(provider.verify("", signature, TEST_SECRET)).toBe(true);
      });

      it("should handle empty string encryption", () => {
        const payload = provider.encrypt("", TEST_KEY);
        const decrypted = provider.decrypt(payload, TEST_KEY);
        expect(decrypted).toBe("");
      });

      it("should handle unicode data", () => {
        const unicodeData = "Hello 世界 🌍 émojis";
        const hashValue = provider.hash(unicodeData);
        expect(provider.verifyHash(unicodeData, hashValue)).toBe(true);
      });

      it("should handle unicode in encryption", () => {
        const unicodeData = "Encrypted 中文 data 🔐";
        const payload = provider.encrypt(unicodeData, TEST_KEY);
        const decrypted = provider.decrypt(payload, TEST_KEY);
        expect(decrypted).toBe(unicodeData);
      });

      it("should handle large data", () => {
        const largeData = "x".repeat(100000); // 100KB
        const hashValue = provider.hash(largeData);
        expect(provider.verifyHash(largeData, hashValue)).toBe(true);
      });

      it("should handle special characters", () => {
        const specialData = "test\x00null\x00bytes\nand\ttabs";
        const signature = provider.sign(specialData, TEST_SECRET);
        expect(provider.verify(specialData, signature, TEST_SECRET)).toBe(true);
      });
    });

    describe("Error Handling", () => {
      it("should throw on missing auth tag for AEAD decryption", () => {
        const payload = provider.encrypt("test", TEST_KEY, "aes-256-gcm");
        delete payload.authTag;
        
        expect(() => provider.decrypt(payload, TEST_KEY)).toThrow(/Auth tag required/);
      });

      it("should throw on key length mismatch", () => {
        const shortKey = crypto.randomBytes(16);
        expect(() => provider.encrypt("test", shortKey)).toThrow();
      });
    });
  });
});
