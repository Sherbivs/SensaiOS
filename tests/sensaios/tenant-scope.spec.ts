/**
 * TenantScope Tests
 * 
 * Tests for multi-tenant scope creation, validation, and propagation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scopeFromInteraction,
  scopeFromGuild,
  scopeFromUser,
  systemScope,
  workerScope,
  withScope,
  withScopeAsync,
  getCurrentScope,
  requireScope,
  isInScope,
  validateScope,
  isTenantScope,
  serializeScope,
  scopePrefix,
  scopeToLabels,
  resolveScope,
  ScopeValidationError,
  type TenantScope,
} from '../../src/sensaios/tenant-scope.js';

describe('TenantScope', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SERVICE_NAME', 'test-service');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Factory Functions', () => {
    it('scopeFromInteraction should create scope from guild interaction', () => {
      const interaction = {
        guildId: '123456789',
        user: { id: '987654321' },
      };

      const scope = scopeFromInteraction(interaction);

      expect(scope.tenant).toBe('123456789');
      expect(scope.environment).toBe('development');
      expect(scope.service).toBe('test-service');
      expect(scope.component).toBe('discord-bot');
    });

    it('scopeFromInteraction should use user ID when no guild', () => {
      const interaction = {
        guildId: null,
        user: { id: '987654321' },
      };

      const scope = scopeFromInteraction(interaction);

      expect(scope.tenant).toBe('user:987654321');
    });

    it('scopeFromGuild should create scope with guild tenant', () => {
      const scope = scopeFromGuild('guild-123', 'battle-engine');

      expect(scope.tenant).toBe('guild-123');
      expect(scope.component).toBe('battle-engine');
    });

    it('scopeFromUser should create user-scoped tenant', () => {
      const scope = scopeFromUser('user-456', 'homestead');

      expect(scope.tenant).toBe('user:user-456');
      expect(scope.component).toBe('homestead');
    });

    it('systemScope should create system tenant', () => {
      const scope = systemScope('database');

      expect(scope.tenant).toBe('system');
      expect(scope.component).toBe('database');
    });

    it('workerScope should create worker scope', () => {
      const scope = workerScope('cache-worker');

      expect(scope.tenant).toBe('system');
      expect(scope.service).toBe('cache-worker');
      expect(scope.component).toBe('worker');
    });
  });

  describe('Context Propagation', () => {
    it('withScope should make scope available via getCurrentScope', () => {
      const scope = systemScope('test');
      let capturedScope: TenantScope | undefined;

      withScope(scope, () => {
        capturedScope = getCurrentScope();
      });

      expect(capturedScope).toEqual(scope);
    });

    it('getCurrentScope should return undefined outside scope', () => {
      expect(getCurrentScope()).toBeUndefined();
    });

    it('requireScope should throw when not in scope', () => {
      expect(() => requireScope()).toThrow('No scope in context');
    });

    it('requireScope should return scope when in context', () => {
      const scope = systemScope('test');

      withScope(scope, () => {
        expect(requireScope()).toEqual(scope);
      });
    });

    it('isInScope should return correct boolean', () => {
      expect(isInScope()).toBe(false);

      withScope(systemScope('test'), () => {
        expect(isInScope()).toBe(true);
      });

      expect(isInScope()).toBe(false);
    });

    it('withScopeAsync should propagate scope in async context', async () => {
      const scope = systemScope('async-test');
      let capturedScope: TenantScope | undefined;

      await withScopeAsync(scope, async () => {
        await Promise.resolve();
        capturedScope = getCurrentScope();
      });

      expect(capturedScope).toEqual(scope);
    });

    it('nested scopes should work correctly', () => {
      const outerScope = systemScope('outer');
      const innerScope = systemScope('inner');
      const captured: (TenantScope | undefined)[] = [];

      withScope(outerScope, () => {
        captured.push(getCurrentScope());

        withScope(innerScope, () => {
          captured.push(getCurrentScope());
        });

        captured.push(getCurrentScope());
      });

      expect(captured[0]?.component).toBe('outer');
      expect(captured[1]?.component).toBe('inner');
      expect(captured[2]?.component).toBe('outer');
    });
  });

  describe('Validation', () => {
    it('validateScope should accept valid scope', () => {
      const scope: TenantScope = {
        tenant: 'guild-123',
        environment: 'production',
        service: 'my-service',
        component: 'my-component',
      };

      expect(() => validateScope(scope)).not.toThrow();
    });

    it('validateScope should reject null', () => {
      expect(() => validateScope(null)).toThrow(ScopeValidationError);
    });

    it('validateScope should reject missing tenant', () => {
      expect(() =>
        validateScope({
          environment: 'production',
          service: 's',
          component: 'c',
        })
      ).toThrow('tenant is required');
    });

    it('validateScope should reject empty tenant', () => {
      expect(() =>
        validateScope({
          tenant: '',
          environment: 'production',
          service: 's',
          component: 'c',
        })
      ).toThrow('tenant is required');
    });

    it('validateScope should reject invalid environment', () => {
      expect(() =>
        validateScope({
          tenant: 't',
          environment: 'invalid',
          service: 's',
          component: 'c',
        })
      ).toThrow('environment must be');
    });

    it('isTenantScope should return true for valid scope', () => {
      const scope = systemScope('test');
      expect(isTenantScope(scope)).toBe(true);
    });

    it('isTenantScope should return false for invalid objects', () => {
      expect(isTenantScope(null)).toBe(false);
      expect(isTenantScope({})).toBe(false);
      expect(isTenantScope({ tenant: 't' })).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('serializeScope should produce valid JSON', () => {
      const scope = systemScope('test');
      const json = serializeScope(scope);
      const parsed = JSON.parse(json);

      expect(parsed.tenant).toBe('system');
      expect(parsed.component).toBe('test');
    });

    it('scopePrefix should produce compact prefix', () => {
      expect(
        scopePrefix({
          tenant: 'guild-123',
          environment: 'production',
          service: 's',
          component: 'battle-engine',
        })
      ).toBe('[prod:guild-123:battle-engine]');

      expect(
        scopePrefix({
          tenant: 'system',
          environment: 'development',
          service: 's',
          component: 'cache',
        })
      ).toBe('[dev:system:cache]');

      expect(
        scopePrefix({
          tenant: 'test',
          environment: 'staging',
          service: 's',
          component: 'api',
        })
      ).toBe('[stg:test:api]');
    });

    it('scopeToLabels should create Loki-compatible labels', () => {
      const scope: TenantScope = {
        tenant: 'guild-123',
        environment: 'production',
        service: 'my-service',
        component: 'battle-engine',
        instance: 'worker-1',
        region: 'us-east-1',
      };

      const labels = scopeToLabels(scope);

      expect(labels.tenant).toBe('guild-123');
      expect(labels.env).toBe('production');
      expect(labels.service).toBe('my-service');
      expect(labels.component).toBe('battle-engine');
      expect(labels.instance).toBe('worker-1');
      expect(labels.region).toBe('us-east-1');
    });

    it('scopeToLabels should omit undefined optional fields', () => {
      const scope = systemScope('test');
      const labels = scopeToLabels(scope);

      expect(labels.tenant).toBeDefined();
      expect('instance' in labels).toBe(false);
      expect('region' in labels).toBe(false);
    });
  });

  describe('Resolution', () => {
    it('resolveScope should use explicit values first', () => {
      const context = systemScope('context-component');
      const explicit: Partial<TenantScope> = { tenant: 'explicit-tenant' };

      const resolved = resolveScope(explicit, context);

      expect(resolved.tenant).toBe('explicit-tenant');
      expect(resolved.component).toBe('context-component');
    });

    it('resolveScope should fall back to context', () => {
      const context = scopeFromGuild('guild-ctx', 'ctx-component');

      const resolved = resolveScope({}, context);

      expect(resolved.tenant).toBe('guild-ctx');
      expect(resolved.component).toBe('ctx-component');
    });

    it('resolveScope should use defaults when no context', () => {
      const resolved = resolveScope({});

      expect(resolved.tenant).toBe('system');
      expect(resolved.component).toBe('unknown');
    });
  });
});
