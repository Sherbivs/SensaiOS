// Battle core v1: thin TypeScript wrappers around the JS engine in src/engine/*
// Provides deterministic RNG, simple helpers to build runtimes from dex, and resolve a turn.

// Import CommonJS modules from our JS engine using esModuleInterop
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import engine from '../../engine/index.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import calc from '../../engine/calc.js';

export interface RNG {
  next: () => number; // [0,1)
}

// Simple, deterministic LCG RNG with 32-bit state
export class SeededRNG implements RNG {
  private state: number;
  constructor(seed: number | string) {
    // Hash string seeds lightly; keep non-negative 32-bit
    let s = 0;
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
      seed = s;
    }
    this.state = (Number(seed) >>> 0) || 1;
  }
  next() {
    // LCG constants from Numerical Recipes
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    // Map to [0,1)
    return (this.state >>> 0) / 0x1_0000_0000; // 2^32
  }
}

export type MoveKey = string;

export interface ResolveCtxOptions {
  seed?: number | string;
  weather?: 'rain' | 'sun' | null;
  critChance?: number; // override global crit chance (0..1)
}

export interface BuiltIndexes {
  dexLookup: (q: string | number) => any;
  movesIndex: Record<string, any>;
}

export function loadIndexes(): BuiltIndexes {
  // engine.loadIndexes returns { dexLookup, movesIndex }
  return engine.loadIndexes();
}

export function buildRuntimeFromDex(name: string, level = 50, moves: MoveKey[] = [], opts: Record<string, any> = {}) {
  const { dexLookup } = loadIndexes();
  const dexMon = dexLookup(name);
  if (!dexMon) throw new Error(`Unknown species: ${name}`);
  const p = engine.makeRuntimeFromDexEntry(dexMon, level, moves, opts);
  return p;
}

export interface BattleInitOptions extends ResolveCtxOptions {
  a: { name: string; level?: number; moves?: MoveKey[]; opts?: Record<string, any> };
  b: { name: string; level?: number; moves?: MoveKey[]; opts?: Record<string, any> };
}

export function newBattle(init: BattleInitOptions) {
  const { a, b } = init;
  const pa = buildRuntimeFromDex(a.name, a.level ?? 50, a.moves ?? [], a.opts ?? {});
  const pb = buildRuntimeFromDex(b.name, b.level ?? 50, b.moves ?? [], b.opts ?? {});
  const state = engine.newBattleState(pa, pb);

  // Build a ctx compatible with engine
  const indexes = loadIndexes();
  const rng = init.seed != null ? new SeededRNG(init.seed) : undefined;
  const ctx: any = {
    rng,
    weather: init.weather ?? null,
  };
  if (typeof init.critChance === 'number') ctx.critChance = init.critChance;

  return { state, ctx, indexes };
}

export function resolveTurn(
  battle: ReturnType<typeof newBattle>,
  moveA: MoveKey,
  moveB: MoveKey,
) {
  const { state, ctx, indexes } = battle;
  const { newAction, resolveTurn } = engine as any;
  const actionA = newAction('a', moveA);
  const actionB = newAction('b', moveB);
  const result = resolveTurn(state, actionA, actionB, { ...ctx, ...indexes, publicLog: [] });
  return result;
}

export function effectiveSpeed(p: any) {
  return (calc as any).effectiveStat(p, 'speed');
}

export function makeCtx(opts: ResolveCtxOptions = {}) {
  const rng = opts.seed != null ? new SeededRNG(opts.seed) : undefined;
  const ctx: any = { rng, weather: opts.weather ?? null };
  if (typeof opts.critChance === 'number') ctx.critChance = opts.critChance;
  return ctx;
}

export type BattleLog = string[];
