/**
 * Dependency Resolution for SensaiOS Apps
 * 
 * Resolves app dependencies, detects circular dependencies, validates
 * installation order, and generates dependency graphs.
 * 
 * Key Functions:
 * - resolveDependencies(): Build dependency graph from manifest
 * - detectCycles(): Find circular dependencies
 * - topologicalSort(): Generate safe installation order
 * - validateDependencies(): Ensure all dependencies installed
 * 
 * @module sensaios/install/dependency-resolver
 */

import type { AppManifest, DependencyGraph, DependencyNode } from './app-manifest.js';
import type { ComponentContext } from './app-manifest.js';

/**
 * Resolves app dependencies and generates dependency graph
 * 
 * @param manifest - App manifest to resolve dependencies for
 * @param ctx - Component context for database access
 * @returns Dependency graph with install order and cycle detection
 * 
 * @throws Error if circular dependencies detected
 * @throws Error if required dependencies not installed
 * 
 * @example
 * const graph = await resolveDependencies(battleEngineManifest, ctx);
 * if (graph.cycles.length > 0) {
 *   console.error('Circular dependencies:', graph.cycles);
 * }
 * console.log('Install order:', graph.installOrder);
 */
export async function resolveDependencies(
  manifest: AppManifest,
  ctx: ComponentContext
): Promise<DependencyGraph> {
  const nodes: DependencyNode[] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  // Build dependency tree recursively
  await buildDependencyTree(manifest.id, manifest, ctx, nodes, visited, stack, cycles);

  // Detect cycles
  const detectedCycles = detectCycles(nodes);
  
  // Generate topological sort for install order
  const installOrder = topologicalSort(nodes);

  return {
    nodes,
    installOrder,
    cycles: detectedCycles,
  };
}

/**
 * Builds dependency tree by recursively fetching dependencies
 * 
 * @internal
 */
async function buildDependencyTree(
  appId: string,
  manifest: AppManifest,
  ctx: ComponentContext,
  nodes: DependencyNode[],
  visited: Set<string>,
  stack: Set<string>,
  cycles: string[][]
): Promise<void> {
  // Skip if already visited
  if (visited.has(appId)) {
    return;
  }

  // Detect cycle (back edge)
  if (stack.has(appId)) {
    const cycle = Array.from(stack).concat(appId);
    cycles.push(cycle);
    return;
  }

  visited.add(appId);
  stack.add(appId);

  // Create node for this app
  const node: DependencyNode = {
    appId,
    version: manifest.version,
    dependencies: manifest.dependencies || [],
    dependents: [], // Will be populated later if needed
  };
  nodes.push(node);

  // Recursively process dependencies
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    for (const depId of manifest.dependencies) {
      // Check if dependency is installed
      const installedDep = await ctx.db.prisma?.installed_app.findUnique({
        where: { id: depId },
        select: { id: true, manifest: true, status: true },
      });

      if (!installedDep) {
        throw new Error(
          `Dependency not installed: ${depId} (required by ${appId})`
        );
      }

      if (installedDep.status !== 'enabled') {
        throw new Error(
          `Dependency not enabled: ${depId} (status: ${installedDep.status})`
        );
      }

      // Recursively build tree for dependency
      const depManifest = installedDep.manifest as AppManifest;
      await buildDependencyTree(
        depId,
        depManifest,
        ctx,
        nodes,
        visited,
        stack,
        cycles
      );
    }
  }

  stack.delete(appId);
}

/**
 * Detects circular dependencies in dependency graph
 * 
 * Uses depth-first search to find cycles (back edges)
 * 
 * @param nodes - Dependency nodes to analyze
 * @returns Array of cycles (each cycle is array of app IDs)
 * 
 * @example
 * const cycles = detectCycles(graph.nodes);
 * // Returns: [['app.a', 'app.b', 'app.a']]
 */
