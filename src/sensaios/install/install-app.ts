/**
 * App Installation API for SensaiOS
 * 
 * Implements app installation workflow:
 * 1. Validate manifest (Zod schema)
 * 2. Resolve dependencies (check cycles)
 * 3. Check dangerous capabilities (request approval)
 * 4. ATOMIC TRANSACTION: Grant capabilities + Store manifest
 * 5. Call onLoad() lifecycle hook
 * 6. Emit app.installed export event
 * 
 * v1.1.2 ENHANCEMENT: Steps 4-5 wrapped in database transaction for atomic rollback
 * If any step fails, all changes are rolled back automatically.
 * 
 * @module sensaios/install/install-app
 */

import { validateManifest, getDangerousCapabilities } from './manifest-schema.js';
import { resolveDependencies, validateDependencies } from './dependency-resolver.js';
import type { AppManifest, InstallResult } from './app-manifest.js';
import type { ComponentContext } from './app-manifest.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Installs an app into SensaiOS
 * 
 * @param manifest - App manifest (validated before storage)
 * @param ctx - Component context with db/exports/obs primitives
 * @returns Install result with success status and details
 * 
 * @throws Never throws - all errors captured in InstallResult
 * 
 * @example
 * const manifest = await loadManifestFromFile('manifests/battle-engine.manifest.json');
 * const result = await installApp(manifest, ctx);
 * 
 * if (!result.success) {
 *   console.error('Install failed:', result.message);
 *   console.error('Errors:', result.errors);
 * }
 * 
 * if (result.pendingApprovals && result.pendingApprovals.length > 0) {
 *   console.warn('Approval required:', result.pendingApprovals);
 * }
 */
