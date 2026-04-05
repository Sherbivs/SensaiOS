/**
 * Manifest Schema — Zod validation for AppManifest
 * 
 * Provides runtime validation for app manifests loaded from JSON files.
 * Ensures manifests conform to the AppManifest TypeScript interface.
 * 
 * @module sensaios/install/manifest-schema
 */

import { z } from 'zod';
import type { AppManifest } from './app-manifest.js';

/**
 * Semantic version schema
 * Format: MAJOR.MINOR.PATCH (e.g., "1.2.3")
 */
const semverSchema = z.string().regex(
  /^\d+\.\d+\.\d+$/,
  { message: 'Version must be semantic version (MAJOR.MINOR.PATCH)' }
);

/**
 * App ID schema
 * Format: namespace.app (e.g., "game.battles", "discord.bot")
 */
const appIdSchema = z.string().regex(
  /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/,
  { message: 'App ID must be format: namespace.app (lowercase, hyphens allowed)' }
);

/**
 * Host kind schema
 * Valid values: bot, worker, cron, cli
 */
const hostKindSchema = z.enum(['bot', 'worker', 'cron', 'cli']);

/**
 * Database capability schema
 */
const dbCapabilitySchema = z.enum(['read', 'write', 'migrate']);

/**
 * Discord capability schema
 */
const discordCapabilitySchema = z.enum(['read', 'send', 'moderate']);

/**
 * Network capability schema
 */
const networkCapabilitySchema = z.enum(['http-egress']);

/**
 * Kernel capability schema (DANGEROUS - requires approval)
 */
const kernelCapabilitySchema = z.enum(['observe', 'modify']);

/**
 * Capability requirements schema
 */
const capabilityRequirementsSchema = z.object({
  db: z.array(dbCapabilitySchema).min(1, 'At least one database capability required'),
  discord: z.array(discordCapabilitySchema).optional(),
  network: z.array(networkCapabilitySchema).optional(),
  kernel: z.array(kernelCapabilitySchema).optional(),
});

/**
 * App ownership schema
 */
const ownershipSchema = z.object({
  canonical: z.array(z.string()).optional(),
  projections: z.array(z.string()).optional(),
});

/**
 * Resource budget schema
 */
const resourcesSchema = z.object({
  maxCacheMb: z.number().positive().optional(),
  maxQueueSize: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().positive().optional(),
});

/**
 * AppManifest validation schema
 * 
 * This Zod schema matches the AppManifest TypeScript interface.
 * Use validateManifest() for runtime validation.
 * 
 * @example
 * ```typescript
 * const result = appManifestSchema.safeParse(jsonData);
 * if (result.success) {
 *   const manifest: AppManifest = result.data;
 * } else {
 *   console.error('Invalid manifest:', result.error.errors);
 * }
 * ```
 */
export const appManifestSchema = z.object({
  // Required fields
  id: appIdSchema,
  name: z.string().min(1, 'App name is required'),
  version: semverSchema,
  hosts: z.array(hostKindSchema).min(1, 'At least one host type required'),
  capabilities: capabilityRequirementsSchema,

  // Optional fields
  description: z.string().optional(),
  owns: ownershipSchema.optional(),
  dependencies: z.array(appIdSchema).optional(),
  resources: resourcesSchema.optional(),
  
  // Lifecycle and handlers are runtime functions, validated separately
  // config is free-form JSON
  config: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Validate an unknown object as an AppManifest
 * 
 * This is the main entry point for manifest validation. It parses JSON data
 * and ensures it conforms to the AppManifest schema.
 * 
 * @param manifest - Unknown object to validate (typically from JSON.parse)
 * @returns Validated AppManifest object
 * @throws {Error} If validation fails with detailed error messages
 * 
 * @example
 * ```typescript
 * import fs from 'fs';
 * import { validateManifest } from './manifest-schema.js';
 * 
 * const jsonData = fs.readFileSync('app.manifest.json', 'utf-8');
 * const parsed = JSON.parse(jsonData);
 * 
 * try {
 *   const manifest = validateManifest(parsed);
 *   console.log('Valid manifest:', manifest.name);
 * } catch (error) {
 *   console.error('Invalid manifest:', error.message);
 * }
 * ```
 */
export function validateManifest(manifest: unknown): AppManifest {
  const result = appManifestSchema.safeParse(manifest);

  if (!result.success) {
    const errors = result.error.issues.map((err) => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });

    throw new Error(
      `Invalid app manifest:\n${errors.join('\n')}`
    );
  }

  // Return validated manifest (safe to cast to AppManifest)
  // Note: lifecycle and handlers are validated separately during installation
  return result.data as unknown as AppManifest;
}

/**
 * Validate manifest from JSON string
 * 
 * Convenience function that parses JSON and validates in one step.
 * 
 * @param json - JSON string containing manifest data
 * @returns Validated AppManifest object
 * @throws {Error} If JSON parsing or validation fails
 * 
 * @example
 * ```typescript
 * import fs from 'fs';
 * import { validateManifestJson } from './manifest-schema.js';
 * 
 * const jsonString = fs.readFileSync('app.manifest.json', 'utf-8');
 * const manifest = validateManifestJson(jsonString);
 * ```
 */
export function validateManifestJson(json: string): AppManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to parse manifest JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error }
    );
  }

  return validateManifest(parsed);
}

