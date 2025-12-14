/**
 * Input Sanitization Service (P2-001)
 *
 * Comprehensive input validation and sanitization for security operations.
 * Implements:
 * - Discord ID validation and sanitization
 * - Embed content sanitization (R3: URL allowlisting + Unicode stripping)
 * - Request nonce validation for replay attack prevention (S5)
 * - General input validation utilities
 *
 * @module InputSanitizationService
 * @security CWE-79 (XSS), CWE-20 (Input Validation), CWE-294 (Replay Attacks)
 */
// ============================================================================
// Error Classes
// ============================================================================
/**
 * Error codes for sanitization failures
 */
export var SanitizationErrorCode;
(function (SanitizationErrorCode) {
    SanitizationErrorCode["INVALID_INPUT"] = "SAN_INVALID_INPUT";
    SanitizationErrorCode["STRING_TOO_LONG"] = "SAN_STRING_TOO_LONG";
    SanitizationErrorCode["INVALID_DISCORD_ID"] = "SAN_INVALID_DISCORD_ID";
    SanitizationErrorCode["INVALID_URL"] = "SAN_INVALID_URL";
    SanitizationErrorCode["BLOCKED_PROTOCOL"] = "SAN_BLOCKED_PROTOCOL";
    SanitizationErrorCode["BLOCKED_DOMAIN"] = "SAN_BLOCKED_DOMAIN";
    SanitizationErrorCode["SUSPICIOUS_UNICODE"] = "SAN_SUSPICIOUS_UNICODE";
    SanitizationErrorCode["EMBED_TOO_MANY_FIELDS"] = "SAN_EMBED_TOO_MANY_FIELDS";
    SanitizationErrorCode["EMBED_FIELD_TOO_LONG"] = "SAN_EMBED_FIELD_TOO_LONG";
    SanitizationErrorCode["NONCE_MISSING"] = "SAN_NONCE_MISSING";
    SanitizationErrorCode["NONCE_INVALID_FORMAT"] = "SAN_NONCE_INVALID_FORMAT";
    SanitizationErrorCode["NONCE_REUSED"] = "SAN_NONCE_REUSED";
    SanitizationErrorCode["NONCE_EXPIRED"] = "SAN_NONCE_EXPIRED";
    SanitizationErrorCode["TIMESTAMP_MISSING"] = "SAN_TIMESTAMP_MISSING";
    SanitizationErrorCode["TIMESTAMP_INVALID"] = "SAN_TIMESTAMP_INVALID";
    SanitizationErrorCode["TIMESTAMP_EXPIRED"] = "SAN_TIMESTAMP_EXPIRED";
    SanitizationErrorCode["TIMESTAMP_FUTURE"] = "SAN_TIMESTAMP_FUTURE";
})(SanitizationErrorCode || (SanitizationErrorCode = {}));
/**
 * Sanitization error with context
 */
export class SanitizationError extends Error {
    code;
    context;
    constructor(code, message, context = {}) {
        super(message);
        this.name = "SanitizationError";
        this.code = code;
        this.context = context;
        Object.setPrototypeOf(this, SanitizationError.prototype);
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
        };
    }
}
// ============================================================================
// Constants
// ============================================================================
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
    maxStringLength: 4096,
    maxEmbedFields: 25,
    maxEmbedTitleLength: 256,
    maxEmbedDescriptionLength: 4096,
    maxEmbedFooterLength: 2048,
    maxEmbedFieldNameLength: 256,
    maxEmbedFieldValueLength: 1024,
    nonceExpiryMs: 5 * 60 * 1000, // 5 minutes
    timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
    allowedProtocols: ["https"],
    allowedDomains: [], // Empty = all domains allowed after protocol check
    stripSuspiciousUnicode: true,
    useInMemoryNonceStore: true,
};
/**
 * Discord snowflake ID pattern (17-20 digits)
 */
const DISCORD_ID_PATTERN = /^[0-9]{17,20}$/;
/**
 * UUID v4 pattern for nonces
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Suspicious Unicode character ranges that can be used for spoofing
 * - Zero-width characters
 * - Right-to-left override characters
 * - Homoglyph confusables
 * - Invisible formatting characters
 */
