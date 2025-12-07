/**
 * Row-Level Security (RLS) Context Manager
 *
 * This module provides functions to set and clear user context for
 * PostgreSQL Row-Level Security policies.
 *
 * @module rls-context
 * @task P1-001 Row-Level Security Policies
 * @created 2025-12-04
 */

import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * User context for RLS policies
 */
export interface RlsUserContext {
  /** Discord user ID (snowflake) */
  discordId: string;
  /** Whether this user has admin bypass privileges */
  isAdmin?: boolean;
}

/**
 * Set the user context for the current database transaction.
 *
 * This MUST be called at the start of every request that accesses
 * user-specific data. The context is transaction-local, so it
 * automatically clears when the transaction ends.
 *
 * @param prisma - Prisma client instance
 * @param context - User context to set
 *
 * @example
 * ```typescript
 * // At start of request handler
 * await setUserContext(prisma, { discordId: interaction.user.id });
 *
 * // Now all queries are automatically filtered by RLS
 * const trainer = await prisma.trainer.findFirst();
 * // Returns only the current user's trainer (or null)
 * ```
 */
export async function setUserContext(
  prisma: PrismaClient,
  context: RlsUserContext
): Promise<void> {
  await prisma.$executeRaw`
    SELECT set_user_context(${context.discordId}, ${context.isAdmin ?? false})
  `;
}

/**
 * Clear the user context for the current database transaction.
 *
 * This should be called at the end of request handling, though
 * it's not strictly necessary since the context is transaction-local.
 *
 * @param prisma - Prisma client instance
 */
export async function clearUserContext(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`SELECT clear_user_context()`;
}

/**
 * Set admin bypass mode for operational queries.
 *
 * Use this for:
 * - System operations (cron jobs, workers)
 * - Admin commands (/ops commands)
 * - Background data processing
 *
 * @param prisma - Prisma client instance
 * @param adminId - Optional admin identifier for audit logging
 *
 * @example
 * ```typescript
 * // In a cron job or admin command
 * await setAdminBypass(prisma, 'system-cron');
 *
 * // Now all RLS policies are bypassed
 * const allTrainers = await prisma.trainer.findMany();
 * // Returns ALL trainers, not just current user's
 * ```
 */
export async function setAdminBypass(
  prisma: PrismaClient,
  adminId: string = "system"
): Promise<void> {
  await prisma.$executeRaw`
    SELECT set_user_context(${adminId}, true)
  `;
}

/**
 * Execute a callback with user context set, automatically clearing afterwards.
 *
 * This is the recommended pattern for request handlers.
 *
 * @param prisma - Prisma client instance
 * @param context - User context to set
 * @param callback - Async function to execute with context set
 * @returns The result of the callback
 *
 * @example
 * ```typescript
 * const trainer = await withUserContext(
 *   prisma,
 *   { discordId: interaction.user.id },
 *   async () => {
 *     return await prisma.trainer.findFirst();
 *   }
 * );
 * ```
 */
export async function withUserContext<T>(
  prisma: PrismaClient,
  context: RlsUserContext,
  callback: () => Promise<T>
): Promise<T> {
  await setUserContext(prisma, context);
  try {
    return await callback();
  } finally {
    await clearUserContext(prisma);
  }
}

/**
 * Execute a callback with admin bypass enabled, automatically clearing afterwards.
 *
 * Use for system operations that need to access all data.
 *
 * @param prisma - Prisma client instance
 * @param callback - Async function to execute with bypass enabled
 * @param adminId - Optional admin identifier for audit logging
 * @returns The result of the callback
 *
 * @example
 * ```typescript
 * // In a worker or cron job
 * const stats = await withAdminBypass(prisma, async () => {
 *   const trainerCount = await prisma.trainer.count();
 *   const pokemonCount = await prisma.pokemonInstance.count();
 *   return { trainerCount, pokemonCount };
 * });
 * ```
 */
export async function withAdminBypass<T>(
  prisma: PrismaClient,
  callback: () => Promise<T>,
  adminId: string = "system"
): Promise<T> {
  await setAdminBypass(prisma, adminId);
  try {
    return await callback();
  } finally {
    await clearUserContext(prisma);
  }
}

/**
 * Execute a Prisma transaction with user context set.
 *
 * The context persists for the entire transaction.
 *
 * @param prisma - Prisma client instance
 * @param context - User context to set
 * @param callback - Transaction callback
 * @returns The result of the transaction
 *
 * @example
 * ```typescript
 * await withUserContextTransaction(
 *   prisma,
 *   { discordId: interaction.user.id },
 *   async (tx) => {
 *     const trainer = await tx.trainer.findFirst();
 *     await tx.pokemonInstance.create({
 *       data: { ... }
 *     });
 *   }
 * );
 * ```
 */