export async function installApp(
  manifest: unknown,
  ctx: ComponentContext
): Promise<InstallResult> {
  const appId = (manifest as { id?: string }).id || 'unknown';
  const startTime = Date.now();

  try {
    // Step 1: Validate manifest with Zod schema
    ctx.obs.log.info('Validating manifest', { appId });
    let validatedManifest: AppManifest;
    try {
      validatedManifest = validateManifest(manifest);
    } catch (error) {
      return {
        success: false,
        appId,
        message: 'Manifest validation failed',
        errors: [(error as Error).message],
      };
    }

    // Step 2: Check if already installed
    const existing = await ctx.db.prisma?.installed_app.findUnique({
      where: { id: validatedManifest.id },
      select: { id: true, status: true, version: true },
    });

    if (existing) {
      return {
        success: false,
        appId: validatedManifest.id,
        message: `App already installed (status: ${existing.status}, version: ${existing.version})`,
        errors: ['App already exists - use upgrade instead'],
      };
    }

    // Step 3: Validate dependencies installed
    ctx.obs.log.info('Validating dependencies', {
      appId: validatedManifest.id,
      dependencies: validatedManifest.dependencies || [],
    });

    const depsValid = await validateDependencies(validatedManifest, ctx);
    if (!depsValid) {
      return {
        success: false,
        appId: validatedManifest.id,
        message: 'Dependency validation failed',
        errors: ['One or more dependencies not installed or not enabled'],
      };
    }

    // Step 4: Resolve dependencies (detect cycles)
    let dependencyGraph;
    try {
      dependencyGraph = await resolveDependencies(validatedManifest, ctx);
    } catch (error) {
      return {
        success: false,
        appId: validatedManifest.id,
        message: 'Dependency resolution failed',
        errors: [(error as Error).message],
      };
    }

    if (dependencyGraph.cycles && dependencyGraph.cycles.length > 0) {
      return {
        success: false,
        appId: validatedManifest.id,
        message: 'Circular dependencies detected',
        errors: dependencyGraph.cycles.map((cycle) => `Cycle: ${cycle.join(' → ')}`),
      };
    }

    // Step 5: Check for dangerous capabilities
    const dangerousCaps = getDangerousCapabilities(validatedManifest);
    
    if (dangerousCaps.length > 0) {
      ctx.obs.log.warn('Dangerous capabilities detected', {
        appId: validatedManifest.id,
        capabilities: dangerousCaps,
      });

      // Emit approval request event
      await ctx.exports?.append({
        source: 'sensaios.install',
        type: 'app.approval-required',
        scope: { tenantId: ctx.scope?.tenantId || 'system', guildId: 'system' },
        idempotencyKey: `approval-${validatedManifest.id}-${Date.now()}`,
        payload: {
          appId: validatedManifest.id,
          appName: validatedManifest.name,
          version: validatedManifest.version,
          dangerousCapabilities: dangerousCaps,
          reason: 'Installation requires operator approval',
        },
        occurredAt: new Date(),
        correlationId: ctx.obs?.correlationId || `install-${Date.now()}`,
      });

      // Return pending approval
      return {
        success: false,
        appId: validatedManifest.id,
        message: 'Awaiting operator approval for dangerous capabilities',
        errors: [],
        pendingApprovals: dangerousCaps,
      };
    }

    // ========================================================================
    // ATOMIC INSTALLATION (v1.1.2) — Capability grants + DB insert in ONE transaction
    // If ANY step fails, ALL changes are rolled back automatically.
    // ========================================================================
    ctx.obs.log.info('Starting atomic installation transaction', {
      appId: validatedManifest.id,
    });

    try {
      await ctx.db.prisma?.$transaction(async (tx: PrismaClient) => {
        // Step 6: Grant capabilities (INSIDE TRANSACTION)
        ctx.obs.log.info('Granting capabilities (atomic)', {
          appId: validatedManifest.id,
          capabilities: validatedManifest.capabilities,
        });

        await grantCapabilitiesAtomic(validatedManifest, tx, ctx);

        // Step 7: Store manifest in database (INSIDE TRANSACTION)
        ctx.obs.log.info('Storing manifest (atomic)', { appId: validatedManifest.id });

        await tx.installedApp.create({
          data: {
            id: validatedManifest.id,
            name: validatedManifest.name,
            version: validatedManifest.version,
            ringLevel: 3, // Apps always Ring 3
            manifest: validatedManifest as object,
            status: 'enabled',
            installedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Transaction commits here if all steps succeed
      });
    } catch (txError) {
      // Transaction automatically rolled back - no dangling state
      ctx.obs.log.error('Atomic installation failed - all changes rolled back', {
        appId: validatedManifest.id,
        error: (txError as Error).message,
      });

      return {
        success: false,
        appId: validatedManifest.id,
        message: 'Installation failed (rolled back)',
        errors: [(txError as Error).message],
      };
    }

    // Step 8: Call onLoad() lifecycle hook (OUTSIDE TRANSACTION - can fail independently)
    if (validatedManifest.lifecycle?.onLoad) {
      ctx.obs.log.info('Calling onLoad lifecycle hook', {
        appId: validatedManifest.id,
      });

      try {
        await validatedManifest.lifecycle.onLoad(ctx);
      } catch (error) {
        // Lifecycle hook failed - rollback install
        ctx.obs.log.error('onLoad lifecycle hook failed - rolling back', {
          appId: validatedManifest.id,
          error: (error as Error).message,
        });

        // Revoke capabilities
        await revokeCapabilities(validatedManifest.id, ctx);

        // Remove from database
        await ctx.db.prisma?.installed_app.delete({
          where: { id: validatedManifest.id },
        });

        return {
          success: false,
          appId: validatedManifest.id,
          message: 'Lifecycle hook onLoad() failed',
          errors: [(error as Error).message],
        };
      }
    }

    // Step 9: Emit app.installed export event
    await ctx.exports?.append({
      source: 'sensaios.install',
      type: 'app.installed',
      scope: { tenantId: ctx.scope?.tenantId || 'system', guildId: 'system' },
      idempotencyKey: `installed-${validatedManifest.id}-${Date.now()}`,
      payload: {
        appId: validatedManifest.id,
        appName: validatedManifest.name,
        version: validatedManifest.version,
        installedAt: new Date(),
        dependencies: validatedManifest.dependencies || [],
      },
      occurredAt: new Date(),
      correlationId: ctx.obs?.correlationId || `install-${Date.now()}`,
    });

    const duration = Date.now() - startTime;
    ctx.obs.log.info('App installed successfully', {
      appId: validatedManifest.id,
      version: validatedManifest.version,
      duration,
    });

    return {
      success: true,
      appId: validatedManifest.id,
      message: `Successfully installed ${validatedManifest.name} v${validatedManifest.version}`,
      errors: [],
    };
  } catch (error) {
    ctx.obs.log.error('Install failed with unexpected error', {
      appId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return {
      success: false,
      appId,
      message: 'Installation failed',
      errors: [(error as Error).message],
    };
  }
}

/**
 * Grants capabilities to installed app
 * 
 * Creates ComponentCapability records for each required capability.
 * 
 * @internal
 * @param manifest - Validated app manifest
 * @param ctx - Component context with database access
 */
async function _grantCapabilities(
  manifest: AppManifest,
  ctx: ComponentContext
): Promise<void> {
  const capabilities: Array<{ type: string; scope: unknown }> = [];

  // Flatten capability requirements
  for (const cap of manifest.capabilities.db) {
    capabilities.push({ type: `db.${cap}`, scope: {} });
  }

  if (manifest.capabilities.discord) {
    for (const cap of manifest.capabilities.discord) {
      capabilities.push({ type: `discord.${cap}`, scope: {} });
    }
  }

  if (manifest.capabilities.network) {
    for (const cap of manifest.capabilities.network) {
      capabilities.push({ type: `network.${cap}`, scope: {} });
    }
  }

  if (manifest.capabilities.kernel) {
    for (const cap of manifest.capabilities.kernel) {
      capabilities.push({ type: `kernel.${cap}`, scope: {} });
    }
  }

  // Insert capability grants
  for (const cap of capabilities) {
    await ctx.db.prisma?.component_capability.create({
      data: {
        component: manifest.id,
        type: cap.type,
        scope: cap.scope,
        reason: `Granted during installation of ${manifest.name} v${manifest.version}`,
        grantedBy: 'sensaios.install',
        createdAt: new Date(),
      },
    });
  }

  ctx.obs.log.info('Capabilities granted', {
    appId: manifest.id,
    count: capabilities.length,
    capabilities: capabilities.map((c) => c.type),
  });
}

/**
 * Revokes all capabilities from app (rollback helper)
 * 
 * @internal
 * @param appId - App ID to revoke capabilities for
 * @param ctx - Component context with database access
 */
async function revokeCapabilities(
  appId: string,
  ctx: ComponentContext
): Promise<void> {
  await ctx.db.prisma?.component_capability.deleteMany({
    where: { component: appId },
  });

  ctx.obs.log.info('Capabilities revoked', { appId });
}

/**
 * Grants capabilities within an atomic transaction (v1.1.2)
 * 
 * Uses the transaction client (tx) instead of ctx.db.prisma to ensure
 * all capability grants are part of the same atomic operation.
 * 
 * @internal
 * @param manifest - Validated app manifest
 * @param tx - Prisma transaction client
 * @param ctx - Component context for logging
 */
async function grantCapabilitiesAtomic(
  manifest: AppManifest,
  tx: PrismaClient,
  ctx: ComponentContext
): Promise<void> {
  const capabilities: Array<{ type: string; scope: object }> = [];

  // Flatten capability requirements
  for (const cap of manifest.capabilities.db) {
    capabilities.push({ type: `db.${cap}`, scope: {} });
  }

  if (manifest.capabilities.discord) {
    for (const cap of manifest.capabilities.discord) {
      capabilities.push({ type: `discord.${cap}`, scope: {} });
    }
  }

  if (manifest.capabilities.network) {
    for (const cap of manifest.capabilities.network) {
      capabilities.push({ type: `network.${cap}`, scope: {} });
    }
  }

  if (manifest.capabilities.kernel) {
    for (const cap of manifest.capabilities.kernel) {
      capabilities.push({ type: `kernel.${cap}`, scope: {} });
    }
  }

  // Insert capability grants atomically
  for (const cap of capabilities) {
    await tx.componentCapability.create({
      data: {
        component: manifest.id,
        type: cap.type,
        scope: cap.scope,
        reason: `Granted during installation of ${manifest.name} v${manifest.version}`,
        grantedBy: 'sensaios.install',
        createdAt: new Date(),
      },
    });
  }

  ctx.obs.log.info('Capabilities granted (atomic)', {
    appId: manifest.id,
    count: capabilities.length,
    capabilities: capabilities.map((c) => c.type),
  });
}
