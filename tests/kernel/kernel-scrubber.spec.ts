import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { KernelLogEntry } from '../../src/kernel/kernel-logger.js';
import {
  scrubEntry,
  getScrubConfig,
  configureScrubber,
  resetScrubConfig,
  type ScrubConfig,
} from '../../src/kernel/kernel-scrubber.js';

function createEntry(overrides: Partial<KernelLogEntry> = {}): KernelLogEntry {
  return {
    timestamp: new Date().toISOString(),
    uptimeMs: 100,
    level: 'INFO',
    component: 'scrubber-test',
    message: 'default message',
    ...overrides,
  };
}

describe('kernel-scrubber', () => {
  beforeEach(() => {
    resetScrubConfig();
  });

  afterEach(() => {
    resetScrubConfig();
  });

  it('should expose default config', () => {
    const config = getScrubConfig();
    expect(config.enabled).toBe(true);
    expect(config.patterns.length).toBeGreaterThan(0);
    expect(config.fields).toContain('message');
    expect(config.fields).toContain('data');
  });

  it('should scrub discord tokens from message', () => {
    const entry = createEntry({
      message: 'Authorization: mfa.abcdefghijklmnopqrstuvwxyz1234567890',
    });

    const scrubbed = scrubEntry(entry);
    expect(scrubbed.message).toContain('[TOKEN_REDACTED]');
    expect(scrubbed.message).not.toContain('mfa.abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('should scrub webhook URL, email, and password fields in data', () => {
    const entry = createEntry({
      data: {
        webhookUrl: 'https://discord.com/api/webhooks/123456789012345678/abc_DEF-123',
        supportEmail: 'trainer@example.com',
        password: 'hunter2',
        nested: {
          passwd: 'my-pass',
        },
      },
    });

    const scrubbed = scrubEntry(entry);
    const data = scrubbed.data as Record<string, unknown>;

    expect(String(data.webhookUrl)).toContain('[WEBHOOK_REDACTED]');
    expect(String(data.supportEmail)).toBe('[EMAIL_REDACTED]');
    expect(String(data.password)).toBe('[REDACTED]');

    const nested = data.nested as Record<string, unknown>;
    expect(String(nested.passwd)).toBe('[REDACTED]');
  });

  it('should scrub error message and stack when configured', () => {
    const entry = createEntry({
      error: {
        name: 'Error',
        message: 'password=supersecret',
        stack: 'at handler email: admin@example.com',
      },
    });

    const scrubbed = scrubEntry(entry);
    expect(scrubbed.error?.message).toContain('[PASSWORD_REDACTED]');
    expect(scrubbed.error?.stack).toContain('[EMAIL_REDACTED]');
  });

  it('should not mutate original entry', () => {
    const entry = createEntry({
      message: 'email trainer@example.com',
      data: { password: 'top-secret' },
      error: {
        name: 'Error',
        message: 'token mfa.abcdefghijklmnopqrstuvwxyz1234567890',
      },
    });

    const scrubbed = scrubEntry(entry);

    expect(scrubbed).not.toBe(entry);
    expect(entry.message).toContain('trainer@example.com');
    expect((entry.data as Record<string, unknown>).password).toBe('top-secret');
    expect(entry.error?.message).toContain('mfa.abcdefghijklmnopqrstuvwxyz1234567890');
  });

  it('should return original entry when scrubber disabled', () => {
    configureScrubber({ enabled: false });
    const entry = createEntry({ message: 'email trainer@example.com' });

    const scrubbed = scrubEntry(entry);
    expect(scrubbed).toBe(entry);
    expect(scrubbed.message).toContain('trainer@example.com');
  });

  it('should only scrub selected fields', () => {
    configureScrubber({ fields: ['message'] });

    const entry = createEntry({
      message: 'email trainer@example.com',
      data: { email: 'admin@example.com' },
      error: {
        name: 'Error',
        message: 'password=abc123',
      },
    });

    const scrubbed = scrubEntry(entry);
    expect(scrubbed.message).toContain('[EMAIL_REDACTED]');
    expect(String((scrubbed.data as Record<string, unknown>).email)).toBe('admin@example.com');
    expect(scrubbed.error?.message).toBe('password=abc123');
  });

  it('should skip message scrubbing when message field is excluded', () => {
    configureScrubber({ fields: ['data'] });

    const entry = createEntry({
      message: 'email trainer@example.com',
      data: { email: 'admin@example.com' },
    });

    const scrubbed = scrubEntry(entry);
    expect(scrubbed.message).toBe('email trainer@example.com');
    expect(String((scrubbed.data as Record<string, unknown>).email)).toBe('[EMAIL_REDACTED]');
  });

  it('should cap recursive scrubbing with maxDepth', () => {
    configureScrubber({ maxDepth: 1 });

    const entry = createEntry({
      data: {
        level1: {
          level2: {
            level3: 'email trainer@example.com',
          },
        },
      },
    });

    const scrubbed = scrubEntry(entry);
    const level1 = (scrubbed.data as Record<string, unknown>).level1 as Record<string, unknown>;
    expect(level1.level2).toBe('[MAX_DEPTH_REDACTED]');
  });

  it('should merge config updates and preserve defaults not overridden', () => {
    const updated = configureScrubber({
      replacement: '[MASKED]',
      fields: ['message'],
    });

    expect(updated.replacement).toBe('[MASKED]');
    expect(updated.fields).toEqual(['message']);
    expect(updated.enabled).toBe(true);
  });

  it('should keep empty strings untouched', () => {
    const entry = createEntry({ message: '' });
    const scrubbed = scrubEntry(entry);
    expect(scrubbed.message).toBe('');
  });

  it('should preserve null/undefined and primitive non-string values in data', () => {
    const entry = createEntry({
      data: {
        count: 42,
        active: true,
        nullable: null,
        maybe: undefined,
      },
    });

    const scrubbed = scrubEntry(entry);
    const data = scrubbed.data as Record<string, unknown>;
    expect(data.count).toBe(42);
    expect(data.active).toBe(true);
    expect(data.nullable).toBeNull();
    expect(data.maybe).toBeUndefined();
  });

  it('should scrub arrays recursively', () => {
    const entry = createEntry({
      data: {
        values: [
          'trainer@example.com',
          'password=abc123',
          { tokenValue: 'mfa.abcdefghijklmnopqrstuvwxyz1234567890' },
        ],
      },
    });

    const scrubbed = scrubEntry(entry);
    const values = (scrubbed.data as Record<string, unknown>).values as unknown[];
    expect(String(values[0])).toContain('[EMAIL_REDACTED]');
    expect(String(values[1])).toContain('[PASSWORD_REDACTED]');
    expect((values[2] as Record<string, unknown>).tokenValue).toBe('[REDACTED]');
  });

  it('should use custom fallback replacement for patterns without replacement', () => {
    const customConfig: ScrubConfig = {
      enabled: true,
      replacement: '[CUSTOM_REDACTED]',
      fields: ['message'],
      maxDepth: 4,
      patterns: [
        {
          name: 'raw-secret',
          pattern: /SECRET_[A-Z0-9]+/g,
        },
      ],
    };

    const entry = createEntry({ message: 'value SECRET_ABC123 should be hidden' });
    const scrubbed = scrubEntry(entry, customConfig);
    expect(scrubbed.message).toContain('[CUSTOM_REDACTED]');
    expect(scrubbed.message).not.toContain('SECRET_ABC123');
  });

  it('should apply updated pattern set via configureScrubber', () => {
    configureScrubber({
      patterns: [
        {
          name: 'custom-email',
          pattern: /player@[A-Za-z0-9.-]+/g,
          replacement: '[PLAYER_EMAIL_REDACTED]',
        },
      ],
      fields: ['message'],
    });

    const entry = createEntry({ message: 'contact player@infinitygauntlet.dev' });
    const scrubbed = scrubEntry(entry);

    expect(scrubbed.message).toContain('[PLAYER_EMAIL_REDACTED]');
    expect(scrubbed.message).not.toContain('player@infinitygauntlet.dev');
  });
});
