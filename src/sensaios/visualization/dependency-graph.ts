/**
 * SensaiOS Dependency Graph Visualization
 * 
 * Export component dependency graphs as:
 * - Mermaid diagrams (for GitHub/Markdown)
 * - Graphviz DOT format
 * - ASCII art (for terminal)
 * 
 * @module sensaios/visualization/dependency-graph
 * @version 1.0.0
 */

import { componentRegistry } from '../component-registry.js';
import { scopedLogger } from '../../observability/envelope/console.js';

/** Scoped logger for visualization */
const log = scopedLogger('sensaios-viz');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Output format for dependency graph
 */
export type GraphFormat = 'mermaid' | 'dot' | 'ascii' | 'json';

/**
 * Graph node with metadata
 */
export interface GraphNode {
  /** Component name */
  name: string;

  /** Component state */
  state: 'uninstalled' | 'installed' | 'enabled';

  /** Has errors */
  hasError: boolean;

  /** Direct dependencies */
  dependencies: string[];

  /** Components that depend on this */
  dependents: string[];
}

/**
 * Complete dependency graph
 */
export interface DependencyGraphData {
  /** All nodes */
  nodes: GraphNode[];

  /** Edge list (from -> to) */
  edges: Array<{ from: string; to: string }>;

  /** Circular dependencies detected */
  cycles: string[][];

  /** Stats */
  stats: {
    totalComponents: number;
    enabled: number;
    installed: number;
    uninstalled: number;
    withErrors: number;
    totalEdges: number;
    maxDepth: number;
  };
}

/**
 * Visualization options
 */
export interface VisualizationOptions {
  /** Include uninstalled components */
  includeUninstalled?: boolean;

  /** Highlight circular dependencies */
  highlightCycles?: boolean;

  /** Show component state via colors */
  showState?: boolean;

  /** Graph title */
  title?: string;

  /** Direction: TB (top-bottom) or LR (left-right) */
  direction?: 'TB' | 'LR';
}

// ============================================================================
// GRAPH DATA EXTRACTION
// ============================================================================

/**
 * Extract dependency graph data from component registry
 */
export function extractGraphData(options: VisualizationOptions = {}): DependencyGraphData {
  const components = componentRegistry.getAll();
  const nodes: GraphNode[] = [];
  const edges: Array<{ from: string; to: string }> = [];

  // Build nodes
  for (const comp of components) {
    if (!options.includeUninstalled && comp.state === 'uninstalled') {
      continue;
    }

    const deps = componentRegistry.getDependencies(comp.manifest.name);
    const dependents = componentRegistry.getDependents(comp.manifest.name);

    nodes.push({
      name: comp.manifest.name,
      state: comp.state,
      hasError: !!comp.lastError,
      dependencies: deps,
      dependents,
    });

    // Build edges
    for (const dep of deps) {
      edges.push({ from: comp.manifest.name, to: dep });
    }
  }

  // Detect cycles
  const cycles = componentRegistry.detectCircularDependencies();

  // Calculate max depth (longest dependency chain)
  const maxDepth = calculateMaxDepth(nodes);

  // Stats
  const stats = {
    totalComponents: nodes.length,
    enabled: nodes.filter(n => n.state === 'enabled').length,
    installed: nodes.filter(n => n.state === 'installed').length,
    uninstalled: nodes.filter(n => n.state === 'uninstalled').length,
    withErrors: nodes.filter(n => n.hasError).length,
    totalEdges: edges.length,
    maxDepth,
  };

  return { nodes, edges, cycles, stats };
}

/**
 * Calculate maximum dependency chain depth
 */
function calculateMaxDepth(nodes: GraphNode[]): number {
  const nodeMap = new Map(nodes.map(n => [n.name, n]));
  const depthCache = new Map<string, number>();

  function getDepth(name: string, visited: Set<string>): number {
    if (depthCache.has(name)) return depthCache.get(name)!;
    if (visited.has(name)) return 0; // Cycle - don't recurse

    const node = nodeMap.get(name);
    if (!node || node.dependencies.length === 0) {
      depthCache.set(name, 0);
      return 0;
    }

    visited.add(name);
    const maxChildDepth = Math.max(
      ...node.dependencies.map(dep => getDepth(dep, visited))
    );
    visited.delete(name);

    const depth = maxChildDepth + 1;
    depthCache.set(name, depth);
    return depth;
  }

  let maxDepth = 0;
  for (const node of nodes) {
    maxDepth = Math.max(maxDepth, getDepth(node.name, new Set()));
  }

  return maxDepth;
}

