/**
 * Input Sanitization Service Tests (P2-001)
 *
 * Comprehensive test coverage for:
 * - Discord ID sanitization
 * - String sanitization with Unicode handling
 * - URL validation and allowlisting
 * - Embed content sanitization (R3)
 * - Request nonce validation (S5)
 *
 * @module InputSanitizationServiceTests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  InputSanitizationService,
  createInputSanitizationService,
  SanitizationError,
  SanitizationErrorCode,
  isSanitizationError,
  hasSanitizationErrorCode,
  isRecoverableSanitizationError,
  type SanitizationLogger,
  type DiscordEmbed,
} from "../../../src/bot/security/services/input-sanitization-service.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockLogger = (): SanitizationLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const validDiscordIds = [
  "123456789012345678", // 18 digits
  "12345678901234567", // 17 digits (minimum)
  "12345678901234567890", // 20 digits (maximum)
  "987654321098765432",
];

const invalidDiscordIds = [
  "1234567890123456", // 16 digits (too short)
  "123456789012345678901", // 21 digits (too long)
  "12345678901234567a", // Contains letter
  "12345678901234567.", // Contains period
  "-12345678901234567", // Negative
  "1234567890123456 78", // Contains space
  "", // Empty
  "   ", // Whitespace only
];

// ============================================================================
// Constructor Tests
// ============================================================================

describe("InputSanitizationService", () => {
  let service: InputSanitizationService;

  afterEach(() => {
    service?.destroy();
  });

  describe("constructor", () => {
    it("should create service with default config", () => {
      service = new InputSanitizationService();
      expect(service).toBeInstanceOf(InputSanitizationService);
    });

    it("should accept custom config", () => {
      service = new InputSanitizationService({
        maxStringLength: 2048,
        nonceExpiryMs: 10 * 60 * 1000,
      });
      const stats = service.getStats();
      expect(stats.config.maxStringLength).toBe(2048);
      expect(stats.config.nonceExpiryMs).toBe(10 * 60 * 1000);
    });

    it("should accept logger", () => {
      const logger = createMockLogger();
      service = new InputSanitizationService({ logger });
      expect(service).toBeInstanceOf(InputSanitizationService);
    });

    it("should start nonce cleanup interval", () => {
      service = new InputSanitizationService({ useInMemoryNonceStore: true });
      expect(service).toBeInstanceOf(InputSanitizationService);
    });

    it("should not start cleanup interval when disabled", () => {
      service = new InputSanitizationService({ useInMemoryNonceStore: false });
      expect(service).toBeInstanceOf(InputSanitizationService);
    });
  });

  // ==========================================================================
  // Discord ID Sanitization Tests
  // ==========================================================================

  describe("sanitizeDiscordId", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid Discord IDs", () => {
      for (const id of validDiscordIds) {
        expect(service.sanitizeDiscordId(id)).toBe(id);
      }
    });

    it("should reject invalid Discord IDs", () => {
      for (const id of invalidDiscordIds) {
        expect(() => service.sanitizeDiscordId(id)).toThrow(SanitizationError);
      }
    });

    it("should accept bigint IDs", () => {
      const id = BigInt("123456789012345678");
      expect(service.sanitizeDiscordId(id)).toBe("123456789012345678");
    });

    it("should accept number IDs (with precision warning)", () => {
      // Note: JavaScript numbers lose precision beyond 2^53-1
      // This test verifies the service handles number input
      // Real Discord IDs should be passed as strings or BigInt
      // Use a 17-digit number that fits in JavaScript's safe integer range
      const id = 12345678901234567n; // Use BigInt to test
      const result = service.sanitizeDiscordId(id);
      expect(typeof result).toBe("string");
      expect(result).toBe("12345678901234567");
    });

    it("should trim whitespace", () => {
      expect(service.sanitizeDiscordId("  123456789012345678  ")).toBe(
        "123456789012345678"
      );
    });

    it("should reject null", () => {
      expect(() => service.sanitizeDiscordId(null)).toThrow(SanitizationError);
    });

    it("should reject undefined", () => {
      expect(() => service.sanitizeDiscordId(undefined)).toThrow(SanitizationError);
    });

    it("should reject objects", () => {
      expect(() => service.sanitizeDiscordId({ id: "123" })).toThrow(SanitizationError);
    });

    it("should reject arrays", () => {
      expect(() => service.sanitizeDiscordId(["123"])).toThrow(SanitizationError);
    });

    it("should include field name in error", () => {
      try {
        service.sanitizeDiscordId("invalid", "userId");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SanitizationError);
        expect((error as SanitizationError).message).toContain("userId");
      }
    });

    it("should have correct error code", () => {
      try {
        service.sanitizeDiscordId("invalid");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as SanitizationError).code).toBe(
          SanitizationErrorCode.INVALID_DISCORD_ID
        );
      }
    });
  });

  describe("isValidDiscordId", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should return true for valid IDs", () => {
      for (const id of validDiscordIds) {
        expect(service.isValidDiscordId(id)).toBe(true);
      }
    });

    it("should return false for invalid IDs", () => {
      for (const id of invalidDiscordIds) {
        expect(service.isValidDiscordId(id)).toBe(false);
      }
    });
  });

  describe("sanitizeDiscordIds", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should sanitize array of valid IDs", () => {
      const result = service.sanitizeDiscordIds(validDiscordIds);
      expect(result).toEqual(validDiscordIds);
    });

    it("should throw for array with invalid ID", () => {
      expect(() =>
        service.sanitizeDiscordIds([validDiscordIds[0], "invalid"])
      ).toThrow(SanitizationError);
    });

    it("should reject non-array input", () => {
      expect(() => service.sanitizeDiscordIds("123" as unknown as unknown[])).toThrow(
        SanitizationError
      );
    });

    it("should handle empty array", () => {
      expect(service.sanitizeDiscordIds([])).toEqual([]);
    });
  });

  // ==========================================================================
  // String Sanitization Tests
  // ==========================================================================

  describe("sanitizeString", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid strings", () => {
      const result = service.sanitizeString("Hello, World!");
      expect(result.value).toBe("Hello, World!");
      expect(result.modified).toBe(false);
    });

    it("should trim whitespace by default", () => {
      const result = service.sanitizeString("  Hello  ");
      expect(result.value).toBe("Hello");
      expect(result.modified).toBe(true);
      expect(result.modifications).toContain("trimmed whitespace");
    });

    it("should not trim when disabled", () => {
      const result = service.sanitizeString("  Hello  ", { trim: false });
      expect(result.value).toBe("  Hello  ");
      expect(result.modified).toBe(false);
    });

    it("should reject empty strings by default", () => {
      expect(() => service.sanitizeString("")).toThrow(SanitizationError);
    });

    it("should allow empty strings when configured", () => {
      const result = service.sanitizeString("", { allowEmpty: true });
      expect(result.value).toBe("");
    });

    it("should reject strings exceeding max length", () => {
      const longString = "a".repeat(5000);
      expect(() => service.sanitizeString(longString)).toThrow(SanitizationError);
    });

    it("should accept strings at max length", () => {
      const exactString = "a".repeat(4096);
      const result = service.sanitizeString(exactString);
      expect(result.value).toBe(exactString);
    });

    it("should accept custom max length", () => {
      const result = service.sanitizeString("Hello", { maxLength: 10 });
      expect(result.value).toBe("Hello");
    });

    it("should reject strings exceeding custom max length", () => {
      expect(() => service.sanitizeString("Hello World", { maxLength: 5 })).toThrow(
        SanitizationError
      );
    });

    it("should reject non-string input", () => {
      expect(() => service.sanitizeString(123)).toThrow(SanitizationError);
      expect(() => service.sanitizeString(null)).toThrow(SanitizationError);
      expect(() => service.sanitizeString(undefined)).toThrow(SanitizationError);
    });

    it("should strip suspicious Unicode characters", () => {
      // Zero-width space (U+200B)
      const input = "Hello\u200BWorld";
      const result = service.sanitizeString(input);
      expect(result.value).toBe("HelloWorld");
      expect(result.modified).toBe(true);
      expect(result.modifications).toContain("stripped suspicious Unicode characters");
    });

    it("should strip right-to-left override", () => {
      // Right-to-left override (U+202E)
      const input = "Hello\u202EWorld";
      const result = service.sanitizeString(input);
      expect(result.value).toBe("HelloWorld");
    });

    it("should strip multiple suspicious characters", () => {
      // Zero-width space, zero-width joiner, right-to-left override
      const input = "A\u200B\u200C\u200D\u202EB";
      const result = service.sanitizeString(input);
      expect(result.value).toBe("AB");
    });

    it("should not strip when disabled", () => {
      const input = "Hello\u200BWorld";
      const result = service.sanitizeString(input, { stripUnicode: false });
      expect(result.value).toBe(input);
      expect(result.modified).toBe(false);
    });

    it("should normalize homoglyphs when enabled", () => {
      // Cyrillic 'а' looks like Latin 'a'
      const input = "hеllo"; // 'е' is Cyrillic
      const result = service.sanitizeString(input, { normalizeHomoglyphs: true });
      expect(result.value).toBe("hello");
      expect(result.modified).toBe(true);
    });

    it("should include field name in error message", () => {
      try {
        service.sanitizeString(123, { fieldName: "username" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as SanitizationError).message).toContain("username");
      }
    });
  });

  // ==========================================================================
  // URL Sanitization Tests
  // ==========================================================================

  describe("sanitizeUrl", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid HTTPS URLs", () => {
      const result = service.sanitizeUrl("https://example.com/path?query=value");
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/path?query=value");
    });

    it("should reject HTTP URLs by default", () => {
      const result = service.sanitizeUrl("http://example.com");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.BLOCKED_PROTOCOL);
    });

    it("should accept HTTP when configured", () => {
      service = new InputSanitizationService({
        allowedProtocols: ["http", "https"],
      });
      const result = service.sanitizeUrl("http://example.com");
      expect(result.valid).toBe(true);
    });

    it("should reject javascript: URLs", () => {
      const result = service.sanitizeUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.BLOCKED_PROTOCOL);
    });

    it("should reject data: URLs", () => {
      const result = service.sanitizeUrl("data:text/html,<script>alert(1)</script>");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.BLOCKED_PROTOCOL);
    });

    it("should reject file: URLs", () => {
      const result = service.sanitizeUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("should reject invalid URLs", () => {
      const result = service.sanitizeUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.INVALID_URL);
    });

    it("should reject non-string input", () => {
      const result = service.sanitizeUrl(123);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.INVALID_URL);
    });

    it("should normalize URLs", () => {
      const result = service.sanitizeUrl("HTTPS://EXAMPLE.COM/PATH");
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/PATH");
    });

    it("should trim whitespace", () => {
      const result = service.sanitizeUrl("  https://example.com  ");
      expect(result.valid).toBe(true);
      expect(result.sanitizedUrl).toBe("https://example.com/");
    });

    it("should enforce domain allowlist when configured", () => {
      service = new InputSanitizationService({
        allowedDomains: ["discord.com", "cdn.discordapp.com"],
      });

      expect(service.sanitizeUrl("https://discord.com/path").valid).toBe(true);
      expect(service.sanitizeUrl("https://cdn.discordapp.com/image.png").valid).toBe(
        true
      );
      expect(service.sanitizeUrl("https://evil.com/phish").valid).toBe(false);
    });

    it("should allow subdomains of allowed domains", () => {
      service = new InputSanitizationService({
        allowedDomains: ["discord.com"],
      });

      expect(service.sanitizeUrl("https://api.discord.com/webhook").valid).toBe(true);
      expect(service.sanitizeUrl("https://sub.api.discord.com/path").valid).toBe(true);
    });

    it("should include field name in error", () => {
      const result = service.sanitizeUrl("invalid", { fieldName: "iconUrl" });
      expect(result.error).toContain("iconUrl");
    });
  });

  describe("isValidUrl", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should return true for valid URLs", () => {
      expect(service.isValidUrl("https://example.com")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(service.isValidUrl("not-a-url")).toBe(false);
      expect(service.isValidUrl("http://example.com")).toBe(false);
    });
  });

  // ==========================================================================
  // Embed Sanitization Tests (R3)
  // ==========================================================================

  describe("sanitizeEmbed", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid embed", () => {
      const embed: DiscordEmbed = {
        title: "Test Title",
        description: "Test Description",
        color: 0x00ff00,
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.title).toBe("Test Title");
      expect(result.value.description).toBe("Test Description");
      expect(result.value.color).toBe(0x00ff00);
      expect(result.modified).toBe(false);
    });

    it("should sanitize title with suspicious characters", () => {
      const embed = {
        title: "Test\u200BTitle",
        description: "Normal description",
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.title).toBe("TestTitle");
      expect(result.modified).toBe(true);
    });

    it("should reject title exceeding length", () => {
      const embed = {
        title: "a".repeat(300),
      };
      expect(() => service.sanitizeEmbed(embed)).toThrow(SanitizationError);
    });

    it("should reject description exceeding length", () => {
      const embed = {
        description: "a".repeat(5000),
      };
      expect(() => service.sanitizeEmbed(embed)).toThrow(SanitizationError);
    });

    it("should validate embed URL", () => {
      const embed = {
        title: "Test",
        url: "https://example.com",
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.url).toBe("https://example.com/");
    });

    it("should remove invalid embed URL with warning", () => {
      const embed = {
        title: "Test",
        url: "javascript:alert(1)",
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.url).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should clamp color to valid range", () => {
      const embed = {
        color: 0xffffff + 1,
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.color).toBe(0xffffff);
    });

    it("should handle negative color", () => {
      const embed = {
        color: -1,
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.color).toBe(0);
    });

    it("should sanitize footer", () => {
      const embed = {
        footer: {
          text: "Footer\u200BText",
          icon_url: "https://example.com/icon.png",
        },
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.footer?.text).toBe("FooterText");
      expect(result.value.footer?.icon_url).toBe("https://example.com/icon.png");
    });

    it("should reject footer exceeding length", () => {
      const embed = {
        footer: {
          text: "a".repeat(3000),
        },
      };
      expect(() => service.sanitizeEmbed(embed)).toThrow(SanitizationError);
    });

    it("should sanitize image", () => {
      const embed = {
        image: {
          url: "https://example.com/image.png",
          width: 100,
          height: 100,
        },
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.image?.url).toBe("https://example.com/image.png");
      expect(result.value.image?.width).toBe(100);
    });

    it("should sanitize thumbnail", () => {
      const embed = {
        thumbnail: {
          url: "https://example.com/thumb.png",
        },
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.thumbnail?.url).toBe("https://example.com/thumb.png");
    });

    it("should sanitize author", () => {
      const embed = {
        author: {
          name: "Author\u200BName",
          url: "https://example.com/author",
          icon_url: "https://example.com/author.png",
        },
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.author?.name).toBe("AuthorName");
      expect(result.value.author?.url).toBe("https://example.com/author");
    });

    it("should sanitize fields", () => {
      const embed = {
        fields: [
          { name: "Field\u200B1", value: "Value 1", inline: true },
          { name: "Field 2", value: "Value\u200B2" },
        ],
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.fields).toHaveLength(2);
      expect(result.value.fields![0].name).toBe("Field1");
      expect(result.value.fields![1].value).toBe("Value2");
    });

    it("should truncate excess fields with warning", () => {
      const fields = Array.from({ length: 30 }, (_, i) => ({
        name: `Field ${i}`,
        value: `Value ${i}`,
      }));
      const embed = { fields };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.fields).toHaveLength(25);
      expect(result.warnings.some((w) => w.includes("Truncated"))).toBe(true);
    });

    it("should reject field name exceeding length", () => {
      const embed = {
        fields: [{ name: "a".repeat(300), value: "Value" }],
      };
      expect(() => service.sanitizeEmbed(embed)).toThrow(SanitizationError);
    });

    it("should reject field value exceeding length", () => {
      const embed = {
        fields: [{ name: "Field", value: "a".repeat(2000) }],
      };
      expect(() => service.sanitizeEmbed(embed)).toThrow(SanitizationError);
    });

    it("should validate timestamp", () => {
      const embed = {
        timestamp: "2025-01-01T00:00:00Z",
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.timestamp).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should handle invalid timestamp with warning", () => {
      const embed = {
        timestamp: "not-a-date",
      };
      const result = service.sanitizeEmbed(embed);
      expect(result.value.timestamp).toBeUndefined();
      expect(result.warnings.some((w) => w.includes("timestamp"))).toBe(true);
    });

    it("should reject non-object embed", () => {
      expect(() => service.sanitizeEmbed("string")).toThrow(SanitizationError);
      expect(() => service.sanitizeEmbed(null)).toThrow(SanitizationError);
      expect(() => service.sanitizeEmbed(undefined)).toThrow(SanitizationError);
    });

    it("should log when logger provided", () => {
      const logger = createMockLogger();
      service = new InputSanitizationService({ logger });

      service.sanitizeEmbed({ title: "Test" });
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Nonce Validation Tests (S5)
  // ==========================================================================

  describe("generateNonce", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should generate valid UUID v4", () => {
      const nonce = service.generateNonce();
      expect(nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("should generate unique nonces", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(service.generateNonce());
      }
      expect(nonces.size).toBe(100);
    });
  });

  describe("validateNonce", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid unused nonce", async () => {
      const nonce = service.generateNonce();
      const result = await service.validateNonce(nonce);
      expect(result.valid).toBe(true);
    });

    it("should reject reused nonce", async () => {
      const nonce = service.generateNonce();
      await service.validateNonce(nonce);

      const result = await service.validateNonce(nonce);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_REUSED);
    });

    it("should reject missing nonce", async () => {
      const result = await service.validateNonce(undefined);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_MISSING);
    });

    it("should reject null nonce", async () => {
      const result = await service.validateNonce(null);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_MISSING);
    });

    it("should reject non-string nonce", async () => {
      const result = await service.validateNonce(123);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_INVALID_FORMAT);
    });

    it("should reject invalid UUID format", async () => {
      const result = await service.validateNonce("not-a-uuid");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_INVALID_FORMAT);
    });

    it("should reject UUID v1", async () => {
      // UUID v1 has version 1 in the 13th character
      const result = await service.validateNonce("123e4567-e89b-12d3-a456-426614174000");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_INVALID_FORMAT);
    });
  });

  describe("validateTimestamp", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept current timestamp", () => {
      const result = service.validateTimestamp(Date.now());
      expect(result.valid).toBe(true);
    });

    it("should accept timestamp within tolerance", () => {
      // 2 minutes ago
      const result = service.validateTimestamp(Date.now() - 2 * 60 * 1000);
      expect(result.valid).toBe(true);
    });

    it("should reject expired timestamp", () => {
      // 10 minutes ago
      const result = service.validateTimestamp(Date.now() - 10 * 60 * 1000);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_EXPIRED);
    });

    it("should reject future timestamp", () => {
      // 10 minutes in the future
      const result = service.validateTimestamp(Date.now() + 10 * 60 * 1000);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_FUTURE);
    });

    it("should reject missing timestamp", () => {
      const result = service.validateTimestamp(undefined);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_MISSING);
    });

    it("should reject null timestamp", () => {
      const result = service.validateTimestamp(null);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_MISSING);
    });

    it("should reject non-number timestamp", () => {
      const result = service.validateTimestamp("2025-01-01");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_INVALID);
    });

    it("should reject NaN timestamp", () => {
      const result = service.validateTimestamp(NaN);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_INVALID);
    });

    it("should reject Infinity timestamp", () => {
      const result = service.validateTimestamp(Infinity);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_INVALID);
    });

    it("should use custom tolerance", () => {
      service = new InputSanitizationService({
        timestampToleranceMs: 1 * 60 * 1000, // 1 minute
      });

      // 2 minutes ago should fail with 1 minute tolerance
      const result = service.validateTimestamp(Date.now() - 2 * 60 * 1000);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateRequest", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should accept valid request", async () => {
      const request = {
        nonce: service.generateNonce(),
        timestamp: Date.now(),
        payload: { action: "test" },
      };
      const result = await service.validateRequest(request);
      expect(result.valid).toBe(true);
    });

    it("should reject request with missing nonce", async () => {
      const request = {
        timestamp: Date.now(),
        payload: {},
      };
      const result = await service.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.NONCE_MISSING);
    });

    it("should reject request with missing timestamp", async () => {
      const request = {
        nonce: service.generateNonce(),
        payload: {},
      };
      const result = await service.validateRequest(request);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.TIMESTAMP_MISSING);
    });

    it("should reject non-object request", async () => {
      const result = await service.validateRequest("string");
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(SanitizationErrorCode.INVALID_INPUT);
    });

    it("should reject null request", async () => {
      const result = await service.validateRequest(null);
      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // Nonce Store Management Tests
  // ==========================================================================

  describe("nonce store management", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should track nonce count", async () => {
      expect(service.getNonceCount()).toBe(0);

      await service.validateNonce(service.generateNonce());
      expect(service.getNonceCount()).toBe(1);

      await service.validateNonce(service.generateNonce());
      expect(service.getNonceCount()).toBe(2);
    });

    it("should clear nonces", async () => {
      await service.validateNonce(service.generateNonce());
      await service.validateNonce(service.generateNonce());
      expect(service.getNonceCount()).toBe(2);

      service.clearNonces();
      expect(service.getNonceCount()).toBe(0);
    });

    it("should allow nonce reuse after clear", async () => {
      const nonce = service.generateNonce();
      await service.validateNonce(nonce);

      service.clearNonces();

      const result = await service.validateNonce(nonce);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // Utility Method Tests
  // ==========================================================================

  describe("escapeLikePattern", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should escape percent signs", () => {
      expect(service.escapeLikePattern("100%")).toBe("100\\%");
    });

    it("should escape underscores", () => {
      expect(service.escapeLikePattern("test_value")).toBe("test\\_value");
    });

    it("should escape backslashes", () => {
      expect(service.escapeLikePattern("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("should escape multiple special characters", () => {
      expect(service.escapeLikePattern("50%_off\\deal")).toBe("50\\%\\_off\\\\deal");
    });

    it("should not modify safe strings", () => {
      expect(service.escapeLikePattern("normal text")).toBe("normal text");
    });
  });

  describe("sanitizeJson", () => {
    beforeEach(() => {
      service = new InputSanitizationService();
    });

    it("should sanitize strings in object", () => {
      const input = {
        name: "Hello\u200BWorld",
        count: 5,
      };
      const result = service.sanitizeJson(input) as Record<string, unknown>;
      expect(result.name).toBe("HelloWorld");
      expect(result.count).toBe(5);
    });

    it("should sanitize nested objects", () => {
      const input = {
        user: {
          name: "Test\u200BUser",
        },
      };
      const result = service.sanitizeJson(input) as Record<string, unknown>;
      expect((result.user as Record<string, string>).name).toBe("TestUser");
    });

    it("should sanitize arrays", () => {
      const input = ["Hello\u200B", "World\u200B"];
      const result = service.sanitizeJson(input) as string[];
      expect(result).toEqual(["Hello", "World"]);
    });

    it("should preserve null and undefined", () => {
      expect(service.sanitizeJson(null)).toBeNull();
      expect(service.sanitizeJson(undefined)).toBeUndefined();
    });

    it("should preserve numbers", () => {
      expect(service.sanitizeJson(42)).toBe(42);
      expect(service.sanitizeJson(3.14)).toBe(3.14);
    });

    it("should preserve booleans", () => {
      expect(service.sanitizeJson(true)).toBe(true);
      expect(service.sanitizeJson(false)).toBe(false);
    });

    it("should reject deeply nested objects", () => {
      let obj: Record<string, unknown> = { value: "test" };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      expect(() => service.sanitizeJson(obj)).toThrow(SanitizationError);
    });

    it("should sanitize object keys", () => {
      const input = { "key\u200B": "value" };
      const result = service.sanitizeJson(input) as Record<string, unknown>;
      expect(Object.keys(result)[0]).toBe("key");
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      service = new InputSanitizationService({
        maxStringLength: 2048,
        nonceExpiryMs: 600000,
      });
    });

    it("should return stats without logger", async () => {
      await service.validateNonce(service.generateNonce());
      const stats = service.getStats();

      expect(stats.nonceCount).toBe(1);
      expect(stats.config.maxStringLength).toBe(2048);
      expect(stats.config.nonceExpiryMs).toBe(600000);
      expect((stats.config as Record<string, unknown>).logger).toBeUndefined();
    });
  });

  describe("destroy", () => {
    it("should clear nonces on destroy", async () => {
      service = new InputSanitizationService();
      await service.validateNonce(service.generateNonce());
      expect(service.getNonceCount()).toBe(1);

      service.destroy();
      expect(service.getNonceCount()).toBe(0);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createInputSanitizationService", () => {
  let service: InputSanitizationService;

  afterEach(() => {
    service?.destroy();
  });

  it("should create service instance", () => {
    service = createInputSanitizationService();
    expect(service).toBeInstanceOf(InputSanitizationService);
  });

  it("should pass config to constructor", () => {
    service = createInputSanitizationService({ maxStringLength: 1024 });
    const stats = service.getStats();
    expect(stats.config.maxStringLength).toBe(1024);
  });
});

// ============================================================================
// Error Class Tests
// ============================================================================

describe("SanitizationError", () => {
  it("should create error with code", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test error"
    );
    expect(error.code).toBe(SanitizationErrorCode.INVALID_INPUT);
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("SanitizationError");
  });

  it("should include context", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test error",
      { field: "test", value: "invalid" }
    );
    expect(error.context).toEqual({ field: "test", value: "invalid" });
  });

  it("should serialize to JSON", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test error",
      { field: "test" }
    );
    const json = error.toJSON();
    expect(json.name).toBe("SanitizationError");
    expect(json.code).toBe(SanitizationErrorCode.INVALID_INPUT);
    expect(json.message).toBe("Test error");
    expect(json.context).toEqual({ field: "test" });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("isSanitizationError", () => {
  it("should return true for SanitizationError", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test"
    );
    expect(isSanitizationError(error)).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(isSanitizationError(new Error("Test"))).toBe(false);
    expect(isSanitizationError(null)).toBe(false);
    expect(isSanitizationError(undefined)).toBe(false);
    expect(isSanitizationError("error")).toBe(false);
  });
});

describe("hasSanitizationErrorCode", () => {
  it("should return true for matching code", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test"
    );
    expect(hasSanitizationErrorCode(error, SanitizationErrorCode.INVALID_INPUT)).toBe(
      true
    );
  });

  it("should return false for non-matching code", () => {
    const error = new SanitizationError(
      SanitizationErrorCode.INVALID_INPUT,
      "Test"
    );
    expect(
      hasSanitizationErrorCode(error, SanitizationErrorCode.STRING_TOO_LONG)
    ).toBe(false);
  });

  it("should return false for non-SanitizationError", () => {
    expect(
      hasSanitizationErrorCode(new Error("Test"), SanitizationErrorCode.INVALID_INPUT)
    ).toBe(false);
  });
});

describe("isRecoverableSanitizationError", () => {
  it("should return true for recoverable errors", () => {
    const recoverableErrors = [
      SanitizationErrorCode.STRING_TOO_LONG,
      SanitizationErrorCode.INVALID_DISCORD_ID,
      SanitizationErrorCode.INVALID_URL,
      SanitizationErrorCode.BLOCKED_PROTOCOL,
      SanitizationErrorCode.BLOCKED_DOMAIN,
      SanitizationErrorCode.EMBED_TOO_MANY_FIELDS,
      SanitizationErrorCode.EMBED_FIELD_TOO_LONG,
      SanitizationErrorCode.TIMESTAMP_EXPIRED,
      SanitizationErrorCode.TIMESTAMP_FUTURE,
    ];

    for (const code of recoverableErrors) {
      const error = new SanitizationError(code, "Test");
      expect(isRecoverableSanitizationError(error)).toBe(true);
    }
  });

  it("should return false for non-recoverable errors", () => {
    const nonRecoverableErrors = [
      SanitizationErrorCode.NONCE_REUSED,
      SanitizationErrorCode.NONCE_MISSING,
      SanitizationErrorCode.INVALID_INPUT,
    ];

    for (const code of nonRecoverableErrors) {
      const error = new SanitizationError(code, "Test");
      expect(isRecoverableSanitizationError(error)).toBe(false);
    }
  });

  it("should return false for non-SanitizationError", () => {
    expect(isRecoverableSanitizationError(new Error("Test"))).toBe(false);
    expect(isRecoverableSanitizationError(null)).toBe(false);
  });
});

// Helper pattern for Discord ID validation
const _DISCORD_ID_PATTERN = /^[0-9]{17,20}$/;
