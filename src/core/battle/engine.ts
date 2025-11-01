// Battle core v1: thin TypeScript wrappers around the JS engine in src/engine/*
// Provides deterministic RNG, simple helpers to build runtimes from dex, and resolve a turn.

// Import CommonJS modules from our JS engine using esModuleInterop

// @ts-ignore — legacy JS module without types
import calc from "../../engine/calc.js";
// @ts-ignore — legacy JS module without types
import engine from "../../engine/index.js";

type UnknownRecord = Record<string, unknown>;

type CalcModule = {
  effectiveStat(pokemon: unknown, key: string, options?: unknown): number;
};

type ResolveContext = {
  rng?: RNG;
  weather: ResolveCtxOptions["weather"] | null;
  critChance?: number;
} & UnknownRecord;

export interface BuiltIndexes {
  dexLookup: (query: string | number) => UnknownRecord | null;
  movesIndex: Record<string, UnknownRecord>;
}

type BattleResolution = {
  log: string[];
  state: UnknownRecord;
  [key: string]: unknown;
};

type BattleRuntime = UnknownRecord;

interface BattleEngineModule {
  loadIndexes(): BuiltIndexes;
  makeRuntimeFromDexEntry(entry: UnknownRecord | null, level: number, moves: MoveKey[], options: UnknownRecord): BattleRuntime;
  newBattleState(a: BattleRuntime, b: BattleRuntime): UnknownRecord;
  newAction(side: "a" | "b", move: MoveKey): UnknownRecord;
  resolveTurn(
    state: UnknownRecord,
    actionA: UnknownRecord,
    actionB: UnknownRecord,
    context: ResolveContext & BuiltIndexes & { publicLog: unknown[] }
  ): BattleResolution;
}

const calcModule = calc as CalcModule;
const engineModule = engine as BattleEngineModule;

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

export function loadIndexes(): BuiltIndexes {
  // engine.loadIndexes returns { dexLookup, movesIndex }
  return engineModule.loadIndexes();
}

export function buildRuntimeFromDex(
  name: string,
  level = 50,
  moves: MoveKey[] = [],
  opts: UnknownRecord = {}
) {
  const { dexLookup } = loadIndexes();
  const dexMon = dexLookup(name);
  if (!dexMon) throw new Error(`Unknown species: ${name}`);
  const p = engineModule.makeRuntimeFromDexEntry(dexMon, level, moves, opts);
  return p;
}

export interface BattleInitOptions extends ResolveCtxOptions {
  a: { name: string; level?: number; moves?: MoveKey[]; opts?: UnknownRecord };
  b: { name: string; level?: number; moves?: MoveKey[]; opts?: UnknownRecord };
}

export function newBattle(init: BattleInitOptions) {
  const { a, b } = init;
  const pa = buildRuntimeFromDex(a.name, a.level ?? 50, a.moves ?? [], a.opts ?? {});
  const pb = buildRuntimeFromDex(b.name, b.level ?? 50, b.moves ?? [], b.opts ?? {});
  const state = engineModule.newBattleState(pa, pb);

  // Build a ctx compatible with engine
  const indexes = loadIndexes();
  const rng = init.seed != null ? new SeededRNG(init.seed) : undefined;
  const ctx: ResolveContext = {
    rng,
    weather: init.weather ?? null,
  };
  if (typeof init.critChance === "number") ctx.critChance = init.critChance;

  return { state, ctx, indexes };
}

export function resolveTurn(
  battle: ReturnType<typeof newBattle>,
  moveA: MoveKey,
  moveB: MoveKey,
) {
  const { state, ctx, indexes } = battle;
  const actionA = engineModule.newAction("a", moveA);
  const actionB = engineModule.newAction("b", moveB);
  const result = engineModule.resolveTurn(state, actionA, actionB, { ...ctx, ...indexes, publicLog: [] });
  return result;
}

export function effectiveSpeed(pokemon: unknown) {
  return calcModule.effectiveStat(pokemon, "speed");
}

export function makeCtx(opts: ResolveCtxOptions = {}) {
  const rng = opts.seed != null ? new SeededRNG(opts.seed) : undefined;
  const ctx: ResolveContext = { rng, weather: opts.weather ?? null };
  if (typeof opts.critChance === "number") ctx.critChance = opts.critChance;
  return ctx;
}

export type BattleLog = string[];