// ============================================================================
// MERMAID FORMAT
// ============================================================================

/**
 * Generate Mermaid diagram from dependency graph
 * 
 * @example Output:
 * ```mermaid
 * graph TB
 *   game.core["game.core 🟢"]
 *   game.battles["game.battles 🟢"]
 *   game.battles --> game.core
 * ```
 */
export function toMermaid(data: DependencyGraphData, options: VisualizationOptions = {}): string {
  const direction = options.direction || 'TB';
  const lines: string[] = [];

  // Header
  lines.push(`graph ${direction}`);
  if (options.title) {
    lines.push(`  subgraph ${options.title}`);
  }

  // Nodes with state indicators
  for (const node of data.nodes) {
    const stateIcon = options.showState !== false ? getStateIcon(node) : '';
    const style = getNodeStyle(node, options);
    const label = `${node.name}${stateIcon}`;
    
    if (style) {
      lines.push(`  ${sanitizeId(node.name)}["${label}"]${style}`);
    } else {
      lines.push(`  ${sanitizeId(node.name)}["${label}"]`);
    }
  }

  // Edges
  for (const edge of data.edges) {
    const isCyclic = options.highlightCycles !== false && 
      data.cycles.some(c => c.includes(edge.from) && c.includes(edge.to));
    
    if (isCyclic) {
      lines.push(`  ${sanitizeId(edge.from)} -.->|cycle| ${sanitizeId(edge.to)}`);
    } else {
      lines.push(`  ${sanitizeId(edge.from)} --> ${sanitizeId(edge.to)}`);
    }
  }

  if (options.title) {
    lines.push('  end');
  }

  // Style definitions
  if (options.showState !== false) {
    lines.push('');
    lines.push('  classDef enabled fill:#90EE90,stroke:#228B22');
    lines.push('  classDef installed fill:#87CEEB,stroke:#4682B4');
    lines.push('  classDef error fill:#FFB6C1,stroke:#DC143C');
    
    // Apply classes
    const enabled = data.nodes.filter(n => n.state === 'enabled' && !n.hasError);
    const installed = data.nodes.filter(n => n.state === 'installed' && !n.hasError);
    const errored = data.nodes.filter(n => n.hasError);
    
    if (enabled.length) lines.push(`  class ${enabled.map(n => sanitizeId(n.name)).join(',')} enabled`);
    if (installed.length) lines.push(`  class ${installed.map(n => sanitizeId(n.name)).join(',')} installed`);
    if (errored.length) lines.push(`  class ${errored.map(n => sanitizeId(n.name)).join(',')} error`);
  }

  return lines.join('\n');
}

function getStateIcon(node: GraphNode): string {
  if (node.hasError) return ' ❌';
  switch (node.state) {
    case 'enabled': return ' 🟢';
    case 'installed': return ' 🔵';
    default: return ' ⚪';
  }
}

