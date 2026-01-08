/**
 * App Uninstallation API for SensaiOS
 * 
 * Implements app uninstallation workflow:
 * 1. Validate app installed
 * 2. Check for dependent apps (block if found)
 * 3. Call onUnload() lifecycle hook
 * 4. Revoke all capabilities
 * 5. Update status to 'uninstalled'
 * 6. Emit app.uninstalled export event
 * 
 * @module sensaios/install/uninstall-app
 */

import type { UninstallResult } from './app-manifest.js';
import type { ComponentContext } from './app-manifest.js';

/**
 * Uninstalls an app from SensaiOS
 * 
 * @param appId - App ID to uninstall
 * @param ctx - Component context with db/exports/obs primitives
 * @param options - Uninstall options
 * @returns Uninstall result with success status and details
 * 
 * @throws Never throws - all errors captured in UninstallResult
 * 
 * @example
 * const result = await uninstallApp('game.battles', ctx);
 * 
 * if (!result.success) {
 *   console.error('Uninstall failed:', result.message);
 *   
 *   if (result.blockedByDependents && result.blockedByDependents.length > 0) {
 *     console.error('Cannot uninstall - other apps depend on this:', result.blockedByDependents);
 *   }
 * }
 */
export async function uninstallApp(
  appId: string,
  ctx: ComponentContext,
  options: { force?: boolean } = {}
): Promise<UninstallResult> {
  const startTime = Date.now();

  try {
    // Step 1: Validate app installed
    ctx.obs.log.info('Checking app installation status', { appId });

    const app = await ctx.db.prisma?.installed_app.findUnique({
      where: { id: appId },
      select: {
        id: true,
        name: true,
        version: true,
        manifest: true,
        status: true,
      },
    });

    if (!app) {
      return {
        success: false,
        appId,
        message: `App not found: ${appId}`,
        errors: ['App does not exist in installed_app table'],
      };
    }

    if (app.status === 'uninstalled') {
      return {
        success: false,
        appId,
        message: `App already uninstalled: ${appId}`,
        errors: ['App status is already "uninstalled"'],
      };
    }

    // Step 2: Check for dependent apps
    ctx.obs.log.info('Checking for dependent apps', { appId });

    const dependents = await findDependentApps(appId, ctx);

    if (dependents.length > 0 && !options.force) {
      ctx.obs.log.warn('Cannot uninstall - other apps depend on this', {
        appId,
        dependents,
      });

      return {
        success: false,
        appId,
        message: `Cannot uninstall - ${dependents.length} app(s) depend on this`,
        errors: [`Dependent apps: ${dependents.join(', ')}`],
        blockedByDependents: dependents,
      };
    }

    // Step 3: Call onUnload() lifecycle hook (best effort)
    const manifest = app.manifest as any;
    if (manifest?.lifecycle?.onUnload) {
      ctx.obs.log.info('Calling onUnload lifecycle hook', { appId });

      try {
        await manifest.lifecycle.onUnload(ctx);
      } catch (error) {
        // Log error but continue with uninstall (best effort cleanup)
        ctx.obs.log.error('onUnload lifecycle hook failed - continuing anyway', {
          appId,
          error: (error as Error).message,
        });
      }
    }

    // Step 4: Revoke all capabilities
    ctx.obs.log.info('Revoking capabilities', { appId });

    const revokedCount = await revokeCapabilities(appId, ctx);

    // Step 5: Update status to 'uninstalled'
    ctx.obs.log.info('Updating app status', { appId });

    await ctx.db.prisma?.installed_app.update({
      where: { id: appId },
      data: {
        status: 'uninstalled',
        updatedAt: new Date(),
      },
    });

    // Step 6: Emit app.uninstalled export event
    await ctx.exports?.append({
      source: 'sensaios.install',
      type: 'app.uninstalled',
      scope: { tenantId: ctx.scope?.tenantId || 'system', guildId: 'system' },
      idempotencyKey: `uninstalled-${appId}-${Date.now()}`,
      payload: {
        appId,
        appName: app.name,
        version: app.version,
        uninstalledAt: new Date(),
        capabilitiesRevoked: revokedCount,
      },
      occurredAt: new Date(),
      correlationId: ctx.obs?.correlationId || `uninstall-${Date.now()}`,
    });

    const duration = Date.now() - startTime;
    ctx.obs.log.info('App uninstalled successfully', {
      appId,
      version: app.version,
      duration,
      capabilitiesRevoked: revokedCount,
    });

    return {
      success: true,
      appId,
      message: `Successfully uninstalled ${app.name} v${app.version}`,
      errors: [],
    };
  } catch (error) {
    ctx.obs.log.error('Uninstall failed with unexpected error', {
      appId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return {
      success: false,
      appId,
      message: 'Uninstallation failed',
      errors: [(error as Error).message],
    };
  }
}

/**
 * Finds apps that depend on the specified app
 * 
 * Queries installed_app table for apps where manifest.dependencies includes appId.
 * Only returns apps with status='enabled'.
 * 
 * @internal
 * @param appId - App ID to check for dependents
 * @param ctx - Component context with database access
 * @returns Array of dependent app IDs
 */
async function findDependentApps(
  appId: string,
  ctx: ComponentContext
): Promise<string[]> {
  // Query installed_app where manifest->'dependencies' contains appId
  // Using JSON path query: manifest->'dependencies' @> '["appId"]'
  const apps = await ctx.db.prisma?.installed_app.findMany({
    where: {
      status: 'enabled',
      // Note: Prisma JSON filtering varies by database
      // This may need adjustment based on your database (PostgreSQL/MySQL/SQLite)
      manifest: {
        path: ['dependencies'],
        array_contains: appId,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  return apps?.map((app: { id: string; name: string }) => app.id) || [];
}

/**
 * Revokes all capabilities from app
 * 
 * Deletes all ComponentCapability records for the app.
 * 
 * @internal
 * @param appId - App ID to revoke capabilities for
 * @param ctx - Component context with database access
 * @returns Number of capabilities revoked
 */
async function revokeCapabilities(
  appId: string,
  ctx: ComponentContext
): Promise<number> {
  const result = await ctx.db.prisma?.component_capability.deleteMany({
    where: { component: appId },
  });

  const count = result?.count || 0;

  ctx.obs.log.info('Capabilities revoked', { appId, count });

  return count;
}

/**
 * Lists all dependents of an app (utility for external use)
 * 
 * @param appId - App ID to check for dependents
 * @param ctx - Component context with database access
 * @returns Array of dependent app information
 * 
 * @example
 * const dependents = await listDependents('game.core', ctx);
 * console.log('Apps depending on game.core:', dependents);
 * // [{ id: 'game.battles', name: 'Battle Engine', version: '1.0.0' }, ...]
 */
export async function listDependents(
  appId: string,
  ctx: ComponentContext
): Promise<Array<{ id: string; name: string; version: string }>> {
  const apps = await ctx.db.prisma?.installed_app.findMany({
    where: {
      status: 'enabled',
      manifest: {
        path: ['dependencies'],
        array_contains: appId,
      },
    },
    select: {
      id: true,
      name: true,
      version: true,
    },
  });

  return apps || [];
}