/**
 * Check if a capability is dangerous (requires approval)
 * 
 * Dangerous capabilities can modify system state or access sensitive data.
 * These require explicit operator approval during installation.
 * 
 * @param capability - Capability string to check
 * @returns True if capability requires approval
 * 
 * @example
 * ```typescript
 * isDangerousCapability('db.read');      // false
 * isDangerousCapability('db.migrate');   // true
 * isDangerousCapability('kernel.modify'); // true
 * ```
 */
export function isDangerousCapability(capability: string): boolean {
  const dangerous = [
    'db.migrate',        // Schema changes
    'kernel.observe',    // Read kernel state
    'kernel.modify',     // Change kernel config
    'discord.moderate',  // Ban/kick users, manage roles
  ];

  return dangerous.includes(capability);
}

/**
 * Extract all dangerous capabilities from manifest
 * 
 * Scans manifest capabilities and returns list of dangerous ones
 * that require approval.
 * 
 * @param manifest - AppManifest to scan
 * @returns Array of dangerous capability strings
 * 
 * @example
 * ```typescript
 * const dangerous = getDangerousCapabilities(manifest);
 * if (dangerous.length > 0) {
 *   console.log('Requires approval:', dangerous);
 * }
 * ```
 */
export function getDangerousCapabilities(manifest: AppManifest): string[] {
  const capabilities: string[] = [];

  // Check database capabilities
  if (manifest.capabilities.db.includes('migrate')) {
    capabilities.push('db.migrate');
  }

  // Check Discord capabilities
  if (manifest.capabilities.discord?.includes('moderate')) {
    capabilities.push('discord.moderate');
  }

  // Check kernel capabilities (all are dangerous)
  if (manifest.capabilities.kernel) {
    for (const cap of manifest.capabilities.kernel) {
      capabilities.push(`kernel.${cap}`);
    }
  }

  return capabilities;
}

/**
 * Flatten capabilities into dot-notation array
 * 
 * Converts nested capability requirements into flat strings.
 * 
 * @param manifest - AppManifest to extract capabilities from
 * @returns Array of capability strings (e.g., ["db.read", "db.write", "discord.send"])
 * 
 * @example
 * ```typescript
 * const caps = flattenCapabilities(manifest);
 * // ["db.read", "db.write", "discord.read", "discord.send"]
 * ```
 */
export function flattenCapabilities(manifest: AppManifest): string[] {
  const capabilities: string[] = [];

  // Database capabilities
  for (const cap of manifest.capabilities.db) {
    capabilities.push(`db.${cap}`);
  }

  // Discord capabilities
  if (manifest.capabilities.discord) {
    for (const cap of manifest.capabilities.discord) {
      capabilities.push(`discord.${cap}`);
    }
  }

  // Network capabilities
  if (manifest.capabilities.network) {
    for (const cap of manifest.capabilities.network) {
      capabilities.push(`network.${cap}`);
    }
  }

  // Kernel capabilities
  if (manifest.capabilities.kernel) {
    for (const cap of manifest.capabilities.kernel) {
      capabilities.push(`kernel.${cap}`);
    }
  }

  return capabilities;
}