function getNodeStyle(node: GraphNode, options: VisualizationOptions): string {
  if (options.showState === false) return '';
  
  // Style applied via classes instead
  return '';
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

// ============================================================================
// GRAPHVIZ DOT FORMAT
// ============================================================================

/**
 * Generate Graphviz DOT format
 * 
 * @example Output:
 * ```dot
 * digraph components {
 *   rankdir=TB;
 *   node [shape=box];
 *   "game.core" [style=filled, fillcolor=lightgreen];
 *   "game.battles" -> "game.core";
 * }
 * ```
 */
export function toDot(data: DependencyGraphData, options: VisualizationOptions = {}): string {
  const lines: string[] = [];

  lines.push('digraph components {');
  lines.push(`  rankdir=${options.direction || 'TB'};`);
  lines.push('  node [shape=box, fontname="Helvetica"];');
  lines.push('  edge [arrowhead=vee];');
  
  if (options.title) {
    lines.push(`  label="${options.title}";`);
    lines.push('  labelloc=t;');
  }

  // Nodes
  for (const node of data.nodes) {
    const attrs: string[] = [];
    
    if (options.showState !== false) {
      if (node.hasError) {
        attrs.push('style=filled', 'fillcolor="#FFB6C1"');
      } else if (node.state === 'enabled') {
        attrs.push('style=filled', 'fillcolor="#90EE90"');
      } else if (node.state === 'installed') {
        attrs.push('style=filled', 'fillcolor="#87CEEB"');
      }
    }

    const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : '';
    lines.push(`  "${node.name}"${attrStr};`);
  }

  // Edges
  for (const edge of data.edges) {
    const isCyclic = options.highlightCycles !== false &&
      data.cycles.some(c => c.includes(edge.from) && c.includes(edge.to));
    
    if (isCyclic) {
      lines.push(`  "${edge.from}" -> "${edge.to}" [style=dashed, color=red, label="cycle"];`);
    } else {
      lines.push(`  "${edge.from}" -> "${edge.to}";`);
    }
  }

  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// ASCII FORMAT
// ============================================================================

/**
 * Generate ASCII art tree for terminal display
 */
export function toAscii(data: DependencyGraphData, options: VisualizationOptions = {}): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(`╔${'═'.repeat(options.title.length + 2)}╗`);
    lines.push(`║ ${options.title} ║`);
    lines.push(`╚${'═'.repeat(options.title.length + 2)}╝`);
    lines.push('');
  }

  // Find root nodes (no dependents within our graph)
  const allDeps = new Set(data.edges.map(e => e.to));
  const roots = data.nodes.filter(n => !allDeps.has(n.name));

  if (roots.length === 0) {
    // All nodes have dependencies - pick any as starting point
    roots.push(...data.nodes.slice(0, 1));
  }

  const printed = new Set<string>();

  function printNode(node: GraphNode, prefix: string, isLast: boolean): void {
    if (printed.has(node.name)) {
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${node.name} (circular ref)`);
      return;
    }
    printed.add(node.name);

    const stateChar = node.hasError ? '✗' : node.state === 'enabled' ? '●' : node.state === 'installed' ? '○' : '◌';
    lines.push(`${prefix}${isLast ? '└── ' : '├── '}[${stateChar}] ${node.name}`);

    const deps = node.dependencies
      .map(d => data.nodes.find(n => n.name === d))
      .filter((n): n is GraphNode => n !== undefined);

    deps.forEach((dep, i) => {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      printNode(dep, newPrefix, i === deps.length - 1);
    });
  }

  for (let i = 0; i < roots.length; i++) {
    printNode(roots[i], '', i === roots.length - 1);
  }

  // Stats footer
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push(`Components: ${data.stats.totalComponents} | Enabled: ${data.stats.enabled} | Edges: ${data.stats.totalEdges}`);
  if (data.cycles.length > 0) {
    lines.push(`⚠️  Circular dependencies: ${data.cycles.length}`);
  }

  return lines.join('\n');
}

// ============================================================================
// JSON FORMAT
// ============================================================================

/**
 * Export graph as JSON (for custom processing)
 */
export function toJson(data: DependencyGraphData): string {
  return JSON.stringify(data, null, 2);
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Generate dependency graph visualization
 * 
 * @param format - Output format
 * @param options - Visualization options
 * @returns Formatted string
 * 
 * @example
 * ```ts
 * // Generate Mermaid for GitHub
 * const mermaid = visualizeDependencies('mermaid', { title: 'SensaiOS Components' });
 * 
 * // Generate DOT for Graphviz
 * const dot = visualizeDependencies('dot');
 * 
 * // Terminal-friendly ASCII
 * const ascii = visualizeDependencies('ascii');
 * ```
 */
export function visualizeDependencies(
  format: GraphFormat = 'mermaid',
  options: VisualizationOptions = {}
): string {
  const data = extractGraphData(options);

  log.info('visualize', 'Generating graph', {
    format,
    nodes: data.stats.totalComponents,
    edges: data.stats.totalEdges,
  });

  switch (format) {
    case 'mermaid':
      return toMermaid(data, options);
    case 'dot':
      return toDot(data, options);
    case 'ascii':
      return toAscii(data, options);
    case 'json':
      return toJson(data);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Get raw graph data (for custom processing)
 */
export function getDependencyGraphData(options: VisualizationOptions = {}): DependencyGraphData {
  return extractGraphData(options);
}