const SUSPICIOUS_UNICODE_RANGES = [
    [0x200b, 0x200f], // Zero-width + directional formatting
    [0x202a, 0x202e], // Directional embedding and override
    [0x2060, 0x206f], // Word joiner and invisible operators
    [0xfeff, 0xfeff], // Zero-width no-break space (BOM)
    [0x00ad, 0x00ad], // Soft hyphen
    [0x034f, 0x034f], // Combining grapheme joiner
    [0x061c, 0x061c], // Arabic letter mark
    [0x115f, 0x1160], // Hangul fillers
    [0x17b4, 0x17b5], // Khmer vowel inherent
    [0x180b, 0x180e], // Mongolian variation selectors
    [0x2000, 0x200a], // Various spaces
    [0x2028, 0x2029], // Line/paragraph separators
    [0x205f, 0x205f], // Medium mathematical space
    [0x3000, 0x3000], // Ideographic space
    [0x3164, 0x3164], // Hangul filler
    [0xffa0, 0xffa0], // Halfwidth hangul filler
];
/**
 * Common homoglyph mappings (confusable characters)
 */
const HOMOGLYPH_MAP = new Map([
    // Cyrillic lookalikes
    ["а", "a"], // Cyrillic а -> Latin a
    ["е", "e"], // Cyrillic е -> Latin e
    ["о", "o"], // Cyrillic о -> Latin o
    ["р", "p"], // Cyrillic р -> Latin p
    ["с", "c"], // Cyrillic с -> Latin c
    ["х", "x"], // Cyrillic х -> Latin x
    ["у", "y"], // Cyrillic у -> Latin y
    ["А", "A"], // Cyrillic А -> Latin A
    ["В", "B"], // Cyrillic В -> Latin B
    ["Е", "E"], // Cyrillic Е -> Latin E
    ["К", "K"], // Cyrillic К -> Latin K
    ["М", "M"], // Cyrillic М -> Latin M
    ["Н", "H"], // Cyrillic Н -> Latin H
    ["О", "O"], // Cyrillic О -> Latin O
    ["Р", "P"], // Cyrillic Р -> Latin P
    ["С", "C"], // Cyrillic С -> Latin C
    ["Т", "T"], // Cyrillic Т -> Latin T
    ["Х", "X"], // Cyrillic Х -> Latin X
    // Greek lookalikes
    ["α", "a"], // Greek α -> Latin a
    ["ο", "o"], // Greek ο -> Latin o
    ["ν", "v"], // Greek ν -> Latin v
    ["Α", "A"], // Greek Α -> Latin A
    ["Β", "B"], // Greek Β -> Latin B
    ["Ε", "E"], // Greek Ε -> Latin E
    ["Ζ", "Z"], // Greek Ζ -> Latin Z
    ["Η", "H"], // Greek Η -> Latin H
    ["Ι", "I"], // Greek Ι -> Latin I
    ["Κ", "K"], // Greek Κ -> Latin K
    ["Μ", "M"], // Greek Μ -> Latin M
    ["Ν", "N"], // Greek Ν -> Latin N
    ["Ο", "O"], // Greek Ο -> Latin O
    ["Ρ", "P"], // Greek Ρ -> Latin P
    ["Τ", "T"], // Greek Τ -> Latin T
    ["Υ", "Y"], // Greek Υ -> Latin Y
    ["Χ", "X"], // Greek Χ -> Latin X
]);
// ============================================================================
// Service Implementation
// ============================================================================
/**
 * Input Sanitization Service
 *
 * Provides comprehensive input validation and sanitization for security operations.
 */