/**
 * Execute a Prisma transaction with user context set.
 *
 * The context persists for the entire transaction.
 * Note: Uses type assertion for transaction client to access raw query methods.
 *
 * @param prisma - Prisma client instance
 * @param context - User context to set
 * @param callback - Transaction callback (receives typed Prisma client)
 * @returns The result of the transaction
 *
 * @example
 * ```typescript
 * await withUserContextTransaction(
 *   prisma,
 *   { discordId: interaction.user.id },
 *   async (tx) => {
 *     const trainer = await tx.trainer.findFirst();
 *     await tx.pokemonInstance.create({
 *       data: { ... }
 *     });
 *   }
 * );
 * ```
 */
export async function withUserContextTransaction<T>(
  prisma: PrismaClient,
  context: RlsUserContext,
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    // Cast tx to PrismaClient to access $queryRawUnsafe
    // This is safe because the transaction client has the same interface
    const txClient = tx as unknown as PrismaClient;
    
    // Set context within transaction
    await txClient.$queryRawUnsafe(
      `SELECT set_user_context($1, $2)`,
      context.discordId,
      context.isAdmin ?? false
    );

    return await callback(txClient);
    // Context automatically cleared when transaction ends
  });
}

/**
 * Check if RLS is enabled on a table.
 *
 * Useful for debugging and verification.
 *
 * @param prisma - Prisma client instance
 * @param tableName - Name of the table to check (case-sensitive)
 * @returns True if RLS is enabled
 */
export async function isRlsEnabled(
  prisma: PrismaClient,
  tableName: string
): Promise<boolean> {
  const result = await prisma.$queryRaw<{ rowsecurity: boolean }[]>`
    SELECT relrowsecurity as rowsecurity
    FROM pg_class
    WHERE relname = ${tableName}
  `;

  return result.length > 0 && result[0].rowsecurity;
}

/**
 * Get all RLS policies for a table.
 *
 * Useful for debugging and verification.
 *
 * @param prisma - Prisma client instance
 * @param tableName - Name of the table (case-sensitive)
 * @returns Array of policy information
 */
export async function getRlsPolicies(
  prisma: PrismaClient,
  tableName: string
): Promise<
  Array<{
    policyname: string;
    cmd: string;
    permissive: string;
    roles: string[];
  }>
> {
  return await prisma.$queryRaw`
    SELECT policyname, cmd, permissive, roles
    FROM pg_policies
    WHERE tablename = ${tableName}
    ORDER BY policyname
  `;
}

/**
 * Verify RLS configuration for all protected tables.
 *
 * Returns a summary of which tables have RLS enabled and their policies.
 *
 * @param prisma - Prisma client instance
 * @returns RLS verification report
 */
export async function verifyRlsConfiguration(prisma: PrismaClient): Promise<{
  tablesWithRls: string[];
  tablesWithoutRls: string[];
  policyCount: number;
  issues: string[];
}> {
  // Tables that SHOULD have RLS
  const protectedTables = [
    "User",
    "Trainer",
    "TrainerSettings",
    "PokemonInstance",
    "Party",
    "PartySlot",
    "Inventory",
    "Encounter",
    "Battle",
    "HomesteadChannel",
  ];

  const tablesWithRls: string[] = [];
  const tablesWithoutRls: string[] = [];
  const issues: string[] = [];
  let policyCount = 0;

  for (const table of protectedTables) {
    const hasRls = await isRlsEnabled(prisma, table);
    if (hasRls) {
      tablesWithRls.push(table);
      const policies = await getRlsPolicies(prisma, table);
      policyCount += policies.length;

      // Check for missing policies
      const commands = policies.map((p) => p.cmd);
      if (!commands.includes("SELECT"))
        issues.push(`${table}: Missing SELECT policy`);
      if (!commands.includes("INSERT"))
        issues.push(`${table}: Missing INSERT policy`);
      if (!commands.includes("UPDATE"))
        issues.push(`${table}: Missing UPDATE policy`);
      if (!commands.includes("DELETE"))
        issues.push(`${table}: Missing DELETE policy`);
    } else {
      tablesWithoutRls.push(table);
      issues.push(`${table}: RLS not enabled`);
    }
  }

  return {
    tablesWithRls,
    tablesWithoutRls,
    policyCount,
    issues,
  };
}