export function detectCycles(nodes: DependencyNode[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.appId, n]));

  function visit(appId: string, path: string[]): void {
    if (stack.has(appId)) {
      // Found cycle - extract cycle path
      const cycleStart = path.indexOf(appId);
      const cycle = path.slice(cycleStart).concat(appId);
      cycles.push(cycle);
      return;
    }

    if (visited.has(appId)) {
      return;
    }

    visited.add(appId);
    stack.add(appId);
    path.push(appId);

    const node = nodeMap.get(appId);
    if (node && node.dependencies) {
      for (const depId of node.dependencies) {
        visit(depId, [...path]);
      }
    }

    stack.delete(appId);
    path.pop();
  }

  // Visit each node as potential cycle start
  for (const node of nodes) {
    if (!visited.has(node.appId)) {
      visit(node.appId, []);
    }
  }

  return cycles;
}

/**
 * Topological sort - generates installation order
 * 
 * Returns apps in order where dependencies are always installed first.
 * Uses Kahn's algorithm (breadth-first with in-degree tracking).
 * 
 * @param nodes - Dependency nodes to sort
 * @returns App IDs in safe installation order
 * @throws Error if cycles detected (topological sort impossible)
 * 
 * @example
 * const order = topologicalSort(graph.nodes);
 * // Returns: ['game.core', 'discord.bot', 'game.battles']
 */
export function topologicalSort(nodes: DependencyNode[]): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  const sorted: string[] = [];

  // Initialize in-degree and adjacency list
  for (const node of nodes) {
    inDegree.set(node.appId, 0);
    adjList.set(node.appId, []);
  }

  // Build graph
  for (const node of nodes) {
    for (const depId of node.dependencies || []) {
      // Add edge from dependency to dependent
      const deps = adjList.get(depId) || [];
      deps.push(node.appId);
      adjList.set(depId, deps);

      // Increment in-degree for dependent
      const degree = inDegree.get(node.appId) || 0;
      inDegree.set(node.appId, degree + 1);
    }
  }

  // Find nodes with no incoming edges (no dependencies)
  const queue: string[] = [];
  for (const [appId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(appId);
    }
  }

  // Process queue
  while (queue.length > 0) {
    const appId = queue.shift()!;
    sorted.push(appId);

    // Reduce in-degree for dependents
    const dependents = adjList.get(appId) || [];
    for (const depAppId of dependents) {
      const degree = inDegree.get(depAppId)!;
      inDegree.set(depAppId, degree - 1);

      if (degree - 1 === 0) {
        queue.push(depAppId);
      }
    }
  }

  // Check if all nodes processed (no cycles)
  if (sorted.length !== nodes.length) {
    throw new Error(
      `Circular dependency detected: processed ${sorted.length}/${nodes.length} nodes`
    );
  }

  return sorted;
}

/**
 * Validates that all required dependencies are installed
 * 
 * @param manifest - App manifest with dependencies
 * @param ctx - Component context for database access
 * @returns True if all dependencies installed, false otherwise
 * 
 * @example
 * const valid = await validateDependencies(manifest, ctx);
 * if (!valid) {
 *   throw new Error('Missing dependencies');
 * }
 */
export async function validateDependencies(
  manifest: AppManifest,
  ctx: ComponentContext
): Promise<boolean> {
  if (!manifest.dependencies || manifest.dependencies.length === 0) {
    return true;
  }

  for (const depId of manifest.dependencies) {
    const installed = await ctx.db.prisma?.installed_app.findUnique({
      where: { id: depId },
      select: { id: true, status: true },
    });

    if (!installed) {
      ctx.obs.log.error('Dependency not installed', { depId, appId: manifest.id });
      return false;
    }

    if (installed.status !== 'enabled') {
      ctx.obs.log.error('Dependency not enabled', {
        depId,
        appId: manifest.id,
        status: installed.status,
      });
      return false;
    }
  }

  return true;
}