export class InputSanitizationService {
    config;
    logger;
    usedNonces = new Map();
    prisma;
    nonceCleanupInterval;
    /**
     * Creates a new InputSanitizationService instance
     */
    constructor(config = {}, prisma) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = this.config.logger;
        this.prisma = prisma;
        // Start nonce cleanup interval if using in-memory store
        if (this.config.useInMemoryNonceStore) {
            this.startNonceCleanup();
        }
    }
    // ==========================================================================
    // Discord ID Sanitization
    // ==========================================================================
    /**
     * Validates and sanitizes a Discord snowflake ID
     *
     * @param id - The ID to sanitize
     * @param fieldName - Name of the field for error messages
     * @returns Sanitized Discord ID
     * @throws SanitizationError if invalid
     */
    sanitizeDiscordId(id, fieldName = "id") {
        // Type check
        if (typeof id !== "string" && typeof id !== "bigint" && typeof id !== "number") {
            throw new SanitizationError(SanitizationErrorCode.INVALID_DISCORD_ID, `${fieldName} must be a string, number, or bigint`, { fieldName, receivedType: typeof id });
        }
        // Convert to string
        const idString = String(id).trim();
        // Check pattern
        if (!DISCORD_ID_PATTERN.test(idString)) {
            throw new SanitizationError(SanitizationErrorCode.INVALID_DISCORD_ID, `${fieldName} must be a valid Discord snowflake ID (17-20 digits)`, { fieldName, value: idString.substring(0, 30) });
        }
        return idString;
    }
    /**
     * Validates a Discord ID without throwing
     */
    isValidDiscordId(id) {
        try {
            this.sanitizeDiscordId(id);
            return true;
        }
        catch {
            return false;
        }
    }
    // ==========================================================================
    // String Sanitization
    // ==========================================================================
    /**
     * Sanitizes a string input with length checking and Unicode handling
     *
     * @param input - The string to sanitize
     * @param options - Sanitization options
     * @returns Sanitization result with details
     */
    sanitizeString(input, options = {}) {
        const { fieldName = "value", maxLength = this.config.maxStringLength, stripUnicode = this.config.stripSuspiciousUnicode, normalizeHomoglyphs = false, trim = true, allowEmpty = false, } = options;
        const modifications = [];
        const warnings = [];
        // Type check
        if (typeof input !== "string") {
            throw new SanitizationError(SanitizationErrorCode.INVALID_INPUT, `${fieldName} must be a string`, { fieldName, receivedType: typeof input });
        }
        let value = input;
        // Trim whitespace
        if (trim) {
            const trimmed = value.trim();
            if (trimmed !== value) {
                modifications.push("trimmed whitespace");
                value = trimmed;
            }
        }
        // Check empty
        if (!allowEmpty && value.length === 0) {
            throw new SanitizationError(SanitizationErrorCode.INVALID_INPUT, `${fieldName} cannot be empty`, { fieldName });
        }
        // Check length
        if (value.length > maxLength) {
            throw new SanitizationError(SanitizationErrorCode.STRING_TOO_LONG, `${fieldName} exceeds maximum length of ${maxLength}`, { fieldName, length: value.length, maxLength });
        }
        // Strip suspicious Unicode
        if (stripUnicode) {
            const stripped = this.stripSuspiciousUnicode(value);
            if (stripped !== value) {
                modifications.push("stripped suspicious Unicode characters");
                warnings.push("Input contained potentially dangerous Unicode characters");
                value = stripped;
            }
        }
        // Normalize homoglyphs
        if (normalizeHomoglyphs) {
            const normalized = this.normalizeHomoglyphs(value);
            if (normalized !== value) {
                modifications.push("normalized homoglyph characters");
                warnings.push("Input contained confusable Unicode characters");
                value = normalized;
            }
        }
        return {
            value,
            modified: modifications.length > 0,
            modifications,
            warnings,
        };
    }
    /**
     * Strips suspicious Unicode characters from a string
     */
    stripSuspiciousUnicode(input) {
        let result = "";
        for (const char of input) {
            const codePoint = char.codePointAt(0);
            if (codePoint === undefined)
                continue;
            let isSuspicious = false;
            for (const [start, end] of SUSPICIOUS_UNICODE_RANGES) {
                if (codePoint >= start && codePoint <= end) {
                    isSuspicious = true;
                    break;
                }
            }
            if (!isSuspicious) {
                result += char;
            }
        }
        return result;
    }
    /**
     * Normalizes homoglyph characters to their ASCII equivalents
     */
    normalizeHomoglyphs(input) {
        let result = "";
        for (const char of input) {
            const normalized = HOMOGLYPH_MAP.get(char);
            result += normalized ?? char;
        }
        return result;
    }
    // ==========================================================================
    // URL Sanitization
    // ==========================================================================
    /**
     * Validates and sanitizes a URL
     *
     * @param url - The URL to sanitize
     * @param options - Validation options
     * @returns URL validation result
     */
    sanitizeUrl(url, options = {}) {
        const { fieldName = "url", allowedProtocols = this.config.allowedProtocols, allowedDomains = this.config.allowedDomains, } = options;
        // Type check
        if (typeof url !== "string") {
            return {
                valid: false,
                error: `${fieldName} must be a string`,
                errorCode: SanitizationErrorCode.INVALID_URL,
            };
        }
        const trimmedUrl = url.trim();
        // Parse URL
        let parsedUrl;
        try {
            parsedUrl = new URL(trimmedUrl);
        }
        catch {
            return {
                valid: false,
                error: `${fieldName} is not a valid URL`,
                errorCode: SanitizationErrorCode.INVALID_URL,
            };
        }
        // Check protocol
        const protocol = parsedUrl.protocol.replace(":", "").toLowerCase();
        if (!allowedProtocols.includes(protocol)) {
            return {
                valid: false,
                error: `${fieldName} uses blocked protocol: ${protocol}`,
                errorCode: SanitizationErrorCode.BLOCKED_PROTOCOL,
            };
        }
        // Check domain (if allowlist is configured)
        if (allowedDomains.length > 0) {
            const hostname = parsedUrl.hostname.toLowerCase();
            const isAllowed = allowedDomains.some((domain) => {
                const domainLower = domain.toLowerCase();
                return hostname === domainLower || hostname.endsWith(`.${domainLower}`);
            });
            if (!isAllowed) {
                return {
                    valid: false,
                    error: `${fieldName} domain is not in allowlist: ${hostname}`,
                    errorCode: SanitizationErrorCode.BLOCKED_DOMAIN,
                };
            }
        }
        // Return sanitized URL (normalized)
        return {
            valid: true,
            sanitizedUrl: parsedUrl.href,
        };
    }
    /**
     * Validates a URL without throwing
     */
    isValidUrl(url, options) {
        return this.sanitizeUrl(url, options).valid;
    }
    // ==========================================================================
    // Embed Sanitization (R3)
    // ==========================================================================
    /**
     * Sanitizes a Discord embed object
     *
     * @param embed - The embed to sanitize
     * @returns Sanitization result with sanitized embed
     */
    sanitizeEmbed(embed) {
        const modifications = [];
        const warnings = [];
        // Type check
        if (!embed || typeof embed !== "object") {
            throw new SanitizationError(SanitizationErrorCode.INVALID_INPUT, "Embed must be an object", { receivedType: typeof embed });
        }
        const input = embed;
        const sanitized = {};
        // Sanitize title
        if (input.title !== undefined) {
            const result = this.sanitizeString(input.title, {
                fieldName: "embed.title",
                maxLength: this.config.maxEmbedTitleLength,
            });
            sanitized.title = result.value;
            if (result.modified) {
                modifications.push(...result.modifications.map((m) => `title: ${m}`));
                warnings.push(...result.warnings);
            }
        }
        // Sanitize description
        if (input.description !== undefined) {
            const result = this.sanitizeString(input.description, {
                fieldName: "embed.description",
                maxLength: this.config.maxEmbedDescriptionLength,
            });
            sanitized.description = result.value;
            if (result.modified) {
                modifications.push(...result.modifications.map((m) => `description: ${m}`));
                warnings.push(...result.warnings);
            }
        }
        // Sanitize URL
        if (input.url !== undefined) {
            const urlResult = this.sanitizeUrl(input.url, { fieldName: "embed.url" });
            if (!urlResult.valid) {
                warnings.push(`embed.url: ${urlResult.error}`);
                // Don't include invalid URL
            }
            else {
                sanitized.url = urlResult.sanitizedUrl;
            }
        }
        // Copy color (safe numeric value)
        if (typeof input.color === "number" && Number.isInteger(input.color)) {
            sanitized.color = Math.max(0, Math.min(0xffffff, input.color));
        }
        // Sanitize timestamp
        if (typeof input.timestamp === "string") {
            try {
                const date = new Date(input.timestamp);
                if (!isNaN(date.getTime())) {
                    sanitized.timestamp = date.toISOString();
                }
                else {
                    warnings.push("embed.timestamp: Invalid date format");
                }
            }
            catch {
                warnings.push("embed.timestamp: Invalid date format");
            }
        }
        // Sanitize footer
        if (input.footer && typeof input.footer === "object") {
            const footer = input.footer;
            sanitized.footer = {};
            if (footer.text !== undefined) {
                const result = this.sanitizeString(footer.text, {
                    fieldName: "embed.footer.text",
                    maxLength: this.config.maxEmbedFooterLength,
                });
                sanitized.footer.text = result.value;
                if (result.modified) {
                    modifications.push(...result.modifications.map((m) => `footer.text: ${m}`));
                }
            }
            else {
                sanitized.footer.text = "";
            }
            if (footer.icon_url !== undefined) {
                const urlResult = this.sanitizeUrl(footer.icon_url, {
                    fieldName: "embed.footer.icon_url",
                });
                if (urlResult.valid) {
                    sanitized.footer.icon_url = urlResult.sanitizedUrl;
                }
            }
        }
        // Sanitize image
        if (input.image && typeof input.image === "object") {
            const image = input.image;
            if (image.url !== undefined) {
                const urlResult = this.sanitizeUrl(image.url, { fieldName: "embed.image.url" });
                if (urlResult.valid) {
                    sanitized.image = {
                        url: urlResult.sanitizedUrl,
                        height: typeof image.height === "number" ? image.height : undefined,
                        width: typeof image.width === "number" ? image.width : undefined,
                    };
                }
            }
        }
        // Sanitize thumbnail
        if (input.thumbnail && typeof input.thumbnail === "object") {
            const thumbnail = input.thumbnail;
            if (thumbnail.url !== undefined) {
                const urlResult = this.sanitizeUrl(thumbnail.url, {
                    fieldName: "embed.thumbnail.url",
                });
                if (urlResult.valid) {
                    sanitized.thumbnail = {
                        url: urlResult.sanitizedUrl,
                        height: typeof thumbnail.height === "number" ? thumbnail.height : undefined,
                        width: typeof thumbnail.width === "number" ? thumbnail.width : undefined,
                    };
                }
            }
        }
        // Sanitize author
        if (input.author && typeof input.author === "object") {
            const author = input.author;
            sanitized.author = {};
            if (author.name !== undefined) {
                const result = this.sanitizeString(author.name, {
                    fieldName: "embed.author.name",
                    maxLength: 256,
                });
                sanitized.author.name = result.value;
                if (result.modified) {
                    modifications.push(...result.modifications.map((m) => `author.name: ${m}`));
                }
            }
            else {
                sanitized.author.name = "";
            }
            if (author.url !== undefined) {
                const urlResult = this.sanitizeUrl(author.url, { fieldName: "embed.author.url" });
                if (urlResult.valid) {
                    sanitized.author.url = urlResult.sanitizedUrl;
                }
            }
            if (author.icon_url !== undefined) {
                const urlResult = this.sanitizeUrl(author.icon_url, {
                    fieldName: "embed.author.icon_url",
                });
                if (urlResult.valid) {
                    sanitized.author.icon_url = urlResult.sanitizedUrl;
                }
            }
        }
        // Sanitize fields
        if (Array.isArray(input.fields)) {
            if (input.fields.length > this.config.maxEmbedFields) {
                warnings.push(`embed.fields: Truncated from ${input.fields.length} to ${this.config.maxEmbedFields} fields`);
                modifications.push("truncated excess fields");
            }
            sanitized.fields = [];
            const fieldsToProcess = input.fields.slice(0, this.config.maxEmbedFields);
            for (let i = 0; i < fieldsToProcess.length; i++) {
                const field = fieldsToProcess[i];
                if (!field || typeof field !== "object")
                    continue;
                const fieldObj = field;
                const nameResult = this.sanitizeString(fieldObj.name ?? "", {
                    fieldName: `embed.fields[${i}].name`,
                    maxLength: this.config.maxEmbedFieldNameLength,
                    allowEmpty: false,
                });
                const valueResult = this.sanitizeString(fieldObj.value ?? "", {
                    fieldName: `embed.fields[${i}].value`,
                    maxLength: this.config.maxEmbedFieldValueLength,
                    allowEmpty: false,
                });
                sanitized.fields.push({
                    name: nameResult.value,
                    value: valueResult.value,
                    inline: typeof fieldObj.inline === "boolean" ? fieldObj.inline : false,
                });
                if (nameResult.modified) {
                    modifications.push(...nameResult.modifications.map((m) => `fields[${i}].name: ${m}`));
                }
                if (valueResult.modified) {
                    modifications.push(...valueResult.modifications.map((m) => `fields[${i}].value: ${m}`));
                }
            }
        }
        this.logger?.debug("Embed sanitized", {
            modified: modifications.length > 0,
            modificationCount: modifications.length,
            warningCount: warnings.length,
        });
        return {
            value: sanitized,
            modified: modifications.length > 0,
            modifications,
            warnings,
        };
    }
    // ==========================================================================
    // Nonce Validation (S5)
    // ==========================================================================
    /**
     * Generates a new nonce (UUID v4)
     */
    generateNonce() {
        // Generate UUID v4 using crypto
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        // Set version (4) and variant (8, 9, a, or b)
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    /**
     * Validates a request nonce
     *
     * @param nonce - The nonce to validate
     * @returns Validation result
     */
    async validateNonce(nonce) {
        // Check nonce presence
        if (nonce === undefined || nonce === null) {
            return {
                valid: false,
                error: "Nonce is required",
                errorCode: SanitizationErrorCode.NONCE_MISSING,
            };
        }
        // Check nonce type
        if (typeof nonce !== "string") {
            return {
                valid: false,
                error: "Nonce must be a string",
                errorCode: SanitizationErrorCode.NONCE_INVALID_FORMAT,
            };
        }
        // Check nonce format (UUID v4)
        if (!UUID_V4_PATTERN.test(nonce)) {
            return {
                valid: false,
                error: "Nonce must be a valid UUID v4",
                errorCode: SanitizationErrorCode.NONCE_INVALID_FORMAT,
            };
        }
        // Check if nonce has been used
        if (this.config.useInMemoryNonceStore) {
            const usedAt = this.usedNonces.get(nonce);
            if (usedAt !== undefined) {
                return {
                    valid: false,
                    error: "Nonce has already been used",
                    errorCode: SanitizationErrorCode.NONCE_REUSED,
                };
            }
            // Mark nonce as used
            this.usedNonces.set(nonce, Date.now());
        }
        return { valid: true };
    }
    /**
     * Validates a request timestamp
     *
     * @param timestamp - Unix timestamp in milliseconds
     * @returns Validation result
     */
    validateTimestamp(timestamp) {
        // Check timestamp presence
        if (timestamp === undefined || timestamp === null) {
            return {
                valid: false,
                error: "Timestamp is required",
                errorCode: SanitizationErrorCode.TIMESTAMP_MISSING,
            };
        }
        // Check timestamp type
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
            return {
                valid: false,
                error: "Timestamp must be a valid number",
                errorCode: SanitizationErrorCode.TIMESTAMP_INVALID,
            };
        }
        const now = Date.now();
        const diff = now - timestamp;
        // Check if timestamp is too old
        if (diff > this.config.timestampToleranceMs) {
            return {
                valid: false,
                error: `Timestamp expired (${Math.round(diff / 1000)}s old, max ${Math.round(this.config.timestampToleranceMs / 1000)}s)`,
                errorCode: SanitizationErrorCode.TIMESTAMP_EXPIRED,
            };
        }
        // Check if timestamp is in the future (with some tolerance for clock drift)
        if (diff < -this.config.timestampToleranceMs) {
            return {
                valid: false,
                error: `Timestamp is in the future (${Math.round(-diff / 1000)}s ahead)`,
                errorCode: SanitizationErrorCode.TIMESTAMP_FUTURE,
            };
        }
        return { valid: true };
    }
    /**
     * Validates a complete request with nonce and timestamp
     *
     * @param request - The request to validate
     * @returns Validation result
     */
    async validateRequest(request) {
        if (!request || typeof request !== "object") {
            return {
                valid: false,
                error: "Request must be an object",
                errorCode: SanitizationErrorCode.INVALID_INPUT,
            };
        }
        const req = request;
        // Validate nonce
        const nonceResult = await this.validateNonce(req.nonce);
        if (!nonceResult.valid) {
            return nonceResult;
        }
        // Validate timestamp
        const timestampResult = this.validateTimestamp(req.timestamp);
        if (!timestampResult.valid) {
            return timestampResult;
        }
        return { valid: true };
    }
    // ==========================================================================
    // Nonce Store Management
    // ==========================================================================
    /**
     * Starts the nonce cleanup interval
     */
    startNonceCleanup() {
        // Clean up expired nonces every minute
        this.nonceCleanupInterval = setInterval(() => {
            this.cleanupExpiredNonces();
        }, 60 * 1000);
    }
    /**
     * Cleans up expired nonces from in-memory store
     */
    cleanupExpiredNonces() {
        const now = Date.now();
        const expiredBefore = now - this.config.nonceExpiryMs;
        let cleaned = 0;
        for (const [nonce, usedAt] of this.usedNonces.entries()) {
            if (usedAt < expiredBefore) {
                this.usedNonces.delete(nonce);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger?.debug("Cleaned up expired nonces", { count: cleaned });
        }
    }
    /**
     * Gets the current nonce count (for monitoring)
     */
    getNonceCount() {
        return this.usedNonces.size;
    }
    /**
     * Clears all nonces (for testing)
     */
    clearNonces() {
        this.usedNonces.clear();
    }
    // ==========================================================================
    // Utility Methods
    // ==========================================================================
    /**
     * Sanitizes an array of Discord IDs
     */
    sanitizeDiscordIds(ids, fieldName = "ids") {
        if (!Array.isArray(ids)) {
            throw new SanitizationError(SanitizationErrorCode.INVALID_INPUT, `${fieldName} must be an array`, { fieldName, receivedType: typeof ids });
        }
        return ids.map((id, index) => this.sanitizeDiscordId(id, `${fieldName}[${index}]`));
    }
    /**
     * Escapes a string for safe use in SQL LIKE patterns
     */
    escapeLikePattern(input) {
        return input.replace(/[%_\\]/g, (char) => `\\${char}`);
    }
    /**
     * Sanitizes a JSON object recursively
     */
    sanitizeJson(input, maxDepth = 10, currentDepth = 0) {
        if (currentDepth > maxDepth) {
            throw new SanitizationError(SanitizationErrorCode.INVALID_INPUT, "JSON object exceeds maximum nesting depth", { maxDepth });
        }
        if (input === null || input === undefined) {
            return input;
        }
        if (typeof input === "string") {
            return this.sanitizeString(input, { allowEmpty: true }).value;
        }
        if (typeof input === "number" || typeof input === "boolean") {
            return input;
        }
        if (Array.isArray(input)) {
            return input.map((item) => this.sanitizeJson(item, maxDepth, currentDepth + 1));
        }
        if (typeof input === "object") {
            const result = {};
            for (const [key, value] of Object.entries(input)) {
                const sanitizedKey = this.sanitizeString(key, {
                    maxLength: 256,
                    allowEmpty: false,
                }).value;
                result[sanitizedKey] = this.sanitizeJson(value, maxDepth, currentDepth + 1);
            }
            return result;
        }
        // Unknown type - return undefined for safety
        return undefined;
    }
    /**
     * Gets service statistics
     */
    getStats() {
        const { logger: _logger, ...configWithoutLogger } = this.config;
        return {
            nonceCount: this.usedNonces.size,
            config: configWithoutLogger,
        };
    }
    /**
     * Stops the service (cleanup)
     */
    destroy() {
        if (this.nonceCleanupInterval) {
            clearInterval(this.nonceCleanupInterval);
            this.nonceCleanupInterval = undefined;
        }
        this.usedNonces.clear();
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Creates a new InputSanitizationService instance
 *
 * @param config - Optional configuration
 * @param prisma - Optional Prisma client for Redis-backed nonce storage
 * @returns InputSanitizationService instance
 */
export function createInputSanitizationService(config = {}, prisma) {
    return new InputSanitizationService(config, prisma);
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Type guard for SanitizationError
 */
export function isSanitizationError(error) {
    return error instanceof SanitizationError;
}
/**
 * Type guard for specific sanitization error codes
 */
export function hasSanitizationErrorCode(error, code) {
    return isSanitizationError(error) && error.code === code;
}
/**
 * Type guard for recoverable sanitization errors
 */
export function isRecoverableSanitizationError(error) {
    if (!isSanitizationError(error))
        return false;
    // These errors are recoverable (user can fix their input)
    const recoverableCodes = [
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
    return recoverableCodes.includes(error.code);
}
