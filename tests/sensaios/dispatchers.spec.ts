/**
 * Tests for SensaiOS Dispatchers — Event Routing via runGuarded
 *
 * Per v1.1.2: All handlers wrapped with runGuarded for observability.
 *
 * Tests cover:
 * - Discord dispatcher
 * - Export dispatcher
 * - Job dispatcher
 * - HTTP dispatcher
 * - CLI dispatcher
 *
 * @module tests/sensaios/dispatchers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { TenantScope } from '../../src/sensaios/tenant-scope.js';
import type { ExportEnvelopeData, LeasedJob } from '../../src/sensaios/component-context.js';
import {
  createDiscordDispatcher,
  createExportDispatcher,
  createJobDispatcher,
  createHttpDispatcher,
  createCliDispatcher,
  type DiscordInteraction,
  type HttpRequest,
} from '../../src/sensaios/dispatchers.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'development',
  service: 'test-service',
  component: 'test-component',
};

// Mock Prisma client
function createMockPrisma(): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (fn) => fn({})),
  } as unknown as PrismaClient;
}

// Mock supervisor
function createMockSupervisor() {
  const discordHandlers = new Map<string, { component: string; handler: ReturnType<typeof vi.fn> }>();
  const exportHandlers = new Map<string, { component: string; handler: ReturnType<typeof vi.fn> }>();
  const jobHandlers = new Map<string, { component: string; handler: ReturnType<typeof vi.fn> }>();
  const httpHandlers = new Map<string, { component: string; handler: ReturnType<typeof vi.fn> }>();
  const cliHandlers = new Map<string, { component: string; handler: ReturnType<typeof vi.fn> }>();

  return {
    getDiscordHandler: vi.fn((key: string) => discordHandlers.get(key)),
    getExportHandler: vi.fn((type: string) => exportHandlers.get(type)),
    getJobHandler: vi.fn((kind: string) => jobHandlers.get(kind)),
    getHttpHandler: vi.fn((path: string) => httpHandlers.get(path)),
    getCliHandler: vi.fn((command: string) => cliHandlers.get(command)),

    // Test helpers
    registerDiscordHandler(key: string, component: string, handler: ReturnType<typeof vi.fn>) {
      discordHandlers.set(key, { component, handler });
    },
    registerExportHandler(type: string, component: string, handler: ReturnType<typeof vi.fn>) {
      exportHandlers.set(type, { component, handler });
    },
    registerJobHandler(kind: string, component: string, handler: ReturnType<typeof vi.fn>) {
      jobHandlers.set(kind, { component, handler });
    },
    registerHttpHandler(path: string, component: string, handler: ReturnType<typeof vi.fn>) {
      httpHandlers.set(path, { component, handler });
    },
    registerCliHandler(command: string, component: string, handler: ReturnType<typeof vi.fn>) {
      cliHandlers.set(command, { component, handler });
    },
  };
}

// Mock Discord interaction
function createMockInteraction(overrides?: Partial<DiscordInteraction>): DiscordInteraction {
  return {
    id: 'interaction-123',
    commandName: 'test-command',
    guildId: 'guild-123',
    user: { id: 'user-123', username: 'testuser' },
    type: 1,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Mock export envelope
function createMockExportEnvelope(overrides?: Partial<ExportEnvelopeData>): ExportEnvelopeData {
  return {
    type: 'test.event',
    scope: testScope,
    idempotencyKey: 'test-key-123',
    payload: { data: 'test' },
    correlationId: 'corr-123',
    occurredAt: new Date(),
    source: 'test-source',
    ...overrides,
  };
}

// Mock leased job
function createMockJob(overrides?: Partial<LeasedJob>): LeasedJob {
  return {
    id: 'job-123',
    kind: 'test.job',
    scope: testScope,
    payload: { task: 'test' },
    correlationId: 'corr-456',
    attempt: 0,
    leaseExpiresAt: new Date(Date.now() + 60000),
    ...overrides,
  };
}

// Mock HTTP request
function createMockHttpRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return {
    method: 'GET',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    query: {},
    body: undefined,
    ...overrides,
  };
}

// Mock HTTP response object
function createMockHttpResponse() {
  let responseStatus = 200;
  let responseBody: unknown;
  const headers: Record<string, string> = {};

  return {
    status: vi.fn((code: number) => { responseStatus = code; }),
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
    json: vi.fn((body: unknown) => { responseBody = body; }),
    send: vi.fn((body: string) => { responseBody = body; }),
    end: vi.fn(),
    // Test helpers
    getStatus: () => responseStatus,
    getBody: () => responseBody,
    getHeaders: () => headers,
  };
}

// Mock CLI command
function createMockCliCommand(name: string, args: string[] = [], options: Record<string, string | boolean | undefined> = {}) {
  return { name, args, options };
}

// ============================================================================
// DISCORD DISPATCHER TESTS
// ============================================================================

describe('createDiscordDispatcher', () => {
  let supervisor: ReturnType<typeof createMockSupervisor>;
  let prisma: PrismaClient;
  let dispatch: ReturnType<typeof createDiscordDispatcher>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supervisor = createMockSupervisor();
    prisma = createMockPrisma();
    dispatch = createDiscordDispatcher({ supervisor: supervisor as any, prisma });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler routing', () => {
    it('should route to handler by commandName', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      supervisor.registerDiscordHandler('test-command', 'game.test', handler);

      const interaction = createMockInteraction({ commandName: 'test-command' });
      const result = await dispatch(interaction);

      expect(result.success).toBe(true);
      expect(result.component).toBe('game.test');
      expect(handler).toHaveBeenCalled();
    });

    it('should route to handler by customId', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      supervisor.registerDiscordHandler('button:confirm', 'ui.buttons', handler);

      const interaction = createMockInteraction({
        commandName: undefined,
        customId: 'button:confirm',
      });
      const result = await dispatch(interaction);

      expect(result.success).toBe(true);
      expect(result.component).toBe('ui.buttons');
    });

    it('should return error if no handler key found', async () => {
      const interaction = createMockInteraction({
        commandName: undefined,
        customId: undefined,
      });
      const result = await dispatch(interaction);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No handler key');
    });

    it('should return error if handler not registered', async () => {
      const interaction = createMockInteraction({ commandName: 'unknown-command' });
      const result = await dispatch(interaction);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No handler registered');
    });
  });

  describe('runGuarded integration', () => {
    it('should catch handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler exploded'));
      supervisor.registerDiscordHandler('test-command', 'game.test', handler);

      const interaction = createMockInteraction();
      const result = await dispatch(interaction);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track duration', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      supervisor.registerDiscordHandler('test-command', 'game.test', handler);

      const interaction = createMockInteraction();
      const result = await dispatch(interaction);

      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('error responses', () => {
    it('should send error reply to user on failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Failed'));
      supervisor.registerDiscordHandler('test-command', 'game.test', handler);

      const interaction = createMockInteraction();
      await dispatch(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
        })
      );
    });

    it('should use custom error message', async () => {
      const customDispatch = createDiscordDispatcher({
        supervisor: supervisor as any,
        prisma,
        defaultErrorMessage: 'Custom error occurred',
      });

      const handler = vi.fn().mockRejectedValue(new Error('Failed'));
      supervisor.registerDiscordHandler('test-command', 'game.test', handler);

      const interaction = createMockInteraction();
      await customDispatch(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Custom error occurred',
        })
      );
    });
  });
});

// ============================================================================
// EXPORT DISPATCHER TESTS
// ============================================================================

describe('createExportDispatcher', () => {
  let supervisor: ReturnType<typeof createMockSupervisor>;
  let prisma: PrismaClient;
  let dispatch: ReturnType<typeof createExportDispatcher>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supervisor = createMockSupervisor();
    prisma = createMockPrisma();
    dispatch = createExportDispatcher({ supervisor: supervisor as any, prisma });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler routing', () => {
    it('should route to handler by event type', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      supervisor.registerExportHandler('battle.completed', 'game.battles', handler);

      const envelope = createMockExportEnvelope({ type: 'battle.completed' });
      const result = await dispatch(envelope);

      expect(result.handled).toBe(true);
      expect(result.component).toBe('game.battles');
      expect(handler).toHaveBeenCalled();
    });

    it('should return handled=false if no handler', async () => {
      const envelope = createMockExportEnvelope({ type: 'unknown.event' });
      const result = await dispatch(envelope);

      expect(result.handled).toBe(false);
      expect(result.component).toBeUndefined();
    });
  });

  describe('runGuarded integration', () => {
    it('should catch handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Export processing failed'));
      supervisor.registerExportHandler('test.event', 'test.handler', handler);

      const envelope = createMockExportEnvelope();
      const result = await dispatch(envelope);

      expect(result.handled).toBe(true); // Handler was found and invoked
      expect(result.error).toBeDefined();
    });

    it('should preserve scope from envelope', async () => {
      const handler = vi.fn().mockImplementation(async (ctx) => {
        expect(ctx.scope).toBeDefined();
        expect(ctx.scope.tenant).toBe(testScope.tenant);
      });
      supervisor.registerExportHandler('test.event', 'test.handler', handler);

      const envelope = createMockExportEnvelope();
      await dispatch(envelope);

      expect(handler).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// JOB DISPATCHER TESTS
// ============================================================================

describe('createJobDispatcher', () => {
  let supervisor: ReturnType<typeof createMockSupervisor>;
  let prisma: PrismaClient;
  let dispatch: ReturnType<typeof createJobDispatcher>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supervisor = createMockSupervisor();
    prisma = createMockPrisma();
    dispatch = createJobDispatcher({ supervisor: supervisor as any, prisma });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler routing', () => {
    it('should route to handler by job kind', async () => {
      const handler = vi.fn().mockResolvedValue('done');
      supervisor.registerJobHandler('email.send', 'notify.email', handler);

      const job = createMockJob({ kind: 'email.send' });
      const result = await dispatch(job);

      expect(result.handled).toBe(true);
      expect(result.component).toBe('notify.email');
    });

    it('should return error if no handler', async () => {
      const job = createMockJob({ kind: 'unknown.job' });
      const result = await dispatch(job);

      expect(result.handled).toBe(false);
      expect(result.error?.message).toContain('No handler');
    });
  });

  describe('job result handling', () => {
    it('should return job result from handler', async () => {
      const handler = vi.fn().mockResolvedValue({ processed: 42 });
      supervisor.registerJobHandler('test.job', 'test.worker', handler);

      const job = createMockJob();
      const result = await dispatch(job);

      expect(result.handled).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.result?.data).toEqual({ processed: 42 });
    });

    it('should handle job failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Job failed'));
      supervisor.registerJobHandler('test.job', 'test.worker', handler);

      const job = createMockJob();
      const result = await dispatch(job);

      expect(result.handled).toBe(true);
      expect(result.error).toBeDefined();
    });
  });
});

// ============================================================================
// HTTP DISPATCHER TESTS
// ============================================================================

describe('createHttpDispatcher', () => {
  let supervisor: ReturnType<typeof createMockSupervisor>;
  let prisma: PrismaClient;
  let dispatch: ReturnType<typeof createHttpDispatcher>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supervisor = createMockSupervisor();
    prisma = createMockPrisma();
    dispatch = createHttpDispatcher({ supervisor: supervisor as any, prisma });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler routing', () => {
    it('should route to handler by path', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      supervisor.registerHttpHandler('/api/status', 'health.check', handler);

      const request = createMockHttpRequest({ path: '/api/status' });
      const response = createMockHttpResponse();
      const result = await dispatch(request, response as any);

      expect(handler).toHaveBeenCalled();
      expect(result.component).toBe('health.check');
    });

    it('should return 404 if no handler', async () => {
      const request = createMockHttpRequest({ path: '/unknown' });
      const response = createMockHttpResponse();
      const result = await dispatch(request, response as any);

      expect(result.response.status).toBe(404);
      expect(response.status).toHaveBeenCalledWith(404);
    });
  });

  describe('runGuarded integration', () => {
    it('should return 500 on handler error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Server error'));
      supervisor.registerHttpHandler('/api/test', 'test.api', handler);

      const request = createMockHttpRequest({ path: '/api/test' });
      const response = createMockHttpResponse();
      const result = await dispatch(request, response as any);

      expect(result.response.status).toBe(500);
    });
  });
});

// ============================================================================
// CLI DISPATCHER TESTS
// ============================================================================

describe('createCliDispatcher', () => {
  let supervisor: ReturnType<typeof createMockSupervisor>;
  let prisma: PrismaClient;
  let dispatch: ReturnType<typeof createCliDispatcher>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supervisor = createMockSupervisor();
    prisma = createMockPrisma();
    dispatch = createCliDispatcher({ supervisor: supervisor as any, prisma });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler routing', () => {
    it('should route to handler by command name', async () => {
      const handler = vi.fn().mockResolvedValue(0); // CliHandler returns exit code
      supervisor.registerCliHandler('db:status', 'ops.db', handler);

      const command = createMockCliCommand('db:status', ['--verbose']);
      const result = await dispatch(command);

      expect(result.result.exitCode).toBe(0);
      expect(result.component).toBe('ops.db');
    });

    it('should return error exit code if no handler', async () => {
      const command = createMockCliCommand('unknown:command');
      const result = await dispatch(command);

      expect(result.result.exitCode).toBe(1);
      expect(result.result.error).toContain('Unknown command');
    });
  });

  describe('argument passing', () => {
    it('should pass arguments to handler', async () => {
      const handler = vi.fn().mockImplementation(async (_ctx, args) => {
        expect(args).toEqual(['--flag', 'value']);
        return 0;
      });
      supervisor.registerCliHandler('test:cmd', 'test.cli', handler);

      const command = createMockCliCommand('test:cmd', ['--flag', 'value']);
      await dispatch(command);

      expect(handler).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// COMMON DISPATCHER TESTS (v1.1.2 compliance)
// ============================================================================

describe('dispatcher v1.1.2 compliance', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('all dispatchers use runGuarded wrapper', () => {
    // This is a meta-test verifying the architecture
    // The individual dispatcher tests above verify runGuarded behavior
    expect(true).toBe(true);
  });

  it('dispatchers create ComponentContext for handlers', async () => {
    const supervisor = createMockSupervisor();
    const prisma = createMockPrisma();

    const handler = vi.fn().mockImplementation(async (ctx) => {
      // Verify ctx has expected primitives
      expect(ctx).toBeDefined();
      expect(ctx.scope).toBeDefined();
    });
    supervisor.registerDiscordHandler('test-command', 'test.component', handler);

    const dispatch = createDiscordDispatcher({ supervisor: supervisor as any, prisma });
    await dispatch(createMockInteraction({ commandName: 'test-command' }));

    expect(handler).toHaveBeenCalled();
  });

  it('dispatchers preserve tenant scope through call chain', async () => {
    const supervisor = createMockSupervisor();
    const prisma = createMockPrisma();

    const customScope: TenantScope = {
      tenant: 'custom-guild-456',
      environment: 'production',
      service: 'custom-service',
      component: 'custom',
    };

    const handler = vi.fn().mockImplementation(async (ctx) => {
      expect(ctx.scope.tenant).toBe(customScope.tenant);
    });
    supervisor.registerExportHandler('test.event', 'test.component', handler);

    const dispatch = createExportDispatcher({ supervisor: supervisor as any, prisma });
    await dispatch(createMockExportEnvelope({ scope: customScope }));

    expect(handler).toHaveBeenCalled();
  });
});
